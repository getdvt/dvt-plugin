# Releasing the dvt plugin

This repo is a Claude Code **plugin marketplace**, and it is **publish-only**. Every file here is
rendered from `plugins/**` in the private [`getdvt/dvt`](https://github.com/getdvt/dvt) repo and
pushed by the `dvt-publisher` GitHub App — including this file. **Nothing here is hand-edited**; a
commit made directly to this repo will be overwritten by the next publish. Make the change upstream.

There is still no build step: a release is a version bump upstream plus a git tag on `main` here.
Claude Code resolves the plugin straight from this public repo when a user runs
`/plugin marketplace add getdvt/dvt-plugin`, so whatever is on `main` is what installs. The version +
tag exist so installs are reproducible and changes are auditable.

This mirrors the internal dvt-org plugin release flow — same shape, so founders only have to learn it
once.

## Versioning

The plugin version is the `version` field in
[`plugins/dvt/.claude-plugin/plugin.json`](./plugins/dvt/.claude-plugin/plugin.json), following
[semver](https://semver.org):

| Bump  | When |
|-------|------|
| patch | docs, copy, a `/dvt:connect` fix, a refreshed authoring skill with no behavior change |
| minor | a new command, a new capability, an additive change to the connect flow |
| major | a breaking change to a command's interface or the connect contract |

A change to the canonical authoring skill (see below) is at least a **patch** — it changes what the
plugin ships even though no plugin file changed.

## Cutting a release

All authoring happens in **`getdvt/dvt`**, under `plugins/**`.

1. Open a PR against `main` **in `getdvt/dvt`** with the change.
2. Bump `version` in `plugins/dvt/.claude-plugin/plugin.json` (semver, per the table above).
3. Run `/pr-review` and get one founder to review + merge.
   CI (`plugin-validate`, in `getdvt/dvt`) must be green: it renders the publishable tree and asserts
   valid JSON manifests, no leaked secret, all required files present, and a forward version bump.
4. On merge, `getdvt/dvt`'s `publish-plugin` workflow renders the tree and pushes it here as
   `dvt-publisher[bot]`.
5. That push fires [`plugin-release`](./.github/workflows/plugin-release.yml) here, which tags the
   published commit `v<version>` — no manual tagging step. It's idempotent: if that tag already
   exists (e.g. the publish didn't bump the version), it's a no-op.

There is nothing to publish afterwards — the marketplace resolves the repo live.

## The bundled authoring skill

`plugins/dvt/skills/dvt-spec-author/SKILL.md` is generated at publish time from its single canonical
source, `web/public/dvt-spec-authoring-skill.md` in `getdvt/dvt`. Edit it **there**.

It used to be a second copy checked into this repo, kept honest by a `skill-drift` job that compared
it against `demo.dvt.dev` (the public deploy) because CI here had no token into the private repo.
That whole apparatus is gone: there is now exactly one copy in git, so drift is not something that
has to be detected — it cannot occur. A skill change is its own release (patch bump; the tag is
automatic) so installs stay pinned to a known skill.

One deliberate consequence: the published skill now tracks `main`, where before it tracked the
`demo.dvt.dev` deploy. So it can briefly describe capabilities a user's own engine does not serve
yet. That is the correct trade — the old scheme's "safety" was really just latency, and it let the
published copy sit silently stale (at cutover it was missing the GL chart types and the `agent`
block). It is also already handled at runtime: per ADR-0047, `/dvt:connect` step 4 tells the agent to
prefer the connected engine's own served skill (`dvt://skill/spec-authoring`) over this bundled copy,
which exists for the offline and pre-connect case.
