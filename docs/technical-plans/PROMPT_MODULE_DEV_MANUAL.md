# 中文 AI Coding CLI 提示词模块技术方案

## 1. 目标

提示词模块要做成可维护、可审查、可版本化的独立模块。提示词内容不直接写死在 TypeScript 代码里，代码只负责加载、校验、变量注入和组装消息。

第一版目标：

- 提示词以 Markdown 文件保存。
- 每个提示词文件有明确用途、版本和变量。
- 代码不硬编码大段 prompt 文本。
- 支持系统提示词、任务包装提示词、工具观察提示词。
- 支持中文 AI coding CLI 的输出规范。
- 支持模型流式输出和 Agent JSON 动作协议。
- 启动时校验提示词文件是否存在、变量是否完整。

## 2. 设计原则

- **提示词资产化**：prompt 是产品资产，放在 `prompts/` 目录中独立管理。
- **代码只做编排**：TypeScript 只做读取、变量替换、校验和消息组装。
- **格式简单**：第一版只用 Markdown + JSON manifest，不引入模板引擎。
- **变量显式**：所有可替换变量必须在 manifest 中声明。
- **失败要早**：缺文件、缺变量、版本不匹配时启动失败。
- **中文优先**：用户可见内容默认中文。
- **不暴露隐藏推理**：只允许输出可公开计划、动作和观察摘要。

## 3. 不做什么

第一版不做：

- 不做 PromptOps 平台。
- 不做在线 prompt 编辑器。
- 不做多套实验 prompt 自动切换。
- 不做 A/B 测试。
- 不做远程拉取 prompt。
- 不做复杂模板语法。
- 不把 API Key、`.env` 内容、token、私钥写入 prompt。

## 4. 推荐目录结构

```text
.
├── prompts
│   ├── manifest.json
│   ├── system.md
│   ├── task.md
│   └── tool-observation.md
└── src
    └── prompts
        ├── loader.ts
        ├── render.ts
        ├── types.ts
        └── index.ts
```

职责：

- `prompts/manifest.json`：声明 prompt 版本、文件、变量和校验要求。
- `prompts/system.md`：系统提示词。
- `prompts/task.md`：用户任务包装提示词。
- `prompts/tool-observation.md`：工具执行结果包装提示词。
- `src/prompts/loader.ts`：读取 prompt 文件和 manifest。
- `src/prompts/render.ts`：执行简单变量替换。
- `src/prompts/types.ts`：定义提示词模块类型。
- `src/prompts/index.ts`：对外提供统一 API。

## 5. manifest 设计

`manifest.json` 是提示词模块的入口。代码读取它，而不是在代码中写死 prompt 文件名和变量规则。

示例：

```json
{
  "version": "0.1.0",
  "language": "zh-CN",
  "prompts": {
    "system": {
      "file": "system.md",
      "requiredVariables": ["cwd", "platform", "maxSteps"]
    },
    "task": {
      "file": "task.md",
      "requiredVariables": ["task"]
    },
    "toolObservation": {
      "file": "tool-observation.md",
      "requiredVariables": ["command", "exitCode", "stdout", "stderr"]
    }
  }
}
```

第一版 manifest 只需要这些字段：

- `version`：提示词版本。
- `language`：默认语言，固定 `zh-CN`。
- `prompts`：提示词清单。
- `file`：提示词文件名。
- `requiredVariables`：渲染时必须提供的变量名。

## 6. 模板变量规范

提示词文件使用双花括号变量：

```text
{{cwd}}
{{platform}}
{{maxSteps}}
{{task}}
{{command}}
{{exitCode}}
{{stdout}}
{{stderr}}
```

变量规则：

- 变量名只允许字母、数字和下划线。
- 未声明变量不能使用。
- 声明变量必须全部传入。
- 变量缺失时直接抛错。
- 第一版不支持条件语句、循环、include。

## 7. system.md

`system.md` 定义模型角色、边界、输出协议和安全规则。

推荐内容：

```md
你是一个中文 AI coding CLI agent，只帮助用户完成代码相关任务。

## 运行环境

- 当前工作目录：{{cwd}}
- 当前平台：{{platform}}
- 当前任务最多允许 {{maxSteps}} 步。

## 任务边界

- 你只能处理代码阅读、代码修改、调试、类型检查、构建、测试、重构和开发文档相关任务。
- 如果用户请求与写代码无关，返回 final，并用中文简短说明无法处理。

## 工作规则

- 你通过 shell 命令观察和修改本地仓库。
- 优先读取项目结构、配置文件和相关代码后再修改。
- 修改要尽量小，避免无关重构。
- 每次只输出一个动作。
- 完成后尽量运行类型检查、构建或项目已有验证命令。

## 输出格式

- 你必须只输出一个 JSON 对象。
- 不要输出 Markdown。
- 不要输出 JSON 之外的解释文字。
- 不要把 JSON 包在代码块里。

## 可用动作

shell 动作：
{"type":"shell","thought":"可公开展示的中文计划，最多 80 字","command":"要执行的 shell 命令"}

final 动作：
{"type":"final","thought":"可公开展示的中文总结，最多 80 字","answer":"中文最终回答"}

## thought 规则

- thought 只写可公开展示的简短计划或总结。
- 不要输出隐藏推理、长篇思考过程或 chain-of-thought。
- 不要描述无法验证的心理活动。

## 安全规则

- 不要主动读取或打印 .env、私钥、token、证书等敏感文件内容。
- 不要自动执行 git commit、git push、发布、部署、删除大量文件等高风险操作。
- 如果确实需要高风险操作，返回 final 用中文说明需要用户手动确认。
```

