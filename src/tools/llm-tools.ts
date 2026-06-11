import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ToolCommand } from "../agent/types.js";
import { runShell } from "./shell.js";

const maxOutputLength = 12000;
const defaultSearchPath = ".";

export interface ToolResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ToolExecutionOptions {
  onWrite?: () => void;
  signal?: AbortSignal;
}

export async function executeToolCommand(command: ToolCommand, options: ToolExecutionOptions = {}): Promise<ToolResult> {
  try {
    if (command.name === "list_files") {
      return await listFiles(command);
    }

    if (command.name === "read_file") {
      return await readTextFile(command);
    }

    if (command.name === "search") {
      return await searchText(command, options);
    }

    if (command.name === "make_dir") {
      return await makeDirectory(command, options);
    }

    if (command.name === "write_file") {
      return await writeTextFile(command, options);
    }

    return await runCommand(command, options);
  } catch (error) {
    if (options.signal?.aborted) {
      throw new Error("任务已中断。");
    }

    return {
      command: formatToolCommand(command),
      exitCode: 1,
      stdout: "",
      stderr: truncateOutput(error instanceof Error ? error.message : String(error)),
    };
  }
}

export function formatToolCommand(command: ToolCommand): string {
  return JSON.stringify(command);
}

async function listFiles(command: Extract<ToolCommand, { name: "list_files" }>): Promise<ToolResult> {
  const targetPath = resolveAllowedPath(command.path ?? ".");
  rejectSensitivePath(targetPath);

  const entries = await readdir(targetPath, { withFileTypes: true });
  const stdout = entries
    .filter((entry) => !isSensitivePath(path.join(targetPath, entry.name)))
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n");

  return {
    command: formatToolCommand(command),
    exitCode: 0,
    stdout: truncateOutput(stdout),
    stderr: "",
  };
}

async function readTextFile(command: Extract<ToolCommand, { name: "read_file" }>): Promise<ToolResult> {
  const targetPath = resolveAllowedPath(command.path);
  rejectSensitivePath(targetPath);

  const content = await readFile(targetPath, "utf8");
  const lines = content.split(/\r?\n/);
  const startLine = command.startLine ?? 1;
  const endLine = command.endLine ?? lines.length;

  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new Error("read_file 的 startLine/endLine 范围无效。");
  }

  const selected = lines.slice(startLine - 1, endLine);
  const stdout = selected
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}: ${line}`)
    .join("\n");

  return {
    command: formatToolCommand(command),
    exitCode: 0,
    stdout: truncateOutput(stdout),
    stderr: "",
  };
}

async function searchText(
  command: Extract<ToolCommand, { name: "search" }>,
  options: ToolExecutionOptions,
): Promise<ToolResult> {
  const searchPath = command.path ?? defaultSearchPath;
  const targetPath = resolveAllowedPath(searchPath);
  rejectSensitivePath(targetPath);

  const result = await runShell(
    `rg --line-number --hidden --glob "!.git" --glob "!node_modules" --glob "!**/.env" --glob "!**/*.pem" --glob "!**/*.key" --glob "!**/*secret*" --glob "!**/*token*" ${quote(command.query)} ${quote(searchPath)}`,
    { signal: options.signal },
  );

  return {
    command: formatToolCommand(command),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function makeDirectory(
  command: Extract<ToolCommand, { name: "make_dir" }>,
  options: ToolExecutionOptions,
): Promise<ToolResult> {
  const targetPath = resolveAllowedPath(command.path);
  rejectSensitivePath(targetPath);
  await mkdir(targetPath, { recursive: true });
  options.onWrite?.();

  return {
    command: formatToolCommand(command),
    exitCode: 0,
    stdout: `已创建目录 ${command.path}`,
    stderr: "",
  };
}

async function writeTextFile(
  command: Extract<ToolCommand, { name: "write_file" }>,
  options: ToolExecutionOptions,
): Promise<ToolResult> {
  const targetPath = resolveAllowedPath(command.path);
  rejectSensitivePath(targetPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, command.content, "utf8");
  options.onWrite?.();

  return {
    command: formatToolCommand(command),
    exitCode: 0,
    stdout: `已写入 ${command.path}`,
    stderr: "",
  };
}

async function runCommand(command: Extract<ToolCommand, { name: "run_shell" }>, options: ToolExecutionOptions): Promise<ToolResult> {
  const result = await runShell(command.command, { signal: options.signal });

  return {
    command: formatToolCommand(command),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function resolveAllowedPath(inputPath: string): string {
  const resolved = path.resolve(process.cwd(), inputPath);

  if (!getAllowedRoots().some((root) => isInsideRoot(resolved, root))) {
    throw new Error(`工具路径必须位于允许目录内：${getAllowedRoots().join("；")}`);
  }

  return resolved;
}

function getAllowedRoots(): string[] {
  const cwd = path.resolve(process.cwd());
  const parent = path.dirname(cwd);

  if (parent === cwd || path.dirname(parent) === parent) {
    return [cwd];
  }

  return [cwd, parent];
}

function isInsideRoot(targetPath: string, root: string): boolean {
  const relative = path.relative(root, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function rejectSensitivePath(targetPath: string): void {
  if (isSensitivePath(targetPath)) {
    throw new Error("工具拒绝读取或写入敏感路径。");
  }
}

function isSensitivePath(targetPath: string): boolean {
  const normalized = targetPath.toLowerCase();
  const parts = normalized.split(path.sep);

  return parts.some((part) =>
    part === ".env"
    || part.endsWith(".pem")
    || part.endsWith(".key")
    || part.includes("secret")
    || part.includes("token")
  );
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function truncateOutput(output: string): string {
  if (output.length <= maxOutputLength) {
    return output;
  }

  return `${output.slice(0, maxOutputLength)}\n[output truncated]`;
}
