import "dotenv/config";

export interface AppConfig {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekContextWindowTokens: number;
  modelEffort: string;
}

export function loadConfig(): AppConfig {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!deepseekApiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env 中配置 DeepSeek API Key。");
  }

  return {
    deepseekApiKey,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    deepseekModel: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    deepseekContextWindowTokens: readPositiveInteger("DEEPSEEK_CONTEXT_WINDOW_TOKENS", 128000),
    modelEffort: process.env.MODEL_EFFORT?.trim() || "high",
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }

  return value;
}
