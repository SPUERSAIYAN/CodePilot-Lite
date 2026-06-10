import type { ReflectionDecision } from "./types.js";

export function parseReflectionDecision(output: string): ReflectionDecision {
  let value: unknown;

  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("复盘输出不是合法 JSON。");
  }

  if (!isRecord(value)) {
    throw new Error("复盘输出必须是 JSON 对象。");
  }

  const summary = readRequiredString(value.summary, "summary");

  if (value.type === "continue") {
    return {
      type: "continue",
      summary,
      next: readRequiredString(value.next, "next"),
    };
  }

  if (value.type === "final") {
    return {
      type: "final",
      summary,
      answer: readRequiredString(value.answer, "answer"),
    };
  }

  throw new Error("type 必须是 continue 或 final。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} 必须是非空字符串。`);
  }

  return value;
}
