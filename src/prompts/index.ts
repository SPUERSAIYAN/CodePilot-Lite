import { loadPromptBundle } from "./loader.js";
import { renderPrompt } from "./render.js";
import type { PromptBundle, PromptService } from "./types.js";

export async function createPromptService(): Promise<PromptService> {
  return new DefaultPromptService(await loadPromptBundle());
}

class DefaultPromptService implements PromptService {
  constructor(private readonly bundle: PromptBundle) {}

  renderSystemPrompt(input: {
    cwd: string;
    platform: NodeJS.Platform;
    maxSteps: number;
  }): string {
    return renderPrompt(this.bundle, "system", input);
  }

  renderTaskPrompt(input: {
    task: string;
  }): string {
    return renderPrompt(this.bundle, "task", input);
  }

  renderToolObservation(input: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }): string {
    return renderPrompt(this.bundle, "toolObservation", input);
  }
}

export type { PromptService } from "./types.js";
