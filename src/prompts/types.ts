export interface PromptManifest {
  version: string;
  language: "zh-CN";
  prompts: Record<string, PromptDefinition>;
}

export interface PromptDefinition {
  file: string;
  requiredVariables: string[];
}

export type PromptVariables = Record<string, string | number>;

export interface PromptBundle {
  manifest: PromptManifest;
  templates: Record<string, string>;
}

export interface PromptService {
  renderSystemPrompt(input: {
    cwd: string;
    platform: NodeJS.Platform;
    maxSteps: number;
  }): string;

  renderTaskPrompt(input: {
    task: string;
  }): string;

  renderToolObservation(input: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }): string;
}
