#!/usr/bin/env bash
#
# Sync the vendored canonical dvt assets into the dvt plugin.
#
# Canonical source of truth: getdvt/dvt → web/public/dvt-spec-authoring-skill.md
# Vendored mirror (this repo):  plugins/dvt/skills/dvt-spec-author/SKILL.md
#
# The plugin ships a byte-for-byte copy of the canonical spec-authoring skill so it
# installs offline with no network call or token into the private dvt repo. Do NOT
# hand-edit the vendored copy — edit it in the dvt repo, then run this script. CI
# (.github/workflows/skill-drift.yml) fails the build if the two copies drift apart.
#
# Usage (from the dvt-plugin repo root, with the dvt repo checked out as a sibling):
#   ./scripts/sync-from-dvt.sh
#   DVT_REPO=/path/to/dvt ./scripts/sync-from-dvt.sh              # explicit source location
#   DVT_REF=origin/my-feature-branch ./scripts/sync-from-dvt.sh   # sync from a non-default ref
#
# Requires network access to the private dvt remote (it fetches before reading). Prefer an
# `origin/*` value for DVT_REF: a local ref such as `main` can sit behind the remote, and
# vendoring from it is the silent-stale failure this script exists to prevent.
#
# By default this reads the canonical file from the dvt repo's `origin/main` (via
# `git show`) after a fetch — NOT your possibly-stale working tree. The DVT-199 vendor
# bug was copying from a local checkout six commits behind origin/main; sourcing from
# the fetched ref prevents that recurring. Mirrors website's scripts/sync-spec-skill.sh,
# which carries the same hardening (DVT-2500 / DVT-2518).
#
# Caveat: `origin/main` may be AHEAD of the deploy that CI compares against —
# .github/workflows/skill-drift.yml diffs the mirror against demo.dvt.dev, not origin/main.
# If dvt main has unshipped skill changes, syncing from origin/main reds the drift job and
# vendors tool names the deployed engine does not serve yet. Resync to the sha currently
# served by demo.dvt.dev (repo convention: "resync … to deployed canonical <sha>").
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DVT_REPO="${DVT_REPO:-$REPO_ROOT/../dvt}"
DVT_REF="${DVT_REF:-origin/main}"
SRC_PATH="web/public/dvt-spec-authoring-skill.md"
DST="$REPO_ROOT/plugins/dvt/skills/dvt-spec-author/SKILL.md"

# Use rev-parse, not `[[ -d "$DVT_REPO/.git" ]]`: in a git WORKTREE .git is a regular
# gitdir-pointer file, not a directory, and this org keeps many dvt-wt-* worktrees.
if ! git -C "$DVT_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: dvt repo not found at:" >&2
  echo "         $DVT_REPO" >&2
  echo "       Check out getdvt/dvt as a sibling of this repo, or set DVT_REPO=/path/to/dvt." >&2
  exit 1
fi

# Refresh remote refs so origin/main is current (the staleness guard). Unconditional:
# fetching is cheap and a non-origin DVT_REF still wants its remote-tracking refs fresh.
# Non-fatal so an offline run can still sync from whatever ref is already fetched — but
# the failure is re-stated at the end, because a warning here scrolls away in CI logs.
FETCH_FAILED=""
if ! git -C "$DVT_REPO" fetch origin -q; then
  FETCH_FAILED=1
  echo "warning: git fetch failed; using last-fetched refs (content may be stale)" >&2
fi

# A local ref is NOT a staleness guard: the shared dvt clone routinely has a local
# `main` behind `origin/main` (measured during DVT-2500: the skill file two versions
# apart). Vendoring from one exits 0 and looks identical to a good sync, which is
# precisely the DVT-199 defect — so say so loudly.
NONORIGIN_REF=""
if [[ "$DVT_REF" != origin/* ]]; then
  NONORIGIN_REF=1
  echo "warning: DVT_REF=$DVT_REF is not an origin/* ref — it may be behind the remote," >&2
  echo "         which vendors stale content and reds the skill-drift job." >&2
fi

if ! git -C "$DVT_REPO" cat-file -e "$DVT_REF:$SRC_PATH" 2>/dev/null; then
  echo "error: canonical file not found at $DVT_REF:$SRC_PATH in $DVT_REPO" >&2
  exit 1
fi

# Read the file out of the ref — never from "$DVT_REPO/$SRC_PATH". The local dvt
# checkout is routinely parked on a stale detached HEAD (deploy and debug lanes leave
# the shared clone wherever they finished), so reading its working tree silently
# vendors old content and reds the drift job. Always source the fetched ref.
#
# Staged through a temp file so a failed or interrupted `git show` cannot leave the
# vendored mirror truncated: `> "$DST"` would truncate it before git even runs.
# INT/TERM as well as EXIT: the skill directory ships verbatim inside the installed
# plugin, so a temp file orphaned by a Ctrl-C would ride along into every install.
TMP="$(mktemp "${DST}.XXXXXX")"
trap 'rm -f "$TMP"' EXIT INT TERM
git -C "$DVT_REPO" show "$DVT_REF:$SRC_PATH" > "$TMP"

# Same content guard .github/workflows/skill-drift.yml applies to its download: the
# skill markdown must open with its YAML frontmatter delimiter and carry the
# distinctive `name:` line (a soft-404 or wrong file shouldn't pass).
if ! head -1 "$TMP" | grep -q '^---$' \
   || ! grep -q '^name: dvt-spec-author$' "$TMP"; then
  echo "error: $DVT_REF:$SRC_PATH does not look like the skill markdown (missing '---' frontmatter or 'name: dvt-spec-author')." >&2
  exit 1
fi

chmod 644 "$TMP"          # mktemp creates 0600; the vendored mirror is a plugin-shipped asset
mv "$TMP" "$DST"

SRC_SHA="$(git -C "$DVT_REPO" rev-parse --short "$DVT_REF" 2>/dev/null || echo '?')"
echo "synced: $DVT_REPO @ $DVT_REF ($SRC_SHA) : $SRC_PATH"
echo "    ->: $DST"
if [[ -n "$FETCH_FAILED" ]]; then
  echo "warning: this sync ran WITHOUT a successful fetch — re-run online before committing." >&2
fi
if [[ -n "$NONORIGIN_REF" ]]; then
  echo "warning: vendored from non-origin ref '$DVT_REF' — verify it is not behind the remote." >&2
fi
