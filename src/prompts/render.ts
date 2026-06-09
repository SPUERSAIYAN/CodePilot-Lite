import type { PromptBundle, PromptVariables } from "./types.js";

const variablePattern = /\{\{([A-Za-z0-9_]+)\}\}/g;

export function renderPrompt(bundle: PromptBundle, name: string, variables: PromptVariables): string {
  const definition = bundle.manifest.prompts[name];
  const template = bundle.templates[name];

  if (!definition || template === undefined) {
    throw new Error(`未知提示词：${name}`);
  }

  for (const variable of definition.requiredVariables) {
    if (variables[variable] === undefined || variables[variable] === null) {
      throw new Error(`渲染提示词 ${name} 缺少必需变量：${variable}`);
    }
  }

  return template.replace(variablePattern, (_match, variable: string) => {
    const value = variables[variable];

    if (value === undefined || value === null) {
      throw new Error(`渲染提示词 ${name} 缺少必需变量：${variable}`);
    }

    return String(value);
  });
}
