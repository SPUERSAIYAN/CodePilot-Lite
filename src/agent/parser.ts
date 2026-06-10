import type { AgentAction, ToolCommand } from "./types.js";

export function parseAgentAction(output: string): AgentAction {
  let value: unknown;

  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("模型输出不是合法 JSON。");
  }

  if (!isRecord(value)) {
    throw new Error("模型输出必须是 JSON 对象。");
  }

  if (value.type === "tool") {
    return {
      type: "tool",
      thought: readOptionalString(value.thought),
      command: parseToolCommand(value.command),
    };
  }

  if (value.type === "final") {
    if (typeof value.answer !== "string" || value.answer.trim() === "") {
      throw new Error("final.answer 必须是非空字符串。");
    }

    return {
      type: "final",
      thought: readOptionalString(value.thought),
      answer: value.answer,
    };
  }

  throw new Error("type 必须是 tool 或 final。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseToolCommand(value: unknown): ToolCommand {
  if (!isRecord(value)) {
    throw new Error("tool.command 必须是 JSON 对象。");
  }

  if (value.name === "list_files") {
    return {
      name: "list_files",
      path: readOptionalString(value.path),
    };
  }

  if (value.name === "read_file") {
    return {
      name: "read_file",
      path: readRequiredString(value.path, "read_file.path"),
      startLine: readOptionalPositiveInteger(value.startLine, "read_file.startLine"),
      endLine: readOptionalPositiveInteger(value.endLine, "read_file.endLine"),
    };
  }

  if (value.name === "search") {
    return {
      name: "search",
      query: readRequiredString(value.query, "search.query"),
      path: readOptionalString(value.path),
    };
  }

  if (value.name === "write_file") {
    return {
      name: "write_file",
      path: readRequiredString(value.path, "write_file.path"),
      content: readRequiredString(value.content, "write_file.content"),
    };
  }

  if (value.name === "run_shell") {
    return {
      name: "run_shell",
      command: readRequiredString(value.command, "run_shell.command"),
    };
  }

  throw new Error("tool.command.name 必须是 list_files、read_file、search、write_file 或 run_shell。");
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} 必须是非空字符串。`);
  }

  return value;
}

function readOptionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} 必须是正整数。`);
  }

  return value;
}
