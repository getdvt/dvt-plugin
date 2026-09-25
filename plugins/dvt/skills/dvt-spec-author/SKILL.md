---
name: dvt-spec-author
description: Author and edit dvt dashboard specs (JSON). Use when a user wants to create, modify, or theme a dvt dashboard, or convert a question/data into a dashboard. Covers the authoring method — audit the data for variance, then for any 3+ panel build state one answer-first key message and its 2-4 key questions in meta.brief/meta.keyQuestions BEFORE authoring panels (a hard gate — refuse to finalize without it), map panels to those questions, adapt generation to the declared audience (executive/analyst/operator each render differently), design encodings/layout, then build and render-verify — not just spec syntax.
---

# dvt Spec Authoring Skill

dvt dashboards are **JSON specs** — "dashboards as data." A spec is declarative: it
describes panels, their data queries, layout, and a token-based theme. The same
spec renders the same pixels every time. Hand this skill to your AI harness so it
can write and edit dvt specs directly, then paste the result into the dvt Spec
Builder (`/builder`) to see it render live.

## How to use this skill

This file is the authoring method. It does not list panel shapes or properties — the engine
serves those, so ground every choice in its catalog tools, in order: `dvt_dashboard_reference` →
`dvt_page_reference` → `dvt_chart_reference` / `dvt_block_reference` → `dvt_interaction_reference`.
Each returns a catalog with no arguments and drills into a type with one; never guess a shape.
The detailed reference is loaded on demand (listed at the end) from wherever this file itself came
from: plugin tree `references/<name>.md`, web `/dvt-spec-authoring-skill/references/<name>.md` on the
host that served this file, or MCP `dvt://skill/spec-authoring/references/<name>`. Need the whole
skill as one file (e.g. to hand to a harness with no MCP access)? `dvt-spec-authoring-skill.full.md`
is served at `/dvt-spec-authoring-skill.full.md` on the web host that served this file (dvt.dev / the
app origin) and bundles it with every reference.

## Choosing your approach — surgical edit vs full build

Classify the request first; the two paths differ a lot in cost and risk.

- **Surgical edit** — one named element, one specific change. Read it with `dvt_element_get` and apply
  `dvt_element_patch`. A change to a page itself (title, background, theme, layout) goes through
  `dvt_page_list` + `dvt_page_patch`; a change to the dashboard's documentation (`spec.meta`: brief,
  keyQuestions, assumptions, per-panel provenance) goes through `dvt_dashboard_get` +
  `dvt_dashboard_meta_patch` (preview first; `reason` is required). These routes keep every element's id
  and revision history, which re-sending the whole spec would not. Locate ids cheaply with
  `dvt_dashboard_get(format="concise")` or `dvt_dashboard_docs`, never a full-spec read. Re-send the spec
  only when a patch route refuses the edit (a `layout.mode` change, a `legacy-dashboard` 409).
- **Full build** — something new, exploratory, or a restructure. Run the method below.

When in doubt, prefer the full method. Error codes and the full edit contract are in
`references/authoring-method-detail.md`.

## Authoring method — audit, narrate, target audience, design, verify

The first passes are analytical, not visual: a dashboard that only plots the data reads flat. Each
pass constrains the next.

### 1. Audit the data

Call `dvt_dashboard_check_overlap` first so you extend existing content instead of duplicating it.
Then profile the source with small, fully-qualified queries: variance per dimension, distribution and
outliers, the time trend and its period-over-period delta, concentration (top-N share), and quality
caveats (nulls, tiny categories, a partial current period). A dimension whose categories carry roughly
equal measures has no story; lead with cuts that have real variance, and reframe the question if the
only cut is flat.

### 2. Narrative — one key message and its questions, before panels

Scope — 3+ panels only. A 1–2 panel build needs just a one-line `meta.brief`; the question and
panel-mapping bookkeeping below would be ceremony at that size, and the server's own provenance checks
only fire at 3+ panels.

**Tier 1 hard gate (3+ panels) — the only Tier 1 gate.** Before writing any panel, author `meta.brief`
(one sentence that is the answer, not the topic) and `meta.keyQuestions` (2–4 questions in priority
order; index 0 is the primary one). If you cannot write the brief you do not understand the data yet, so
return to step 1. In the `dvt_dashboard_apply_spec(preview=true)` result, `plan.provenance` ranks
suggestions `gate` / `warn` / `info`; a `gate` on `meta.brief` for a 3+ panel dashboard means refuse to
finalize until the brief exists. The server never rejects the spec for this (ADR-0018), so you are the
enforcement point. Do not escalate anything else into this gate: missing `meta.purpose`, `meta.audience`
or `meta.keyQuestions` surface as Tier 2 `warn`, and coherence or layout concerns belong to review.

