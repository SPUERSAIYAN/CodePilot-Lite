# 中文 AI Coding CLI 前端开发手册

## 1. 定位

本文档描述中文 AI Coding CLI 的前端交互层。这里的“前端”不是 Web UI，而是终端里的用户界面，负责输入、输出、流式渲染、状态展示、命令执行反馈和错误提示。

CLI 前端的目标：

- 面向中文开发者。
- 默认使用中文提示、中文状态和中文最终回答。
- 支持模型回答流式输出。
- 展示 Agent 的可公开工作过程，包括计划、动作、命令、观察结果和总结。
- 不展示模型隐藏推理原文，避免把不可控的内部推理当作产品输出。

## 2. 交互原则

第一版保持简单，不做复杂 TUI。

- 使用 Node.js `readline`。
- 不引入 Commander。
- 不引入 Ink、Blessed、React CLI 等终端 UI 框架。
- 输出以纯文本为主。
- 用少量固定前缀区分不同类型的信息。
- 每轮任务结束后回到输入提示符。

推荐提示符：

```text
请输入编码任务 > 
```

退出命令：

```text
exit
```

## 3. 输出信息类型

CLI 前端需要区分 5 类信息。

| 类型 | 前缀 | 用途 |
| --- | --- | --- |
| 用户输入 | `你 >` | 回显用户任务，可选 |
| 模型输出 | `AI >` | 展示最终回答或普通文本 |
| 计划 | `计划 >` | 展示模型给出的可公开计划 |
| 命令 | `命令 >` | 展示即将执行的 shell 命令 |
| 观察 | `结果 >` | 展示命令执行结果摘要 |
| 错误 | `错误 >` | 展示配置、模型、解析或命令错误 |

第一版不需要颜色。后续可以再引入 `chalk`。

## 4. 关于“思考过程”的产品定义

用户需要看到工具在做什么，但不应该直接展示模型隐藏推理。

第一版展示这些内容：

- 当前准备做什么。
- 模型给出的简短计划。
- 即将执行的命令。
- 命令退出码。
- stdout/stderr 摘要。
- 下一步动作。
- 最终中文总结。

第一版不展示这些内容：

- 模型隐藏 chain-of-thought。
- 长篇内部推理。
- 无法验证的心理活动描述。
- 与代码任务无关的模型自述。

建议把“思考过程”实现为“可公开执行轨迹”。

示例：

```text
计划 > 我会先查看 package.json，确认项目命令，然后运行类型检查。
命令 > Get-Content package.json
结果 > exitCode=0，读取到 scripts: dev, typecheck
命令 > pnpm typecheck
结果 > exitCode=0，类型检查通过
AI > 已完成检查，当前项目类型检查通过。
```

## 5. 模型输出协议

为了支持流式输出和过程展示，第一版建议让模型仍然输出 JSON，但 JSON 中增加可公开展示字段。

```ts
export type AgentAction =
  | {
      type: "shell";
      thought?: string;
      command: string;
    }
  | {
      type: "final";
      thought?: string;
      answer: string;
    };
```

字段说明：

- `thought`：可公开的简短思路，不是隐藏推理。用于 CLI 展示为 `计划 >`。
- `command`：要执行的 shell 命令。
- `answer`：最终中文回答。

模型输出示例：

```json
{
  "type": "shell",
  "thought": "我先读取 package.json，确认项目的启动和检查命令。",
  "command": "Get-Content package.json"
}
```

最终输出示例：

```json
{
  "type": "final",
  "thought": "类型检查已经通过，可以结束本轮任务。",
  "answer": "已完成验证，项目当前可以通过 pnpm typecheck。"
}
```

## 6. 流式输出设计

### 6.1 流式输出目标

流式输出用于降低等待感，让用户看到模型正在生成内容。

第一版流式输出只用于：

- 展示模型生成中的文本片段。
- 最终拼接完整文本后再进入 JSON 解析。

不要边流式输出边执行命令。必须等模型输出完整 JSON 并成功解析后，再执行动作。

### 6.2 推荐流程

```text
1. 用户输入任务
2. CLI 显示：AI 正在分析...
3. 调用 model.stream(messages)
4. 边接收 token 边写入终端
5. 拼接完整 assistant 文本
6. 解析 JSON
7. 展示 thought
8. 执行 shell 或输出 final
```

### 6.3 Model 接口

模型接口需要从一次性生成扩展到流式生成。

```ts
export interface Model {
  generate(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
}
```

DeepSeek 使用 OpenAI 兼容接口时，`stream` 返回 token 片段。

伪代码：

```ts
export class DeepSeekModel implements Model {
  async *stream(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
```

## 7. CLI 渲染函数

第一版可以用一组简单函数隔离输出格式。

