import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import { runAgent } from "../../src/agent/loop.js";
import { parseReflectionDecision } from "../../src/agent/reflection.js";
import type { AgentEvent, Message } from "../../src/agent/types.js";
import type { RepoMapService } from "../../src/context/repo-map.js";
import type { Model, ModelRequestOptions } from "../../src/models/model.js";
import { createPromptService } from "../../src/prompts/index.js";

test("parseReflectionDecision parses continue decisions", () => {
  const decision = parseReflectionDecision(JSON.stringify({
    type: "continue",
    summary: "已读取文件，还需要继续检查调用方。",
    next: "继续读取调用方。",
  }));

  assert.deepEqual(decision, {
    type: "continue",
    summary: "已读取文件，还需要继续检查调用方。",
    next: "继续读取调用方。",
  });
});

test("parseReflectionDecision parses final decisions", () => {
  const decision = parseReflectionDecision(JSON.stringify({
    type: "final",
    summary: "验证已通过，可以结束。",
    answer: "已完成修改并通过验证。",
  }));

  assert.deepEqual(decision, {
    type: "final",
    summary: "验证已通过，可以结束。",
    answer: "已完成修改并通过验证。",
  });
});

test("parseReflectionDecision rejects invalid reflection JSON", () => {
  assert.throws(
    () => parseReflectionDecision("{"),
    /复盘输出不是合法 JSON/,
  );
  assert.throws(
    () => parseReflectionDecision(JSON.stringify({ type: "continue", next: "继续" })),
    /summary 必须是非空字符串/,
  );
  assert.throws(
    () => parseReflectionDecision(JSON.stringify({ type: "tool", summary: "错误" })),
    /type 必须是 continue 或 final/,
  );
});

test("runAgent reflects after a tool result and can finish from reflection", async () => {
  const model = new ScriptedModel([
    JSON.stringify({
      type: "tool",
      thought: "先读取测试目录。",
      command: { name: "list_files", path: "tests" },
    }),
    JSON.stringify({
      type: "final",
      summary: "目录已读取，任务可以结束。",
      answer: "已读取 tests 目录。",
    }),
  ]);
  const events: AgentEvent[] = [];

  const answer = await runAgent(
    "读取 tests 目录",
    model,
    await createPromptService(),
    new FakeRepoMapService(),
    (event) => events.push(event),
  );

  assert.equal(answer, "已读取 tests 目录。");
  assert.equal(model.messagesAtCalls.length, 2);
  const reflectionPrompt = model.messagesAtCalls[1].at(-1)?.content ?? "";
  assert.match(reflectionPrompt, /用户目标：读取 tests 目录/);
  assert.match(reflectionPrompt, /上一轮动作：\{"name":"list_files","path":"tests"\}/);
  assert.match(reflectionPrompt, /工具结果：exitCode=0/);
  assert.match(reflectionPrompt, /测试结果：上一轮没有运行测试命令。/);
  assert.match(reflectionPrompt, /错误信息：无/);
  assert.match(reflectionPrompt, /1\. 当前任务是否完成/);
  assert.match(reflectionPrompt, /2\. 上一步是否有效/);
  assert.match(reflectionPrompt, /3\. 是否遗漏相关文件/);
  assert.match(reflectionPrompt, /4\. 下一步最合理的操作是什么/);
  assert.match(reflectionPrompt, /summary 字段必须存在且不能为空/);
  assert.match(reflectionPrompt, /不要把 summary 改名为/);
  assert.deepEqual(events.filter((event) => event.type === "reflection"), [
    { type: "reflection", text: "目录已读取，任务可以结束。" },
  ]);
  assert.equal(events.at(-1)?.type, "final");
});

test("runAgent stores continue reflection before the next ReAct query", async () => {
  const model = new ScriptedModel([
    JSON.stringify({
      type: "tool",
      thought: "先读取测试目录。",
      command: { name: "list_files", path: "tests" },
    }),
    JSON.stringify({
      type: "continue",
      summary: "已经拿到目录，还需要给出最终答复。",
      next: "下一轮直接总结。",
    }),
    JSON.stringify({
      type: "final",
      thought: "复盘后结束。",
      answer: "已完成。",
    }),
  ]);

  const answer = await runAgent(
    "读取 tests 目录",
    model,
    await createPromptService(),
    new FakeRepoMapService(),
  );

  assert.equal(answer, "已完成。");
  assert.equal(model.messagesAtCalls.length, 3);
  assert.match(model.messagesAtCalls[2].at(-1)?.content ?? "", /复盘结果：已经拿到目录，还需要给出最终答复。/);
  assert.match(model.messagesAtCalls[2].at(-1)?.content ?? "", /下一步建议：下一轮直接总结。/);
});