Preview before persisting any net-new or multi-panel change, and show the user the plan as a
`Row | Panels` table per page built from `plan.layoutSummary` (size cues relative to that page's own
`columns`; mark a `truncated` page as "first N of rowCount rows"). The table is the authored arrangement
at one breakpoint, not the rendered one. Showing the plan is not optional under an autonomous framing,
since persisting an unreviewed dashboard is the failure mode. In a headless run, still preview and record
`"Preview: applied unattended (headless run)"` in `meta.decisions`. Narrate a multi-panel build with a
one-line status between calls, and surface a server Problem `detail`/`suggestion` verbatim on failure.

Lead answer-first: the first page and top-left panel carry the headline, one question per page, and each
page opens with a `text` panel whose live `{{ field | agg | format }}` values move with the data.

Map panels to questions with `meta.panels[panelId].serves_question`, a zero-based index into
`meta.keyQuestions` (an index survives a wording edit; text would not). Omit it for navigation or filter
panels. Section-level orphan check — not per-panel: each page or `section` band should answer at least one
declared question; otherwise fold it in, add the question it really answers, or cut it. `keyQuestions` is
append-only once panels reference it, because a reorder silently repoints every index; if a question must
move or go, rewrite every affected `serves_question` in the same edit, transactionally. Prune
`meta.panels[panelId]` when you delete a panel.

Provenance labels: `meta.assumptions` / `meta.conclusions` entries are `{ text, assertedBy, validatedAt? }`.
Never emit an entry without `assertedBy` — `agent` for your own inference, `human` only when a human
confirmed it in this conversation. Both fields are author-asserted, not server-attested, so a
false `human` label is worse than an honest `agent` one. Field-by-field documentation is in
`references/documenting.md`.

### 3. Audience-driven generation — `meta.audience` shapes the build

`meta.audience` is a generation contract, decided with the brief (ADR-0004 Amendment 1):

- `executive` — fewer panels, a hero KPI, titles that state the recommendation. Worked example:
  brief "Renew now — ENT churn risk crosses 8% in Q3." opens with a `hero`, a 3-card KPI strip, one chart.
- `analyst` — denser detail, filters, drill-downs, rich tables; titles can name the cut plainly.
- `operator` — current status first, `meta.dataAsOf` visible on the page, threshold-colored KPIs.

### 3b. Build style — settle the layout preference before design begins (DVT-830)

