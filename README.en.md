# dsh-conversation-forward

Pick conversation messages in the DSH Web GUI, produce a forwarding text, and
deliver it into a new session in another workspace.

## Features

- Tick user prompts and assistant replies; consecutive tool-call steps fold into
  one group you can select whole
- Two content modes: **verbatim** (roles and order preserved) / **summary**
- Two delivery modes: **new session** (creates it in the chosen workspace) /
  **copyable text** (prints the text in the current conversation)
- Additive only: hooks the official `conversation.input.left` slot, replaces no
  shipped renderer

## Install

```bash
dsh plugin add github:musria5001/dsh-conversation-forward
```

Refresh the page; a trigger appears at the left of the composer tool row.

## Usage

1. Click the trigger, tick messages
2. Pick `verbatim`/`summary` and `selected`/`whole session`
3. Pick `new session` or `copyable text`, then press the footer button

## Configuration (all optional)

Settings → Plugins → **forward panel**: `provider` / `model` /
`reasoningEffort` / `preset`

Left empty, the plugin inherits the provider/model and preset from the source
session's `request/header`, so no configuration is needed across DSH setups.
The created session behaves like any other: the model picker keeps working.

## Host API

`POST /api/forward-panel/create` (loopback Host only)

```json
{ "cwd": "C:\\path\\to\\workspace", "sessionId": "session-…", "prompt": "first message" }
```

→ `{"ok":true,"sessionId":"sb-…","workspaceId":"…"}` or
`{"ok":false,"code":"E_NO_MODEL|E_CWD_MISSING|…"}`.

## Limits

- `cwd` must exist and be a registered workspace
- 4000 chars per message, 60000 total; longer input is truncated
- tool-call steps are not forwarded
- the route only accepts a loopback Host

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
