import { stdout } from "node:process";

import type { AgentEvent, ToolCommand } from "../agent/types.js";

const useColor = stdout.isTTY;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerTimer: NodeJS.Timeout | undefined;
let spinnerFrameIndex = 0;

const colors = {
  primary: "#cc785c",
  ink: "#141413",
  muted: "#6c6a64",
  hairline: "#e6dfd8",
  surfaceDark: "#181715",
  onDark: "#faf9f5",
  success: "#5db872",
  error: "#c64545",
};

export interface CliRenderOptions {
  appName: string;
  appVersion: string;
  commandName: string;
  modelLabel: string;
  contextWindowTokens: number;
  contextUsedTokens: number;
  modelEffort: string;
}

export function printWelcome(options: CliRenderOptions): void {
  console.log(style(`PS ${process.cwd()}> ${options.commandName}`, "terminal"));
  console.log("");
  console.log(`${style("✣", "mark")} ${style(options.appName, "brand")} ${style(formatVersion(options.appVersion), "muted")}`);
  console.log(style("中文 AI Coding Agent，面向本地仓库的代码理解、命令执行和小范围修改。", "strong"));
  console.log(style(`工作区 ${process.cwd()}`, "muted"));
  console.log(statusLine("Esc 中断 · ctrl+c/ctrl+d 退出", "/ 命令 · ! shell · ctrl+o 更多"));
  console.log("");
}

export function printPrompt(_options: CliRenderOptions): string {
  return `${inputTopLine()}\n`;
}

export function renderInputFrame(options: CliRenderOptions, value: string): string {
  const visibleValue = fitInputValue(value);

  return [
    inputTopLine(),
    visibleValue,
    style(inputBottomLine(), "rule"),
    statusLine(`上下文 ${formatContextStatus(options)}`, `模型 ${options.modelLabel} · 推理 ${formatModelEffort(options.modelEffort)}`),
  ].join("\n");
}

export function moveCursorToInputValue(value: string): string {
  const column = displayWidth(fitInputValue(value));
  return `\u001b[2A\r${column > 0 ? `\u001b[${column}C` : ""}`;
}

export function saveCursorPosition(): string {
  return "\u001b7";
}

export function restoreCursorPosition(): string {
  return "\u001b8";
}

export function moveCursorBelowInputFrame(): string {
  return "\u001b[3B\r\n";
}

export function printStatus(options: CliRenderOptions): void {
  console.log(style(inputBottomLine(), "rule"));
  console.log(statusLine(`上下文 ${formatContextStatus(options)}`, `模型 ${options.modelLabel} · 推理 ${formatModelEffort(options.modelEffort)}`));
}

export function printSubmittedInputStatus(options: CliRenderOptions): void {
  printStatus(options);
  console.log("");
}

export function printModelStart(): void {
  startActivity("AI 正在思考...");
}

export function printPlan(text: string): void {
  console.log(`${style("计划 >", "primary")} ${text}`);
}

export function printCommand(command: ToolCommand): void {
  console.log(`${style("命令 >", "darkLabel")} ${renderToolCommand(command)}`);
}

export function printObservation(text: string): void {
  console.log(`${style("结果 >", "success")} ${text}`);
}

export function printReflection(text: string): void {
  console.log(`${style("复盘 >", "primary")} ${text}`);
}

export function printFinal(answer: string): void {
  stopActivity();
  console.log(`${style("AI >", "primary")} ${renderMarkdown(answer)}`);
}

export function printError(message: string): void {
  stopActivity();
  console.error(`${style("错误 >", "error")} ${message}`);
}

export function renderAgentEvent(event: AgentEvent): void {
  if (event.type === "model_start") {
    printModelStart();
    return;
  }

  if (event.type === "plan") {
    stopActivity();
    printPlan(event.text);
    return;
  }

  if (event.type === "command") {
    stopActivity();
    printCommand(event.command);
    startActivity("正在执行命令...");
    return;
  }

  if (event.type === "observation") {
    stopActivity();
    printObservation(event.text);
    return;
  }

  if (event.type === "reflection") {
    stopActivity();
    printReflection(event.text);
    return;
  }

  if (event.type === "final") {
    stopActivity();
    printFinal(event.answer);
    return;
  }

  stopActivity();
  printError(event.message);
}

export function renderToolCommand(command: ToolCommand): string {
  if (command.name === "list_files") {
    return renderCommandLine("ls", [renderPath(command.path ?? ".")]);
  }

  if (command.name === "read_file") {
    return renderCommandLine("read", [renderPath(formatReadPath(command))]);
  }

  if (command.name === "search") {
    return renderCommandLine("rg", [
      style(quoteArgument(command.query), "argument"),
      renderPath(command.path ?? "."),
    ]);
  }

  if (command.name === "write_file") {
    return renderCommandLine("write", [renderPath(command.path)]);
  }

  return renderShellCommand(command.command);
}

export function renderMarkdown(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rendered: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      rendered.push(renderCodeLine(line));
      continue;
    }

    rendered.push(renderMarkdownLine(line));
  }

  return rendered.join("\n");
}

