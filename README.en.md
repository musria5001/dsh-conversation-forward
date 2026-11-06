# dsh-forward-panel

Pick conversation messages in the DSH Web GUI, produce a forwarding text (verbatim
or a summary), and deliver it into a brand-new session in another workspace.

- Checklist over your prompts and the assistant replies; consecutive tool-call
  steps fold into one group you can select whole
- Two content modes: **verbatim** (roles and order preserved) or **summary**
- Two delivery modes: **new session** (creates it for you) or **copyable text**
  (nothing is created; the text is printed in the current conversation)
- Additive only: hooks the official `conversation.input.left` slot, replaces no
  shipped renderer

## Install

```bash
dsh plugin add /path/to/forward-panel
```

## Configure

Settings → Plugins → **forward panel**:

| Field | Meaning |
|---|---|
| `provider` | provider for the new session (e.g. `deepseek-account`) |
| `model` | model id for the new session (e.g. `deepseek-flash`) |
| `reasoningEffort` | optional effort id (`high`, `medium`, `low`) |
| `preset` | agent preset to mount, default `standard` |

The model matters because the shipped preset persona prefix interpolates
`{{model}}`; a bare agent without a request-header model fails its first turn with
`prompt variable "{{model}}" has no value`. Resolution order:

1. `route` in the request body
2. this plugin's `provider` / `model`
3. otherwise `E_NO_MODEL`

## Usage

The plugin is an **agent-facing workflow**: the panel decides *what* to forward, the
conversation's agent decides *how* to deliver it.

1. Click the trigger next to the attach row, tick messages
2. Pick `verbatim` / `summary` and `selected` / `whole session`
3. Pick `new session` or `copyable text`, then press the footer button
4. Two delivery paths:
   - **verbatim + new session**: the panel composes the text and posts to
     `/api/forward-panel/create` itself — no agent round trip
   - **summary / copyable text**: the panel submits a `[forward-request]`
     (items, `sessionId`, target workspace, API contract) to the current
     conversation's agent, which writes the content and delivers it

For `new session`, the agent only needs to do this:

```
POST /api/forward-panel/create
{ "cwd": "<target dir>", "sessionId": "<source session>", "prompt": "<final text>" }
```

The provider/model/preset are inherited from `sessionId`; on `E_NO_MODEL`, retry
with an explicit `route`.

## Host API

`POST /api/forward-panel/create` (loopback Host only)

```json
{
  "cwd": "C:\\Users\\lenovo\\Desktop",
  "sessionId": "session-…",
  "prompt": "first message for the new session",
  "route": { "provider": "deepseek-account", "model": "deepseek-flash" }
}
```

→ `{"ok":true,"sessionId":"sb-…","workspaceId":"…"}` or
`{"ok":false,"code":"…","params":{…}}`.

### The inherited route only seeds the first turn

The inherited `route` is written into the new session's first `request/header`
only. Afterwards the session is a normal one: the model picker keeps working and
writes later headers. The plugin installs no `agent/request` hook and never
overrides a later switch.

### Preset inheritance

`preset` resolves as: plugin config → the source session's `agentPreset` →
`standard`, so users on `minimal`, `ptc`, or a custom preset get the same one.

### Optional dependency

`sessionPersistence` is not required: without it the plugin still works, it just
cannot inherit the source route/preset and falls back to plugin config
(`E_NO_MODEL` when both are empty).

## Limits

- `cwd` must already exist and be a registered workspace
- 4000 chars per message, 60000 total; longer input is truncated and flagged
- tool-call steps are not forwarded
- new session ids use the `sb-` prefix

## License

MIT
