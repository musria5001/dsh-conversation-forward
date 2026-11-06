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

## Host API

`POST /api/forward-panel/create` (loopback Host only)

```json
{
  "cwd": "C:\\Users\\lenovo\\Desktop",
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
