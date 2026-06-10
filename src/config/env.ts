import "dotenv/config";

export interface AppConfig {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekContextWindowTokens: number;
  modelEffort: string;
  repoMapEnabled: boolean;
  repoMapTokenRatio: number;
  repoMapMaxTokens: number;
}

export function loadConfig(): AppConfig {
  return loadConfigFromEnv(process.env);
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  const deepseekApiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!deepseekApiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env 中配置 DeepSeek API Key。");
  }

  const deepseekContextWindowTokens = readPositiveInteger(env, "DEEPSEEK_CONTEXT_WINDOW_TOKENS", 128000);
  const repoMapTokenRatio = readRatio(env, "REPO_MAP_TOKEN_RATIO", 0.1);

  return {
    deepseekApiKey,
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    deepseekModel: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    deepseekContextWindowTokens,
    modelEffort: env.MODEL_EFFORT?.trim() || "high",
    repoMapEnabled: readBoolean(env, "REPO_MAP_ENABLED", true),
    repoMapTokenRatio,
    repoMapMaxTokens: readPositiveInteger(
      env,
      "REPO_MAP_MAX_TOKENS",
      Math.max(1, Math.floor(deepseekContextWindowTokens * repoMapTokenRatio)),
    ),
  };
}

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const rawValue = env[name]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }

  return value;
}

function readRatio(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const rawValue = env[name]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} 必须是 0 到 1 之间的数字。`);
  }

  return value;
}

function readBoolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const rawValue = env[name]?.trim().toLowerCase();
  if (!rawValue) {
    return fallback;
  }

  if (rawValue === "true" || rawValue === "1" || rawValue === "yes") {
    return true;
  }

  if (rawValue === "false" || rawValue === "0" || rawValue === "no") {
    return false;
  }

  throw new Error(`${name} 必须是 true 或 false。`);
}
