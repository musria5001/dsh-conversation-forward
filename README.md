# dsh-conversation-forward

在 DSH Web GUI 里**摘选对话 → 生成文案 → 投递到新会话**。

## 功能

- 勾选「我的消息 / AI 回复」，连续的工具调用自动折叠成一组，可整组勾选
- 两种内容：**原文**（保留角色与顺序）/ **摘要**
- 两种投递：**新建对话**（在所选工作区建会话）/ **文案生成**（只在当前对话输出可复制文案）
- 挂在官方 `conversation.input.left` 槽位，不替换任何官方渲染

## 安装

```bash
dsh plugin add github:musria5001/dsh-conversation-forward
```

装完刷新页面，输入框工具行左侧出现「摘选」按钮。

## 使用

1. 点「摘选」，勾选消息
2. 选 `原文`/`摘要`、`选中`/`整段会话`
3. 选 `新建对话` 或 `文案生成`，点底部按钮

## 配置（可全部留空）

设置 → 插件 → **摘选转发**：`provider` / `model` / `reasoningEffort` / `preset`

留空时自动继承来源会话的模型与预设（读该会话的 `request/header`），换 DSH、换 provider 都不用配。
新建出来的会话与普通会话一致，模型选择器照常可用。

## 宿主接口

`POST /api/forward-panel/create`（仅接受回环 Host）

```json
{ "cwd": "C:\\path\\to\\workspace", "sessionId": "session-…", "prompt": "首条消息" }
```

成功 `{"ok":true,"sessionId":"sb-…","workspaceId":"…"}`，失败 `{"ok":false,"code":"E_NO_MODEL|E_CWD_MISSING|…"}`。

## 限制

- `cwd` 必须已存在且是已注册工作区
- 单条 4000 字、总计 60000 字，超出自动截断
- 工具调用步骤不参与转发
- 路由只接受回环 Host（`127.0.0.1` / `localhost` / `::1`）

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

MIT
