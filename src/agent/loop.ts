import type { RepoMapService } from "../context/repo-map.js";
import type { Model } from "../models/model.js";
import type { PromptService } from "../prompts/index.js";
import { executeToolCommand, type ToolResult } from "../tools/llm-tools.js";
import { parseAgentAction } from "./parser.js";
import type { AgentEventHandler, Message } from "./types.js";

const maxSteps = 10;

export async function runAgent(
  task: string,
  model: Model,
  promptService: PromptService,
  repoMapService: RepoMapService,
  onEvent?: AgentEventHandler,
): Promise<string> {
  const agent = new DefaultAgent(task, model, promptService, await repoMapService.getRepoMap(), repoMapService, onEvent);

  return agent.run();
}

export class DefaultAgent {
  private readonly messages: Message[];
  private stepCount = 0;

  constructor(
    task: string,
    private readonly model: Model,
    private readonly promptService: PromptService,
    repoMap: string,
    private readonly repoMapService: RepoMapService,
    private readonly onEvent?: AgentEventHandler,
  ) {
    this.messages = [
      {
        role: "system",
        content: this.promptService.renderSystemPrompt({
          cwd: process.cwd(),
          platform: process.platform,
          maxSteps,
          repoMap,
        }),
      },
      { role: "user", content: this.promptService.renderTaskPrompt({ task }) },
    ];
  }

  async run(): Promise<string> {
    while (this.messages.at(-1)?.role !== "exit") {
      if (this.stepCount >= maxSteps) {
        const answer = "已达到最大执行步数，本轮任务终止。";
        this.onEvent?.({ type: "final", answer });
        this.messages.push({ role: "exit", content: answer });
        break;
      }

      await this.step();
      this.stepCount += 1;
    }

    return this.messages.at(-1)?.content ?? "任务已结束。";
  }

  async step(): Promise<void> {
    await this.executeActions(await this.query());
  }

  private async query(): Promise<string> {
    this.onEvent?.({ type: "model_start" });
    return readModelStream(this.model, this.messages);
  }

  private async executeActions(output: string): Promise<void> {
    this.messages.push({ role: "assistant", content: output });

    let action;
    try {
      action = parseAgentAction(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onEvent?.({
        type: "error",
        message: `模型输出无法解析：${message}。已要求模型重新输出合法 JSON。`,
      });
      this.messages.push({
        role: "tool",
        content: `解析失败：${message}。请严格输出合法 JSON。`,
      });
      return;
    }

    if (action.type === "final") {
      if (action.thought) {
        this.onEvent?.({ type: "plan", text: action.thought });
      }
      this.onEvent?.({ type: "final", answer: action.answer });
      this.messages.push({ role: "exit", content: action.answer });
      return;
    }

    if (action.thought) {
      this.onEvent?.({ type: "plan", text: action.thought });
    }
    this.onEvent?.({ type: "command", command: action.command });
    const result = await executeToolCommand(action.command, {
      onWrite: () => {
        this.repoMapService.markDirty();
      },
    });
    this.onEvent?.({ type: "observation", text: formatObservation(result) });
    this.messages.push({
      role: "tool",
      content: this.promptService.renderToolObservation({
        command: result.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    });
  }
}

async function readModelStream(model: Model, messages: Message[]): Promise<string> {
  let output = "";

  for await (const chunk of model.stream(messages)) {
    output += chunk;
  }

  if (!output) {
    throw new Error("模型没有返回内容。");
  }

  return output;
}

function formatObservation(result: ToolResult): string {
  const stdoutLength = result.stdout.length;
  const stderrLength = result.stderr.length;

  return `命令完成，exitCode=${result.exitCode}，stdout ${stdoutLength} 字符，stderr ${stderrLength} 字符。详情已交给模型分析。`;
}
