import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { runAgent } from "../agent/loop.js";
import type { RepoMapService } from "../context/repo-map.js";
import type { Model } from "../models/model.js";
import type { PromptService } from "../prompts/index.js";
import {
  type CliRenderOptions,
  printError,
  printFinal,
  printPrompt,
  printWelcome,
  renderAgentEvent,
} from "./render.js";

export async function startRepl(
  model: Model,
  promptService: PromptService,
  repoMapService: RepoMapService,
  options: CliRenderOptions,
): Promise<void> {
  const rl = readline.createInterface({
    input,
    output,
    historySize: 100,
    terminal: output.isTTY,
  });

  printWelcome(options);

  try {
    while (true) {
      let task: string;

      try {
        task = (await rl.question(printPrompt(options))).trim();
      } catch (error) {
        if (error instanceof Error && error.message === "readline was closed") {
          break;
        }

        throw error;
      }

      if (task === "exit") {
        printFinal("已退出。");
        break;
      }

      if (!task) {
        continue;
      }

      try {
        await runAgent(task, model, promptService, repoMapService, renderAgentEvent);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(`任务失败：${message}`);
      }
    }
  } finally {
    rl.close();
  }
}
