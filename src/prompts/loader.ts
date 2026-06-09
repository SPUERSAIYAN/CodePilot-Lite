import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PromptBundle, PromptDefinition, PromptManifest } from "./types.js";

const requiredPromptNames = ["system", "task", "toolObservation"] as const;
const variablePattern = /\{\{([A-Za-z0-9_]+)\}\}/g;

export async function loadPromptBundle(promptDir = path.join(process.cwd(), "prompts")): Promise<PromptBundle> {
  const manifest = await loadManifest(promptDir);
  const templates: Record<string, string> = {};

  for (const [name, definition] of Object.entries(manifest.prompts)) {
    validatePromptDefinition(name, definition);

    const template = await readPromptFile(promptDir, definition.file);
    validateTemplateVariables(name, template, definition.requiredVariables);
    templates[name] = template;
  }

  return { manifest, templates };
}

async function loadManifest(promptDir: string): Promise<PromptManifest> {
  const manifestPath = path.join(promptDir, "manifest.json");

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error("提示词 manifest 文件不存在：prompts/manifest.json");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("提示词 manifest 不是合法 JSON。");
  }

  validateManifest(value);
  return value;
}

function validateManifest(value: unknown): asserts value is PromptManifest {
  if (!isRecord(value)) {
    throw new Error("提示词 manifest 必须是 JSON 对象。");
  }

  if (!isNonEmptyString(value.version)) {
    throw new Error("提示词 manifest.version 必须是非空字符串。");
  }

  if (value.language !== "zh-CN") {
    throw new Error("提示词 manifest.language 必须是 zh-CN。");
  }

  if (!isRecord(value.prompts)) {
    throw new Error("提示词 manifest.prompts 必须是对象。");
  }

  for (const name of requiredPromptNames) {
    if (!isRecord(value.prompts[name])) {
      throw new Error(`提示词 manifest 缺少 ${name} 定义。`);
    }
  }
}

function validatePromptDefinition(name: string, definition: PromptDefinition): void {
  if (!isNonEmptyString(definition.file)) {
    throw new Error(`提示词 ${name}.file 必须是非空字符串。`);
  }

  if (path.isAbsolute(definition.file) || path.basename(definition.file) !== definition.file) {
    throw new Error(`提示词 ${name}.file 必须是相对文件名。`);
  }

  if (!Array.isArray(definition.requiredVariables)) {
    throw new Error(`提示词 ${name}.requiredVariables 必须是字符串数组。`);
  }

  for (const variable of definition.requiredVariables) {
    if (!isValidVariableName(variable)) {
      throw new Error(`提示词 ${name} 声明了非法变量名。`);
    }
  }
}

async function readPromptFile(promptDir: string, file: string): Promise<string> {
  const promptPath = path.join(promptDir, file);

  let template: string;
  try {
    template = await readFile(promptPath, "utf8");
  } catch {
    throw new Error(`提示词文件不存在：prompts/${file}`);
  }

  if (template.trim() === "") {
    throw new Error(`提示词文件不能为空：prompts/${file}`);
  }

  return template;
}

function validateTemplateVariables(name: string, template: string, requiredVariables: string[]): void {
  const usedVariables = new Set(extractVariables(template));
  const requiredVariableSet = new Set(requiredVariables);

  for (const variable of usedVariables) {
    if (!requiredVariableSet.has(variable)) {
      throw new Error(`提示词 ${name} 使用了未声明变量：${variable}`);
    }
  }

  for (const variable of requiredVariables) {
    if (!usedVariables.has(variable)) {
      throw new Error(`提示词 ${name} 声明了未使用变量：${variable}`);
    }
  }
}

function extractVariables(template: string): string[] {
  return Array.from(template.matchAll(variablePattern), (match) => match[1]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidVariableName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value);
}