test("runAgent continues when reflection parsing fails", async () => {
  const model = new ScriptedModel([
    JSON.stringify({
      type: "tool",
      thought: "先读取测试目录。",
      command: { name: "list_files", path: "tests" },
    }),
    "not json",
    JSON.stringify({
      type: "final",
      thought: "复盘失败后继续结束。",
      answer: "已继续。",
    }),
  ]);
  const events: AgentEvent[] = [];

  const answer = await runAgent(
    "读取 tests 目录",
    model,
    await createPromptService(),
    new FakeRepoMapService(),
    (event) => events.push(event),
  );

  assert.equal(answer, "已继续。");
  assert.ok(events.some((event) => event.type === "error" && event.message.includes("复盘输出无法解析")));
  assert.match(model.messagesAtCalls[2].at(-1)?.content ?? "", /复盘解析失败/);
});

test("runAgent stops reflecting after the reflection limit", async () => {
  const model = new ScriptedModel([
    JSON.stringify({
      type: "tool",
      thought: "读取测试目录。",
      command: { name: "list_files", path: "tests" },
    }),
    JSON.stringify({
      type: "final",
      thought: "未复盘也可结束。",
      answer: "已结束。",
    }),
  ]);

  const answer = await runAgent(
    "读取 tests 目录",
    model,
    await createPromptService(),
    new FakeRepoMapService(),
    undefined,
    { maxReflections: 0 },
  );

  assert.equal(answer, "已结束。");
  assert.equal(model.messagesAtCalls.length, 2);
});

test("runAgent still marks the repo map dirty after write_file", async () => {
  const targetPath = "reflection-dirty-test.tmp";
  const repoMapService = new FakeRepoMapService();
  const model = new ScriptedModel([
    JSON.stringify({
      type: "tool",
      thought: "写入临时文件。",
      command: { name: "write_file", path: targetPath, content: "ok" },
    }),
    JSON.stringify({
      type: "final",
      summary: "写入完成。",
      answer: "临时文件已写入。",
    }),
  ]);

  try {
    await runAgent(
      "写入临时文件",
      model,
      await createPromptService(),
      repoMapService,
    );

    assert.equal(repoMapService.dirtyCount, 1);
  } finally {
    await rm(targetPath, { force: true });
  }
});

test("runAgent stops when aborted during model stream", async () => {
  const controller = new AbortController();
  const model = new AbortingStreamModel(controller);

  await assert.rejects(
    runAgent(
      "可中断任务",
      model,
      await createPromptService(),
      new FakeRepoMapService(),
      undefined,
      { signal: controller.signal },
    ),
    /任务已中断/,
  );
  assert.equal(model.seenSignal, controller.signal);
});

class ScriptedModel implements Model {
  readonly messagesAtCalls: Message[][] = [];
  private outputIndex = 0;

  constructor(private readonly outputs: string[]) {}

  async generate(messages: Message[]): Promise<string> {
    this.messagesAtCalls.push(cloneMessages(messages));
    return this.readNextOutput();
  }

  async *stream(messages: Message[]): AsyncIterable<string> {
    this.messagesAtCalls.push(cloneMessages(messages));
    yield this.readNextOutput();
  }

  private readNextOutput(): string {
    const output = this.outputs[this.outputIndex];
    this.outputIndex += 1;

    if (output === undefined) {
      throw new Error("ScriptedModel 没有更多输出。");
    }

    return output;
  }
}

class AbortingStreamModel implements Model {
  seenSignal?: AbortSignal;

  constructor(private readonly controller: AbortController) {}

  async generate(): Promise<string> {
    throw new Error("不应调用 generate。");
  }

  async *stream(_messages: Message[], options: ModelRequestOptions = {}): AsyncIterable<string> {
    this.seenSignal = options.signal;
    this.controller.abort();
    yield "partial";
  }
}

class FakeRepoMapService implements RepoMapService {
  dirtyCount = 0;

  async getRepoMap(): Promise<string> {
    return "## Repo Map\n- tests";
  }

  markDirty(): void {
    this.dirtyCount += 1;
  }
}

function cloneMessages(messages: Message[]): Message[] {
  return messages.map((message) => ({ ...message }));
}
