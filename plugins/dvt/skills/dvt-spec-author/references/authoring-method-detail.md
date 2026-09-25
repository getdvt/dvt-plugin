# dvt spec authoring — Authoring method — full detail (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

## Choosing your approach — surgical edit vs full build

- Before authoring, classify the request — the two execution paths have very different costs.
- **Surgical edit** — the user names an existing element and a specific change ("change the Q3 revenue KPI to red", "fix the funnel title typo", "make this axis start at zero"). Read that one element with `dvt_element_get`, then apply a `dvt_element_patch`. Do NOT run the full audit→narrative→design method and do NOT re-send the whole spec — it wastes tokens and risks rebuilding panels the user didn't ask you to touch.
- **Page-level surgical edit** — the user names an existing page and a change to the page itself, not a panel ("rename this page", "restyle this page's existing HTML frame", "widen the hero tile on tablet", "recolor this page's background"). Read the page's current `version` with `dvt_page_list`, then apply a `dvt_page_patch` — it reaches a page's `title`, `background`, `theme`, and `layout` (htmlSlots `layout.html`, and per-breakpoint grid `layout.items.{lg,md,sm,xs}`, including adding a breakpoint that doesn't exist yet). Do NOT delete-and-recreate the page and do NOT re-send the whole spec for this — `dvt_page_patch` preserves every element's id and revision history, unlike `dvt_dashboard_apply_spec`, which fully replaces the spec and re-keys every element. It does not reach `spec.meta`/panelDocs/`keyQuestions` — those are dashboard-level, so use `dvt_dashboard_meta_patch` (next bullet) — or a page's `position` (use `dvt_pages_reorder`) or `layout.mode` (mode transitions stay full-build).
- **Dashboard-level surgical edit (provenance / `spec.meta`)** — the user names a change to the dashboard's *documentation*, not to a panel or a page ("update the brief", "add a key question", "record this assumption", "fix the dashboard title", "say why this panel exists", "mark the data as of yesterday"). Read the DASHBOARD's current `version` with `dvt_dashboard_get`, then apply a `dvt_dashboard_meta_patch` — an RFC 6902 JSON Patch array against `spec.meta`. It reaches `/title`, `/brief`, `/description`, `/findings`, `/readme`, `/decisions`, `/tags`, `/purpose`, `/audience`, `/keyQuestions`, `/assumptions`, `/conclusions`, `/dataAsOf`, and per-panel provenance at `/panels/{panelId}` (`purpose`/`intent`/`assumptions`/`notes`/`serves_question`). Do NOT re-send the whole spec for this — `dvt_dashboard_meta_patch` preserves every element's id and revision history, unlike `dvt_dashboard_apply_spec`, which fully replaces the spec and re-keys every element. Unlike `dvt_page_patch` it works on **both** single-page and multi-page dashboards (`meta` lives on the manifest, so there is no single-page restriction). `version` is the DASHBOARD's version, not a page's. `reason` is REQUIRED (max 280 chars) and is recorded on the new revision. Preview first (`preview=true` is the default), show the user, then apply — but note what preview does *not* do: it confirms the dashboard exists, checks your `version`, and validates `reason`; it does **not** run the forbidden-path or `documentationStale` checks, so a clean preview can still be followed by a 400 on apply.
  - Rejected with a 400 (among others): a whole-document replace (an op on `/`); **`documentationStale`** — dashboard-level or per-panel, **including a parent-path op that would change its value** (e.g. replacing or removing `/panels`), because it is server-set (DVT-267), so patch a leaf field or restate the existing value instead; and **`/createdBy`**, which is immutable creation provenance. Every forbidden path above is also rejected as a `move`/`copy` **`from`**, not just as a `path`. A malformed or empty patch array is a 400 too.
  - A 422 means the patched meta failed validation — `title` must stay non-empty. **Two different conditions return 409, and they need opposite reactions** — discriminate on the error `type`, not the status. Over MCP the tool hands you a short slug: `version-conflict` means re-read the dashboard's `version` and retry, while `legacy-dashboard` means the dashboard predates granular editing and retrying will *never* work — that one needs a full-spec re-apply. (Against the REST API directly, those arrive as the full problem `type` URLs under `https://docs.dvt.dev/errors/`.)
- **Block-level reads, not full-spec reads.** If you don't already know the element's id, read the dashboard ONCE with `dvt_dashboard_get(format="concise")` (manifest + `provenanceSummary`, no heavy spec) or `dvt_dashboard_docs` (cheap doc tree) to locate the page/element id, then pull ONLY that element via `dvt_element_get`. Never load the full page spec (`dvt_dashboard_get(format="full")`) just to change one panel.
- **Full build** — the user wants something new or exploratory ("help me understand our sales", "build a pipeline dashboard", "restructure this to tell a story"). Run the full authoring method below. **Interactive session** (a user is watching): persist via the incremental flow in "Persisting the build" (§4b) below, not a single full-spec apply. **Headless/batch run:** persist via a single full-spec `dvt_dashboard_apply_spec` call.
- When in doubt (an edit spanning several elements, or one that changes the dashboard's story), prefer the full method. A single named property on a single named element is the clear signal for the surgical path.

## Authoring method — audit, narrate, target audience, design, verify

Don't jump straight to charts. A dashboard that just "plots the data" reads flat and
forgettable. Work in six passes; each one constrains the next. **The first passes are
analytical, not visual** — that's what separates a compelling dashboard from a
technically-correct but boring one.

### 1. Audit the data first — what's actually interesting?

Before a net-new build, call `dvt_dashboard_check_overlap` to see whether existing content
already covers this — extend or patch it instead of duplicating.

Before choosing a single chart, profile the source so you build on signal, not noise.
Run small profiling queries (always fully-qualified — `database.schema.table`):

- **Shape & variance:** `SELECT count(*), count(distinct <dim>), min(<m>), max(<m>), avg(<m>), stddev(<m>) FROM …`. A dimension whose categories all carry ~equal measures has **no story** — a bar chart of it is flat. (TPC-H is uniformly distributed this way: orders per nation/segment barely differ. Notice that and do **not** lead with it.)
- **Distribution & outliers:** percentiles or a histogram-bucket query. Skew, long tails, and concentration ARE the story.
- **Time:** if there's a date column, pull the trend and the period-over-period delta — time series almost always has shape.
- **Concentration:** top-N share / Pareto (does ~20% of X drive ~80% of Y?).
- **Quality caveats:** null rates, tiny-N categories, a partial current period. Note them; never silently chart misleading numbers.

Prefer cuts with real variance — **time series, distributions, comparisons of unlike things, concentration, and change** — over flat categoricals. If the only available cut is uniform, **reframe the question** rather than drawing a boring bar.

### 2. Narrative — one key message + questions, before panels

**Scope — 3+ panels only.** The full machinery in this step (`keyQuestions`, panel↔question mapping, section-orphan check) applies to a **3+ panel build**. A 1–2 panel build — a single KPI card, a two-panel glance — needs only a one-line `meta.brief`; its question is self-evident at that scale, and forcing `keyQuestions`/`serves_question` bookkeeping onto it is needless ceremony. (This mirrors the server's own threshold — the provenance checks below only fire at 3+ panels.)

**Tier 1 hard gate (3+ panels) — the only Tier 1 gate.** Before you write a single panel, author `meta.brief` — one sentence that is the *answer*, not the topic — and `meta.keyQuestions` — the 2–4 questions the dashboard is designed to answer, in priority order (index 0 = the primary question). If you can't write the brief, you don't understand the data yet — go back to step 1. Check the `dvt_dashboard_apply_spec(preview=true)` result: `plan.provenance` carries advisory suggestions ranked `gate` / `warn` / `info` (ADR-0004 Amendment 1). A `gate`-severity suggestion on `meta.brief` for a 3+ panel dashboard means **refuse to finalize** — go back and write the brief before you call apply without `preview`. The server never rejects the spec itself (enforcement is advisory at persistence, ADR-0018); the skill — you — is the enforcement point. Don't escalate other concerns into this gate: `meta.purpose`, `meta.audience`, and `meta.keyQuestions` missing surface only as `warn` (Tier 2), and coherence/layout issues belong to a separate narrative/layout review pass (Tier 2/3), not a blocker here.

**Preview-first is mandatory, not advisory.** For any net-new build or multi-panel change: call
`dvt_dashboard_apply_spec(preview=true)`, SHOW the user the resulting plan (pages, panels,
provenance suggestions), and only after that call apply without `preview`. Do not skip the show
step under an "operate autonomously" framing — persisting an unreviewed dashboard is the failure
mode, not the deliverable. In a headless/scheduled run with no user to show, still run the
preview and record `"Preview: applied unattended (headless run)"` in `meta.decisions`.

**Show the plan as a table, not prose.** The preview result carries `plan.layoutSummary` — the
recorded-breakpoint layout as per-page rows of panels. When you SHOW the plan, render it as a
`Row | Panels` markdown table (one table per page) instead of prose-restating the panel list;
list panels left-to-right in grid order and note size cues derived from that page entry's own
`columns` (the effective column count — NOT always 24; a page can declare a custom
`layout.columns` or breakpoint-specific `columns`), e.g. `w` equal to `columns` → "full-width",
`w`/`columns` ≈ 2/3 → "2/3-width", alongside the title. Canvas/htmlSlots pages carry `mode`
and no `rows`/`columns` — just name the page, no table. If a page entry carries
`"truncated": true`, its `rows` are capped (DVT-2370) — title that page's table "first N of
{rowCount} rows" (using the entry's own `rowCount`), never present the capped rows as if they
were the whole page.

**The table is the AUTHORED arrangement, not necessarily the rendered one.** Rows are banded from
the y-coordinates you wrote, at one recorded breakpoint (`layoutSummary.breakpoint`) — a sparse
layout can compact further when react-grid-layout lays it out client-side, and other breakpoints
machine-reflow. So don't present a preview table as the final rendered arrangement; the
ground-truth layout is the one from a post-persist `dvt_dashboard_get(format="concise")`.

For example:

| Row | Panels |
|-----|--------|
| 1 (KPI band) | Total CR · Step 1 CR · Step 2 CR · Step 3 CR |
| 2 | Weekly Conversion Trend (full-width line) |

**Narrate the build.** A multi-panel build must not be a silent spinner: before authoring, tell
the user the plan (the layout table above, per page); between tool calls, emit a one-line
status ("page 1/3 applied: 6 panels"). If a call fails, surface the server's Problem
`detail`/`suggestion` verbatim rather than retrying silently.

- **Answer-first (Minto / SCQA):** lead with the conclusion, then the support. The first page and the top-left panel carry the headline; detail comes after.
- **One question per page.** Order pages and panels so a reader gets the answer in the first few seconds and can drill into "why" below.
- Open each page with a `text` panel stating that page's takeaway, using live `{{ field | agg | format }}` variables so the prose moves with the data.

**Panel ↔ question mapping.** Once `meta.keyQuestions` exists, cite which question each panel answers via `meta.panels[panelId].serves_question` — a **zero-based index** into `meta.keyQuestions`, never the question text (an index survives a wording edit; text wouldn't). Omit it for a panel that serves no single question (navigation, decoration, a filter bar).

**Section-level orphan check — not per-panel.** After panels are placed, check at the *section* level (a page, or a `section` panel band grouping several panels) whether it collectively answers at least one declared question. Checking per panel is too noisy for a normal build; check the group. A section none of whose panels' `serves_question` values trace back to `meta.keyQuestions` is a signal: fold it into an existing question, add the question it's actually answering to `meta.keyQuestions`, or cut it — a section answering no declared question is scope creep.

**`keyQuestions` is append-only.** Never reorder or splice `meta.keyQuestions` in place once panels reference it by index — a silent reorder silently repoints every `serves_question` to the wrong question. Append new questions to the end. If a question genuinely must move or be removed, rewrite **every** `meta.panels[*].serves_question` index that pointed at it in the same edit, transactionally — never leave a stale index across a save (a stale/out-of-range index surfaces as a Tier-2 `warn`). When you delete a panel, also prune its `meta.panels[panelId]` entry — an orphan key matching no panel id surfaces as a Tier-3 `info` nudge.

### 3. Audience-driven generation — `meta.audience` shapes the build, not just the metadata

`meta.audience` (`executive` | `analyst` | `operator`) is a generation contract, not a label applied after the fact (ADR-0004 Amendment 1) — decide it alongside `meta.brief` in step 2, and let it steer every choice in step 4 (design) and step 5 (build).

- **`executive`** → compressed narrative, bigger key metrics, action-oriented panel/section titles, recommendation up top.
  - Fewer panels, more compression: one hero KPI + a short supporting group beats ten charts.
  - Titles state the recommendation, not the topic: "Renew ENT accounts before Q3 churn risk hits 8%," not "Churn by Segment."
  - *Worked example:* `meta.brief: "Renew now — ENT churn risk crosses 8% in Q3."` → the page opens with a `hero` panel stating that sentence, then one 3-card KPI strip (signed deltas), then a single supporting chart. No raw table, no drill-down affordances above the fold.
- **`analyst`** → denser data + richer exploration affordances.
  - More panels/detail is fine here; add filters, drill-downs, and rich tables (conditional formatting, in-cell viz — see "Rich tables") that the executive build would omit.
  - Titles can name the metric plainly ("Churn by Segment, Trailing 12mo") — the analyst wants the cut, not a pre-chewed conclusion.
  - *Worked example:* the same churn question renders as a `filter` panel for segment/region, a `chart:line` trend with `tooltip.fields` extra columns, and a rich `table` with `colorScale` heat-mapping the risk column — inviting the reader to slice further.
- **`operator`** → monitoring/freshness orientation.
  - Lead with current status, not narrative: is the system/process healthy right now?
  - Keep `meta.dataAsOf` / data-freshness visible (a `stat`/`kpi` panel or footnote citing it), not buried in the docs drawer — an operator dashboard whose data might be stale is actively misleading.
  - Favor status-forward primitives: `kpi`/`metric-strip` with delta + sparkline, threshold-colored panels for in-range vs out-of-range state, minimal historical narrative.
  - *Worked example:* a `metric-strip` of current queue depth / error rate / latency p95, each with a semantic-color threshold (see "Query-bound thresholds"), plus a footnote citing `meta.dataAsOf` so the on-call reader knows how current the numbers are.

### 3b. Build style — settle the layout preference before design begins (DVT-830)

Audience says *who* the dashboard is for; build style says *how* the user wants it built — a
second, separate thing to decide alongside `meta.brief`/`meta.audience` in step 2/3, before you
touch design or layout (step 4).

**For a net-new build of 3+ panels in an interactive session, ASK the user — via your harness's
user-question tool (e.g. `AskUserQuestion`) — which of the three build styles fits AND how they
want pages structured, before the design pass. This question overrides any "operate
autonomously" framing: build style is a product preference only the user can settle, not a
detail to infer.** Infer instead of asking only when (a) the user already stated a preference
earlier in this conversation, or (b) the run is headless/scheduled with no user to ask. Whichever
branch you take, record it in `meta.decisions` — including, when you inferred, that you inferred
and why.

- **quick KPI wall** — a dense grid of scorecards/metric-strips, minimal narrative chrome, fastest
  to build and scan. Build this only when the user **explicitly picks it** — and even a KPI wall
  ships with the default scoped filter (see Exploration patterns).
- **immersive / free-form report** — a scroll-driven, full-bleed story (canvas mode) with motion
  and one idea per section.
- **custom / bespoke look** — a heavier design pass (custom theming, HTML escape hatches,
  non-standard treatment) — usually still grid or canvas underneath with more art direction; a
  fully bespoke print-like/editorial page the user explicitly asks for is `htmlSlots` instead
  (see the layout-format rubric below).

When the user expresses no preference (they defer, or the run is headless), the default is a
**narrative layout derived from the data's story** — an answer-first guided band opening into an
interactive exploratory zone — never a KPI wall by default.

⚠️ **ADR-0057 guardrail — this question is presentation-only.** It's about build STYLE/LAYOUT
preference, never about the data itself — never use it to discover warehouse schema, tables, or
sample data. Data discovery is a separate concern (the profiling in step 1); don't blend the two.

Record the answer in **`meta.decisions`** with a recognizable prefix so it's easy to find later:
`"Build style: <kpi-wall|immersive|custom> — <one-line why>"`, e.g. `"Build style: kpi-wall —
exec wants a fast daily scan, not a narrative."` There is no dedicated schema field for build
style (unlike `meta.audience`, which is a schema-validated enum) — this is an **authoring
convention only**, so `dvt_spec_validate` neither requires nor enforces it. Set it before step 4
(Design) so the layout-format rubric below has an answer to consume. The server also surfaces a
warn-severity provenance suggestion on `meta.decisions` (DVT-881) when a 3+ panel spec has no
"Build style:" entry, so a missed omission still shows up in both the preview plan and the persist
response.

### 4. Design — encoding and layout in service of the message

- **Match the chart to the analytical task,** not to variety: trend → line/area; comparison → bar; distribution → histogram/box; relationship → scatter; part-to-whole → a few bars or a single donut (not a wall of pies); flow → sankey; concentration → sorted bar / Pareto. (See Panel types; avoid passthrough types that need inline data when binding a live query.)
- **Reserve color for signal** — the primary series, a delta, an outlier. Everything else stays neutral. Keep series colors as `{chart.series.N}` so the theme drives them.
- **Make the headline preattentive:** put the number that matters at the top, larger, with the one accent color; supporting charts recede.
- **Group and align** related panels; keep ≤ ~8–12 per page. Don't crowd — the renderer adapts label density to panel width automatically, so trust it instead of cramming.
- **For a narrative showpiece, reach for canvas mode** (`layout.mode: "canvas"`): one idea per scrolling section, a `hero` + `stat` opener, motion on entrance. Scrollytelling (Segel & Heer, author-driven) is the canvas analogue of answer-first paging — see Canvas mode.

**Layout-format rubric — map the build style to `layout.mode` (DVT-831).** Three real layout
formats exist today; pick with a short rubric, not a guess. Read the build style you recorded in
`meta.decisions` (step 3b) plus the brief's own characteristics — panel count, narrative weight,
audience — and map to a format:

| Build style / brief | Characteristics | Layout format |
|---|---|---|
| quick KPI wall | few panels, scorecards/metric-strips, exec or operator audience, scan-fast | `grid` (default) |
| dense analyst exploration | many panels, filters, drill-downs, rich tables | `grid` |
| immersive / free-form report | narrative showpiece, one idea per scrolling section, exec/prospect-facing | `canvas` (`layout.mode: "canvas"`, ADR-0027) |
| custom / bespoke, still tile-oriented | non-standard theming or HTML blocks, but panels stay tiled | `grid` |
| custom / bespoke, scroll-driven | non-standard theming, sectioned scroll story, motion | `canvas` |
| custom / bespoke, print-like/editorial page explicitly requested | bespoke branded HTML page, print/editorial layout the grid can't express | `htmlSlots` (`layout.mode: "htmlSlots"`, ADR-0059, dvt Full only) |

`grid` (`layout.mode` omitted, or set to `"grid"`) is the default — the 24-column tile grid used
above, right for KPI walls and analyst views. `canvas` (`layout.mode: "canvas"`) is for immersive,
full-bleed, scroll-driven decks — see **Canvas mode** below. `htmlSlots` (`layout.mode:
"htmlSlots"`) is for author-written HTML pages with live panel mounts — see **HTML-slots mode**
below; default to `grid` unless the user explicitly asks for a bespoke HTML page. When the build
style doesn't cleanly map (most "custom/bespoke" answers), let the brief's characteristics from
the table break the tie.

htmlSlots shipped via ADR-0059 (schema #708, renderer #713) — it is available today, not a future
option; see **HTML-slots mode** above for the full authoring contract.

**`dvt_page_reference` catalogs the modes; the pick stays rubric-driven (founder decision, DVT-857,
2026-07-02, superseding the DVT-831 no-catalog-tool call).** Call `dvt_page_reference()` with no arguments to enumerate the page layout modes
(`grid`, `canvas`, `htmlSlots`) with their `whenToUse`/summary — that catalog is what tells you the
modes exist and gives fit guidance; it does not choose one for you. The actual pick still runs
through the rubric above (build style + brief characteristics). There is still **no
`dvt_layout_recommend`** MCP tool — a recommender that maps build style → format automatically
remains out of scope. Don't add one on your own initiative.

**Let the chart reference drive selection.** Call `dvt_chart_reference()` with no arguments to get the catalog — every chart type with a one-line `whenToUse` and `dataShapes` tags (`time-series`, `part-to-whole`, `correlation`, `flow`, `distribution`, `hierarchy`, `geo`, `categorical-comparison`, `ranking`, `multivariate`, `network`, `single-kpi`). Match your profiled data's shape to a type, then call `dvt_chart_reference(chart_type)` for its option summary and `dvt_chart_reference(chart_type, property_path)` to drill into a specific property before you author it. Validate the result with `dvt_spec_validate`.

### 4a. Design flow — ground every choice in a served catalog (no guessing)

Design (step 4) is not a single decision — it's five mechanical stages, each grounded in a
served MCP catalog. At every stage below, **call the named tool and pick from what it returns** —
never recall options from memory or prose, and never offer a user something the catalog didn't
serve. Work the stages in order; each stage's output constrains the next.

| Stage | Tool | Grounds |
|---|---|---|
| 0. Dashboard | `dvt_dashboard_reference()` | What the top-level dashboard spec shape looks like |
| 1. Page | `dvt_page_reference()` | Which page layout modes exist, with fit guidance |
| 2. Blocks & charts | `dvt_chart_reference()` / `dvt_block_reference()` | Which panel types fit the data shapes and key questions |
| 3. Specs | `dvt_dashboard_reference(section, property_path)` / `dvt_chart_reference(chart_type, property_path)` / `dvt_block_reference(block_type, property_path)` / `dvt_page_reference(page_type, property_path)` | Exactly which properties exist on the dashboard, chosen page, or panel |
| 4. Interactivity | `dvt_interaction_reference()` | Which interactivity surface is actually shipped |

**0 — Dashboard.** Call `dvt_dashboard_reference()` with no arguments to enumerate the top-level
dashboard spec keys (`meta`, `theme`, `layout`, `panels`, `pages`, `tabBar`, `cache`, ...) with
`required`/`whenToUse` guidance and a minimal valid skeleton. This is the shape everything else
below hangs off of — ground it before picking a page mode.

**1 — Page.** Call `dvt_page_reference()` with no arguments to enumerate the available page
layout modes and their fit guidance. Where the build-style answer (§3b) doesn't already force
the pick, present the modes as options to the user before committing. Choose using the
layout-format rubric above, then call `dvt_page_reference(mode)` to drill into the chosen mode's
declaration shape.

**2 — Blocks & charts.** Call `dvt_chart_reference()` / `dvt_block_reference()` to match panel
types to the data shapes you profiled (step 1) and the key questions you set (step 2). Before
authoring the full spec, propose a sample layout — a panel-by-panel sketch (type, purpose, rough
position) — and get user confirmation.

**3 — Specs.** For each chosen panel type, for the page itself, and for the dashboard-level
sections from stage 0 (`meta`, `theme`, ...), drill down with `property_path` to fetch exactly
which properties exist. Declare only served properties — never author a field you haven't
confirmed exists. Validate with `dvt_spec_validate`.

**4 — Interactivity.** Call `dvt_interaction_reference()` with no arguments to enumerate the
shipped interactivity surface (filter controls, brush cross-filter, context-menu actions, drill,
params). Start from the **default interactivity package** in Exploration patterns above (scoped
filter + context menus on hero/tables + drills where detail exists) and run the per-control
self-check to tune it. **Include the package in the proposed layout sketch you present** — it is
part of the design the user confirms, not an optional add-on they must request; note any control
you cut (and why), and record a fully-flat choice as `"Interactivity: none — <reason>"` in
`meta.decisions`.

**If an option isn't in a served catalog, it doesn't exist — never offer or author it.**

### 4b. Persisting the build — incremental is the interactive default (ADR-0057 Amendment 1)

Design and preview are unchanged: finish the staged design pass (§4a), assemble the complete intended spec, run `dvt_dashboard_apply_spec(preview=true)` on it, and SHOW the user the plan (§3b and the preview-first rule above). What changes is how you persist.

**Interactive sessions (a user is watching): persist incrementally.**

1. **Shell first.** Apply a minimal shell — `meta` + `theme` + the first page with `panels: []` (valid: `panels` has no minimum) — without `preview`. The dashboard now exists in the Builder within seconds; tell the user to open it and watch it grow.
2. **Panel by panel.** `dvt_element_create` each panel (~1–2KB each), narrating as you go ("page 1/3: panel 4/6 — revenue trend"). **Always pass an explicit, stable `slug`** derived from the panel's title/id in the design (e.g. `revenue-trend`) — never leave it empty. An empty slug is regenerated fresh on every call, so a lost-response retry after a create that actually landed will duplicate the panel; an explicit slug makes the create idempotent (see step 4). Pass the optional per-breakpoint `layout` param when your design carries responsive (md/sm) geometry; flat x/y/w/h is fine otherwise. An interactive panel is ONE call: pass `on_click` (a single bare action — filter | drill | openOverlay), `context_menu`, `subtitle` (and `drill` / `brush` if the design uses them) directly on `dvt_element_create` — they are the rest of the Panel envelope and are validated against the same Panel schema `dvt_element_patch` enforces at `/onClick`, `/contextMenu`, `/subtitle`, `/drill`, `/brush` — instead of creating and then patching. `dvt_element_get` echoes them back, so a read-after-write shows the wiring. Create later pages with `dvt_page_create` as you reach them; fix ordering at the end with `dvt_pages_reorder`.
3. **Render checkpoint per page — never per panel.** `dvt_dashboard_render_inline` after each page completes. The render budget is 10/hour per org on SaaS (`RENDER_RATE_LIMIT`; the native app has no hourly cap by default, but the render service only runs 2 at a time); a per-panel cadence will exhaust a SaaS budget mid-build.
4. **If one element fails,** surface the server's Problem `detail`/`suggestion` verbatim and retry that one element — the retry re-sends 1–2KB, not the whole spec. This retry is safe **because** step 2's explicit slug makes it idempotent: if the original create actually landed and only the response was lost, the retry gets a 409 slug-taken — treat that as success (the panel is already there) and move on, don't error out or duplicate it. A briefly incomplete dashboard is expected here; the user is watching it assemble.
5. **Final integrity pass.** Run `dvt_spec_validate` on the full spec you assembled and applied (already in context — no need to re-fetch it) and surface any remaining `collision`, `data-binding`, `interaction-stranding`, and provenance warnings to the user. (`dvt_dashboard_check_overlap` is the pre-build duplicate-content search from the Authoring method's step-1 data audit — not an integrity check; don't re-run it here.) Then `dvt_dashboard_get(format="concise")` the persisted dashboard for its `layoutSummary` — the final, ground-truth layout (built page-by-page, so it may differ from what you narrated mid-build) — this is what becomes the closing table (§5).

**Headless/scheduled runs (no user watching): keep the single full-spec apply** — transactional, all-or-nothing; never leave a half-built dashboard unattended.

Record which persist path you took in `meta.decisions` (e.g. `"Persist: incremental (interactive)"` or `"Persist: single apply (headless run)"`).

### 5. Build, then SEE it — verify and iterate

Headless/batch net-new builds persist via the single-apply path below; interactive net-new builds persist via the incremental flow in §4b above. **Surgical edits do not use either** — an edit scoped to one element, one page, or `spec.meta` persists through its own patch route (`dvt_element_patch` / `dvt_page_patch` / `dvt_dashboard_meta_patch`, §"Choosing your approach"), not by re-sending the spec. Re-send only when the patch route itself refuses the edit — e.g. a `layout.mode` transition, `dvt_page_patch`'s single-page restriction, or a `legacy-dashboard` 409 on a dashboard predating granular editing — which is a documented fallback, not the default. Read the refusal rather than assuming: the `legacy-dashboard` and single-page cases are 409s whose `suggestion` names the full re-apply outright, but a `layout.mode` change comes back as a **400 `invalid-patch`** whose `suggestion` merely lists which page paths *are* patchable — treat that one as "not through this route", not as "malformed patch, retry".

1. Write the spec (mechanics above). Bind each panel to a fully-qualified `query`.
2. Validate with `dvt_spec_validate` — fix field errors and heed `warnings` (typos, and panels that will render EMPTY).
3. **Render, then read `renderSummary` before you look at anything:** `dvt_dashboard_render_inline` at desktop (`width` ~1280–1440) AND mobile (`width` ~390–414), for each `page`. Alongside the PNG the response carries a text block with a `renderSummary` — read it first, and let it decide whether the render succeeded; a picture is not a verdict — for **every** panel kind, not just charts. The lead line reads "renderSummary: N of M mounted panel(s) measured (S structural), K warning(s)" and always ends "Panels not mounted in this render (inactive container tabs, other pages) were not measured." M counts panels MOUNTED in the rendered page; panels on inactive container tabs or other pages are not mounted and never appear — render each `page`, and check a hidden tab's panels some other way, before calling them verified. "(S structural)" (shown when S > 0) counts measured panels that carry no data (section, divider, filter, filter-bar, container, action-button) — they are part of N, not evidence of data. Every panel in `renderSummary.panels` carries its `type`, a `state` (`drawn` / `empty` / `error` / `not-measured`), and a per-kind `measure`: charts report `pointsDrawn` (and `pointsPerSeries`); tables report `measure.rowsShown` (body rows after client filters and sort, before grouping — not a guarantee they fit the capture); kpi / stat report `rowsShown` as the result's rows and are `empty` when there is no finite value to show; metric-strip reports `rowsShown` as the tiles with a finite value (`empty` when no tile has one); html / text / hero report `measure.kind: "expressions"` with `total` / `resolved` / `unresolved` `{{ }}` counts (`empty` means the query returned 0 rows, or the panel has `{{ }}` expressions and every one fell back to "—" — including a panel with expressions but no `data`); media reports the loaded image's `naturalWidth` × `naturalHeight`, `error` when it failed to load, `empty` when the src was rejected by the sanitizer, and `not-measured` with reason `image-not-loaded` when the image was still pending at capture; structural panels report `measure.kind: "static"` and are `drawn`, except an action-button with no label or action, which is `empty`. The lead line's "not measured: <elementId> (<reason>)" list names panels the render did not measure: `python` panels (`python-not-rendered` — python never runs in a render), `agent` panels (`interactive-only`), and media still loading (`image-not-loaded`). An older bundle without a panel count still prints the legacy "N chart panel(s) measured … Panels not listed were not measured" line — there, a panel absent from the list was simply not measured. Any `warnings[]` entry means the render did **not** succeed — say so and fix it, don't describe the dashboard as done. Report the evidence as numbers, not impressions: "the revenue line drew 6 points across 1 series", never "the chart looks right". Two zero-point causes read identically on screen but are different bugs — name which one the summary shows, but only for a panel in `state: "empty"`: `pointsDrawn: 0` with a non-zero `rowCount` means the data arrived and the **binding** is wrong (this is DVT-4399 exactly: 6 rows returned, 0 points drawn); `pointsDrawn: 0` with `rowCount: 0` means the **query** returned nothing. `state: "error"` means the panel is showing the "No data — this panel couldn't load" card, and `error` says why. A panel can instead report `state: "not-measured"` — the summary genuinely could not tell whether it drew data (e.g. a series reading a `transform`-produced dataset, whose rows aren't visible in the ECharts option readback; or a tuple-compiled chart type — scatter, heatmap — whose compiled data cells mix an unusable value, such as `NaN` from a text-bound axis, with a populated label/category cell, so every row classifies as mixed and the series is unmeasurable). It reports that same `pointsDrawn: 0` with non-zero `rowCount` shape without being a DVT-4399 binding bug; don't apply the binding-vs-empty rule above to a `not-measured` panel. **It is not a failure, but it is not a pass either — treat the panel as unverified.** A passing `dvt_data_query` does NOT clear it: data arriving is exactly as consistent with a working panel as with the scatter-style binding failure above, which also returns every row — the columns just aren't drawable — so `dvt_spec_validate` plus `dvt_data_query` cannot tell the two apart and must never be reported as confirming the panel is fine. The lead line's "not measured" list (legacy: "N panel(s) could not be measured") counts exactly these panels — they sit outside the verdict entirely, never folded into "0 warning(s)". The only thing that can confirm the draw for a `not-measured` panel is the image itself: look for actual marks in the plot area — points, cells, bars — at roughly the expected `rowCount`; a visually blank plot area despite a non-zero `rowCount` is real evidence of the same binding failure the summary couldn't detect, even though it still isn't proof. Report a `not-measured` panel to the user as unverified either way — name it and its chart type, don't fold it into a clean summary. Otherwise, the image can only prove layout, legibility, squished labels, headline clarity, mobile reflow. **The image cannot prove a *measured* panel has data — a table's rows, a KPI's value, an html panel's `{{ }}` values — only the summary can.**
4. Iterate on what the summary and the image showed, then save via the API / MCP. **Don't ship a dashboard whose `renderSummary` you haven't read, and never call a render fixed on a warning-free glance at the picture alone.**

**When render-verify is unavailable (DVT-1014).** Render depends on the dvt-render (Chromium)
service, a heavier path than the JSON API. From some hosted MCP/agent sessions
`dvt_dashboard_render_inline` fails with `api_unreachable` (a transport-level failure on the
long-held inline request), `api_disconnected` (the API accepted the request but the render hop
closed the connection), or `api_timeout` **even when plain calls — `dvt_data_query`,
`dvt_dashboard_get` — succeed against the same API**. That means the render dispatch path is
unavailable in this context, NOT that the API is down; don't report it as an outage and don't
retry it in a loop. Fall back to structural verification — `dvt_spec_validate` plus
`dvt_data_query` on each panel's SQL — or run render-verify from a local `make dev` context
where the render service is reachable. Say which verification you actually did.

**When the render succeeds but `renderSummary` doesn't come back.** This is not the DVT-1014
failure above (the render worked) — the summary was unavailable in this context. Don't paper over
the gap by reading the image as if it were the summary: say plainly that `renderSummary` was
unavailable, then fall back to the same structural verification as DVT-1014 —
`dvt_spec_validate` plus `dvt_data_query` on each panel's SQL — to establish that data actually
arrived. Say which verification you actually did.

**Renders you intend to diff.** `dvt_dashboard_render` persists an artifact and is diffable;
`dvt_dashboard_render_inline` stores nothing, so `dvt_dashboard_diff` 422s on inline renders at
any dimensions. `dvt_dashboard_diff` also rejects a pair whose `width`, `height`, or `format`
differ — but it does **not** check panel scope, so two renders of *different* panels (both
defaulting to 800×600) pass validation and return a meaningless diff instead of an error. Keep
`width`, `height`, `format`, and `panel_id` consistent yourself across any pair you diff.

**Close every build/reflow/multi-panel edit with three things:** the final layout table (from the
apply/preview `plan.layoutSummary`, or a closing `dvt_dashboard_get(format="concise")` after an
incremental build), the dashboard link, and any caveats worth one line — the table reflects the
recorded `breakpoint` (`layoutSummary.breakpoint`, usually `lg`) only — other breakpoints
machine-reflow — plus unresolved provenance warnings and anything you renamed or couldn't do.
Skip caveats that don't apply; never pad the close with restated panel prose the table already
shows.

### 6. Premium polish — the exec-grade checklist

For a C-suite / board / prospect-facing dashboard, run this final gate (every item TRUE) before
you ship. It's the authoring-skill condensation of the executive-dashboard playbook:

1. **One key message** — answer-first headline top-left before any chart (Minto/BLUF), with live `{{ }}` values.
2. **Answer-first ordering** — hero → supporting groups → detail (inverted pyramid); no chart above the key message.
3. **Guided band, then explore** — a full-width headline + KPI strip + insight sentence reads on its own; filters/drill live below it, never above.
4. **One hero, ≥2 size tiers** — the hero panel is ≥2× a standard panel's area; **never an all-same-size grid**.
5. **Top-left = most important** — respect F/Z reading paths.
6. **KPI strip: 3–5 cards on a page (≤4 in an overlay/drawer)** — each with value + signed % delta + sparkline + target, semantic color only.
7. **Takeaway titles** — titles state the insight with injected values, not column names.
8. **Narrative block per section** — a `text` panel with live `{{ }}` precedes the chart it explains.
9. **Annotation callouts** on the hero chart's target/peak/inflection with a cause phrase (cap 3/chart).
10. **Section headers** (`section` panels) group the grid into legible chapters.
11. **Restrained palette** — neutral base + 1 accent + semantic tokens; color = meaning only. Consider a `theme.preset`.
12. **Flat & clean** — no gradient/shadow/3D on data; faint horizontal gridlines only; high data-ink ratio.
13. **Humanized, consistent units & locked axes** for fair comparison.
14. **No pies >3 slices, no dual-axis, no rainbow heatmaps** — sorted bars / split panels / single-hue ramps.
15. **Render and look at it** — desktop AND mobile; dark mode is first-class, not an inversion filter.
16. **Every chart names its comparison** — vs book, vs prior period, vs fleet average; a number with no reference reads as decoration.
17. **Metric reconciliation** — before publishing, reconcile every derived count/share appearing in prose or titles against its source panels (sums add, shares ≤100%, cohort counts match).

(The full playbook — audience framing, KPI-card anatomy, the anti-pattern table — lives in the
`executive-dashboard` design skill; this checklist is the spec-author's pocket version.)
