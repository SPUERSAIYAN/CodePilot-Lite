import type { RepoMapService } from "../context/repo-map.js";
import type { Model } from "../models/model.js";
import type { PromptService } from "../prompts/index.js";
import { executeToolCommand, type ToolResult } from "../tools/llm-tools.js";
import { parseAgentAction } from "./parser.js";
import { parseReflectionDecision } from "./reflection.js";
import type { AgentEventHandler, Message, ToolCommand } from "./types.js";

const maxSteps = 10;
const defaultMaxReflections = 10;

export interface AgentRunOptions {
  maxReflections?: number;
  signal?: AbortSignal;
}

export async function runAgent(
  task: string,
  model: Model,
  promptService: PromptService,
  repoMapService: RepoMapService,
  onEvent?: AgentEventHandler,
  options: AgentRunOptions = {},
): Promise<string> {
  const agent = new DefaultAgent(
    task,
    model,
    promptService,
    await repoMapService.getRepoMap(),
    repoMapService,
    onEvent,
    options,
  );

  return agent.run();
}

export class DefaultAgent {
  private readonly messages: Message[];
  private stepCount = 0;
  private reflectionCount = 0;
  private readonly maxReflections: number;
  private readonly signal?: AbortSignal;

  constructor(
    private readonly task: string,
    private readonly model: Model,
    private readonly promptService: PromptService,
    repoMap: string,
    private readonly repoMapService: RepoMapService,
    private readonly onEvent?: AgentEventHandler,
    options: AgentRunOptions = {},
  ) {
    this.maxReflections = options.maxReflections ?? defaultMaxReflections;
    this.signal = options.signal;
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
      this.throwIfAborted();

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
    this.throwIfAborted();
    await this.executeActions(await this.query());
  }

  private async query(): Promise<string> {
    this.throwIfAborted();
    this.onEvent?.({ type: "model_start" });
    return readModelStream(this.model, this.messages, this.signal);
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
      signal: this.signal,
    });
    this.throwIfAborted();
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
    await this.reflect(action.command, result);
  }

  private async reflect(action: ToolCommand, result: ToolResult): Promise<void> {
    this.throwIfAborted();

    if (this.reflectionCount >= this.maxReflections) {
      return;
    }

    this.reflectionCount += 1;

    const reflectionPrompt = this.promptService.renderReflectionPrompt({
      task: this.task,
      lastAction: JSON.stringify(action),
      toolResult: summarizeToolResult(result),
      testResult: summarizeTestResult(action, result),
      errorInfo: summarizeErrorInfo(result),
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    let decision;
    try {
      decision = parseReflectionDecision(await this.model.generate(
        [
          ...this.messages,
          { role: "user", content: reflectionPrompt },
        ],
        { signal: this.signal },
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onEvent?.({
        type: "error",
        message: `复盘输出无法解析：${message}。已回到普通 ReAct 流程。`,
      });
      this.messages.push({
        role: "reflection",
        content: `复盘解析失败：${message}。请继续按 ReAct 协议推进。`,
      });
      return;
    }

    this.onEvent?.({ type: "reflection", text: decision.summary });

    if (decision.type === "final") {
      this.onEvent?.({ type: "final", answer: decision.answer });
      this.messages.push({ role: "exit", content: decision.answer });
      return;
    }

    this.messages.push({
      role: "reflection",
      content: `复盘结果：${decision.summary}\n下一步建议：${decision.next}`,
    });
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted) {
      throw new Error("任务已中断。");
    }
  }
}

async function readModelStream(model: Model, messages: Message[], signal?: AbortSignal): Promise<string> {
  let output = "";

  for await (const chunk of model.stream(messages, { signal })) {
    if (signal?.aborted) {
      throw new Error("任务已中断。");
    }

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

function summarizeToolResult(result: ToolResult): string {
  const stdoutLength = result.stdout.length;
  const stderrLength = result.stderr.length;
  return `exitCode=${result.exitCode}，stdout ${stdoutLength} 字符，stderr ${stderrLength} 字符。`;
}

function summarizeTestResult(action: ToolCommand, result: ToolResult): string {
  if (action.name !== "run_shell" || !looksLikeTestCommand(action.command)) {
    return "上一轮没有运行测试命令。";
  }

  if (result.exitCode === 0) {
    return "测试命令通过。";
  }

  return `测试命令失败，exitCode=${result.exitCode}。`;
}

function summarizeErrorInfo(result: ToolResult): string {
  const combined = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  if (!combined || result.exitCode === 0) {
    return "无";
  }

  return combined.slice(0, 2000);
}

function looksLikeTestCommand(command: string): boolean {
  return /\b(test|typecheck|build|check|vitest|jest|mocha|pytest|cargo test|go test)\b/i.test(command);
}