```ts
export function printPrompt(): void {
  process.stdout.write("请输入编码任务 > ");
}

export function printPlan(text: string): void {
  console.log(`计划 > ${text}`);
}

export function printCommand(command: string): void {
  console.log(`命令 > ${command}`);
}

export function printObservation(text: string): void {
  console.log(`结果 > ${text}`);
}

export function printError(message: string): void {
  console.error(`错误 > ${message}`);
}

export function writeStreamChunk(chunk: string): void {
  process.stdout.write(chunk);
}
```

后续如果需要颜色、折叠、进度条，只改这一层。

## 8. 流式 JSON 的显示策略

因为模型输出的是 JSON，直接流式打印原始 JSON 体验不好。

第一版有两个可选方案。

### 方案 A：流式显示原始输出

优点：

- 实现最简单。
- 有真实流式反馈。

缺点：

- 用户会看到 JSON。
- 体验偏开发调试。

适合第一天跑通。

### 方案 B：流式时显示等待状态，解析后显示结构化内容

优点：

- 用户体验更清晰。
- 不暴露 JSON 噪音。

缺点：

- 用户看不到 token 级文本。
- “流式感”弱一些。

第一版推荐方案 B。

示例：

```text
AI 正在分析...
计划 > 我会先查看 package.json，确认项目命令。
命令 > Get-Content package.json
```

## 9. readline 主循环

CLI 主循环职责：

- 显示中文提示符。
- 读取用户输入。
- 处理 `exit`。
- 忽略空输入。
- 把任务交给 Agent。
- 捕获错误并用中文展示。
- 每轮结束后重新显示提示符。

伪代码：

```ts
export async function startRepl(agent: Agent): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  while (true) {
    const input = await question(rl, "请输入编码任务 > ");
    const task = input.trim();

    if (!task) {
      continue;
    }

    if (task === "exit") {
      rl.close();
      return;
    }

    try {
      await agent.run(task);
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
    }
  }
}
```

## 10. Agent 与 CLI 前端的边界

Agent 不应该直接散落 `console.log`。

推荐让 Agent 接收一个事件回调：

```ts
export type AgentEvent =
  | { type: "model_start" }
  | { type: "model_delta"; text: string }
  | { type: "plan"; text: string }
  | { type: "command"; command: string }
  | { type: "observation"; text: string }
  | { type: "final"; answer: string }
  | { type: "error"; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;
```

Agent 只发事件，CLI 负责怎么展示。

这样做的好处：

- Agent 逻辑更容易测试。
- CLI 输出格式集中管理。
- 后续可以替换成 TUI 或 Web UI。

## 11. 推荐事件展示规则

| AgentEvent | CLI 展示 |
| --- | --- |
| `model_start` | `AI 正在分析...` |
| `model_delta` | 方案 A 中直接 `process.stdout.write` |
| `plan` | `计划 > ...` |
| `command` | `命令 > ...` |
| `observation` | `结果 > ...` |
| `final` | `AI > ...` |
| `error` | `错误 > ...` |

如果使用方案 B，`model_delta` 只用于内部拼接，不展示。

## 12. 命令执行结果展示

不要把完整 stdout/stderr 无脑打印到终端。

第一版建议展示：

```text
结果 > exitCode=0
stdout:
...
stderr:
...
```

输出限制：

- stdout 最多展示 4000 字符。
- stderr 最多展示 4000 字符。
- 超出后显示 `[output truncated]`。

完整内容仍可以放进 Agent 上下文，但也建议截断，避免上下文过长。

## 13. 中文错误信息

配置错误：

```text
错误 > 缺少 DEEPSEEK_API_KEY，请在 .env 中配置。
```

模型错误：

```text
错误 > 模型请求失败，请检查网络、API Key 或模型名称。
```

解析错误：

```text
错误 > 模型输出无法解析，已要求模型重新输出合法 JSON。
```

命令错误：

```text
结果 > exitCode=1，命令执行失败，已把错误输出交给模型分析。
```

## 14. 开发顺序

1. 实现 `cli/render.ts`。
   验证：所有输出函数能正常打印中文前缀。

2. 实现 `Model.stream()`。
   验证：能逐片段接收 DeepSeek 输出，并拼接成完整字符串。

3. 在 Agent 中加入事件回调。
   验证：模型开始、计划、命令、观察和最终答案都会触发事件。

4. 实现 `readline` 主循环。
   验证：中文提示符正常显示，`exit` 可以退出。

5. 接入流式 Agent。
   验证：用户输入中文编码任务后，CLI 能展示分析状态、计划、命令、结果和中文最终回答。

## 15. 验收标准

```text
1. pnpm typecheck 成功
2. pnpm dev 可以启动中文 CLI
3. CLI 显示：请输入编码任务 >
4. 输入中文任务后会显示：AI 正在分析...
5. Agent 生成 shell 动作时会显示：计划 > 和 命令 >
6. shell 执行完成后会显示：结果 >
7. Agent 结束时会显示中文 AI 最终回答
8. 不展示模型隐藏推理原文
```

满足以上标准，认为第一版 CLI 前端完成。
