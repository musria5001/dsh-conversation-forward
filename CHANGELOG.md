# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，
版本号用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-11-06

首个可用版本。

### 新增

- **摘选面板**：挂在官方 `conversation.input.left` 槽位，不替换任何官方渲染
  - 按顺序列出本会话的用户消息与 AI 回复（角色标签 + `#seq` 预览）
  - 连续的工具调用步骤自动折叠成一组，可整组勾选，组内条目仍可单独勾选
  - 全选 / 清除；勾选数实时显示在触发按钮上
- **两种内容模式**：`原文`（保留角色与时序）/ `摘要`
- **两种投递方式**
  - `新建对话`：在所选工作区新建会话，把文案作为首条消息
  - `文案生成`：不新建任何东西，只在当前对话输出可复制的代码块文案
- **宿主路由** `POST /api/forward-panel/create`：插件自己建会话（`ctx.agents.create` + 挂载工作区 + 投递首条消息），不再依赖第三方插件的建会话能力
- **模型与预设自适应**
  - 请求带 `sessionId` 时，读取来源会话最近一次 `request/header`，继承 `provider` / `model` / `reasoningEffort`
  - 预设按 `配置 → 来源会话的 agentPreset → standard` 解析
  - 都没有时返回 `E_NO_MODEL`，并给出可操作的提示
- **配置项**：`provider` / `model` / `reasoningEffort` / `preset`，全部可留空（走继承）
- **英文文档**：`README.md` / `README.en.md`
- **Issue 模板**：bug 反馈表单（强制版本、复现步骤、接口返回）、功能请求表单、文档联系链接

### 修复

- 新建会话首轮报 `prompt variable "{{model}}" has no value`：建会话时用 `agentOptions` 钉住初始路由
- **模型选择器被锁死**：早期实现给 `agent/request` 挂了强制钩子，导致新会话无法切换模型；已删除，初始路由只作用于首轮
- **连点建出两个会话**：面板提交加了 1.5 秒去抖
- **助手重试/并发请求重复建会话**：路由层对相同 `(cwd, prompt)` 做 15 秒幂等去重，返回同一 `sessionId`（带 `deduped: true`）
- **改名后按钮消失**：包名、`cordis.patch.yml`、`index.js` 的 `export const name`、`client.js` 的模块 id 四处必须一致，已统一为 `dsh-forward-panel`
- **插件在缺少 `sessionPersistence` 的宿主上无法激活**：改为运行时 `ctx.get()` 读取，缺失时降级到配置

### 变更

- 建会话方式从"依赖 `dsh-session-bridge` 的工具"改为"插件自己的宿主路由"
- `inject` 不用 `{ required, optional }` 对象写法（当前 Cordis 版本会把它当服务名而卡在 pending），改为数组 + `ctx.get()`
- 「新建对话」的路径输入框/目录选择器回退为**工作区下拉**（只从已注册工作区里选）

### 已知限制

- 路由只接受回环 Host（`127.0.0.1` / `localhost` / `::1`）
- `cwd` 必须已存在且是已注册工作区，否则会话建好但不出现在侧栏分组下（返回里带 `note`）
- 单条消息 4000 字、总计 60000 字上限，超出自动截断并标 `truncated`
- 工具调用步骤不参与转发
- 双分词条之间的一处重复段落（提取层把同一段合并了两次）会在原文里出现，已知但不影响投递