For a net-new interactive build of 3+ panels, ask the user (with your harness's question tool) which
build style fits and how pages should be structured, even under an "operate autonomously" framing,
because only the user can settle a product preference. Infer only if they already said, or the run is
headless. The options: quick KPI wall (dense scorecards, only when explicitly picked), immersive /
free-form report (scroll-driven canvas story), custom / bespoke look (heavier art direction). With no
preference, default to a narrative layout — a guided answer-first band opening into exploration.

ADR-0057: the question is presentation-only; never use it to discover warehouse schema, tables or
sample data — that is step 1's job. Record the answer in `meta.decisions` as
`"Build style: <kpi-wall|immersive|custom> — <why>"`, noting when you inferred it. This is an authoring
convention only; `dvt_spec_validate` neither requires nor enforces it, though a 3+ panel spec without it
draws a `warn` (DVT-881).

### 4. Design — encoding and layout in service of the message

Match the chart to the analytical task (trend → line, comparison → bar, distribution → histogram,
relationship → scatter, flow → sankey), reserve color for signal with `{chart.series.N}` refs, make the
headline preattentive, and keep roughly 8–12 panels per page.

**Layout-format rubric** (DVT-831) — map the recorded build style and the brief to `layout.mode`:

| Build style / brief | Layout format |
|---|---|
| quick KPI wall; dense analyst exploration; bespoke but tile-oriented | `grid` (default) |
| immersive / free-form report; bespoke scroll-driven story | `canvas` (ADR-0027) |
| bespoke print-like / editorial page, explicitly requested | `htmlSlots` (ADR-0059, dvt Full only) |

Default to `grid` unless the user explicitly asks otherwise. HTML-slots mode (`layout.mode: "htmlSlots"`)
is shipped: an author-written HTML page where live panels mount at `<dvt-slot ref="panelId">` markers.
`dvt_page_reference` catalogs the modes; the pick stays rubric-driven (DVT-857). There is no
`dvt_layout_recommend` tool, and you should not build one.

### 4a. Design flow — ground every choice in a served catalog

Work five stages, each grounded in a tool, and pick only from what it returns:

0. Dashboard — `dvt_dashboard_reference()` for the top-level shape and a minimal skeleton.
1. Page — `dvt_page_reference()`, then drill into the chosen mode.
2. Blocks & charts — `dvt_chart_reference()` / `dvt_block_reference()` matched to your data shapes and
   questions; then propose a sample layout (type, purpose, rough position) and get it confirmed.
3. Specs — drill each chosen type with `property_path`; declare only served properties.
4. Interactivity — `dvt_interaction_reference()`; include the default package (scoped filter, context
   menus, drills) in the sketch, or record `"Interactivity: none — <reason>"` in `meta.decisions`.

If an option isn't in a served catalog, it doesn't exist — never offer or author it.

### 4b. Persisting the build (ADR-0057 Amendment 1)

Interactive: apply a shell (`meta`, `theme`, first page with `panels: []`), then `dvt_element_create`
each panel with an explicit stable `slug` so a retried create is idempotent (a 409 slug-taken means it
landed), render once per page (the render budget is 10/hour per org on SaaS; the native app has no
hourly cap by default), and finish with `dvt_spec_validate` and `dvt_dashboard_get(format="concise")`.
Headless: one full-spec `dvt_dashboard_apply_spec`, so nothing is left half-built. Record the path in
`meta.decisions`.

### 5. Build, then see it

Validate with `dvt_spec_validate`, then `dvt_dashboard_render_inline` each page at desktop and mobile
widths and read `renderSummary` before the image: any warning means the render did not succeed. Report
evidence as numbers ("6 points across 1 series"). `pointsDrawn: 0` with rows means a binding bug; with no
rows, an empty query. A `not-measured` panel is unverified, not passed. If render is unreachable, fall
back to `dvt_spec_validate` plus `dvt_data_query` and say so. Close with the final layout table, the
link, and one-line caveats. The full `renderSummary` contract is in `references/authoring-method-detail.md`.

### 6. Premium polish

For exec-, board- or prospect-facing work: one answer-first key message, one hero with at least two size
tiers, a 3–5 card KPI strip with signed deltas, takeaway titles, a restrained palette, no pies over three
slices or dual axes, every chart naming its comparison, and derived numbers reconciled against their
panels. The 17-item checklist is in `references/authoring-method-detail.md`.

## Rules

- No JS functions in specs — use `format` objects and the `{ "$dvtRef": "formatter:pie-label@1" }` ref instead. `$dvtRef` ids are **versioned** (`<kind>:<name>@<version>`, e.g. `formatter:usd-compact@1`) and must be one of the registered ids — an unknown or unversioned ref is rejected at write time (ADR-0016).
- Every `layout.items[*].i` must match a panel `id`.
- Keep series colors as `{chart.series.N}` refs so the theme stays consistent.
- Prefer `pages` for anything with more than ~8 panels.
- Always fully-qualify table names in `data.query` as `database.schema.table` — connections may carry no default database/schema.
- Write SQL in the canonical dvt style — lowercase keywords, leading commas, `where 1=1` guard, `%(key)s` bindings (see `docs/02-spec/sql-style-guide.md`).
- A literal `%` in any param-bound query's SQL text must be written `%%` (pyformat parses a bare `%` as a placeholder start) — prefer `mod()` over the `%` operator; never double-percent a bound parameter *value*.
- Round every numeric a `{{ }}` template interpolates in the SQL itself — the template renders the raw value verbatim.

The machine-readable JSON Schema lives at `spec/schema/dashboard.schema.json` in the dvt repo — validate against it when in doubt.

## References (load on demand)

Each file sits in `references/` beside this one — in the plugin tree at `references/<name>.md`, on
the web host that served this file at `/dvt-spec-authoring-skill/references/<name>.md`, and over MCP
at `dvt://skill/spec-authoring/references/<name>`. Need every reference in a single file instead?
`dvt-spec-authoring-skill.full.md`, served at `/dvt-spec-authoring-skill.full.md` on the web host that
served this file (dvt.dev / the app origin), bundles this file plus all of them.

- `panel-types.md` — every panel type, its fields, and the chart-type table; open when authoring a panel.
- `layout-modes.md` — top-level spec shape, canvas and HTML-slots modes, page rhythm, formats.
- `theme-and-tokens.md` — tokens, presets, color encoding, annotations, trendlines, footnotes.
- `documenting.md` — self-documenting fields (`Page.doc`, `meta.panels`, provenance claims).
- `data-sources.md` — `source_id`, table naming per source, `dvt_data_query` result shapes.
- `exports-and-email.md` — scheduled exports, panel export, and emailing a report (Snowflake native
  app). A scheduled email renders from rows dvt already holds: the task's staged rows, or a panel's own
  authored inline `data.rows`.
- `authoring-method-detail.md` — the full, unabridged method: edit routes and error codes,
  `renderSummary` semantics, the persist steps, the premium-polish checklist.
