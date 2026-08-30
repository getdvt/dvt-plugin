# Connecting from Cowork

This plugin's `/dvt:connect` command runs `claude mcp add` under the hood, which is a Claude Code
CLI feature — it isn't available in Cowork's GUI-only environment. If you're on Cowork:

- **Prefer the dvt connector from the Connectors Directory** (once listed there) — add it from
  Cowork's connector/plugin settings, connecting to dvt Gallery (`https://mcp.dvt.dev/mcp`) with the
  OAuth sign-in flow, or a Gallery API key minted at `https://app.dvt.dev/app/api-keys`.
- **On Claude Code**, just run `/dvt:connect` and follow the prompts instead — no manual connector
  setup needed.

No secret ever lives in this plugin or its repo — your endpoint and key are stored by whichever
harness you connect from (Claude Code or Cowork), at your user/account scope.
