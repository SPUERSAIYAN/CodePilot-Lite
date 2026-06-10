# 中文 AI Coding CLI 工具开发手册

## 1. 产品定位

本项目目标是开发一个中文 AI coding CLI 工具，产品定位只针对写代码。第一版不做通用聊天助手，不做网页 UI，不做 IDE 插件，不做多模型复杂编排，核心目标是让中文用户在终端里用自然语言提出编码任务，工具通过模型规划、执行本地命令、读取结果并继续迭代，最终用中文说明代码修改结果或明确失败原因。

第一版的成功标准：

- 可以在 Node.js 20.15.0 环境下用 `pnpm` 安装并运行。
- 可以通过 `.env` 配置 DeepSeek API Key。
- 可以在终端中输入中文自然语言编码任务。
- CLI 提示、错误信息、最终回答默认使用中文。
- Agent 能按 `query -> parse -> execute -> observe` 循环工作。
- 可以调用本地 shell 命令并把执行结果反馈给模型。
- 模型接入被隔离在统一 `Model` 接口后面，业务逻辑不直接依赖 DeepSeek 实现。

## 2. 技术选型

| 模块         | 选型                                  | 说明                                     |
| ------------ | ------------------------------------- | ---------------------------------------- |
| 语言         | TypeScript strict                     | 核心开发语言                             |
| 运行时       | Node.js 20.15.0                       | 固定第一版运行环境                       |
| 模块系统     | ESM                                   | 使用 `import/export`                   |
| 包管理       | pnpm                                  | 管理依赖                                 |
| 开发运行     | tsx                                   | 直接运行 TypeScript                      |
| 类型检查     | tsc                                   | 第一版暂时不引入 tsup                    |
| CLI          | Node.js `readline`                  | 第一版不引入 Commander                   |
| 配置         | `.env` + `dotenv`                 | 保存 DeepSeek API Key 等配置             |
| 配置校验     | 手写简单校验                          | 第一版暂时不引入 Zod                     |
| 模型接入     | 自定义统一 `Model` 接口             | 隔离 DeepSeek 具体实现                   |
| DeepSeek API | `openai` SDK + DeepSeek `baseURL` | 使用 OpenAI 兼容接口                     |
| Agent 循环   | ReAct                                 | `query -> parse -> execute -> observe` |
| 命令执行     | `execa`                             | 本地执行 Shell 命令                      |
| 上下文       | `Message[]`                         | 线性存储全部消息                         |
| 日志         | `console`                           | 第一版不引入 Pino                        |
| 文件操作     | `node:fs/promises`                  | 需要时直接使用                           |
| 测试         | 暂时不引入                            | 跑通后再加入 Vitest                      |

## 3. 第一版范围

### 3.1 做什么

- 启动一个交互式 CLI。
- 接收用户输入的中文编码任务。
- 把任务追加到消息上下文。
- 调用 DeepSeek 生成下一步动作。
- 解析模型输出中的动作。
- 支持执行 shell 命令。
- 把命令输出追加回上下文。
- 循环直到模型返回中文最终答案。

### 3.2 不做什么

- 不实现复杂权限系统。
- 不实现多模型路由。
- 不实现插件市场。
- 不实现长期记忆。
- 不实现向量数据库。
- 不实现 TUI。
- 不实现自动 git commit。
- 不实现后台 daemon。
- 不实现跨平台 shell 抽象，只优先保证当前开发环境可用。

## 4. 推荐目录结构

```text
.
├── .env
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── src
    ├── index.ts
    ├── cli
    │   └── repl.ts
    ├── config
    │   └── env.ts
    ├── agent
    │   ├── loop.ts
    │   ├── parser.ts
    │   └── types.ts
    ├── models
    │   ├── model.ts
    │   └── deepseek.ts
    └── tools
        └── shell.ts
```

目录职责：

