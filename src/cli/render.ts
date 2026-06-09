import { stdout } from "node:process";

import type { AgentEvent } from "../agent/types.js";

const useColor = stdout.isTTY;

const colors = {
  primary: "#cc785c",
  ink: "#141413",
  muted: "#6c6a64",
  hairline: "#e6dfd8",
  surfaceCard: "#efe9de",
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

export function printPrompt(): string {
  return `${inputTopLine()}\n${style("│", "rule")} `;
}

export function printStatus(options: CliRenderOptions): void {
  console.log(style(inputBottomLine(), "rule"));
  console.log(statusLine(`上下文 ${formatContextStatus(options)}`, `模型 ${options.modelLabel} · 推理 ${formatModelEffort(options.modelEffort)}`));
}

export function printSubmittedInputStatus(options: CliRenderOptions): void {
  console.log("");
  printStatus(options);
  console.log("");
}

export function printModelStart(): void {
  console.log(style("AI 正在分析...", "muted"));
}

export function printPlan(text: string): void {
  console.log(`${style("计划 >", "primary")} ${text}`);
}

export function printCommand(command: string): void {
  console.log(`${style("命令 >", "darkLabel")} ${style(command, "code")}`);
}

export function printObservation(text: string): void {
  console.log(`${style("结果 >", "success")} ${text}`);
}

export function printFinal(answer: string): void {
  console.log(`${style("AI >", "primary")} ${answer}`);
}

export function printError(message: string): void {
  console.error(`${style("错误 >", "error")} ${message}`);
}

export function renderAgentEvent(event: AgentEvent): void {
  if (event.type === "model_start") {
    printModelStart();
    return;
  }

  if (event.type === "plan") {
    printPlan(event.text);
    return;
  }

  if (event.type === "command") {
    printCommand(event.command);
    return;
  }

  if (event.type === "observation") {
    printObservation(event.text);
    return;
  }

  if (event.type === "final") {
    printFinal(event.answer);
    return;
  }

  printError(event.message);
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

  if (token === "darkLabel") {
    return `${bg(colors.surfaceDark)}${fg(colors.onDark)}${text}${reset()}`;
  }

  if (token === "code") {
    return `${bg(colors.surfaceCard)}${fg(colors.ink)}${text}${reset()}`;
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
  const rightRule = "─".repeat(Math.max(width - label.length - 4, 20));

  return `${style("╭─ ", "rule")}${style(label, "primary")}${style(` ${rightRule}`, "rule")}`;
}

function inputBottomLine(): string {
  return `╰${fullWidthLine().slice(1)}`;
}

function statusLine(left: string, right: string): string {
  const width = Math.max(stdout.columns || 80, 40);
  const gap = Math.max(width - left.length - right.length, 1);
  return `${style(left, "strong")}${" ".repeat(gap)}${style(right, "strong")}`;
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
  | "darkLabel"
  | "code"
  | "success"
  | "error";
