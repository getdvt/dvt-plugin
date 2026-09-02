# dvt — Claude Code plugin

A thin client for [dvt](https://dvt.dev) (data viz tool). dvt treats a dashboard as a versioned JSON
spec — "dashboards as data" — that humans and agents author the same way. This plugin brings that
workflow into Claude Code.

It bundles:

- **`dvt-spec-author` skill** — teaches the agent how to read, write, and validate a dvt dashboard
  spec (the same authoring skill dvt ships canonically).
- **`/dvt:dvt-review` command** — a design critique of a spec *before* you persist it, or of a
  **built dashboard** (by id) including its actual rendered pages. It runs two fresh subagents
  (`dvt-narrative-critic` for the analytical story, `dvt-layout-critic` for visual craft) and folds
  in the engine's deterministic lints, then gives you a GO / REVISE recommendation with concrete
  fixes. A clean read, by design — the session that authored a spec is the worst judge of it.
- **`dvt` MCP client** — connects to a dvt endpoint so the agent can validate, render, and apply
  specs against a live dvt instance.

The plugin is open and ungated. It carries no secret and no entitlement logic — your access is
decided entirely by the dvt endpoint and the key you connect with.

## Connect

Run **`/dvt:connect`** and follow the prompts. You can point the client at either:

- **dvt Gallery (hosted)** — `https://mcp.dvt.dev/mcp` with a Gallery API key minted at
  `https://app.dvt.dev/app/api-keys`. The key is stored by Claude Code at user scope, never in this
  repo.
- **Direct engine URL** — a dvt engine URL you already have (e.g. `http://localhost:8001/mcp`), with or
  without auth depending on how you front it.

The plugin registers no MCP server until you run `/dvt:connect` — that command adds a user-scoped
`dvt` server carrying your endpoint and (for Gallery) your key, so nothing secret and nothing broken
ships in the repo.

On Cowork (no CLI), see [`SETUP.md`](SETUP.md) instead.

## What's inside

```
.claude-plugin/plugin.json   plugin manifest (name "dvt", semver)
commands/connect.md          /dvt:connect — first-run setup + verify
commands/dvt-review.md       /dvt:dvt-review — narrative + layout critique (pre-apply spec or built dashboard)
agents/dvt-narrative-critic.md   fresh-read critic: analytical story (answer-first, spine, key message)
agents/dvt-layout-critic.md      fresh-read critic: layout craft (Gestalt/Tufte/Few) + deterministic lints
skills/dvt-spec-author/      dvt dashboard-spec authoring skill (generated at publish time)
```

The two critic agents carry dvt's design opinion (the narrative + layout rubric), kept roughly in
sync with dvt's own design-review rubric. They critique the **spec** (cheap, pre-render) and — when
given a built dashboard id — the **actual rendered pages**, fetched as pre-signed artifact URLs and
viewed from a temp file so no base64 image bytes ever land in context.

`skills/dvt-spec-author/SKILL.md` has a single canonical source in the private dvt repo
(`web/public/dvt-spec-authoring-skill.md`) and is generated into this tree when the plugin is
published, so the shipped copy cannot drift from canonical. Edit it there, not here.

## Advanced / manual setup

`/dvt:connect` runs `claude mcp add` for you. If you'd rather wire it by hand, add an HTTP MCP server
named `dvt` at user scope:

```bash
# dvt Gallery (hosted) — with your dvt_live_ key
claude mcp add --transport http --scope user dvt "https://mcp.dvt.dev/mcp" \
  --header "Authorization: Bearer dvt_live_…"

# direct engine URL — no auth
claude mcp add --transport http --scope user dvt "http://localhost:8001/mcp"
```

Equivalent `.mcp.json` shape (for reference — the key lives in your local config, never in a repo):

```jsonc
{ "mcpServers": { "dvt": { "type": "http", "url": "https://mcp.dvt.dev/mcp",
  "headers": { "Authorization": "Bearer <your dvt_live_ key>" } } } }
```

## License

[Apache-2.0](../../LICENSE).
