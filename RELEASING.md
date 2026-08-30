# Releasing the dvt plugin

This repo is a Claude Code **plugin marketplace**. There is no build or publish step: a release is a
version bump plus a git tag on `main`. Claude Code resolves the plugin straight from this public repo
when a user runs `/plugin marketplace add getdvt/dvt-plugin`, so whatever is on `main` is what
installs. The version + tag exist so installs are reproducible and changes are auditable.

This mirrors the [dvt-org plugin release flow](https://github.com/getdvt/claude-org) — same shape,
so founders only have to learn it once.

## Versioning

The plugin version is the `version` field in
[`plugins/dvt/.claude-plugin/plugin.json`](./plugins/dvt/.claude-plugin/plugin.json), following
[semver](https://semver.org):

| Bump  | When |
|-------|------|
| patch | docs, copy, a `/dvt:connect` fix, a re-vendored skill with no behavior change |
| minor | a new command, a new capability, an additive change to the connect flow |
| major | a breaking change to a command's interface or the connect contract |

A re-vendored `skills/dvt-spec-author/SKILL.md` (see below) is at least a **patch** — it changes what
the plugin ships even though no code here changed.

## Cutting a release

1. Open a PR against `main` with the change.
2. Bump `version` in `plugins/dvt/.claude-plugin/plugin.json` (semver, per the table above).
3. Run [`/pr-review`](https://github.com/getdvt/claude-org) and get one founder to review + merge
   (`--squash`). CI (`plugin-validate`) must be green: valid JSON manifests, no committed secret, all
   required files present.
4. On merge, the [`plugin-release`](./.github/workflows/plugin-release.yml) workflow tags the merge
   commit `v<version>` and pushes it automatically — no manual tagging step. It's idempotent: if that
   tag already exists (e.g. the merge didn't bump the version), it's a no-op.

There is nothing to publish afterwards — the marketplace resolves the repo live.

## The vendored authoring skill — do not hand-edit

`plugins/dvt/skills/dvt-spec-author/SKILL.md` is **vendored byte-for-byte** from the canonical copy in
[`getdvt/dvt`](https://github.com/getdvt/dvt) and must never be edited here. To update it, re-vendor
from upstream `origin/main` (never a local checkout — that was the DVT-199 staleness bug):

```bash
./scripts/sync-from-dvt.sh
```

Caveat: `origin/main` may be **ahead of the deploy** the drift job compares against
(`skill-drift.yml` diffs the mirror against `demo.dvt.dev`, not `origin/main`). If dvt main
carries unshipped skill changes, sync to the sha currently served by demo.dvt.dev instead
(`DVT_REF=<deployed-sha>`), per the repo's "resync … to deployed canonical `<sha>`" convention.

`.github/workflows/skill-drift.yml` is the backstop: it diffs the vendored skill against the canonical
copy served from `demo.dvt.dev` on every PR that touches it and weekly for upstream drift. A re-vendor
is its own release (patch bump; the tag is automatic) so installs stay pinned to a known skill.