function startActivity(text: string): void {
  stopActivity();

  if (!useColor) {
    console.log(style(text, "muted"));
    return;
  }

  const renderFrame = (): void => {
    const frame = spinnerFrames[spinnerFrameIndex % spinnerFrames.length];
    spinnerFrameIndex += 1;
    stdout.write(`\r${style(frame, "primary")} ${style(text, "muted")}`);
  };

  renderFrame();
  spinnerTimer = setInterval(renderFrame, 90);
}

function stopActivity(): void {
  if (!spinnerTimer) {
    return;
  }

  clearInterval(spinnerTimer);
  spinnerTimer = undefined;
  stdout.write(`\r${" ".repeat(Math.max(stdout.columns || 80, 40))}\r`);
}

function style(text: string, token: StyleToken): string {
  if (!useColor) {
    return text;
  }

  if (token === "terminal") {
    return fg(colors.muted, text);
  }

  if (token === "mark") {
    return fg(colors.ink, text);
  }

  if (token === "brand") {
    return fg(colors.ink, text);
  }

  if (token === "strong") {
    return fg(colors.ink, text);
  }

  if (token === "rule") {
    return fg(colors.hairline, text);
  }

  if (token === "primary") {
    return fg(colors.primary, text);
  }

  if (token === "muted") {
    return fg(colors.muted, text);
  }

  if (token === "argument") {
    return fg(colors.muted, text);
  }

  if (token === "path") {
    return fg(colors.ink, text);
  }

  if (token === "darkLabel") {
    return `${bg(colors.surfaceDark)}${fg(colors.onDark)}${text}${reset()}`;
  }

  if (token === "codeInline") {
    return `${bg(colors.surfaceDark)}${fg(colors.onDark)} ${text} ${reset()}`;
  }

  if (token === "codeBlock") {
    return `${bg(colors.surfaceDark)}${fg(colors.onDark)}${text}${reset()}`;
  }

  if (token === "success") {
    return fg(colors.success, text);
  }

  return fg(colors.error, text);
}

function fg(hex: string, text?: string): string {
  const { r, g, b } = hexToRgb(hex);
  const code = `\u001b[38;2;${r};${g};${b}m`;
  return text === undefined ? code : `${code}${text}${reset()}`;
}

