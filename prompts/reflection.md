请根据用户目标、已执行动作和工具/测试结果进行复盘。

用户目标：{{task}}

上一轮动作：{{lastAction}}

工具结果：{{toolResult}}

测试结果：{{testResult}}

错误信息：{{errorInfo}}

原始工具输出：

command: {{command}}
exitCode: {{exitCode}}

stdout:
{{stdout}}

stderr:
{{stderr}}

请判断：
1. 当前任务是否完成
2. 上一步是否有效
3. 是否遗漏相关文件
4. 下一步最合理的操作是什么

只输出一个 JSON 对象，不要输出 Markdown，不要输出 JSON 之外的文字。

硬性输出要求：
- summary 字段必须存在且不能为空。
- summary 必须是可公开展示的中文短句，最多 80 字。
- 不要把 summary 改名为 analysis、reason、thought、reflection、message 或其他字段。
- type 为 continue 时必须同时包含 type、summary、next。
- type 为 final 时必须同时包含 type、summary、answer。

如果还需要继续修或继续验证，输出：
{"type":"continue","summary":"可公开展示的中文复盘，最多 80 字","next":"下一轮 ReAct 应该关注什么，最多 80 字"}

如果任务已经可以结束，输出：
{"type":"final","summary":"可公开展示的中文复盘，最多 80 字","answer":"中文最终回答"}