## 8. task.md

`task.md` 负责把用户输入包装成稳定任务。

推荐内容：

```md
用户的编码任务如下：

{{task}}

请根据系统规则返回下一步 JSON 动作。
```

不要把策略重复写进 `task.md`。策略集中放在 `system.md`，避免每轮用户消息膨胀。

## 9. tool-observation.md

`tool-observation.md` 负责把 shell 执行结果包装成模型可读观察。

推荐内容：

```md
命令执行结果：

command: {{command}}
exitCode: {{exitCode}}

stdout:
{{stdout}}

stderr:
{{stderr}}
```

如果 stdout 或 stderr 被截断，由调用方在变量内容中追加：

```text
[output truncated]
```

## 10. TypeScript 类型

```ts
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
```

## 11. 加载流程

启动时执行一次加载和校验。

```text
1. 读取 prompts/manifest.json
2. 校验 manifest 基本结构
3. 按 manifest.prompts 读取每个 prompt 文件
4. 校验文件是否存在且非空
5. 扫描模板中的 {{variable}}
6. 校验模板变量都在 requiredVariables 中声明
7. 返回 PromptBundle
```

缺任何文件或变量不一致时，启动失败并输出中文错误。

## 12. 渲染流程

```text
1. 根据 prompt 名称找到模板
2. 读取 requiredVariables
3. 校验变量全部传入
4. 把变量转成字符串
5. 替换 {{variable}}
6. 返回渲染后的 prompt 文本
```

变量替换只做精确替换，不做表达式求值。

## 13. 对外 API

```ts
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
```

Agent 只依赖 `PromptService`，不直接读取文件。

## 14. 与 Message[] 的关系

初始化：

```ts
const messages: Message[] = [
  {
    role: "system",
    content: promptService.renderSystemPrompt({
      cwd: process.cwd(),
      platform: process.platform,
      maxSteps: 10
    })
  }
];
```

用户任务：

```ts
messages.push({
  role: "user",
  content: promptService.renderTaskPrompt({ task })
});
```

工具观察：

```ts
messages.push({
  role: "tool",
  content: promptService.renderToolObservation({
    command,
    exitCode,
    stdout,
    stderr
  })
});
```

## 15. 校验规则

manifest 校验：

- `version` 必须是非空字符串。
- `language` 必须是 `zh-CN`。
- `prompts.system`、`prompts.task`、`prompts.toolObservation` 必须存在。
- 每个 `file` 必须是相对文件名，不能包含绝对路径。
- 每个 `requiredVariables` 必须是字符串数组。

模板校验：

- 文件必须存在。
- 文件内容必须非空。
- 模板内变量必须全部出现在 `requiredVariables`。
- `requiredVariables` 中声明的变量必须至少在模板中出现一次。

渲染校验：

- 调用方必须传入全部必需变量。
- 变量值不能是 `undefined` 或 `null`。

## 16. 安全规则

提示词模块不得：

- 读取 `.env` 并注入 prompt。
- 把 API Key 注入 prompt。
- 自动读取敏感文件内容。
- 在错误信息中打印敏感变量值。

工具观察进入 prompt 前，需要由调用方完成敏感信息过滤或截断。

## 17. 开发顺序

1. 创建 `prompts/manifest.json`。
   验证：包含 `system`、`task`、`toolObservation` 三个 prompt 定义。

2. 创建 `prompts/system.md`。
   验证：包含中文 AI coding CLI 定位、JSON 动作协议和安全规则。

3. 创建 `prompts/task.md`。
   验证：包含 `{{task}}`。

4. 创建 `prompts/tool-observation.md`。
   验证：包含 `{{command}}`、`{{exitCode}}`、`{{stdout}}`、`{{stderr}}`。

5. 实现 `src/prompts/types.ts`。
   验证：Prompt 相关类型集中定义。

6. 实现 `src/prompts/loader.ts`。
   验证：能读取 manifest 和三个 Markdown 文件。

7. 实现 `src/prompts/render.ts`。
   验证：变量替换正确，缺变量会报错。

8. 实现 `src/prompts/index.ts`。
   验证：Agent 可以通过 `PromptService` 获取渲染后的 prompt。

9. 接入 Agent。
   验证：`Message[]` 中的 system/user/tool 内容都来自 prompt 模块。

## 18. 验收标准

```text
1. pnpm typecheck 成功
2. prompts/manifest.json 存在
3. prompts/system.md 存在，且包含中文 AI coding CLI 定位
4. prompts/task.md 存在，且包含 {{task}}
5. prompts/tool-observation.md 存在，且包含工具观察变量
6. TypeScript 代码中没有大段硬编码系统提示词
7. 启动时会校验 prompt 文件和变量声明
8. 缺 prompt 文件时启动失败并显示中文错误
9. 缺必需变量时渲染失败并显示中文错误
10. Agent 消息内容通过 PromptService 渲染
11. 模型仍被约束为只输出 shell/final JSON 动作
12. final.answer 默认中文
```

满足以上标准，认为提示词模块技术方案第一版完成。