function bg(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\u001b[48;2;${r};${g};${b}m`;
}

function reset(): string {
  return "\u001b[0m";
}

function fullWidthLine(): string {
  return "─".repeat(Math.max(stdout.columns || 80, 40));
}

function inputTopLine(): string {
  const width = Math.max(stdout.columns || 80, 40);
  const label = "输入编码任务";
  const rightRule = "─".repeat(Math.max(width - displayWidth(label) - 3, 20));

  return `${style("─ ", "rule")}${style(label, "primary")}${style(` ${rightRule}`, "rule")}`;
}

function inputBottomLine(): string {
  return fullWidthLine();
}

function fitInputValue(value: string): string {
  const width = Math.max((stdout.columns || 80) - 1, 20);
  const chars = [...value];
  let result = "";
  let currentWidth = 0;

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index];
    const widthToAdd = charWidth(char);
    if (currentWidth + widthToAdd > width) {
      return `…${result}`;
    }

    result = `${char}${result}`;
    currentWidth += widthToAdd;
  }

  return result;
}

function fitText(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) {
    return value;
  }

  let result = "";
  let currentWidth = 1;

  for (const char of value) {
    const widthToAdd = charWidth(char);
    if (currentWidth + widthToAdd > maxWidth) {
      return `${result}…`;
    }

    result += char;
    currentWidth += widthToAdd;
  }

  return result;
}

function statusLine(left: string, right: string): string {
  const width = Math.max(stdout.columns || 80, 40);
  const safeRight = fitText(right, Math.floor(width / 2));
  const leftBudget = Math.max(width - displayWidth(safeRight) - 1, 1);
  const safeLeft = fitText(left, leftBudget);
  const gap = Math.max(width - displayWidth(safeLeft) - displayWidth(safeRight), 1);

  return `${style(safeLeft, "strong")}${" ".repeat(gap)}${style(safeRight, "strong")}`;
}

function renderCommandLine(verb: string, parts: string[]): string {
  const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  return `${style("$", "muted")} ${style(verb, "primary")}${suffix}`;
}

function renderShellCommand(command: string): string {
  const trimmed = command.trim();
  const match = /^(\S+)(\s+[\s\S]*)?$/.exec(trimmed);
  if (!match) {
    return renderCommandLine(command, []);
  }

  const verb = match[1];
  const rest = match[2]?.trim();
  return renderCommandLine(verb, rest ? [style(rest, "argument")] : []);
}

function renderPath(value: string): string {
  return style(value, "path");
}

function renderMarkdownLine(line: string): string {
  const heading = /^(#{1,6})\s+(.+)$/.exec(line);
  if (heading) {
    return renderHeading(heading[2], heading[1].length);
  }

  const unorderedList = /^(\s*)[-*]\s+(.+)$/.exec(line);
  if (unorderedList) {
    return `${unorderedList[1]}${style("•", "primary")} ${renderInlineMarkdown(unorderedList[2])}`;
  }

  const orderedList = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
  if (orderedList) {
    return `${orderedList[1]}${style(`${orderedList[2]}.`, "primary")} ${renderInlineMarkdown(orderedList[3])}`;
  }

  return renderInlineMarkdown(line);
}

function renderHeading(text: string, level: number): string {
  const renderedText = renderInlineMarkdown(text);
  if (level <= 2) {
    return `${style(renderedText, "primary")}\n${style("─".repeat(visibleLength(text)), "rule")}`;
  }

  return style(renderedText, "strong");
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_match, code: string) => style(code, "codeInline"))
    .replace(/\*\*([^*]+)\*\*/g, (_match, value: string) => style(value, "strong"));
}

function renderCodeLine(line: string): string {
  return `${style("│", "darkLabel")} ${style(line, "codeBlock")}`;
}

function formatReadPath(command: Extract<ToolCommand, { name: "read_file" }>): string {
  if (command.endLine === undefined) {
    return command.path;
  }

  return `${command.path}:${command.startLine ?? 1}-${command.endLine}`;
}

function quoteArgument(value: string): string {
  return JSON.stringify(value);
}

function visibleLength(text: string): number {
  return Math.max([...text].length, 4);
}

function displayWidth(text: string): number {
  return [...text].reduce((width, char) => width + charWidth(char), 0);
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  return codePoint >= 0x2e80 ? 2 : 1;
}

function formatVersion(version: string): string {
  if (version === "dev" || version.startsWith("v")) {
    return version;
  }

  return `v${version}`;
}

function formatContextStatus(options: CliRenderOptions): string {
  const percentage = options.contextWindowTokens > 0
    ? (options.contextUsedTokens / options.contextWindowTokens) * 100
    : 0;

  return `${percentage.toFixed(1)}%/${formatTokenCount(options.contextWindowTokens)} (自动)`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${trimFixed(tokens / 1_000_000)}M`;
  }

  if (tokens >= 1_000) {
    return `${trimFixed(tokens / 1_000)}K`;
  }

  return String(tokens);
}

function trimFixed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatModelEffort(effort: string): string {
  if (effort === "high") {
    return "高";
  }

  if (effort === "medium") {
    return "中";
  }

  if (effort === "low") {
    return "低";
  }

  return effort;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

type StyleToken =
  | "terminal"
  | "mark"
  | "brand"
  | "strong"
  | "rule"
  | "primary"
  | "muted"
  | "argument"
  | "path"
  | "darkLabel"
  | "codeInline"
  | "codeBlock"
  | "success"
  | "error";
