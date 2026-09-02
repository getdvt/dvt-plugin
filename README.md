# dvt-plugin

The dvt Claude Code plugin — a thin client for [dvt](https://dvt.dev) (data viz tool).

dvt is an AI-native approach to data visualization: data teams design, generate, and deploy
dashboards through a spec-driven workflow, where a dashboard is a versioned JSON spec that humans
and agents author the same way. This plugin brings that workflow into Claude Code. It is a **thin
client** — it carries no data and no compute. It bundles two things:

- the **dvt dashboard-spec authoring skill**, so an agent knows how to read, write, and validate a
  dvt dashboard spec; and
- an **MCP client** pointed at a dvt endpoint, so the agent can design, validate, render, and apply
  specs against a live dvt instance.

The plugin is open and ungated. It contains no secret and no entitlement logic — your access is
governed entirely by the dvt endpoint and the key you connect with.

## Install

In any Claude Code session:

```
/plugin marketplace add getdvt/dvt-plugin
/plugin install dvt@dvt-plugin
```

Then restart Claude Code (plugins don't hot-load).

## Connect

After installing, run **`/dvt:connect`** and follow the prompts. The plugin talks to a dvt endpoint
over MCP; point it at one of two targets:

- **dvt Gallery (hosted)** — connect to `https://mcp.dvt.dev/mcp` with a Gallery API key. Mint a key
  in your dvt workspace at `https://app.dvt.dev/app/api-keys`, then paste the `dvt_live_…` value when
  `/dvt:connect` prompts for it. The key is stored by Claude Code at user scope, never committed here.
- **Direct engine URL** — point the client at a dvt engine URL you already have (e.g.
  `http://localhost:8001/mcp`).

`/dvt:connect` registers a user-scoped `dvt` MCP server with your endpoint and (for Gallery) your
key, then verifies the connection by listing your dashboards. Once connected, just ask the agent to
build a dashboard.

The plugin bundles the authoring skill so it works offline, but a connected engine also serves **its
own** copy — matched to the spec version that engine speaks — at the MCP Resource
`dvt://skill/spec-authoring`. When that revision is at least as new as the bundled one, `/dvt:connect`
prefers it for the session (and tells you), so authoring stays correct as the schema evolves without a
re-install. If the engine doesn't serve it, the bundled copy is always a valid fallback (ADR-0047).

> The plugin never embeds a key or any entitlement check. What you can do is decided by your dvt
> endpoint and the scopes on the key you provide.

## What's inside

```
.claude-plugin/
  marketplace.json              single-plugin marketplace so /plugin marketplace add resolves this repo
plugins/dvt/
  .claude-plugin/plugin.json    plugin manifest (name "dvt", semver)
  commands/connect.md           /dvt:connect — first-run setup + verify (registers the MCP server)
  commands/dvt-review.md        /dvt:dvt-review — critique a spec or a built dashboard, GO / REVISE
  agents/dvt-layout-critic.md   layout, visual design, readability — PASS / NEEDS ATTENTION / SIGNIFICANT ISSUES
  agents/dvt-narrative-critic.md  analytical story coherence — COHERENT / PARTIALLY COHERENT / INCOHERENT
  skills/dvt-spec-author/       dvt dashboard-spec authoring skill (generated at publish time)
  icon.svg
  README.md
  SETUP.md                      connecting from Cowork (GUI-only environments)
.github/workflows/
  plugin-release.yml            tags each published version v<semver>
RELEASING.md                    version + tag convention (semver in plugin.json)
LICENSE                         Apache-2.0
```

> **This repo is publish-only — do not send pull requests here.** Every file above is rendered from
> `plugins/**` in the private `getdvt/dvt` repo and pushed by the `dvt-publisher` GitHub App, so a
> commit made directly to this repo is overwritten by the next publish. Issues and discussions are
> closed for the same reason. To propose a change, talk to us at [dvt.dev](https://dvt.dev). Security
> reports go to `security@dvt.dev` (also `dvt.dev/.well-known/security.txt`), or via GitHub private
> vulnerability reporting on this repo.

The bundled spec-authoring skill has a single canonical source in `getdvt/dvt`
(`web/public/dvt-spec-authoring-skill.md`) and is generated into the tree at publish time, so the
published copy cannot drift from it.

Maintainers: see [RELEASING.md](./RELEASING.md) for the version + tag flow.

## License

[Apache-2.0](./LICENSE). dvt is an open funnel artifact — this plugin matches the spec and SDK
licensing.