- `src/index.ts`：程序入口，只负责加载配置并启动 CLI。
- `src/cli/repl.ts`：终端交互层，使用 `readline` 接收用户输入。
- `src/config/env.ts`：读取 `.env` 并做最小配置校验。
- `src/models/model.ts`：定义统一模型接口。
- `src/models/deepseek.ts`：DeepSeek 的 OpenAI 兼容实现。
- `src/agent/loop.ts`：Agent 主循环。
- `src/agent/parser.ts`：解析模型输出。
- `src/agent/types.ts`：Agent 相关类型。
- `src/tools/shell.ts`：用 `execa` 执行本地命令。

## 5. 基础工程配置

### 5.1 package.json

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "dotenv": "latest",
    "execa": "latest",
    "openai": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest"
  },
  "engines": {
    "node": "20.15.0"
  }
}
```

### 5.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

### 5.3 .env.example

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

真实 API Key 只写入本地 `.env`，不要写入 Markdown 文档、示例文件或提交到 git。

## 6. 核心类型设计

### 6.1 消息类型

`Message[]` 是第一版唯一上下文结构，按顺序保存所有对话和观察结果。

```ts
export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
}
```

### 6.2 模型接口

业务代码只依赖 `Model`，不直接依赖 OpenAI SDK 或 DeepSeek。

```ts
export interface Model {
  generate(messages: Message[]): Promise<string>;
}
```

### 6.3 Agent 动作

第一版只支持两种动作：

- `shell`：执行本地 shell 命令。
- `final`：结束循环并返回最终答案。

```ts
export type AgentAction =
  | {
      type: "shell";
      command: string;
    }
  | {
      type: "final";
      answer: string;
    };
```

## 7. 模型输出协议

为了降低解析复杂度，第一版要求模型只输出 JSON。

执行命令：

```json
{
  "type": "shell",
  "command": "pnpm typecheck"
}
```

结束任务：

```json
{
  "type": "final",
  "answer": "已完成修改，并通过 pnpm typecheck。"
}
```

解析规则：

- 只接受合法 JSON。
- `type` 必须是 `shell` 或 `final`。
- `shell.command` 必须是非空字符串。
- `final.answer` 必须是非空字符串。
- 解析失败时，把错误作为 `tool` 消息反馈给模型，让模型重新输出。

## 8. Agent 循环

Agent 主流程：

```text
1. 接收用户任务
2. 追加 user message
3. 调用 model.generate(messages)
4. 解析 assistant 输出
5. 如果是 shell：
   5.1 执行命令
   5.2 把 stdout、stderr、exitCode 追加为 tool message
   5.3 回到第 3 步
6. 如果是 final：
   6.1 输出最终答案
   6.2 结束本轮任务
```

第一版需要设置最大循环次数，例如 `maxSteps = 10`。超过后直接终止，避免模型无限调用命令。

## 9. Shell 工具设计

`shell` 工具只负责执行命令并返回结构化结果。

```ts
export interface ShellResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

执行约束：

- 使用 `execa`。
- 默认在当前工作目录执行。
- 捕获失败命令，不让异常中断 Agent 循环。
- 输出长度需要截断，避免上下文被一次命令填满。

第一版建议限制：

- `stdout` 最多保留 12000 字符。
- `stderr` 最多保留 12000 字符。
- 超出部分追加提示：`[output truncated]`。

## 10. 配置读取与校验

配置字段：

```ts
export interface AppConfig {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
}
```

校验规则：

- `DEEPSEEK_API_KEY` 必填。
- `DEEPSEEK_BASE_URL` 没有配置时使用 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL` 没有配置时使用 `deepseek-v4-pro`。
- 第一版使用 OpenAI 兼容接口，不接入 Anthropic 兼容地址；Anthropic 兼容地址是 `https://api.deepseek.com/anthropic`，后续需要时再加入。

配置错误应该在启动时失败，并输出明确原因。

## 11. Prompt 设计

