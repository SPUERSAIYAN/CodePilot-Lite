import { emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { runAgent } from "../agent/loop.js";
import type { RepoMapService } from "../context/repo-map.js";
import type { Model } from "../models/model.js";
import type { PromptService } from "../prompts/index.js";
import {
  type CliRenderOptions,
  moveCursorBelowInputFrame,
  moveCursorToInputValue,
  printError,
  printFinal,
  printPrompt,
  printSubmittedInputStatus,
  printWelcome,
  renderInputFrame,
  renderAgentEvent,
  restoreCursorPosition,
  saveCursorPosition,
} from "./render.js";

export async function startRepl(
  model: Model,
  promptService: PromptService,
  repoMapService: RepoMapService,
  options: CliRenderOptions,
): Promise<void> {
  const interactive = input.isTTY && output.isTTY;
  const rl = interactive ? undefined : readline.createInterface({ input, output });

  printWelcome(options);

  try {
    while (true) {
      let task: string;

      try {
        task = (await readTask(rl, options, interactive)).trim();
        if (!interactive) {
          printSubmittedInputStatus(options);
        }
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
    rl?.close();
  }
}

async function readTask(
  rl: readline.Interface | undefined,
  options: CliRenderOptions,
  interactive: boolean,
): Promise<string> {
  if (!interactive) {
    if (!rl) {
      throw new Error("非交互模式缺少 readline 实例。");
    }

    return rl.question(printPrompt(options));
  }

  return readInteractiveTask(options);
}

function readInteractiveTask(options: CliRenderOptions): Promise<string> {
  return new Promise((resolve) => {
    let value = "";
    const wasRaw = input.isRaw;

    const render = (): void => {
      output.write(restoreCursorPosition());
      output.write("\u001b[J");
      output.write(renderInputFrame(options, value));
      output.write(moveCursorToInputValue(value));
    };

    const onKeypress = (text: string, key: KeypressKey): void => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) {
        cleanup();
        output.write(moveCursorBelowInputFrame());
        resolve("exit");
        return;
      }

      if (key.name === "return") {
        cleanup();
        output.write(moveCursorBelowInputFrame());
        resolve(value);
        return;
      }

      if (key.name === "backspace") {
        value = [...value].slice(0, -1).join("");
        render();
        return;
      }

      if (!key.ctrl && !key.meta && text) {
        value += text;
        render();
      }
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(wasRaw);
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKeypress);

    output.write(saveCursorPosition());
    output.write(renderInputFrame(options, value));
    output.write(moveCursorToInputValue(value));
  });
}

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}
