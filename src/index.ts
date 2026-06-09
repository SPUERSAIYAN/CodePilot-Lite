import { readFile } from "node:fs/promises";
import path from "node:path";

import { startRepl } from "./cli/repl.js";
import { loadConfig } from "./config/env.js";
import { DeepSeekModel } from "./models/deepseek.js";
import { createPromptService } from "./prompts/index.js";

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const promptService = await createPromptService();
    const model = new DeepSeekModel(config);
    const project = await loadProjectMetadata();

    await startRepl(model, promptService, {
      appName: project.name,
      appVersion: project.version,
      commandName: project.name,
      modelLabel: formatModelLabel(config.deepseekModel),
      contextWindowTokens: config.deepseekContextWindowTokens,
      contextUsedTokens: 0,
      modelEffort: config.modelEffort,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`启动失败：${message}`);
    process.exitCode = 1;
  }
}

await main();

async function loadProjectMetadata(): Promise<ProjectMetadata> {
  const fallbackName = path.basename(process.cwd());

  try {
    const packageJson = await readFile(path.join(process.cwd(), "package.json"), "utf8");
    const value: unknown = JSON.parse(packageJson);

    if (!isRecord(value)) {
      return { name: fallbackName, version: "dev" };
    }

    return {
      name: readString(value.name) ?? fallbackName,
      version: readString(value.version) ?? "dev",
    };
  } catch {
    return { name: fallbackName, version: "dev" };
  }
}

function formatModelLabel(modelName: string): string {
  return modelName.includes("/") ? modelName : `deepseek/${modelName}`;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ProjectMetadata {
  name: string;
  version: string;
}
