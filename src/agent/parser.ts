import type { AgentAction } from "./types.js";

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

  if (value.type === "shell") {
    if (typeof value.command !== "string" || value.command.trim() === "") {
      throw new Error("shell.command 必须是非空字符串。");
    }

    return {
      type: "shell",
      thought: readOptionalString(value.thought),
      command: value.command,
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

  throw new Error("type 必须是 shell 或 final。");
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
