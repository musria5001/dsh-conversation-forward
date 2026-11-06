# dsh-forward-panel

在 DeepSeek Harness（DSH）Web GUI 里**摘选对话、生成转发文案、投递到新会话**。

- 列表式勾选（我的消息 / AI 回复），连续的工具调用自动折叠成一组，可整组勾选
- 两种内容模式：**原文**（保留角色与顺序）/ **摘要**（压缩成一段摘要）
- 两种投递方式：**新建对话**（在所选工作区建会话并投递）/ **文案生成**（只在当前对话输出可复制文案）
- 零 UI 侵入：只挂官方 `conversation.input.left` 槽位，不替换任何官方渲染

## 安装

```bash
# 从本地目录（开发）
dsh plugin add dsh-forward-panel

# 或从 npm（发布后）
dsh plugin add dsh-forward-panel
```

安装后在输入框工具行左侧出现「摘选」按钮。

## 配置

设置 → 插件 → **摘选转发**：

| 字段 | 说明 |
|---|---|
`provider` | 兜底 provider（**留空即可**，优先自动继承来源会话） |
`model` | 兜底模型（**留空即可**，优先自动继承来源会话） |
`reasoningEffort` | 可选兜底推理强度（如 `high`） |
`preset` | 新建会话挂载的 agent 预设，默认 `standard` |

**模型怎么来的**（按优先级）：

1. 请求体里的 `route`（显式指定）
2. **来源会话的模型** —— 请求里带 `sessionId`，插件读该会话最近一次 `request/header` 的 `provider` / `model` / `reasoningEffort` 并继承（**换人、换 DSH 配置都自动适配，无需配置**）
3. 插件配置里的 `provider` / `model`
4. 都没有 → `E_NO_MODEL`，提示补 `sessionId` 或填配置

为什么必须有模型：DSH 预设的人设前缀里有 `{{model}}` 占位符，新建 agent 若请求头没有模型，首轮会失败（`prompt variable "{{model}}" has no value`）。

## 怎么用

1. 点「摘选」打开面板，勾选消息
2. 选 `原文`/`摘要`、`选中`/`整段会话`
3. 选 `新建对话` 或 `文案生成`，点底部按钮
4. 面板会把一条 `[forward-request]` 提交给当前对话的助手，由助手：
   - 生成最终文案（原文或它的摘要）
   - `文案生成`：直接在对话里输出 ``` 代码块
   - `新建对话`：`POST /api/forward-panel/create` 让插件自己建会话，再回报工作区路径与会话 id

## 宿主接口（给其他插件/脚本用）

`POST /api/forward-panel/create`（仅接受回环 Host）

```json
{
  "cwd": "C:\\Users\\lenovo\\Desktop",
  "sessionId": "session-…",
  "prompt": "要写入新会话首条消息的文本",
  "route": { "provider": "…", "model": "…", "reasoningEffort": "high" }
}
```

`sessionId`（可选）指向**来源会话**：不传 `route` 时插件会读它的模型并继承，所以跨用户、跨 DSH 配置都能自动适配。`route` 只在需要强制指定模型时使用。

成功：`{"ok":true,"sessionId":"sb-…","workspaceId":"…"}`
失败：`{"ok":false,"code":"E_NO_MODEL|E_CWD_MISSING|E_NO_PROMPT|…","params":{…}}`

## 限制与注意

- `cwd` 必须**已存在**（不会自动建目录）；且需是已注册的工作区，才会挂到侧栏分组下
- 单条消息上限 4000 字、总计 60000 字，超出自动截断并在请求里标 `truncated`
- 工具调用步骤不参与转发（面板里显示为 `⚙ N 次工具调用`，只作参考）
- 新会话 id 前缀是 `sb-`；如果你用第三方"删除会话"插件，确认它接受非 `session-` 前缀

## 许可

MIT