系统提示词需要约束模型只服务写代码任务，默认使用中文和用户交互，并遵守工具协议。

建议内容：

```text
你是一个中文 CLI AI coding agent，只帮助用户完成代码相关任务。
你可以通过 shell 命令观察和修改本地仓库。
你必须只输出 JSON，不要输出 Markdown，不要输出解释性文字。

可用动作：
1. {"type":"shell","command":"..."}
2. {"type":"final","answer":"..."}

工作规则：
- 优先读取代码和配置后再修改。
- 修改要尽量小。
- 每次只执行一个明确命令。
- 完成后尽量运行类型检查或项目已有验证命令。
- final.answer 必须使用中文。
- CLI 面向中文用户，错误说明、完成说明和需要用户介入的信息都用中文。
- 如果任务不属于写代码，返回 final 并用中文说明无法处理。
```

## 12. 开发顺序

建议按以下顺序实现：

1. 初始化 TypeScript 工程。
   验证：`pnpm typecheck` 可以运行。
2. 实现 `.env` 配置读取。
   验证：缺少 `DEEPSEEK_API_KEY` 时启动失败并输出清晰错误。
3. 实现 `Model` 接口和 `DeepSeekModel`。
   验证：能发送固定消息并拿到模型文本响应。
4. 实现 `readline` CLI。
   验证：终端可以持续输入中文任务，输入 `exit` 可以退出。
5. 实现 JSON parser。
   验证：合法 JSON 能解析，非法 JSON 会返回解析错误。
6. 实现 `shell` 工具。
   验证：能执行 `node --version` 并拿到 stdout。
7. 实现 Agent 循环。
   验证：用户输入“运行类型检查”，Agent 能调用 shell 并返回结果。
8. 接入真实编码任务。
   验证：在一个小仓库中让 Agent 修改一处代码，并运行验证命令。

## 13. 第一版命令约定

启动：

```bash
pnpm dev
```

类型检查：

```bash
pnpm typecheck
```

退出 CLI：

```text
exit
```

CLI 提示符建议：

```text
请输入编码任务 > 
```

## 14. 错误处理策略

第一版只处理真实会影响主流程的错误：

- 配置缺失：启动失败。
- 模型请求失败：当前任务失败，提示错误。
- 模型输出无法解析：反馈给模型重试。
- shell 命令失败：把 `exitCode/stdout/stderr` 反馈给模型，由模型决定下一步。
- 超过最大循环次数：终止当前任务。

不要为第一版加入复杂重试、错误分类、遥测或恢复机制。

## 15. 安全边界

第一版是本地开发者工具，默认信任用户，但仍需要明确边界：

- 工具会执行模型生成的 shell 命令。
- 不应在未告知用户的情况下自动提交、推送或发布。
- 不应默认读取 `.env` 内容并回显给模型以外的外部位置。
- 文档和 README 中必须提示：只在可信代码仓库中使用。

第一版可以先不做命令确认流程。如果后续要更安全，可以在执行 shell 前增加人工确认。

## 16. 后续迭代方向

第一版跑通后再考虑：

- 加入 Vitest。
- 增加文件读写工具，减少 shell 依赖。
- 增加命令执行确认。
- 增加上下文压缩。
- 增加 git diff 摘要。
- 增加项目规则读取，例如 `AGENTS.md`。
- 增加更严格的模型输出 schema 校验。
- 支持多模型配置。

## 17. 最小可验收结果

完成第一版时，需要满足：

```text
1. pnpm install 成功
2. pnpm typecheck 成功
3. pnpm dev 可以启动交互式 CLI
4. 缺少 API Key 时有明确错误
5. 输入中文 coding 任务后模型会返回 JSON 动作
6. shell 动作可以被执行并反馈观察结果
7. final 动作可以结束任务并显示中文最终答案
```

只要以上全部满足，就认为第一版开发目标完成。后续优化不应阻塞第一版交付。
