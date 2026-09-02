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

## Top-level shape

```json
{
  "schemaVersion": 1,
  "id": "00000000-0000-0000-0000-000000000000",
  "meta": { "title": "...", "brief": "one-line thesis",
            "findings": ["..."], "readme": "markdown", "decisions": ["..."],
            "tags": ["..."], "createdBy": { "actorType": "user", "actorId": "..." } },
  "theme": { "tokens": { "primitive": {}, "semantic": {}, "component": {} } },
  "layout": { "columns": 24, "rowHeight": 30, "items": { "lg": [], "md": [] } },
  "panels": [ /* Panel[] for the default page */ ],
  "pages": [ { "id": "...", "title": "...", "layout": {...}, "panels": [...],
              "background": "linear-gradient(135deg,#1E1B4B,#0D9488)" } ],
  "tabBar": { "position": "top", "layout": "horizontal", "alignment": "start", "size": "md" },
  "cache": { "ttlSeconds": 600, "enabled": true }
}
```

**`id`** — supply a fresh random UUID for each new dashboard, or pass the all-zeros UUID
(`00000000-0000-0000-0000-000000000000`) and the server generates one (the generated id is
injected into the stored spec and returned on create). Never copy an id from an example or an
existing dashboard — dashboard ids are globally unique, and a colliding id is rejected with
**409 `id-conflict`** (exception: retrying a create whose spec is identical to what's already
stored replays the existing dashboard with a 200 — safe to retry after a network blip).

- Use **`pages`** for multi-tab dashboards; each page has its own `layout` + `panels`.
  (If you use `pages`, the top-level `panels`/`layout` can be empty.)
- **`tabBar`** (optional) configures the page-tab navigation control for a multi-page
  dashboard — declaratively, no callbacks. It renders in the editor, the chrome-less
  `/present` viewer, and full-bleed **canvas** dashboards; single-page dashboards render
  **no tab chrome**. Fields (all optional, sensible defaults):
  - **`position`** — `top` (default) · `bottom` · `left` · `right` · `free`. `left`/`right`
    dock a vertical rail; `free` **floats** the bar over the content at `placement` (the
    natural choice for a full-bleed canvas dashboard, which reserves no edge gutter).
  - **`layout`** — `horizontal` (default, a row) · `vertical` (a column) · `stacked`
    (a row that wraps onto multiple lines when the tabs overflow).
  - **`alignment`** — `start` (default) · `center` · `end` · `justify`.
  - **`size`** — `sm` · `md` (default) · `lg`.
  - **`placement`** — `{ "x": 0-100, "y": 0-100 }`, a percentage offset from the top-left
    of the viewport. Only used when `position: "free"`; ignored otherwise.
  Example (a centered floating bar for a canvas deck):
  `"tabBar": { "position": "free", "layout": "stacked", "alignment": "center", "size": "md", "placement": { "x": 50, "y": 4 } }`
  - A page may set **`"hidden": true`** (ADR-0036, as amended 2026-08-21): it is **excluded from
    the tab bar / default nav** but stays fully authored and is a valid **`openOverlay`** target
    — the way to build a **detail page that only opens as an overlay** (`pages: [{ id:
    "region-inspector", title: "Region inspector", hidden: true, layout, panels:[…] }]`).
    ⛔ **Never `drill` at a hidden page.** A `drill` *navigates*, and a hidden page has no tab to
    return through — the viewer is stranded with browser Back. `dvt_spec_validate` raises the
    advisory `interaction-stranding` warning on it (DVT-3138). `drill` remains correct and
    supported for a page that **is** visible in the tab bar. ⚠️ `hidden` is
    **presentation, not access control** — a hidden page's data is governed by the same RBAC
    as any page; never use it to "protect" sensitive data.
- **`cache`** (optional) tunes how long this dashboard's query results may be reused
  before re-querying the warehouse. `ttlSeconds` is the freshness window (e.g. `600`
  = up to 10 min stale); `0` or `"enabled": false` means **always live**. Omit it to
  use the org default (10 min). Results are cached per `(source, query, params,
  viewer-role)` and never shared across identities; viewers can always force a live
  refresh from a panel's refresh control. Raise it for slow/expensive dashboards that
  don't need to be real-time; set it live for operational dashboards.
- **`page.background`** (per page) takes a solid color or a gradient (`linear-gradient(...)`,
  `radial-gradient(...)`, `conic-gradient(...)`, the `repeating-*` variants, theme `var()`
  indirection) — the in-app sanitizer allowlists color/gradient/indirection CSS functions only
  and drops the whole value if it contains anything else (ADR-0027 §2); **no image** —
  `url(...)`/`image-set(...)`/`cross-fade(...)` are all rejected (SSRF/exfil defense-in-depth,
  same concern as `media.src`). For an image background, use the Hero-band pattern's `html` band
  instead. Use `page.background` to make each page its own visual "world" — it's the cheap
  "anti-boring" lever, a subtle gradient wash lifts a dashboard off flat gray for zero layout
  cost. Keep washes subtle, and keep the light theme the default; build dark only when the brief
  explicitly asks for it.
- **`layout.items`** is keyed by breakpoint (`lg`, `md`, `sm`, `xs`). Each item:
  `{ "i": panelId, "x", "y", "w", "h" }` on a 24-column grid. `rowHeight` is ~30px;
  the governing invariant is **~380px of rendered height** — `h × rowHeight + (h−1) × gap`
  (gap = the grid's row margin, `layout.gap.y`/`grid.yGap`, default 16) — for
  standard/mini/hero charts — smaller reads as a toy. The sizing rules of thumb
  below (heights, not an ordering) are that ~380px floor expressed at the measured
  `rowHeight: 40`: a text/strip band ≈ `h:3–4` (a coverage/context strip's own
  CHARTS ≥ `h:4` — the deliberate exception to the floor), a standard chart ≈
  `h:7–8` (h:7 × 40 + 6 × 16 ≈ 376px — right at the floor, which is why that
  rule of thumb sits there), exec-wall mini charts ≥ `h:10`, hero charts ≥ `h:11`,
  `kpi` panels (the `kpi` panel type — not `metric-strip` cells) ≥ `h:5` when they carry a caption + sparkline. At a different
  `rowHeight`, derive `h` from the full formula
  `h × rowHeight + (h−1) × gap ≥ ~380px` rather than scaling row counts — e.g. at
  the schema default `rowHeight: 30`, that gives `h:9` (9×30 + 8×16 ≈ 398px), not
  a proportionally-scaled `h:11`. The page's *shape* comes from the
  data's story (see the Authoring method), not from a fixed strip-then-charts
  template. Author `lg` always. Below a 640px-wide
  container the renderer stacks the `lg` panels into one full-width column in
  reading order — author `sm`/`xs` items (with `layout.breakpoints`) only when you
  want to hand-tune that narrow view; they win over the automatic stack. (`md` is
  not consulted for narrow stacking.)
- **`layout.mode`** defaults to `"grid"` (the 24-column grid above). Set
  `"mode": "canvas"` for an immersive, full-bleed, scroll-driven layout (sections +
  free-form blocks + motion) — see **Canvas mode** below. Set `"mode": "htmlSlots"`
  for an author-written HTML page where live panels mount at `<dvt-slot ref="panelId">`
  markers — dvt Full only, never Core — see **HTML-slots mode** below. One spec, three
  layout shapes.

## Panel types

Five MCP reference tools ground the authoring flow in what's actually served, never
prose recall: `dvt_dashboard_reference` for the top-level dashboard spec shape itself,
`dvt_chart_reference` for every `chart:*` type (option summary +
property-path drill-down, sourced from ECharts' own docs), `dvt_block_reference` for
the non-chart, dvt-native block types (its catalog is the authoritative, current
list of which of those it serves a dedicated property reference for today, since
coverage is expected to grow (DVT-2734); same catalog → type-summary →
property-path drill-down shape), `dvt_page_reference` for the available page layout modes, and
`dvt_interaction_reference` for the shipped interactivity surface (filters, brush,
context-menu actions, drill, params). Call the matching one before authoring an
unfamiliar type — see **Design flow** below for how the five compose into a staged
build.

**Work them in this staged order — each stage's answer constrains the next:**
`dvt_dashboard_reference()` for the top-level dashboard shape → `dvt_page_reference()`
for the page mode → `dvt_chart_reference()` / `dvt_block_reference()` for panel types
→ `dvt_interaction_reference()` for interactivity — any of those five with a
`property_path` for the exact properties a chosen type accepts. Each returns a catalog
with no arguments; call it again with its discriminator (`section`, `chart_type`,
`block_type`, `page_type`, or `interaction_type`) to drill in. **If an option isn't in a
served catalog, it doesn't exist — never offer it to the user and never author it.**
The full staged walk-through, with the rubric for each stage, is **Design flow**
(§4a of the Authoring method).

| `type` | Renders | Key `spec` fields |
| --- | --- | --- |
<!-- BEGIN generated chart-type table (make echarts / ADR-0022) — do not edit between markers -->
| `chart:bar` / `chart:bar:horizontal` / `chart:bar:stacked` / `chart:bar:stacked-percent` | ECharts bar | `xAxis`, `yAxis`, `series[].dataField`, `series[].itemStyle.color`; stacked uses `categoryField`/`seriesField`/`valueField` |
| `chart:line` / `chart:line:smooth` / `chart:line:step` / `chart:area` | ECharts line | `series[].dataField`, `series[].smooth`, `series[].lineStyle`, dual `yAxis` + `yAxisIndex`; `chart:area` adds `areaStyle` |
| `chart:pie` / `chart:donut` | ECharts pie | `series[].radius` (`["40%","70%"]` = donut), `series[].label` |
| `chart:scatter` | ECharts scatter | `xField`, `yField`, `sizeField` (bubble), `labelField`; binds rows → `[x,y,size]` points |
| `chart:effect-scatter` | ECharts effectScatter (passthrough) | scatter with ripple emphasis — `series[].rippleEffect`, inline or `dataField`-bound points; on geo: `coordinateSystem: 'geo'` — **On geo, `series[].coordinateSystem` must be set to `'geo'` explicitly — the compiler never injects it — and `geo.map` must name a registered map asset (ADR-0023); dvt bundles `USA`, `world`, `usa-counties`, `canada-provinces`, `uk-regions`, `eu-admin1` (case-sensitive). Other names need host-side `registerMapAsset`. Data points must carry inline `value: [lon, lat]` coordinates; category-axis values (the default cartesian shape) will not place points on the map.** |
| `chart:heatmap` | ECharts heatmap | `xField`, `yField`, `valueField`, `valueFormat`; auto category axes + `visualMap` ramp (`heatmap.low`/`heatmap.high` tokens) |
| `chart:calendar` | ECharts heatmap | `xField` (defaults to the first non-value column) + `valueField` (defaults to the last column) — both case-tolerant (DVT-530); the color ramp comes from `colorScale` or the `heatmap.low`/`heatmap.high` theme tokens by default, but authoring `visualMap` directly is a passthrough that overrides the ramp — **`xField`/`valueField` accept a `Date`, an ISO datetime string, or an already-`YYYY-MM-DD` string; a row whose date fails to normalize is dropped, never rendered as a NaN cell. Dates outside 1970-01-01..2100-12-31 are treated as unparseable and dropped (a sentinel guard against warehouse values like `9999-12-31`); once the max date is known, rows more than ~5 years (1827 days) before it are further trimmed before `calendar.range` and the color scale are derived, so a decade of data renders as its most recent 5 years. `valueField` values that are `null`/`undefined`/`''`/boolean are dropped rather than coerced to 0 — a missing day is an uncolored cell, not a 0-valued one. `calendar.range` is derived from the data's min/max date unless you declare `calendar` yourself — a declared `calendar` is spread last and wins, which is an ECharts passthrough and classifies the panel as dvt Full; the ~5-year data trim still applies even when you declare `calendar`, so a wider declared `range` renders empty cells and does not restore the trimmed rows, and a very wide declared range (e.g. spanning centuries) is an unbounded render cost. Pre-aggregate to one row per day — the binder does not aggregate duplicate dates. If every row fails to normalize, the whole panel falls back to the cartesian default rather than rendering an empty calendar.** |
| `chart:waterfall` | ECharts bar | `categoryField` (defaults to the first non-value column, the bar label) + `valueField` (defaults to the last column, the delta) — both case-tolerant (DVT-530); a NULL `valueField` cell marks a subtotal/total bar — **Two `bar` series share one `stack` with `stackStrategy: 'all'` — an invisible spacer (base) plus the visible bar (delta) — because ECharts' default `stackStrategy: 'samesign'` only combines same-signed stacked values, which silently detaches the visible bar from its base once the running total goes negative; `'all'` combines unconditionally and renders every case (increase, decrease, negative territory, a single delta that itself crosses zero) correctly. A row whose `valueField` is SQL NULL/absent is a subtotal/total bar — drawn from 0 to the accumulated running total (which the row does not itself change) — not a separate schema key; `''`/boolean/object values are dropped, as is any string that isn't a plain decimal literal (no exponent, hex, or leading `+`) — never coerced to 0, the `Number(null) === 0` class of footgun — rather than becoming a false delta. Bar color is sign-driven (`semantic.positive`/`semantic.negative` theme tokens) with total bars using the primary series color, overridable per-category via `categoryColors`; there is no `seriesColors` analogue since the bridge synthesizes one visible series, not a named list. Without rows, or when every row is unparseable junk, falls back to the cartesian default rather than rendering an empty bridge. Unlike every other chart family, a hand-authored `series[0]` does NOT bind to the visible bar here — it binds to the invisible base spacer, so a `series[0]` style/label override touches geometry the viewer never sees; the real, visible delta bar is `series[1]`.** |
| `chart:gauge` | ECharts gauge | first numeric column (or `valueField`) binds the value; `valueFormat` formats the detail readout; `min`/`max`, `progress`, `axisLine` |
| `chart:radar` | ECharts radar (passthrough) | `radar.indicator[]`, inline `series[].data: [{ name, value: [...] }]` |
| `chart:funnel` | ECharts funnel | (name, value) columns auto-bind (`labelField`/`valueField` to override); `series[].sort`, `gap`, `label` |
| `chart:treemap` | ECharts treemap (passthrough) | inline `series[].data` hierarchy (`{ name, value, children }`), `levels` |
| `chart:sankey` | ECharts sankey | `sourceField`/`targetField`/`valueField` columns → nodes + links (or inline `series[].data` + `series[].links`) |
| `chart:tree` | ECharts tree (passthrough) | inline `series[].data` hierarchy, `layout` (`orthogonal`/`radial`) |
| `chart:sunburst` | ECharts sunburst (passthrough) | flat query rows via `hierarchyFields` (ordered inner→outer level columns) + `valueField`; or inline `series[].data` hierarchy (`{ name, value, children }`); `radius` — **Two binding modes: map flat query rows with `hierarchyFields` (inner→outer level columns) + `valueField`, or hand-author the nested inline `series[].data` tree (DVT-1101).** |
| `chart:boxplot` | ECharts boxplot (passthrough) | inline `series[].data: [[min, Q1, median, Q3, max], …]` + category `xAxis.data` |
| `chart:candlestick` | ECharts candlestick (passthrough) | inline `series[].data: [[open, close, low, high], …]` + category `xAxis.data` |
| `chart:graph` | ECharts graph (passthrough) | inline `series[].data` (nodes) + `series[].links`, `layout: "force"`, `categories` |
| `chart:lines` | ECharts lines (passthrough) | inline `series[].data` polylines/trajectories (`coords`), `polyline`, `effect` — **`geo.map` must name a registered map asset (ADR-0023); dvt bundles `USA`, `world`, `usa-counties`, `canada-provinces`, `uk-regions`, `eu-admin1` (case-sensitive). Other names need host-side `registerMapAsset`. Each `series[].coordinateSystem` must be set to `'geo'` explicitly — the compiler never injects it. Route geometry must be supplied inline in `series[].data[].coords`; the `dataField` data-binding path is refused by the shape guard — the compiler emits no series. The app and both MCP render tools (`dvt_dashboard_render`, `dvt_dashboard_render_inline` — headless Chromium against the app) surface the `passthrough-shape-unbindable` explanation; only the CI SSR smoke's compiler-only path shows an empty chart.** |
| `chart:parallel` | ECharts parallel (passthrough) | `parallelAxis[]` dims + inline `series[].data` rows |
| `chart:pictorial-bar` | ECharts pictorialBar (passthrough) | `series[].symbol` per category, `symbolRepeat`, `symbolSize` |
| `chart:theme-river` | ECharts themeRiver (passthrough) | `singleAxis` (time) + inline `series[].data: [[date, value, stream], …]` |
| `chart:chord` | ECharts chord (passthrough) | inline `series[].data` (nodes) + `series[].links` with values |
| `chart:map` | ECharts map (advanced) | `series[].map` names a registered map asset (bundled: `USA`, `world`, `usa-counties`, `canada-provinces`, `uk-regions`, `eu-admin1`); (name, value) rows bind automatically, `labelField`/`valueField` override; `visualMap` min/max auto-fill from bound values. Match your data's region names to the pack's binding contract exactly (`usa-counties` = `"<NAMELSAD>, <ST>"`, the Census LSAD label verbatim — e.g. `"Harris County, TX"`, `"Orleans Parish, LA"`; `eu-admin1` = `"<Region>, <CC>"`, with a parenthetical qualifier for the small number of within-country collisions, e.g. `"Cork (County), IE"`; `uk-regions` bare region name, e.g. `"East"` for East of England). For data-driven geography set `geoField` to a GeoJSON-geometry column (e.g. GEOGRAPHY/GEOMETRY or VARIANT/OBJECT in Snowflake, `jsonb` in Postgres) and the query rows build a per-panel inline map — no named asset needed (DVT-153) — **`series[].map` must name a registered map asset (ADR-0023). dvt bundles `USA` (US states + DC + Puerto Rico), `world` (country boundaries, region name on `properties.name`), `usa-counties` (3,222 US counties, binds as `"<NAMELSAD>, <ST>"` — the Census LSAD label verbatim, e.g. `"Harris County, TX"` AND `"Orleans Parish, LA"` — 223 of 3,222 regions are not "County": Parish/LA, Municipio/PR, independent city, Borough/Census Area/etc.), `canada-provinces` (13 provinces/territories, bare province name, e.g. `"Québec"`), `uk-regions` (12: 9 English regions + Scotland + Wales + Northern Ireland, bare region name, e.g. `"Scotland"` — East of England is the bare string `"East"`), and `eu-admin1` (998 EU-27 first-order admin units, continental Europe only, binds as `"<Region>, <CC>"`, e.g. `"Limburg, NL"`; names carry diacritics, NFC-normalized; 20 of 998 rows collide within one country and instead carry a parenthetical qualifier, e.g. `"Cork (County), IE"` / `"Cork (City), IE"`); other names need host-side registerMapAsset and render an explicit error until registered. For data-driven geography, set `geoField` to a column carrying GeoJSON geometry (e.g. a Snowflake GEOGRAPHY/GEOMETRY or VARIANT/OBJECT column, or a Postgres `jsonb` column — the engine returns all of them parsed) — the rows build a per-panel inline map, so no named asset is needed (DVT-153). geoField queries are bounded by the engine row cap (`query_max_rows` = 10,000 rows; 5,000 on the shared demo-postgres source) and each row is one feature — shape geo queries per-state / per-metro, never one national query (e.g. all ~33k US ZCTAs), or the map silently renders a partial choropleth from the capped subset.** |
| `chart:custom` | ECharts custom (advanced) | `series[].renderItem` must be a registered `$dvtRef` — **Requires a renderItem function, which must be a registered $dvtRef (ADR-0016); raw functions cannot be expressed in a spec.** |
| `chart:bar:racing` | ECharts bar (advanced) | `animation.frameField` (required — the time column), `categoryField` (entity identity, stable across frames so bars slide not pop), `valueField` (measure); optional `animation.{speeds,speedDefault,loop,controls.placement}`, top-N via `yAxis.max` — **Animated 'bar chart race' (ADR-0034). dvt Full / non-portable. Requires an `animation` block with `frameField` (the time/sequence column); `categoryField` is the stable entity identity that slides between frames and `valueField` the measure. One query returns all frames stacked in rows; the client iterates in-browser — no per-frame query. Top-N via `yAxis.max`. Renders to a static poster (last frame) in exports (ADR-0024).** |
| `chart:line:racing` | ECharts line (advanced) | `animation.frameField` (required — the x/time column), `valueField` (y measure), optional `seriesField` (multi-line split); `animation.{speeds,speedDefault,loop,controls.placement}` — **Animated progressive / 'racing' line (ADR-0034). dvt Full / non-portable. Requires an `animation` block with `frameField` (the x/time column the line draws along); optional `seriesField` splits multiple lines, `valueField` is the y measure. One query, the client iterates frames as a cumulative slice — no per-frame query. Renders to a static poster (last frame) in exports (ADR-0024).** |
| `chart:geo:animated` | ECharts map (advanced) | `animation.frameField` (required — the period column), `series[].map` (registered asset, e.g. `USA`), `labelField`/`valueField` (region, measure) or `geoField` for data-driven geometry; `visualMap` auto-fills from values — **Animated choropleth over a time dimension (ADR-0034), driven by the shared merge-clock + `visualMap` (not the native ECharts `timeline`, ADR-0034 Amdt 1). dvt Full / non-portable. Requires `animation.frameField` (the period column) and a registered map asset (`series[].map`, ADR-0023); `labelField`/`geoField` name the region, `valueField` the measure. Fills CROSS-FADE between periods via per-region value interpolation (ADR-0034 Amdt 3); regions with no data on either side snap at the boundary, and large maps (>80 regions, e.g. `world`, `usa-counties`) stay discrete. One query, the client iterates. Renders to a static poster (last frame) in exports (ADR-0024).** |
| `chart:bar3d` | ECharts bar3D (passthrough) | top-level `grid3D` + `xAxis3D`/`yAxis3D`/`zAxis3D`, inline `series[].data` rows `[x, y, z]` — **ECharts GL series — no upstream Apache-core option doc exists for `bar3D` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:line3d` | ECharts line3D (passthrough) | top-level `grid3D` + `xAxis3D`/`yAxis3D`/`zAxis3D`, inline `series[].data` rows `[x, y, z]` — **ECharts GL series — no upstream Apache-core option doc exists for `line3D` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:lines3d` | ECharts lines3D (passthrough) | top-level `globe` or `geo3D` (NOT `grid3D`/cartesian3D — unsupported by the lines3D layout), inline `series[].data` arc/trajectory segments `[{"coords": [[lng,lat],[lng,lat]]}]` — **ECharts GL series — no upstream Apache-core option doc exists for `lines3D` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). cartesian3D (`grid3D`) is unsupported by the lines3D layout — author `globe` or `geo3D` instead (DVT-3413 r3). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:scatter3d` | ECharts scatter3D (passthrough) | top-level `grid3D` + `xAxis3D`/`yAxis3D`/`zAxis3D`, inline `series[].data` rows `[x, y, z]` — **ECharts GL series — no upstream Apache-core option doc exists for `scatter3D` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:surface` | ECharts surface (passthrough) | top-level `grid3D` + `xAxis3D`/`yAxis3D`/`zAxis3D`, inline `series[].data` grid of `[x, y, z]` triples — **ECharts GL series — no upstream Apache-core option doc exists for `surface` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). echarts-gl also supports a parametric-equation path (`series[].equation`), but `equation.z` must be an actual JS function (echarts-gl SurfaceSeries.js) — dvt specs are function-free (ADR-0016) and no $dvtRef id supplies one, so that path is unreachable from a dvt spec; author inline `series[].data` instead (DVT-3413 r2). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:map3d` | ECharts map3D (passthrough) | optional top-level `geo3D` (map3D creates its own by default) or `globe` (with `series.coordinateSystem: "globe"` to attach to it); `series[].map` (SERIES-level, required) names a registered map asset — `geo3D.map` alone is NOT sufficient, `Map3DSeries.getInitialData` reads `option.map` off the series itself (echarts-gl `Map3DSeries.js`), so a top-level `geo3D.map` with no `series[].map` never feeds map3D (bundled assets: `USA`, `world`, `usa-counties`, `canada-provinces`, `uk-regions`, `eu-admin1`); inline `series[].data` objects `{name, value}` — compileGl does no row binding (web/src/compiler/gl.ts), so query rows never populate this type — **ECharts GL series — no upstream Apache-core option doc exists for `map3D` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). `series[].map` must name a registered map asset (ADR-0023), same as chart:map. Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:graph-gl` | ECharts graphGL (passthrough) | inline `series[].data` (nodes) + `series[].links`, `layout: "forceAtlas2"` (GPU force layout) — **ECharts GL series — no upstream Apache-core option doc exists for `graphGL` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:scatter-gl` | ECharts scatterGL (passthrough) | inline `series[].data` rows `[x, y]`; large point counts render GPU-accelerated — **ECharts GL series — no upstream Apache-core option doc exists for `scatterGL` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:lines-gl` | ECharts linesGL (passthrough) | inline `series[].data[].coords` polylines; `coordinateSystem: 'geo'` for a geo basemap, same registered-asset contract as chart:lines — **ECharts GL series — no upstream Apache-core option doc exists for `linesGL` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Same map-asset/coordinateSystem contract as chart:lines when drawn over a geo basemap. Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
| `chart:flow-gl` | ECharts flowGL (passthrough) | `series[].dimensions` naming the coord + velocity columns (e.g. `["x","y","vx","vy"]`) and inline `series[].data` rows in that column order — echarts-gl has no `supplyData` API; FlowGLSeries reads `series.data` via the standard ECharts source/dimensions path — **ECharts GL series — no upstream Apache-core option doc exists for `flowGL` (echarts-gl ships separately from apache/echarts-doc), so specs pass GL options through unvalidated; the advisory lint skips shape checks for this type (ADR-0022 GL carve-out, DVT-3413). Renders via WebGL in the browser; headless render/export (PNG poster, scheduled export) support is unverified until the GL render lane lands — non-portable, requires the echarts-gl module (dvt Full).** |
<!-- END generated chart-type table -->
| `metric-strip` | Row of KPI metric tiles | `metrics[]` (see below); each metric accepts `description` (optional hover tooltip) |
| `kpi` | Single-value scorecard (one headline number + comparison + sparkline) | `valueField` (required), `agg`, `format`, `label`, `caption`, `description` (optional hover tooltip), `comparison{…}`, `sparkline{…}` (see below) |
| `table` | Data table (dvt-native, portable) | `columns[]` — each `{ field, label?, format?, align?, sortable?, filterable? }`; omit for every query column in result order. `defaultSort{ field, direction }` seeds an initial sort; click-to-sort + per-column filter run client-side over the fetched rows (`sortable`/`filterable` default true). Row order follows the query `ORDER BY` unless `defaultSort` overrides it; `format` uses the shared format objects. `grouping{ groupBy[], aggregations[]{field,agg}, subtotals?, grandTotal?, defaultExpanded? }` collapses rows into a grouped tree with subtotal/grand-total rows — computed client-side over the fetched rows (no re-query, no SQL rewrite), `groupBy` order = nesting levels, `agg` ∈ sum/avg/min/max/count (default sum). `pivot{…}` switches the panel to cross-tab mode (see Rich tables → Pivot); pivot panels also show a viewer-facing `Fields` tray that quick-swaps pivot rows/columns/values as ephemeral view state — parallel to client-side sort/filter, never persisted (DVT-897) |
| `text` | Markdown narrative | `markdown`, `variant` (`plain`\|`callout`), `align` |
| `html` | Sanitized HTML/CSS escape hatch | `html` (see below) |
| `stat` | Big-number tile (hero-scale single value) | `valueField` (required), `agg`, `format`, `label`, `caption`, `description` (optional hover tooltip), `delta`, `sparkline`, `align` (see below) |
| `hero` | Headline block (eyebrow + headline + subhead) | `headline` (required), `eyebrow`, `subhead`, `align`, `size` (`sm`\|`md`\|`lg`\|`xl`); text fields support `{{ … }}` variables (see below) |
| `media` | Image block (ADR-0014 escape hatch) | `src` (required, sanitized), `alt`, `fit` (`cover`\|`contain`\|`fill`), `rounded`, `caption` (see below) |
| `divider` | Visible rule line | `orientation`, `thickness`, `color`, `style` (`solid`\|`dashed`\|`dotted`), `inset` (see below) |
| `section` | Grid heading band that labels a group of panels | panel `title` = the heading; `subtitle` (one line), `rule` (hairline below, default true), `align` (`left`\|`center`\|`right`); takes no query, spans full width (`w:24` by convention). **dvt Core. NOT the canvas `layout.sections[]` block — distinct constructs** (see below) |
| `filter` | Interactive control whose selected value re-queries target panels | `param` (required unless a range), `valueField` (required), `labelField`, `label` (display label — preferred over `placeholder` for labelling; falls back to `placeholder` → param → `'Filter'`), `placeholder` (input-hint text only), `help` (accessible `?` tooltip), `control` (`select`\|`multiselect`\|`date-range`\|`number-range`\|`search`\|`toggle`\|`number`\|`segmented`\|`radio`\|`button-group`\|`checkbox-list`\|`top-n`), `valueType` (`string`\|`number`\|`date`\|`boolean`), `targets`, `values`, `default`, `allLabel`, `unsetMode` (`omit`\|`null`), `operator` (`equals`\|`not-equals`\|`contains`\|`starts-with`\|`ends-with`\|`in`\|`not-in`\|`between`\|`gt`\|`gte`\|`lt`\|`lte`), `apply` (`live`\|`button`), `required` (boolean), `chrome` (`card`\|`none`), `width` (`compact`\|`full`), `density` (`comfortable`\|`compact`), `icon` (`calendar`\|`search`\|`filter`\|`region`\|`tag`\|`clock`\|`user`\|`dollar`); **range** (`between` / `number-range` / `date-range`): `loParam`+`hiParam` (required, replace `param`), `min`, `max`, `step`; **date** (`date-range`): `relativeDate` (`{lo?,hi?}`, each `{unit: minute\|hour\|day\|week\|month\|quarter\|year, amount, direction}`), `presets` (`today`\|`last-7d`\|`last-30d`\|`last-90d`\|`mtd`\|`qtd`\|`ytd`\|`all-time`), `timezone` (IANA, default `UTC`); **server-side typeahead** (`select`/`multiselect` only, DVT-540): `searchMode` (`'client'`\|`'server'`, default `'client'`), `searchParam` (required when `searchMode:'server'` — the `%(name)s` placeholder the typed term binds to) (see Filters & drill-downs) |
| `filter-bar` | Horizontal band grouping several filter elements in one light surface (DVT-551) | `panels` (required — ordered list of child filter element ids from the same page's `panels[]`), `title?`; child filters should set `chrome:"none"` to avoid doubled chrome; children are NOT page grid items; semantic pass enforces existence / no double-placement |
| `container` | Tabbed container — one page region holding several panel sets behind tabs (layout primitive, not a chart) | `spec.layout: "tabs"` (required), `tabs[]` (required) each `{ id, label, panels:[childId…], layout }`, `defaultTab?`. **Children stay real elements in `panels[]`** referenced by id (never inlined); each tab carries its own mini 24-col `layout`, and the container itself occupies one cell in the page grid. Children are NOT in the page grid. Single level only (no tabs-in-tabs). NOT the same as page-level tabs (`pages[]`+`tabBar`). The semantic validator rejects missing refs / a child placed twice / a child also in the page grid / nesting / a bad `defaultTab` / a tab id that collides with a panel id |
| `agent` | Interactive block hosting a live conversational thread with a registered Cortex agent (DVT-3562, ADR-0082 W2) | `agent?` (optional `database.schema.agent` FQN of the Cortex agent this panel talks to — unset shows an explicit "no agent configured" state, never a silent no-op or a guessed default). Deliberately minimal: no `data` block (a turn is a Cortex agent run, not a warehouse query, and never enters the query-result cache) and no per-user/thread state — a conversation is per-viewer browser state only, never written into the spec or a stored revision. Interactive-only: a headless/static render shows a placeholder in place of the chat surface |

Any panel can also carry a `contextMenu` object (right-click action menu — filter/drill/link/copy/export/openOverlay) and/or a `drill` object (retained for back-compat, inert on its own — DVT-555; wire drill navigation via `onClick` or a `contextMenu` action instead). `onClick` (a single, disclosed left-click action — filter/drill/openOverlay) is narrower: a property on every panel type that resolves a clicked datum (every `chart:*` type, plus `table`/`kpi`/`stat`/`metric-strip`) — but `chart:line:racing` is inert at runtime (no affordance, no dispatch; DVT-3041); the schema rejects it on `filter`, `filter-bar`, `container`, `divider`, `section`, `text`, `html`, `hero`, `media`, `agent`, which surface no clicked datum. See **Filters & drill-downs** for the full field reference and the post-DVT-2722 actionability rule (which surfaces need a row-field `valueFrom` vs. `category`/`value`/`seriesName`).

### ⚠️ Chart spec — critical: do NOT use Vega-lite encoding syntax

dvt charts use **ECharts-style specs**, not Vega-lite. The schema allows additional
properties (for ECharts passthrough flexibility), so an incorrect spec **passes
validation but renders blank charts with no error**. This is the #1 authoring mistake.

```
❌ WRONG (blank chart, no error):
"spec": {"encoding": {"x": {"field": "REGION", "type": "nominal"}, "y": {"field": "REVENUE", "type": "quantitative"}}}

✅ CORRECT (renders):
"spec": {"xAxis": {"type": "category"}, "yAxis": {"type": "value"}, "series": [{"type": "bar", "dataField": "REVENUE"}]}
```

**Every chart panel needs a resolvable ECharts-style binding** — either a `series[]`
array with a bound field, or the Core field mappings shown below (`xField`/`yField`,
`labelField`). A Vega-lite `encoding` block is neither, so the chart renders blank.
Minimum specs by chart type:

| Type | Minimum `spec` |
| --- | --- |
| `chart:bar` / `chart:line` / `chart:area` | `{"xAxis":{"type":"category"}, "yAxis":{"type":"value"}, "series":[{"type":"bar","dataField":"<value_col>"}]}` |
| `chart:pie` / `chart:donut` | `{"series":[{"type":"pie","dataField":"<value_col>"}], "labelField":"<label_col>"}` |
| `chart:scatter` | `{"xAxis":{"type":"value"}, "yAxis":{"type":"value"}, "xField":"<x_col>", "yField":"<y_col>"}` |
| `chart:bar:horizontal` | `{"xAxis":{"type":"value"}, "yAxis":{"type":"category"}, "series":[{"type":"bar","dataField":"<value_col>"}]}` |

Field placement matters: `xField`/`yField` (scatter) and `labelField` (pie/donut) are
**top-level `spec` keys**, not inside `series[]` — placed under `series[]` they are
silently ignored and the binder falls back to positional columns. (Scatter needs no
explicit `series[]` at all; the renderer synthesizes one from the query rows.)

All of these values are **query column names**. Match the exact column casing —
Snowflake returns columns uppercase, so use `"REVENUE"`, not `"revenue"` (a
case-insensitive fallback exists but only when no two columns collide on case; exact
match is unambiguous and always safest). For cartesian charts the category axis defaults
to the first query column not already consumed by a series `dataField`.

### Data binding

Each panel may set `data: { "sourceId": "...", "query": "SELECT ..." }`. The first
returned column is the category/label axis; subsequent columns are bound by
`series[].dataField` (chart) or `valueField` (metric/stacked). Charts that take an
explicit field mapping (scatter/heatmap) name their columns via `xField`/`yField`/etc.

`sourceId` is the NAME of a configured data source (matched by name, not a UUID).
In snowflake native mode (`DVT_MODE=snowflake`) the app boot-provisions exactly one
secretless, caller's-rights source named `Host Snowflake`; set `data.sourceId:
"Host Snowflake"` for a panel's query to run against the caller's own Snowflake
account — otherwise the panel never fires a query.

**`Host Snowflake` cannot query shared databases.** Its caller's-rights sessions
can only reach objects the app owner has pre-delegated with CALLER grants, and
Snowflake forbids CALLER grants on shared (imported) objects — so
`SNOWFLAKE.ACCOUNT_USAGE`, `SNOWFLAKE_SAMPLE_DATA`, and any Marketplace/data-share
import will ALWAYS fail (never author panels directly against them). Wrap the
shared data in an owned table, view, or model first (e.g. `CREATE VIEW
my_db.my_schema.v AS SELECT ... FROM SNOWFLAKE.ACCOUNT_USAGE....`) and point the
panel's query at that owned object. Owned databases additionally need CALLER grants to
the APPLICATION — set up once per database (not per object): `GRANT CALLER USAGE ON
DATABASE <db> TO APPLICATION <app>; GRANT INHERITED CALLER USAGE ON ALL SCHEMAS IN
DATABASE <db> TO APPLICATION <app>; GRANT INHERITED CALLER SELECT ON ALL TABLES IN
DATABASE <db> TO APPLICATION <app>; GRANT INHERITED CALLER SELECT ON ALL VIEWS IN
DATABASE <db> TO APPLICATION <app>;`. `INHERITED CALLER` cascades by containment, so
this also covers schemas/tables/views created later — no re-grant needed.

**Canonical cartesian form — author the measure as `series[].dataField`.** For the plain
value families (`chart:bar`/`chart:line`/`chart:area`), the single authored form used by
every dvt example, seed demo, and golden spec is an explicit `series[].dataField` (the
category axis comes from the first returned column, or an explicit `categoryField`/`xField`).
Author to that form so specs stay consistent across surfaces. The renderer *also* tolerates a
`series[]`-less **Core shorthand** — `valueField` (+`categoryField`) for bar, `yField`
(+`xField`) for line/area — and synthesizes a single series from it (DVT-1085), but that is a
render-time convenience, **not** the authored convention: prefer `series[].dataField`. (Note
the nullish-coalescing edge the validator now flags: a present-but-empty `valueField: ""`
wins over a set `yField` and renders blank — omit the field entirely rather than passing `""`.)

**Always fully-qualify table names** as `database.schema.table` (e.g.
`SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS`). A connection may carry no default
database/schema — Snowflake service connections don't — so an unqualified
`FROM orders` fails; fully-qualified names are also deterministic regardless of
session/connection context and role defaults on every warehouse. Never rely on an
implicit current database/schema. This applies to `Host Snowflake` too: its
caller's-rights session pins no default database/schema, so queries against it
must be fully qualified.

**Write SQL in the canonical dvt style.** Leading commas, lowercase keywords, a
`where 1=1` guard — clean diffs, and a missing comma is a one-line error:

```sql
select alias1.field1
    , alias1.field2
    , sum(alias2.field3) as total_field3s
from tablea as alias1
inner join tableb as alias2
    on alias1.key1 = alias2.key1
    and alias1.key2 = alias2.key2
where 1=1
    and alias1.region = %(region)s
group by alias1.field1
    , alias1.field2
```

Rules: lowercase keywords; one field per line with **leading** commas; explicit
`as` on every table alias and alias-qualified columns; `inner/left join` with `on`
then indented `and` predicates; `where 1=1` guard then each predicate as an
indented `and ...`; `group by` mirrors the select list. Parameter-bound predicates
use named `%(key)s` bindings (ADR-0028) — never string-interpolate values into the
SQL. Full reference: `docs/02-spec/sql-style-guide.md`. This is dvt's opinionated
default for SQL that's easy to read and audit; customers can override authoring with
their own skills, but the dvt app always normalizes the SQL shown in the panel query
inspector to this canonical style.

**`data.query` must always be executable SQL — including on baked panels.** The panel query
inspector shows it verbatim and a live fetch executes it verbatim, even when the panel renders
from baked `rows` or inline `series[].data`. Never write a natural-language description there
(advisory `query-sql` lint, DVT-1242). If the data you baked in came from reshaping the query
result — a pivot, a manual rollup, a hand-tweaked ordering — write the **real SQL that produced
it** and document the post-query reshaping as a trailing `--` comment:

```sql
select o.region
    , sum(o.revenue) as revenue
from analytics.public.orders as o
where 1=1
    and o.closed_at >= %(start_date)s
group by o.region
-- pivoted to one series per region client-side; ordering set manually to match the brief
```

**Backend-free specs:** add `data.rows` (an array of row objects) and the panel
renders from those directly — **no engine, no warehouse, no live query.** This makes
a spec fully self-contained (great for demos, the `/builder`, and static hosting).
Keep `query` alongside `rows` so the SQL inspector still shows real SQL:

```json
"data": { "sourceId": "db", "query": "SELECT category, SUM(amount) AS revenue ...",
          "rows": [ { "category": "Software", "revenue": 1269315.62 } ] }
```

**`data.query` MUST be executable SQL — never a natural-language description.**
The panel's query inspector shows the string verbatim, and a live fetch executes it
verbatim, so `"query": "weekly revenue by category (theme-river bands)"` is both
dishonest and broken. This applies even when the panel renders from baked `rows` or
inline `series[].data`: write the real SQL that produced the data (validate surfaces
an advisory `query-sql` warning otherwise, DVT-1242). When the shown data was
reshaped after the query (e.g. rows nested into a sunburst tree), append the note as
a trailing SQL comment — executable statement first:

```json
"query": "SELECT c.region, c.segment, ROUND(SUM(o.amount)) AS rev FROM ... GROUP BY 1, 2\n-- derived: nested into region → segment children for the sunburst"
```

Only truly derivation-only documentation (no single producing statement exists) may
be comment-only (`-- derived: …`).

### Tooltip — dvt Core extensions (DVT-301 / DVT-408)

The tooltip sub-keys `fields`, `total`, `order`, `template`, and `crosshair` are *dvt Core* (portable, renderer-neutral). They are compiled + stripped before the ECharts tooltip passthrough — any other key under `tooltip` is the ECharts escape hatch. Tooltip enrichment works on bar/line/area, pie/donut, and scatter; ignored on pivot/relational families.

**Functions are never allowed in dvt specs.** The `template` key is the function-free alternative to a raw ECharts `tooltip.formatter`.

#### tooltip.fields — extra columns on hover (DVT-301)

`spec.tooltip.fields` surfaces additional query-result columns in the chart hover tooltip. Absent columns are silently skipped.

Each entry: `{ "field": "<column>", "label"?: "...", "format"?: { ... } }`. `label` defaults to a humanized form of the field name. `format` is the shared FormatObject.

```json
{ "type": "chart:bar",
  "spec": {
    "series": [{ "type": "bar", "dataField": "rev" }],
    "tooltip": { "fields": [
      { "field": "order_count", "label": "Orders", "format": { "type": "number" } },
      { "field": "yoy", "label": "YoY", "format": { "type": "percentage" } }
    ] } } }
```

#### tooltip.total — shared-axis sum row (DVT-408)

Appends a total row summing all numeric series values at the hovered category. *dvt Core.*

`total.show` (boolean) — enable the total row. `total.label` (string, default `"Total"`) — the row label. `total.format` (FormatObject) — formats the sum; defaults to a grouped number.

```json
"tooltip": { "total": { "show": true, "label": "Total", "format": { "type": "currency", "currency": "USD", "compact": true } } }
```

#### tooltip.order — sort per-series rows (DVT-408)

`order`: `"asc"` \| `"desc"` \| `"seriesIndex"` (default). Sorts the per-series tooltip rows by numeric value ascending or descending; `"seriesIndex"` keeps the original series order.

```json
"tooltip": { "order": "desc" }
```

#### tooltip.template — function-free row template (DVT-408)

A string template applied to each per-series tooltip row instead of the default `name: value` line. *dvt Core — no functions needed.*

**Token grammar** (only these tokens are substituted; everything else is left as literal text):

- `{value}` — the formatted series value for this row
- `{label}` — the series name
- `{field:<colname>}` — a named query-result column from the hovered row (`<colname>` must be `[A-Za-z0-9_]+`)

All substituted values and all literal template text are HTML-escaped. Unknown tokens (anything that doesn't match the allow-list) are left as-is in the output.

```json
"tooltip": {
  "template": "{label}: {value} ({field:region})"
}
```

Example output for a series named `Revenue`, value `$1.2M`, hovered row `region=West`: `Revenue: $1.2M (West)`.

#### tooltip.crosshair — axis pointer style (DVT-408)

Compiles to ECharts `tooltip.axisPointer`. *dvt Core.*

- `crosshair.axis`: `"x"` \| `"y"` \| `"both"` — `x`/`y` renders a line pointer on that axis; `"both"` renders a cross pointer.
- `crosshair.label` (boolean) — when `true`, shows the axis value label on the pointer line.
- `crosshair.snap` (boolean) — when `true`, the pointer snaps to the nearest data point.

```json
"tooltip": { "crosshair": { "axis": "x", "label": true, "snap": false } }
```

#### Composing all Core keys

All dvt Core tooltip keys compose freely and can be mixed with ECharts passthrough keys:

```json
"tooltip": {
  "trigger": "axis",
  "fields": [{ "field": "order_count", "label": "Orders", "format": { "type": "number" } }],
  "total": { "show": true },
  "order": "desc",
  "template": "{label}: {value}",
  "crosshair": { "axis": "x" }
}
```

**The FormatObject** (`format`) is one shared, renderer-neutral vocabulary — it renders identically on chart axes/labels/tooltips, KPI scorecards, table cells, and `{{ }}` text variables. `type` is one of:

- `number` / `currency` (`currency` ISO code) / `percentage` — `decimals` sets fraction digits; `compact` (`1.2M`) on number/currency. (Percentage expects a whole number, e.g. `25` → `25%`.)
- `compact` — shorthand for compact number notation.
- `date` — `pattern` selects which fields show (CLDR-ish tokens: `yyyy`/`yy`, `MMMM`/`MMM`/`MM`/`M`, `dd`/`d`, `HH`, `mm`), e.g. `"MMM d, yyyy"` → `Mar 9, 2026`. Rendered in UTC.
- `duration` — humanizes a numeric duration. `unit` is the input unit (`ms` default, or `s`/`m`/`h`/`d`); `style` is `short` (`2h 5m`, default), `long` (`2 hours 5 minutes`), or `colon` (`2:05:00`).
- `custom` — `pattern` is a [d3-format](https://github.com/d3/d3-format) string (a portable mini-language, **not** author code — ADR-0016): `",.2f"`, `"$,.0f"`, `".1%"`, `"~s"`. Note: a d3 `%` pattern (`".1%"`) multiplies by 100 and expects a **fraction** (`0.25` → `25%`), unlike `type:"percentage"` which expects a whole number (`25` → `25%`).

All types also accept `prefix`/`suffix` (wrap the output) and `locale` (BCP-47; defaults to `en-US` for deterministic output).

### Legend (DVT-407)

*Multi-series charts auto-get a legend.* A chart with ≥2 series (bar/line/area/scatter, any orientation) receives a styled legend automatically — no `legend: {}` needed. Single-series cartesian charts do *not* get an auto-legend (it's noise). Set `"legend": { "show": false }` to suppress.

`legend.position` — *dvt Core* placement shorthand: `"top"` \| `"bottom"` \| `"left"` \| `"right"`. `left`/`right` automatically set `orient:"vertical"`. Compiled + stripped; not a native ECharts key. Raw ECharts placement keys (`top`/`left`/`right`/`bottom`/`orient`) set directly on `legend` win over this shorthand.

`legend.values` — *dvt Core* value-in-legend: appends an aggregated series value to each legend label. No JS needed.

```json
{ "type": "chart:bar",
  "spec": {
    "series": [
      { "type": "bar", "dataField": "revenue", "name": "Revenue" },
      { "type": "bar", "dataField": "target",  "name": "Target" }
    ],
    "legend": {
      "position": "bottom",
      "values": { "agg": "total", "format": { "type": "currency", "currency": "USD", "compact": true } }
    } } }
```

`values.agg`: `last` (last non-null) · `total` (sum) · `min` · `max` · `mean`. `values.format` is the shared *FormatObject*.

For scroll behavior, hiding individual series by default, or other ECharts legend features — use the raw ECharts legend passthrough (`type:"scroll"`, `selected`, etc.) directly alongside Core keys.

### Number display — value labels, funnel rates, derived metrics

dvt Core, renderer-neutral ways to put numbers *on the chart* — no hand-written ECharts `formatter`. All format via the shared format objects (see Formats). A raw `series[].label.formatter` remains the Full escape hatch and takes precedence over these.

**Value labels on marks** — top-level `spec.label` puts the formatted datum value on each mark. Works on bar/line/area, pie/donut, scatter (ignored on pivot/relational families). `position` defaults sensibly per type (bar→top, horizontal bar→right, pie/donut→outside, scatter→top).

**Pie/donut labels are default-ON.** Unlike the cartesian families (default-OFF — they need an explicit `show:true`), pie/donut inherit ECharts' slice labels: labels paint unless you set `show:false`, and an absent `show` with any other label control set still applies it. Their value label is prefixed with the slice **name** (`"2019: 42.0%"`) since a pie has no axis to carry that identity. When a legend is shown on the **left/right**, the default label position moves from `outside` to `inside` (and the name prefix is dropped — the side legend already carries the names), so outside labels don't collide with the legend; a top/bottom legend, no legend, or an explicit `position` keeps `outside`.

```json
{ "type": "chart:bar",
  "spec": {
    "series": [{ "type": "bar", "dataField": "revenue" }],
    "label": { "show": true, "position": "top", "format": { "type": "currency", "currency": "USD", "compact": true } } } }
```

**Derived display metrics** — `label.derive` shows a value computed from the series instead of the raw number:

- `percentOfTotal` — each datum as % of the series sum.
- `deltaPrev` — absolute change vs the previous datum (signed ▲/▼).
- `deltaPrevPct` — percent change vs the previous datum (signed ▲/▼).

First datum / zero-sum / zero-prior render as `—`.

```json
"label": { "show": true, "derive": "percentOfTotal", "format": { "type": "percentage", "decimals": 0 } }
```

**Label styling** (DVT-1002) — `label.rotate`, `label.fontSize`, `label.color` restyle the
value-label text itself, on the same nine families as `spec.label` above (bar, bar:horizontal,
line, line:smooth, line:step, area, scatter, pie, donut). **Not** compiled on `chart:bar:stacked`,
`chart:bar:stacked-percent`, or `chart:funnel` — those stay on the escape-hatch
`series[].label.*` passthrough, so a `spec.label.rotate`/`.fontSize`/`.color` there is a silent
no-op.

- `rotate` — label rotation in degrees, `-90`–`90`.
- `fontSize` — label font size in pixels, `8`–`32`.
- `color` — a CSS color string or a `{token}` reference (resolved before compilation); gated
  through the same SSRF-safe color guard as `categoryColors`/`colorRules` — an unsafe value is
  dropped and the authored/default label color is left untouched.

```json
"label": { "show": true, "rotate": -45, "fontSize": 11, "color": "{text.secondary}" }
```

**Funnel conversion rates** — on `chart:funnel`, top-level `spec.funnelRate` shows conversion % in the stage labels (no raw formatter needed):

```json
{ "type": "chart:funnel",
  "spec": {
    "labelField": "stage", "valueField": "count",
    "funnelRate": { "mode": "step", "showValue": true, "precision": 0 } } }
```

`mode`: `step` (% of the previous stage) · `overall` (% of the first stage) · `total` (% of all stages) · `none`. `showValue` also prints the formatted stage value (uses the panel's `valueFormat`).

**Label headroom.** With `label.position: "right"` on horizontal bars (or any end-of-axis value
labels), set the value axis `max` ~10–15% above the data max so the labels render inside the plot
instead of clipping against the panel edge. For param-bound charts whose max varies with the
parameter, prefer tooltip-only labels over a hardcoded `max`.

### Axes

`xAxis` and `yAxis` accept a single *AxisSpec* object or an array of *AxisSpec* objects for multi-axis charts. Every property below is dvt Core (portable). Any key *not* listed here is raw ECharts passthrough — it validates and renders as-is (the escape hatch, ADR-0014).

| Property | Type | Notes |
|----------|------|-------|
| `type` | `"value"` \| `"category"` \| `"time"` \| `"log"` | Axis scale. Default `"value"` for numeric axes, `"category"` for label axes. |
| `min` | number \| `"dataMin"` | Fixed lower bound, or `"dataMin"` to derive from the data. |
| `max` | number \| `"dataMax"` | Fixed upper bound, or `"dataMax"` to derive from the data. |
| `scale` | boolean | Value axis: don't force a zero baseline. Default `false`. |
| `splitNumber` | integer | Suggested tick count (ECharts treats as a hint). |
| `logBase` | number | Base for `type:"log"`. Default 10. |
| `name` | string | Axis title label. Styled by `chart.axis.name.*` tokens. |
| `nameLocation` | `"start"` \| `"middle"` \| `"center"` \| `"end"` | Where along the axis the name anchors. Default `"end"` (the engine default) — but the AUTHORING default for a vertical value-axis `name` is `nameLocation: "middle"` with `nameGap` ≈ 40 (tune 36–44 to label width); an end/top-positioned vertical axis name clips against the panel's top edge (reproduced 4× on one build, measured on the FCC rebuild, 2026-08). |
| `nameGap` | number | Distance in pixels between the name and the axis line. |
| `nameRotate` | number | Name label rotation in degrees. |
| `boundaryGap` | boolean \| array | Category-axis edge padding. `false` = data point on the axis edge. Array `["10%","10%"]` for value axes. |
| `inverse` | boolean | Reverse the axis direction. Default `false`. |
| `position` | `"top"` \| `"bottom"` \| `"left"` \| `"right"` | Axis position. Default `"bottom"` for xAxis, `"left"` for yAxis. |
| `axisLabel.rotate` | number | Tick-label rotation (-90 to 90). Use for long labels that overlap. |
| `axisLabel.interval` | number \| `"auto"` | Label display interval. `0` = every label; `"auto"` = auto-hide overlapping. |
| `axisLabel.hideOverlap` | boolean | Auto-hide overlapping labels. |
| `axisLabel.margin` | number | Distance (px) between label text and the axis. |
| `axisLabel.width` | number | Max label width (px); overflow handled by `axisLabel.overflow`. |
| `axisLabel.overflow` | `"none"` \| `"truncate"` \| `"break"` \| `"breakAll"` | Text overflow handling when label exceeds `width`. |
| `axisLabel.format` | FormatObject | The compiler turns this into an ECharts `axisLabel.formatter` — the same renderer-neutral vocabulary as value labels and tooltips. Use for date axes to avoid hand-written formatters. |

*Example — named axes with rotated labels:*

```json
{ "type": "chart:bar",
  "spec": {
    "xAxis": { "type": "category", "name": "Month", "nameLocation": "end",
               "axisLabel": { "rotate": 45 } },
    "yAxis": { "type": "value", "name": "Revenue (USD)", "nameGap": 20,
               "axisLabel": { "format": { "type": "currency", "currency": "USD", "compact": true } } },
    "series": [{ "type": "bar", "dataField": "revenue" }] } }
```

Never leave an axis `name` at end-position on horizontal bars — it collides with the last value
label; prefer `nameLocation: "middle"`, or fold the unit into the panel subtitle instead.

**Dual-axis pattern.** Set `yAxis` to an array and reference the secondary axis by index in the series. `dvt_spec_validate` warns when `series[].yAxisIndex > 0` but `yAxis` is not an array of sufficient length.

```json
{ "type": "chart:line",
  "spec": {
    "xAxis": { "type": "category" },
    "yAxis": [
      { "type": "value", "name": "Revenue" },
      { "type": "value", "name": "Margin %", "position": "right" }
    ],
    "series": [
      { "type": "line", "dataField": "revenue" },
      { "type": "line", "dataField": "margin", "yAxisIndex": 1 }
    ] } }
```

Any other ECharts axis key (e.g. `splitLine`, `axisPointer`, `minInterval`) is raw passthrough and validates alongside these documented properties — both coexist freely.

See **Label headroom** below (end of Number display) for keeping end-of-axis value labels inside the plot area.

### Gridlines, banding & plot area

Four dvt-Core keys control the plot grid — no hand-written ECharts `splitLine`/`splitArea`/`grid` needed for common cases. *Precedence*: raw ECharts passthrough (e.g. a `xAxis.splitLine` set directly, or a raw `grid:{left:60}`) always wins over these Core keys, which in turn win over the theme defaults.

| Key | Type | Effect |
|-----|------|--------|
| `gridlines.x` | *GridlineAxis* | Gridlines on the x axis |
| `gridlines.y` | *GridlineAxis* | Gridlines on the y axis |
| `banding` | `{ axis, colors? }` | Zebra-stripe bands on the named axis |
| `plotArea` | `{ background?, border? }` | Plot area fill and border color |
| `gridPadding` | `{ left?, right?, top?, bottom? }` | Plot-area inset overrides (partial deep-merge) |
| `density` | `"comfortable"` \| `"compact"` | Preset spacing; `"compact"` tightens insets for dense dashboards |

*GridlineAxis* properties: `show` (boolean), `style` (`"solid"` \| `"dashed"` \| `"dotted"`), `width` (number), `color` (CSS color string).

*Example — dashed y-axis gridlines, zebra x banding, compact plot area:*

```json
{ "type": "chart:bar",
  "spec": {
    "gridlines": { "y": { "show": true, "style": "dashed", "color": "#E0E0E0" } },
    "banding":   { "axis": "x" },
    "plotArea":  { "background": "#FAFAFA" },
    "gridPadding": { "left": 60 },
    "density": "compact",
    "xAxis": { "type": "category" },
    "yAxis": { "type": "value" },
    "series": [{ "type": "bar", "dataField": "revenue" }] } }
```

`density:"compact"` is for panels where space is scarce (e.g. a narrow column). For most charts, omit it (the `"comfortable"` default). A partial `gridPadding` (e.g. only `left`) deep-merges over the defaults — the other three insets and `containLabel` are unchanged.

### metric-strip

```json
{ "type": "metric-strip", "title": "KPIs",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue ... GROUP BY 1 ORDER BY 1" },
  "spec": { "metrics": [
    { "label": "Revenue", "valueField": "revenue", "agg": "sum",
      "format": { "type": "currency", "currency": "USD", "compact": true }, "color": "{chart.series.1}" }
  ] } }
```

`agg`: `sum | avg | last | first | min | max | count | delta`. The strip shows the
headline number, a ▲/▼ delta vs. the prior row, and a sparkline. Each metric accepts an optional **`description`** field — a plain-text explanation shown as a hover tooltip; falls back to `label` when not set. dvt Core (DVT-558).

**Count cap.** 3–5 metrics on a page, ≤4 on an overlay/drawer page — a 6th metric wraps into a
second row with broken/overlapping values on a full-width page, measured at a 1440px render
(DVT-3539); the wrap threshold has not been reduced to a width rule, so treat no page width as
"wide enough" for a 6th — and it clips in the narrower overlay drawer (see `openOverlay` below);
set `layout: 'row'`/`'grid'` (DVT-292) to escape the cap instead.

**Strip-wide display controls** (DVT-998), set on the `metric-strip` panel's own `spec` (siblings of `metrics[]`):

- `sparklines` (boolean, default `true`) — show the trend sparkline on each tile. `false` hides sparklines strip-wide.
- `delta` (boolean, default `true`) — show the ▲/▼ period-over-period chip on each tile. `false` hides the delta chip strip-wide.
- `valueFontSize` (number, `16`–`64`, default `30`) — headline value font size in pixels, applied strip-wide.
- `valueColor` (`ColorTokenValue` — literal hex/named color or a `{token}` ref, default `text.primary`) — headline value color, applied strip-wide. A tile's own `MetricItem.color` still wins over this for that tile (the existing per-tile-color-wins precedence).

```json
{ "type": "metric-strip", "title": "KPIs",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue ... GROUP BY 1 ORDER BY 1" },
  "spec": {
    "sparklines": false, "delta": true, "valueFontSize": 24, "valueColor": "{text.primary}",
    "metrics": [
      { "label": "Revenue", "valueField": "revenue", "agg": "sum",
        "format": { "type": "currency", "currency": "USD", "compact": true }, "color": "{chart.series.1}" }
    ] } }
```

### kpi  ← single-value scorecard

A `kpi` is one headline number with an explicit period-over-period comparison and an
optional inline sparkline — the grid-native scorecard (the metric-strip tile, scaled
up and given a real comparison binding):

```json
{ "type": "kpi", "title": "Revenue",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue, LAG(SUM(amount)) OVER (ORDER BY month) AS revenue_prev FROM analytics.public.orders GROUP BY 1 ORDER BY 1" },
  "spec": { "valueField": "revenue", "agg": "last",
    "format": { "type": "currency", "currency": "USD", "compact": true },
    "comparison": { "field": "revenue_prev", "mode": "percent", "improvement": "up" },
    "sparkline": { "field": "revenue" } } }
```

- **`valueField`** (required) + `agg` reduce the column to the headline (default `sum`).
- **`comparison`**: `{ field?, agg?, mode?, improvement? }`. With `field`, the comparison value is that column; omit `field` to compare the last two points of the value series. `mode`: `percent | delta | both` (default `percent`). `improvement`: `up` (default) or `down` — set `down` for metrics where lower is better (cost, churn) so the chip colors green/red semantically.
- **`sparkline`**: `{ field?, color? }` — needs ≥2 rows; `field` defaults to `valueField`. Omit for no trend line.
- `label`, `caption`, `color`, `align` (`left | center`) trim the chrome. A `kpi` carrying both
  `caption` and `sparkline` needs `h ≥ 5` — at `h:4` the caption clips (DVT-3540).
- **`description`** (optional) — a plain-text explanation of the metric shown as a hover tooltip; falls back to `caption` when not set. dvt Core, renderer-neutral (DVT-558).

### Rich tables — conditional formatting, heat maps, in-cell viz, pivot (DVT-507)

The `table` panel type ships a full vocabulary for presentation-quality tables.
All features are dvt Core (client-side over already-bound rows, ADR-0011). The
core table `spec` shape:

```jsonc
{
  "type": "table",
  "data": { "sourceId": "db", "query": "SELECT …" },
  "spec": {
    "columns": [ /* TableColumn[] — ordered column defs */ ],
    "defaultSort": { "field": "revenue", "direction": "desc" },
    "columnGroups": [ /* optional spanning headers */ ],
    "grouping":  { /* optional row-grouping tree */ },
    "conditionalFormat": [ /* table-wide CF rules */ ],
    "footnotes": [ /* footnotes beneath the table */ ],
    "sourceNote": "Source: analytics.public.orders",
    "pivot": { /* pivot/cross-tab mode */ }
  }
}
```

Each **`TableColumn`** is `{ field, label?, description?, format?, align?, sortable?,
filterable?, conditionalFormat?, colorScale?, cell?, textStyle?, width?, wrap?, maxLines? }`.

---

#### Column width, wrapping & "See more" (ADR-0044 §3c)

Three per-column layout fields, all authored the same way a person sets them in the
tray (no separate AI path):

- **`width`** — fixed column width in px (40–1200). Omit for auto-sizing. As soon as
  **any** column pins a width the table switches to a fixed layout, so set widths on
  the columns that need them and leave the rest to fill.
- **`wrap`** — `true` lets a text column wrap onto multiple lines. Default (omitted) is
  single-line: a long value widens the column, or, with a `width` set, clips to an
  ellipsis. **Guideline:** enable `wrap` for text columns whose values commonly exceed
  **~30 characters** (notes, descriptions, addresses, URLs) — don't leave long free-text
  single-line.
- **`maxLines`** — only meaningful with `wrap:true`. Clamps wrapped text to N lines
  (1–20) and shows an explicit **See more / Show less** toggle when the value overflows,
  expanding the full text in-cell. Use it for *really* long values so a few outliers
  don't blow up row height. Omit for wrap-with-no-limit.

```json
{ "field": "notes", "wrap": true, "maxLines": 3, "width": 260 }
```

---

#### Conditional formatting (DVT-509, ADR-0044 §3)

`TableSpec.conditionalFormat[]` sets **table-wide** rules (can target any column or
the whole row). `TableColumn.conditionalFormat[]` sets **column-level** rules applied
*after* table-wide ones (more specific wins per style key unless `stopIfMatched` is
used).

Each rule: `{ where: CellPredicate, apply: CellStyle, target?, stopIfMatched? }`.

**`target`** — what gets painted when the predicate matches:

- `"cell"` (default) — only the tested cell.
- `"row"` — the entire row.
- any field name string — that column's cell in the same row.

**Precedence** (lowest → highest): `colorScale` background tint → table-wide CF →
column-level CF. Within one array, rules layer **last-wins per style key** unless
`stopIfMatched: true` (then first-wins short-circuits later rules for that row/cell).

**`CellStyle`** properties: `fill`, `textColor`, `weight` (`normal|medium|bold`),
`italic`, `underline`, `strikethrough`, `align` (`left|center|right`). Color slots
accept a `ColorTokenValue` (hex / `rgb()` / named / `{token}`) or a `FieldColorRef`
`{ fromField: "<col>" }` — see field-value color below.

**`CellPredicate`** grammar:

| op | `value` shape | Notes |
|---|---|---|
| `eq` / `neq` | scalar | Equality / inequality |
| `gt` / `gte` / `lt` / `lte` | number | Numeric comparison |
| `between` | `[lo, hi]` | Inclusive range |
| `in` / `notIn` | array of scalars | Set membership |
| `contains` | string | Substring match |
| `isNull` / `isNotNull` | omit `value` | Null test |
| `topN` / `bottomN` | integer N | Tier-B (cap-sensitive — a badge appears when result was capped) |

`field` defaults to the column the rule is attached to; required for table-wide rules.
Use `all: [...]` (AND) / `any: [...]` (OR) to combine sub-predicates (nesting capped at 5).

```jsonc
// Column-level CF: bold green when revenue > 100000, red italic when < 10000
{
  "field": "revenue",
  "conditionalFormat": [
    {
      "where": { "op": "gt", "value": 100000 },
      "apply": { "fill": "#d1fae5", "textColor": "#065f46", "weight": "bold" }
    },
    {
      "where": { "op": "lt", "value": 10000 },
      "apply": { "fill": "#fee2e2", "textColor": "#991b1b", "italic": true }
    }
  ]
}

// Table-wide CF: highlight the whole row when status = "at-risk"
// (table-level conditionalFormat[], target:"row")
{
  "where": { "field": "status", "op": "eq", "value": "at-risk" },
  "apply": { "fill": "#fff7ed" },
  "target": "row"
}

// stopIfMatched — first matching rule wins; later rules don't layer
{
  "where": { "op": "topN", "value": 3 },
  "apply": { "fill": "#fef9c3", "weight": "bold" },
  "stopIfMatched": true
}
```

---

#### Heat-map color coding — `colorScale` (DVT-509, ADR-0044 §3)

`TableColumn.colorScale` paints a **background tint proportional to each cell's
numeric value** — the column stays readable (auto-contrast text) while giving an
instant visual heat map. Computed client-side over the column's bound rows (ADR-0011).

```jsonc
{
  "field": "conversion_rate",
  "colorScale": {
    "method": "numeric",       // "numeric" | "bin" | "quantile"
    "domain": [0, 1],          // [min, (mid,) max] or "auto" (default)
    "palette": "blues",        // named ramp or ColorTokenValue[] (≥2 stops)
    "bins": 5,                 // for method:"bin" — number of equal-width bins
    "nullColor": "#f3f4f6"     // background for null cells; omit = transparent
  }
}
```

`method`:

- `"numeric"` — linear interpolation between domain bounds (default).
- `"bin"` — equal-width bins; `bins` (default 5) controls the count.
- `"quantile"` — nearest-rank percentile bins. **Tier-B cap-sensitive**: a badge
  appears when the result set was truncated.

`domain`: `"auto"` (default) derives min/max from the column's finite values — also
Tier-B cap-sensitive. Explicit `[lo, hi]` or `[lo, mid, hi]` pins the scale.

`palette`: a **named ramp** from the color-schemes registry or an explicit array of
`ColorTokenValue` stops (at least 2). Named ramps:

| Name | Kind |
|---|---|
| `blues` | sequential (light→dark blue, default) |
| `viridis` | sequential (perceptually uniform) |
| `magma` | sequential (dark→light) |
| `rdbu` | diverging (red→neutral→blue) |
| `brbg` | diverging (brown→neutral→green) |
| `spectral` | diverging (red→yellow→blue) |
| `okabe-ito` | categorical (colorblind-safe) |
| `set2` | categorical (soft, print-safe) |

---

#### Field-value color — `FieldColorRef` (DVT-510, ADR-0044 §4)

`CellStyle.fill` and `CellStyle.textColor` accept a `{ "fromField": "<col>" }` object
instead of a literal color — the renderer reads the color from the named column of
the same bound row. The warehouse-controlled value is sanitized by `sanitizeBackground`
at render time (the same gate as an authored `ColorTokenValue`): an unsafe value
(e.g., a URL function) is dropped and the cell renders without that color slot.

```jsonc
// Cells in the "status" column adopt the background color from the "status_color" column
{
  "field": "status",
  "conditionalFormat": [
    {
      "where": { "op": "isNotNull" },
      "apply": {
        "fill": { "fromField": "status_color" },
        "textColor": "#ffffff"
      }
    }
  ]
}
```

---

#### In-cell visualizations — `TableColumn.cell` (DVT-511/512, ADR-0044 §4)

`TableColumn.cell` replaces the plain text value with an inline SVG visualization.
Dispatch on `kind`. Don't combine `cell` with `colorScale` on the same column —
`cell` replaces the value, so the heat-map tint is moot (this is an authoring
guideline, not a schema constraint; `colorScale` tints the background and keeps
the value visible, which only makes sense when the value is still shown).

**`ValueSeriesSource`** — used by `sparkline` and `winloss` to resolve a per-row
numeric series. Exactly one of:

- `{ "valuesField": "<col>" }` — column holding a comma-delimited string or JSON array of numbers.
- `{ "valuesFromColumns": ["q1", "q2", "q3", "q4"] }` — ordered sibling column names whose values form the series.

**`kind: "sparkline"`** — mini inline trend line/area/bar chart:

```jsonc
{
  "field": "quarterly_trend",
  "cell": {
    "kind": "sparkline",
    "type": "line",          // "line" (default) | "area" | "bar"
    "source": { "valuesFromColumns": ["q1", "q2", "q3", "q4"] },
    "color": "#2563eb",      // ColorTokenValue
    "min": 0                 // optional fixed domain
  }
}
```

**`kind: "bar"`** — horizontal data bar sized to the cell value:

```jsonc
{
  "field": "revenue",
  "cell": {
    "kind": "bar",
    "domain": "auto",          // [min, max] or "auto"
    "color": "#3b82f6",
    "negativeColor": "#ef4444",
    "baseline": 0,             // bar diverges here for negatives
    "hideNumber": false        // true = suppress the inline text value
  }
}
```

**`kind: "bullet"`** — value bar + target reference line + optional qualitative bands:

```jsonc
{
  "field": "attainment",
  "cell": {
    "kind": "bullet",
    "valueField": "attainment",    // defaults to this column's own value
    "targetField": "quota",        // per-row target column; overrides static "target"
    "domain": [0, 150],
    "qualBands": [50, 100]         // thresholds → poor / ok / good bands
  }
}
```

**`kind: "winloss"`** — win/loss tile strip (positive = win, negative = loss, zero = tie):

```jsonc
{
  "field": "game_results",
  "cell": {
    "kind": "winloss",
    "source": { "valuesField": "results_array" },
    "winColor": "#22c55e",
    "lossColor": "#ef4444",
    "tieColor": "#94a3b8"
  }
}
```

**`kind: "dot"`** — positioned dot marker on a domain scale:

```jsonc
{ "field": "score", "cell": { "kind": "dot", "domain": [0, 100], "color": "#6366f1" } }
```

**`kind: "icon"`** — allow-listed bundled SVG icon. `name` or `nameField` selects
the icon; an unrecognized name renders nothing (never injected into markup):

```jsonc
{
  "field": "trend",
  "cell": {
    "kind": "icon",
    "nameField": "trend_icon",   // column value selects icon at render time
    "colorField": "trend_color"  // column value tints the icon (sanitized)
    // or: "name": "arrow-up" + "color": "#22c55e" for a static icon
  }
}
```

Allow-listed icon names: `check` · `x` · `arrow-up` · `arrow-down` · `arrow-right` ·
`arrow-left` · `circle` · `circle-check` · `circle-x` · `star` · `star-half` ·
`warning` · `info` · `ban` · `bolt` · `clock` · `fire` · `heart` · `thumb-up` ·
`thumb-down` · `trending-up` · `trending-down` · flag codes (`flag-us` `flag-gb`
`flag-de` `flag-fr` `flag-jp` `flag-cn` `flag-ca` `flag-au` `flag-in` `flag-br`).

**`kind: "image"`** — logo/avatar/thumbnail. `src`/`srcField` must pass the media
safety gate (same-origin relative, https on approved dvt asset hosts, raster `data:`
URIs; SVG and unapproved hosts are blocked — renders a placeholder):

```jsonc
{
  "field": "logo_url",
  "cell": {
    "kind": "image",
    "srcField": "logo_url",   // or static "src"
    "shape": "circle",        // "rect" (default) | "circle"
    "height": 32,             // px (8–200), width scales proportionally
    "altField": "company_name"
  }
}
```

**`kind: "markdown"`** — renders the cell's string value as **sanitized markdown**
(marked + DOMPurify; https/mailto links only; no `<img>`, no raw HTML). `mode` picks
the grammar:

- **`"inline"`** (default) — bold / italic / links / code only, stays on one logical
  line. Backward-compatible with existing markdown cells.
- **`"block"`** — full markdown: lists, headings, paragraphs, blockquote. Use for rich
  multi-line cells; pair with `wrap: true` (and usually a `maxLines` "See more") so the
  block content has room without stretching every row.

```jsonc
{ "field": "notes", "cell": { "kind": "markdown", "mode": "block" }, "wrap": true, "maxLines": 4 }
```

---

#### Text styling + number format additions (DVT-513, ADR-0044 §3b)

**`TableColumn.textStyle`** sets a base style for data cells in a column — applied
under `colorScale` and `conditionalFormat` (those override it per key):

```jsonc
{
  "field": "region",
  "textStyle": {
    "weight": "bold",          // "normal" | "medium" | "bold"
    "align": "left",           // "left" | "center" | "right"
    "size": 13,                // font size px (8–48)
    "font": "JetBrains Mono, monospace",  // closed FontFamily enum (ADR-0032 §A3)
    "color": "#374151",        // ColorTokenValue
    "transform": "uppercase",  // "none" | "uppercase" | "lowercase" | "capitalize"
    "decoration": "underline"  // "none" | "underline" | "line-through"
  }
}
```

`font` is the same **closed allow-set** as `typography.fontFamily` — free-text CSS
font stacks are rejected (ADR-0032 §A3). Valid values: `"Inter Variable, Inter, sans-serif"` ·
`"Inter, sans-serif"` · `"JetBrains Mono, monospace"` · `"JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"` ·
`"ui-sans-serif, system-ui, sans-serif"` · `"ui-serif, Georgia, serif"` · `"ui-monospace, monospace"`.

**`FormatObject` additions** (also available on chart panels):

- **`negativeParens: true`** — accounting-style `(1,234)` instead of `-1,234`.
- **`scaleBy: 1000`** — divide the raw value before formatting (e.g. `scaleBy:1000` +
  `suffix:" K"` displays thousands; distinct from `compact` notation).

---

#### Column spanners + grouping totals (DVT-514, ADR-0044 §8)

**`TableSpec.columnGroups[]`** adds spanning header rows above the normal column
headers — like `gt::tab_spanner`. Groups may be nested to produce multiple spanner
rows. Pure header layout — no data transform.

```jsonc
{
  "columnGroups": [
    {
      "label": "This Quarter",
      "columns": ["q_revenue", "q_deals", "q_win_rate"]   // leaf column fields
    },
    {
      "label": "Totals",
      "columnGroups": [                                    // nested sub-groups
        { "label": "YTD", "columns": ["ytd_revenue"] },
        { "label": "Annual Target", "columns": ["target"] }
      ]
    }
  ]
}
```

`columns` (leaf fields) and `columnGroups` (nested) are mutually exclusive. Columns
not covered by any group show a blank cell in the spanner row.

**`TableGrouping`** labels on totals rows:

```jsonc
{
  "grouping": {
    "groupBy": ["region", "segment"],
    "aggregations": [{ "field": "revenue", "agg": "sum" }],
    "subtotals": true,
    "grandTotal": true,
    "totalLabel": "Grand Total",
    "subtotalLabelTemplate": "{value} subtotal"  // {value} = group value
  }
}
```

`totalLabel` sets the label in the leading cell of the grand-total row (default
`"Total"`). `subtotalLabelTemplate` uses `{value}` to interpolate the group value —
e.g., `"{value} subtotal"` renders as `"West subtotal"`.

---

#### Footnotes and source note (DVT-517, ADR-0044 §9)

`TableSpec.footnotes[]` renders footnote marks as superscripts on column headers and
collects the annotated text in a block beneath the table.

```jsonc
{
  "footnotes": [
    {
      "mark": "*",                  // explicit mark; omit for auto (¹ ² ³ …)
      "where": { "column": "revenue" },  // column header to anchor; omit = no anchor
      "text": "Revenue excludes returns and chargebacks."
    },
    {
      "text": "Win rate computed on closed opportunities only."
      // no "where" → appears in notes block without a header superscript
    }
  ],
  "sourceNote": "Source: [analytics.public.orders](https://example.com/docs)"
}
```

Both `text` and `sourceNote` are **sanitized markdown** (https/mailto links only;
no raw HTML). `sourceNote` is rendered after any `footnotes[]`.

Charts support the same `footnotes[]` + `sourceNote` on `ChartSpec` (DVT-569) — see "Chart footnotes and source note" and "Document as you build" below.

---

#### Pivot / cross-tab mode (DVT-515, ADR-0044 §8)

`TableSpec.pivot` restructures bound rows client-side into a cross-tab — no new
panel type. The result is a `table` whose generated value-columns inherit the full
`cell` / `conditionalFormat` / `colorScale` / `format` vocabulary (a colorScale heat
map on a pivot is a common killer combo). Mutually exclusive with `grouping` (pivot
wins; do not combine). At view time every pivot panel shows a `Fields` tray: viewers
can add/remove rows/columns/values, reorder rows, and change aggs as **ephemeral view state**
(parallel to viewer sort/filter — never persisted, no new revision; `Reset` restores
the authored pivot), so treat the authored `pivot` as the sensible default cut, not
the only view (DVT-897).

```jsonc
{
  "pivot": {
    "rows": ["region"],              // row-dimension fields (the left stub)
    "columns": ["quarter"],          // column-dimension fields (low-cardinality)
    "values": [
      {
        "field": "revenue",
        "agg": "sum",                // "sum" (default) | "avg" | "min" | "max" | "count"
        "weightField": "deals",      // with agg:"avg" → weighted mean Σ(v·w)/Σw
        "label": "Revenue",
        "format": { "type": "currency", "currency": "USD", "compact": true },
        "colorScale": { "method": "numeric", "domain": "auto", "palette": "blues" }
      }
    ],
    "totals": {
      "row": true,    // trailing total COLUMN at the right (aggregate across quarters)
      "column": true, // trailing grand-total ROW at the bottom
      "grand": true   // grand-total intersection cell (bottom-right)
    },
    "maxColumns": 50  // cap on generated value-columns (default 50); exceeded → "showing K of J columns" disclosure
  }
}
```

**Avg-of-avgs guard (ADR-0044 §8):** omitting `agg` defaults to `sum`, never an
implicit average. Use `agg: "avg"` explicitly; add `weightField` for a proper
weighted mean.

**Cardinality cap:** when the distinct column-dimension tuples × values exceeds
`maxColumns` (max 200), the renderer truncates to the first N (in column-tuple order)
and shows a visible "showing K of J columns (capped)" disclosure — the Tier-B
honesty contract.

---

#### Composition example — rich table with multiple features

```jsonc
{
  "type": "table",
  "title": "Sales by Rep",
  "data": { "sourceId": "db", "query": "SELECT rep, region, revenue, quota, monthly_trend, status_color FROM analytics.public.rep_performance ORDER BY revenue DESC" },
  "spec": {
    "columnGroups": [
      { "label": "Identity",  "columns": ["rep", "region"] },
      { "label": "Performance", "columns": ["revenue", "quota", "monthly_trend"] }
    ],
    "columns": [
      { "field": "rep", "label": "Sales Rep" },
      { "field": "region" },
      {
        "field": "revenue",
        "format": { "type": "currency", "currency": "USD", "compact": true },
        // colorScale: heat-map tint; keeps value visible
        "colorScale": { "method": "numeric", "domain": "auto", "palette": "blues" },
        // CF rule on top: bold the top 3
        "conditionalFormat": [
          {
            "where": { "op": "topN", "value": 3 },
            "apply": { "weight": "bold" },
            "stopIfMatched": true
          }
        ]
      },
      {
        "field": "quota",
        "format": { "type": "currency", "currency": "USD", "compact": true },
        // bullet chart: attainment bar vs quota target
        "cell": {
          "kind": "bullet",
          "targetField": "quota",
          "domain": "auto",
          "qualBands": [50, 100]
        }
      },
      {
        "field": "monthly_trend",
        "label": "Trend (12mo)",
        // sparkline: area chart from a JSON-array column
        "cell": {
          "kind": "sparkline",
          "type": "area",
          "source": { "valuesField": "monthly_trend" },
          "color": "{chart.series.1}"
        }
      }
    ],
    // table-wide CF: highlight entire row when rep is over quota
    "conditionalFormat": [
      {
        "where": { "field": "revenue", "op": "gte", "value": 100 },
        "apply": { "fill": { "fromField": "status_color" } },
        "target": "row"
      }
    ],
    "footnotes": [
      { "where": { "column": "revenue" }, "text": "Revenue is recognized at close date." }
    ],
    "sourceNote": "Source: analytics.public.rep_performance"
  }
}
```

#### Pivot example — revenue by region × quarter with heat map

```jsonc
{
  "type": "table",
  "title": "Revenue by Region × Quarter",
  "data": { "sourceId": "db", "query": "SELECT region, quarter, SUM(revenue) AS revenue FROM analytics.public.orders GROUP BY 1, 2" },
  "spec": {
    "pivot": {
      "rows": ["region"],
      "columns": ["quarter"],
      "values": [
        {
          "field": "revenue",
          "agg": "sum",
          "format": { "type": "currency", "currency": "USD", "compact": true },
          "colorScale": { "method": "numeric", "domain": "auto", "palette": "blues" }
        }
      ],
      "totals": { "row": true, "column": true }
    }
  }
}
```

### text panels + narrative variables  ← dvt's differentiator

Text panels render markdown and **interpolate live values** from the panel's own
`data.query` using `{{ field | agg | format }}`:

```json
{ "type": "text", "title": "",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue FROM analytics.public.orders GROUP BY 1 ORDER BY 1" },
  "spec": { "variant": "callout",
    "markdown": "Revenue reached **{{ revenue | sum | currency }}**, {{ revenue | delta | percent }} vs. last month." } }
```

- **agg ops:** `sum, avg, last, first, min, max, count, delta` (delta = % change of last two rows; defaults to percent format).
- **format ops:** `currency, percent, number, compact, date`.
- Omit the agg → `last`. Omit the format → plain number. Unknown/empty → `—`.
- **Text columns:** `first`/`last` (and the default agg) over a text column return the raw string — `{{ artist | last }}` or `{{ department }}` resolves to the value, not `—`. A numeric format op (`currency`/`percent`/`number`/`compact`) forces the numeric path; a non-numeric value then renders `—`. `—` now means only: missing column, empty result, or a numeric format applied to non-numeric text.
- **Round in SQL.** Round EVERY numeric a `{{ }}` template interpolates *in the SQL itself* —
  interpolation renders the raw value verbatim, so an un-rounded column ships a `10.49382%`.

Use text panels to give every dashboard a thesis and takeaways — **explain the data, don't just plot it.**

### Takeaway titles & subtitles — `{{ }}` in panel headers (A1/DVT-468)

A panel's own `title` and `subtitle` interpolate the **same** `{{ field | agg | format }}`
variables, resolved against that panel's query rows. Use this to write **takeaway titles** that
state the insight with a live number instead of naming a column — the single highest-leverage
narrative change.

```json
{ "type": "chart:line", "title": "Revenue grew {{ revenue | delta | percent }} to {{ revenue | last | currency | compact }}",
  "subtitle": "Enterprise now {{ ent_share | last | percent }} of the book",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue, … GROUP BY 1 ORDER BY 1" },
  "spec": { "series": [{ "dataField": "revenue" }] } }
```

| Column-name title (weak) | Takeaway title (strong) |
| --- | --- |
| `"Revenue Over Time"` | `"Revenue grew {{ revenue \| delta \| percent }} to {{ revenue \| last \| currency \| compact }}"` |
| `"NRR by Quarter"` | `"NRR improved to {{ nrr \| last \| percent }} — best in 6 quarters"` |

- `title: ""` renders **no header** (common for `text`/`html` panels that paint their own headline).
- `subtitle` shows as a muted second line under the title; omit it to show none.
- Round in SQL here too — titles are the highest-visibility leak site for an un-rounded `{{ }}` value.
- Same agg/format ops as text panels (`sum avg last first min max count delta` · `currency percent number compact date`); unknown/empty → `—`. Text columns: `first`/`last` (and the default) return the raw string; a numeric format op forces the numeric path (non-numeric → `—`).

### section panels — grid heading bands (A2/DVT-469)

A `section` panel is a **labelled heading band** that groups the panels beneath it — the panel
`title` is the heading, with an optional one-line `subtitle` and a hairline `rule`. It takes **no
query**, spans full width (`w:24` by convention), and is dvt Core. Use it to break a long grid
page into legible chapters (Gestalt grouping) — e.g. a guided top band, then a "By segment"
section below.

```json
{ "type": "section", "title": "By segment",
  "spec": { "subtitle": "Where the growth came from", "rule": true, "align": "left" } }
```

- `rule` defaults `true` (a hairline below the heading); set `false` for a bare label.
- `align` ∈ `left` (default) `center` `right`. `section.*` component tokens theme it.
- **Not the same as canvas `layout.sections[]`** (ADR-0027, the scroll spine) — that is a layout
  construct; this is a grid panel type. They are distinct and non-overlapping.

### html panels  ← the escape hatch

When charts and text aren't enough — hero banners, gradient backdrops, big-number
tiles, badges, bespoke multi-column layouts — use an `html` panel. It renders raw
HTML/CSS, **sanitized** (DOMPurify: inline styles, gradients, `<svg>`, `<style>`,
classes are allowed; `<script>` and `on*` handlers are stripped). It also supports
the same `{{ field | agg | format }}` variables, so a hand-built hero can show live
numbers.

```json
{ "type": "html", "title": "",
  "data": { "sourceId": "db", "query": "SELECT SUM(amount) AS revenue FROM analytics.public.orders",
            "rows": [ { "revenue": 2803054.22 } ] },
  "spec": { "html": "<div style=\"height:100%;display:flex;align-items:center;justify-content:space-between;padding:24px 30px;border-radius:16px;background:linear-gradient(120deg,#EEF0FF,#E9F7F5);\"><div style=\"font-size:26px;font-weight:800;color:var(--ink);\">Revenue Overview</div><div style=\"font-size:42px;font-weight:800;color:var(--accent);\">{{ revenue | sum | currency }}</div></div>" } }
```

The theme is exposed to your CSS as variables: `var(--accent)`, `var(--accent-2)`,
`var(--ink)`, `var(--muted)` — use them so escape-hatch markup stays on-palette.
text/html panels are **bare** (transparent) by default so they paint their own
surface; set `overrides["panel.background"]` if you want a card behind them.

**Hero-band pattern.** A full-width `html` band — a background image with a left-to-right scrim
(opaque over the text side, fading toward the image side) and an accent border stripe, with all
`{{ }}` content live on top — is the cheapest way to open a page with visual weight instead of a
plain title bar. Host the image via `dvt_media_upload` — it returns a dvt-hosted `assets.dvt.dev`
URL — and reference that in the band's inline `background-image`/`background` CSS: the app's CSP
`img-src` allows only `'self'`/`data:`/`blob:`/`assets.dvt.dev`/`dvt.dev` (DVT-164), so an arbitrary
remote image host is blocked, not just discouraged. This holds for cloud (app.dvt.dev) only —
self-host and the Snowflake Native App serve the SPA with a same-origin-only CSP
(`img-src 'self' data: blob:`, no `assets.dvt.dev` — server/internal/webui/embed.go:52-64), so a
`dvt_media_upload` URL never resolves there, and uploads are additionally disabled outright on the
Snowflake edition (`MediaUploads=false`, server/internal/config/capabilities.go:367, gated at
server/internal/api/media.go:123-129). Embed the image as a `data:` URI or use a gradient scrim
band instead on either.

### canvas blocks — `stat` · `hero` · `media` · `divider`

Composition blocks for richer layouts (designed for `layout.mode: "canvas"`
sections, but valid in a grid too). All dvt Core (renderer-neutral) except `media`
(an ADR-0014 escape hatch). All are **bare** by default.

**`stat`** — a big-number tile (the hero-scale sibling of a metric-strip tile, same
count-up + delta primitive). Use it for a single headline figure that needs to read
large. The DVT-133 `kpi` is the grid scorecard with an explicit comparison binding;
reach for `stat` when you just want the number big.

```json
{ "type": "stat", "title": "",
  "data": { "sourceId": "db", "query": "SELECT month, SUM(amount) AS revenue FROM analytics.public.orders GROUP BY 1 ORDER BY 1" },
  "spec": { "label": "Revenue", "valueField": "revenue", "agg": "sum",
    "format": { "type": "currency", "currency": "USD", "compact": true },
    "delta": true, "sparkline": true, "align": "center" } }
```

`valueField` (required) + `agg` (default `sum`); `delta`/`sparkline` are booleans
(need ≥2 rows); `label`, `caption`, `color`, `align` (`left | center`). Optional **`description`** — a plain-text explanation of the metric shown as a hover tooltip; falls back to `caption` when not set. dvt Core (DVT-558).

**`hero`** — a headline block (eyebrow + headline + subhead) to open a canvas section.
The three text fields interpolate `{{ field | agg | format }}` variables.

```json
{ "type": "hero", "title": "",
  "data": { "sourceId": "db", "query": "SELECT SUM(amount) AS revenue FROM analytics.public.orders" },
  "spec": { "eyebrow": "FY25", "headline": "{{ revenue | sum | currency }} in revenue",
    "subhead": "Up and to the right.", "align": "center", "size": "xl" } }
```

`headline` (required); `eyebrow`, `subhead`; `align` (`left | center | right`);
`size` (`sm | md | lg | xl`, default `lg`).

**`media`** — an image block (escape hatch). `src` is **sanitized** (media-safety):
a same-origin relative path, a dvt-hosted `https` asset, or a raster `data:` URI —
anything else is rejected.

```json
{ "type": "media", "title": "",
  "spec": { "src": "/assets/logo.png", "alt": "Company logo", "fit": "contain", "rounded": 12 } }
```

`src` (required); `alt`; `fit` (`cover | contain | fill`, default `cover`);
`rounded` (`true` → 12px, a number → px, `false` → square); `caption`.

**`divider`** — a visible rule line (a pure spacer needs no block — just leave empty
geometry). `orientation` (`horizontal | vertical`, default horizontal); `thickness`
(px, default 1); `style` (`solid | dashed | dotted`); `color`; `inset` (px, shortens
the rule from both ends).

### Filters & drill-downs — interactive parameter binding (ADR-0028)

Both make a dashboard interactive by binding a value into target panels **by name**:
the value overwrites a matching `data.params` entry — it is **never** interpolated
into the SQL string and never a column/identifier. So the contract is the same for
both, and a target panel must declare **two** things:

1. a **named placeholder** `%(param)s` in its `data.query`, and
2. a matching **`data.params`** default for that key (the slot the value overwrites).

A binding whose param no target panel declares is wired to nothing — it renders fine
but does nothing at runtime, and `dvt_spec_validate` warns about it. A
`multiselect` control binds an **array** of selected values into an `IN`-list:
write a **self-contained parenthesized** placeholder `WHERE (region IN %(region)s)`
and the engine expands it to one parameter-bound placeholder per selection — values
are never spliced into SQL. **Clearing a multi-select to 0 selected binds an unset
param.** What that does depends on `unsetMode` (below): under the default
`"omit"` the key is dropped and each target panel falls back to its authored
`data.params` default; under `"null"` the key binds SQL NULL and the engine
rewrites the whole parenthesized `IN`/`NOT IN` predicate to the tautology `(1=1)` —
**true "show everything,"** including rows where the dimension itself is NULL
(DVT-1209, ADR-0028 Amendment 1). Use `unsetMode:"null"` when you want a cleared
multi-select to mean "show everything." Do **not** hand-write a legacy
`(%(k)s IS NULL OR col IN %(k)s)` guard for this — the lint flags it as an
anti-pattern; the parenthesized bare form above is both the unset-safe and the
lint-clean form. Note a **populated** `NOT IN` list still excludes NULL-dimension
rows per SQL's normal three-valued logic — only the fully-unset case is rewritten
to show everything.

The multi-select control's UX affordances are **automatic — no spec field**: a
tri-state **Select all / Clear all** bulk row, an in-list **search** box (appears once
the option list exceeds 8), an **"N selected"** footer summary, and **batched Apply**
(the re-query fires once on Apply, not per checkbox). For a `not-in` (exclude)
multi-select, author the same parenthesized bare form `WHERE (col NOT IN %(k)s)` with
`unsetMode:"null"` so an empty exclusion means "show all" rather than matching no rows.

**Filter selections round-trip in the URL.** When a viewer adjusts a filter, the
selection is mirrored to the page URL (under an `f.<param>` query param), so a reload
or a **shared/bookmarked link restores the exact filter bar** (multi-select arrays,
scalars, ranges, and dates alike). Dates encode the relative **intent** ("last 7
days"), not the resolved dates, so a shared "last 7 days" re-resolves against the
recipient's current day. No authoring action is required; an unset filter simply
drops its URL param. (View-time URL sync is on for the live viewer and the immersive
present view; the Builder authoring canvas and headless renders don't touch the URL.)

**`filter`** — a dashboard-level control (its own panel). The selectable options come
from the panel's own `data` (a `SELECT DISTINCT` value query, or baked `data.rows`),
or from a static `values` list. Selecting a value re-queries the target panels.

```json
{ "id": "region-filter", "type": "filter", "title": "Region",
  "data": { "sourceId": "db", "query": "SELECT DISTINCT region FROM demo.public.orders ORDER BY 1" },
  "spec": { "param": "region", "valueField": "region", "control": "select",
            "valueType": "string", "targets": "all", "default": "NA" } }
```

```json
{ "id": "rev-by-month", "type": "chart:bar", "title": "Revenue by Month",
  "data": { "sourceId": "db",
            "query": "SELECT month, SUM(amount) AS rev FROM demo.public.orders WHERE region = %(region)s GROUP BY 1 ORDER BY 1",
            "params": { "region": "NA" } },
  "spec": { "series": [{ "type": "bar", "dataField": "rev" }] } }
```

`param` (required) — the params key this filter sets. `valueField` (required) — the
value-source column holding each option's bound value; `labelField` defaults to it.
`label` — the display label shown in the pill/popover header. Use this instead of
`placeholder` for labelling the control; `placeholder` is now input-hint text only
(shown inside a blank text/search input). Precedence: `label` → `placeholder` → `param`
→ `'Filter'`. `help` — per-control help text; the renderer surfaces an accessible `?`
tooltip on hover + keyboard focus (`aria-describedby`).

`control`: `select` (default) | `multiselect` (binds an array → `IN`-list; target query
uses the parenthesized bare form `(col IN %(param)s)`) | `date-range` | `number-range` | `search` | `toggle`
(tri-state boolean switch; pair with `valueType:"boolean"`, binds a scalar boolean via
the `equals` path; unset = no predicate when `unsetMode:"omit"`) | `number` (single
`<input type=number>` binding one scalar to `param`; use with `operator: gt|gte|lt|lte|
equals` for one-sided numeric comparisons — unlike `number-range` it binds a single
`param`, not `loParam`/`hiParam`) | `segmented` / `button-group` (inline single-select —
a horizontal row of option buttons, same value binding as `select`, ideal for ≤6 options)
| `radio` (inline single-select as a vertical radio list, same binding as `select`) |
`checkbox-list` (inline multiselect as a vertical checkbox list, same array binding as
`multiselect`; engine expands to IN-list, DVT-170). All four inline controls commit
instantly (no Apply step) and share the same option source as their popover counterparts.

`top-n` (Track F) — ranks the value-source query rows by the numeric column `measureField`,
keeps the top (or bottom) `n` rows per `order` (`"desc"` = Top-N, `"asc"` = Bottom-N;
default `n: 10`, `order: "desc"`), and binds the resulting category set as a parameter-bound
IN-list — **same binding contract as `multiselect`** (never string-interpolated, always
`IN %(param)s`, DVT-170). Client-side only: no engine rewrite; the viewer adjusts N with a
compact stepper. Fields: `measureField` (required), `n` (default 10),
`order` (`"desc"` | `"asc"`, default `"desc"`) (`param` + `valueField` are required as for any select/multiselect — the ranked set binds to `param`).

**Server-side typeahead search (`searchMode` / `searchParam`, DVT-540 / ADR-0028 §A4.1).** Applies to `select` and `multiselect` only; ignored for all other control kinds.

- `searchMode`: `'client'` (default / omit) | `'server'`. Client mode filters the already-fetched option list in the browser — zero extra queries, works for up to thousands of options. Server mode fires a debounced re-query of the filter's own value-source on each keystroke, binding the viewer's typed text as a LIKE-escaped named parameter; use for high-cardinality dimensions (millions of distinct values) where loading the full option set upfront is infeasible.
- `searchParam`: the `data.params` key the typed search term binds to. Required when `searchMode:'server'`; ignored otherwise.

**Value-source predicate contract (server mode — get this wrong and search silently no-ops).** The value-source query MUST contain a `%(searchParam)s` LIKE placeholder in its `WHERE` clause, AND `data.params` MUST declare the matching `searchParam` key (with an initial value). The runtime LIKE-escapes `!`, `%`, and `_` in the viewer's input with `!` and wraps the term as `%term%` before binding — values are never interpolated (ADR-0011 / ADR-0028 §A4.1). Always include the `ESCAPE '!'` clause:

```json
{ "id": "customer-filter", "type": "filter", "title": "Customer",
  "data": { "sourceId": "db",
            "query": "select distinct customer_name from demo.public.customers where 1=1 and customer_name like %(q)s escape '!' order by 1",
            "params": { "q": "%%" } },
  "spec": { "param": "customer", "valueField": "customer_name", "control": "select",
            "searchMode": "server", "searchParam": "q",
            "unsetMode": "null", "targets": "all" } }
```

The `data.params` default for `searchParam` (`"q": "%%"` in the example) is the initial load value — bound as the literal two-character string `%%`, which under `LIKE … ESCAPE '!'` is two wildcards (neither `!`-escaped), so the unfiltered first open matches every row. Omitting `searchParam` from the query or `data.params`, or omitting the `ESCAPE '!'` clause, makes the server return the full unfiltered list or nothing, silently. In particular, an initial value of `""` matches only the empty string, so the control opens with zero options and looks broken — use a match-all default like `%%`.

**The `%%` rule.** In ANY param-bound query, a literal `%` in the SQL text must be written `%%` —
the pyformat binding parses a bare `%` as the start of a `%(name)s` placeholder — and prefer
`mod()` over the `%` operator to sidestep the escaping entirely. This `%%`→`%` collapse applies
only to query *text*, never to a bound parameter *value*: don't double-percent a real term;
`"50%%"` as a *value* would bind `50` followed by anything, not a literal `50%`.

`valueType`: `string` (default) | `number` | `date` | `boolean`. `targets`: `"all"`
(default — every panel on the page that declares the key) or an explicit `["panelId", …]`;
a panel that doesn't declare the key is never re-fetched. `values` — a static
`[value | { value, label }]` list (the fallback when there's no value query/rows).
`default` — the initial selection.

**UX and presentation fields.** `apply`: `"live"` | `"button"` — override the default
commit timing. Default: instant controls (`select`, `search`, `toggle`, `number`) commit
on each change; batched controls (`multiselect`, `number-range`, `date-range`) hold in a
draft until the viewer presses Apply. `"button"` forces an explicit Apply step even for
normally-instant controls; `"live"` forces immediate commits even for batched controls.
`required`: `true` — suppresses the clear/All affordance and holds target queries until
a value is chosen (prevents a "fetch everything" on expensive panels while unset). Default
`false`. `chrome`: `"card"` (default) | `"none"` — `"none"` renders the bare control only
(no background, border, shadow, radius, or minHeight floor); use it to embed a filter
inside a `filter-bar` without doubled card-in-card chrome. `width`: `"compact"` |
`"full"` (default) — `"compact"` shrinks the control to fit-content width inside its
grid cell. `density`: `"comfortable"` (default, 36 px min-height) | `"compact"` (28 px
min-height, tighter padding) — useful when multiple filters share a filter-bar.
`icon`: closed enum — `calendar` | `search` | `filter` | `region` | `tag` | `clock` |
`user` | `dollar`. A curated leading glyph inside the filter pill; values outside this
list fail validation (422, ADR-0032 §A3). Omit for no icon.

**The unfiltered / "everything" state (`allLabel` + `unsetMode`, ADR-0028
Amendment 1).** Don't hand-roll an `'ALL'` option row plus a
`(%(k)s = 'ALL' OR col = %(k)s)` SQL hack — the control renders the "All" affordance
for you. Two fields:

- `allLabel` — the display text for the unset state (e.g. `"All regions"`, `"Any
  date"`). Falls back to `placeholder`, then `"All"`. The single-select **All row**
  and the multi-select **0-selected** state are control affordances, not data rows.
- `unsetMode` — how an unset filter binds:
  - `"omit"` (default) — the key is **not set**, so each target panel keeps its
    **authored `params` default**. Author writes plain `WHERE col = %(k)s`. Use when
    there's a natural default value.
  - `"null"` — the key binds **SQL NULL**. Author writes the guarded predicate
    `WHERE (col = %(k)s OR %(k)s IS NULL)`. Use for "show everything by default", for
    `IN`-list multi-selects (`WHERE (col IN %(k)s)` — the engine rewrites this
    self-contained parenthesized predicate to `(1=1)` when unset, DVT-1209), and it is
    **required** for open-ended range sides.

```json
{ "id": "region-filter", "type": "filter", "title": "Region",
  "data": { "sourceId": "db", "query": "SELECT DISTINCT region FROM demo.public.orders ORDER BY 1" },
  "spec": { "param": "region", "valueField": "region", "control": "select",
            "allLabel": "All regions", "unsetMode": "null", "targets": "all" } }
```

…with the target panel guarding the param so unset = everything:
`WHERE (region = %(region)s OR %(region)s IS NULL)`. Unset is **omit or typed NULL
only** — never a sentinel string or client-built SQL.

**The comparison operator (`operator`, ADR-0028 Amendment 1).** `operator` is
**author-fixed** spec state — it tells the renderer how to *shape the bound value*
(e.g. wrap a `contains` term in `%…%`), it is **not** a control a viewer toggles, and
it **never** changes the SQL. You write the matching, fixed predicate yourself; the
value still enters SQL only as a bound `%(k)s` parameter (never interpolated). Default
`equals`.

| `operator` | you write this predicate | the value the viewer types is bound as |
|---|---|---|
| `equals` (default) | `WHERE col = %(k)s` | the value as-is |
| `not-equals` | `WHERE col <> %(k)s` | the value as-is |
| `contains` | `WHERE col LIKE %(k)s ESCAPE '!'` | `%value%` (LIKE metachars `! % _` escaped) |
| `starts-with` | `WHERE col LIKE %(k)s ESCAPE '!'` | `value%` |
| `ends-with` | `WHERE col LIKE %(k)s ESCAPE '!'` | `%value` |
| `not-in` | `WHERE (col NOT IN %(k)s)` | an array → parameter-bound `NOT IN`-list |
| `in` / `between` | (multiselect / range — see those controls) | array / two bounds |
| `gt` | `WHERE col > %(k)s` | a plain scalar (NOT LIKE-wrapped) |
| `gte` | `WHERE col >= %(k)s` | a plain scalar |
| `lt` | `WHERE col < %(k)s` | a plain scalar |
| `lte` | `WHERE col <= %(k)s` | a plain scalar |

**Required for the LIKE operators** (`contains` / `starts-with` / `ends-with`): your
query **must** carry the `ESCAPE '!'` clause. The renderer escapes `!`, `%`, and `_`
in the viewer's value with `!` so a typed `%` or `_` matches **literally** (not as a
wildcard). The `!` escape character is fixed on both sides — write it verbatim. The
text control shows the operator verb (e.g. `Customer  contains`) next to the label so
viewers see the match kind; a viewer who needs both `equals` and `contains` on one
column gets **two** filters (operator switching is author-time only).

```json
{ "id": "customer-search", "type": "filter", "title": "Customer",
  "data": { "sourceId": "db", "query": "SELECT DISTINCT customer FROM demo.public.orders ORDER BY 1" },
  "spec": { "param": "customer", "valueField": "customer", "control": "search",
            "operator": "contains", "unsetMode": "null", "targets": "all" } }
```

…with the target panel: `WHERE (customer LIKE %(customer)s ESCAPE '!' OR %(customer)s IS NULL)`.

**Number range (`control: "number-range"`, `operator: "between"`, ADR-0028 Amendment 1
— DVT-257).** A range filter binds **two** values, so it uses **two author-declared
keys** — `loParam` and `hiParam` — instead of the single `param` (for a range,
`param` is **forbidden** and `loParam`+`hiParam` are **required**). They are ordinary
`data.params` keys (no `__lo`/`__hi` magic suffix): you declare both and write the
predicate. The renderer shows a dual-thumb slider (domain from `min`/`max`, or derived
from a `MIN()`/`MAX()` value-source query, stepped by `step`) plus paired min/max
numeric inputs. The two values bind as named scalar parameters — never interpolated,
never a list — so the engine is unchanged.

**Open-ended (one side blank) is required to work**, so write the **null-tolerant
guarded predicate** and set `unsetMode: "null"` (required for ranges): an unset side
binds typed **NULL**, which the guard reads as "no bound on that side."

```json
{ "id": "amount-range", "type": "filter", "title": "Order amount",
  "data": { "sourceId": "db", "query": "SELECT MIN(amount) AS amount, MAX(amount) AS amount FROM demo.public.orders" },
  "spec": { "control": "number-range", "operator": "between", "valueField": "amount",
            "valueType": "number", "loParam": "amount_lo", "hiParam": "amount_hi",
            "min": 0, "max": 50000, "step": 1000,
            "unsetMode": "null", "allLabel": "Any amount", "targets": "all" } }
```

…with the target panel writing the dual-guarded predicate and declaring **both** keys:

```sql
WHERE (amount >= %(amount_lo)s OR %(amount_lo)s IS NULL)
  AND (amount <= %(amount_hi)s OR %(amount_hi)s IS NULL)
```

`"params": { "amount_lo": null, "amount_hi": null }`. A blank min **or** max is
open-ended on that side; an **inverted** range (min above max) binds faithfully and
simply matches no rows (the renderer never silently swaps the bounds).

**Date range (`control: "date-range"`, ADR-0028 Amendment 1 A2.3/A5 — DVT-256).** A
date filter is a range, so it binds the **same two author-declared keys** as a number
range — `loParam` + `hiParam` (the scalar `param` is **forbidden**; declare both keys
and write the dual-guarded predicate, exactly like the number range above). What it
adds is **relative** windows that resolve to concrete dates:

- **`relativeDate`** — `{ lo?, hi? }`, where each end is
  `{ unit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year", amount: <int ≥ 0>, direction: "past" | "future" }`.
  `amount: 0` = the anchor ("today"). An omitted end is **open-ended** on that side.
  Example: last 30 days = `lo: { unit:"day", amount:30, direction:"past" }`,
  `hi: { unit:"day", amount:0, direction:"past" }`.
  Sub-day units (`hour`, `minute`) resolve to an **absolute ISO 8601 timestamp** (not a
  calendar date) — use them for ops / real-time dashboards that filter by rolling hour or
  minute windows. Day and coarser units resolve to a calendar date.
- **`presets`** — an allow-list of quick-pick chips, a subset (in your order) of:
  `today`, `last-7d`, `last-30d`, `last-90d`, `mtd`, `qtd`, `ytd`, `all-time`.
  `all-time` clears both bounds (fully open).
- **`timezone`** — an IANA zone (e.g. `"America/New_York"`, default `"UTC"`) that
  defines what "today" / day boundaries mean. **This is your authored basis, not the
  viewer's locale** — the dashboard resolves identically for every viewer.

**How relative dates resolve (the contract you can rely on).** A relative window
resolves to **absolute** dates that bind as ordinary `date` params — never
interpolated, never the warehouse `CURRENT_DATE`. "Now" is sampled **once per
dashboard load** and the resolution uses your `timezone`, so "last 7 days" always
means the same 7 days for everyone viewing at the same moment. Crucially, a shared
link / reload encodes the **relative expression** (e.g. "last 30 days"), not the
resolved dates — so the recipient re-resolves against **their** current "now" and a
link stays meaningfully relative. The viewer can also switch to **Absolute** mode and
pick literal dates (those are fixed, and encode as-is). Either side blank/disabled =
open-ended, so write the same null-tolerant guard and `unsetMode: "null"` as a number
range.

```json
{ "id": "date-range", "type": "filter", "title": "Order date",
  "data": { "sourceId": "db", "query": "SELECT MIN(order_date) AS order_date, MAX(order_date) AS order_date FROM demo.public.orders" },
  "spec": { "control": "date-range", "valueField": "order_date", "valueType": "date",
            "loParam": "order_date_lo", "hiParam": "order_date_hi",
            "unsetMode": "null", "allLabel": "Any date", "timezone": "America/New_York",
            "relativeDate": { "lo": { "unit": "day", "amount": 30, "direction": "past" },
                              "hi": { "unit": "day", "amount": 0, "direction": "past" } },
            "presets": ["today", "last-7d", "last-30d", "mtd", "qtd", "ytd", "all-time"],
            "targets": "all" } }
```

…with the target panel writing the dual-guarded date predicate and declaring **both**
keys (`"params": { "order_date_lo": null, "order_date_hi": null }`):

```sql
WHERE (order_date >= %(order_date_lo)s OR %(order_date_lo)s IS NULL)
  AND (order_date <= %(order_date_hi)s OR %(order_date_hi)s IS NULL)
```

**`filter-bar` — the de-blocky grouping band (DVT-551, dvt Core).** A `filter-bar`
element is a horizontal band that lays out several filter elements inside one light,
theme-aware surface. Its children are **real elements** in the same page's `panels[]`
(never inlined), referenced by id — they remain individually queryable/filterable.
The `filter-bar` itself occupies one grid cell; its children are **NOT** in the page
grid (the semantic pass enforces this, along with existence / no double-placement).

Intended pattern: set `chrome: "none"` on each child filter so the bare pill merges
into the band surface without doubled card-in-card chrome. Use `density: "compact"`
on children to tighten vertical padding when filters share a narrow row.

```json
{ "id": "filter-band", "type": "filter-bar", "title": "Filters",
  "spec": { "panels": ["active-toggle", "status-seg"] } }

{ "id": "active-toggle", "type": "filter", "title": "",
  "spec": { "param": "is_active", "valueField": "val", "control": "toggle",
            "valueType": "boolean", "label": "Active only",
            "chrome": "none", "density": "compact",
            "unsetMode": "omit", "targets": "all" },
  "data": { "rows": [] } }

{ "id": "status-seg", "type": "filter", "title": "",
  "data": { "rows": [{ "val": "open" }, { "val": "closed" }, { "val": "pending" }] },
  "spec": { "param": "status", "valueField": "val", "control": "segmented",
            "label": "Status", "help": "Filter by order lifecycle state",
            "chrome": "none", "density": "compact",
            "allLabel": "All", "unsetMode": "null", "targets": "all" } }
```

The target panel writes the standard guarded predicates and declares both params in
`data.params`:

```sql
where 1=1
    and (is_active = %(is_active)s or %(is_active)s is null)
    and (status = %(status)s or %(status)s is null)
```

Spec fields on `filter-bar`: `panels` (required, ordered child ids) + `title?`
(optional heading above the band).

**Cross-page scope, interaction mode, and report placement (ADR-0028 Amendment 4).**

**Structured `targets` form.** The shorthand values `"all"` and `["panelId", …]` are
convenience forms. The full structured form:

```json
{ "scope": "page", "panels": "all" | ["panelId", …] }
```

Three scope values: `"page"` (default) — this page only; `"pages"` — explicit allow-list
(requires `"pages": ["pageId", …]`); `"dashboard"` — every page. The shorthands map
exactly: `"all"` ≡ `{ "scope": "page", "panels": "all" }`, and `["panelId", …]` ≡
`{ "scope": "page", "panels": ["panelId", …] }`.

**Interaction `mode`** — controls what happens to a target panel when the filter fires.
Three values: `"filter"` (default) re-queries the target at the warehouse; `"highlight"`
is **client-side only** — dims/de-emphasizes non-matching marks without a re-query (ADR-0011
fence: never touches the warehouse); `"none"` is inert (declared but does nothing —
useful for staged authoring). Set at the `targets` level to apply to all bound panels, or
override per panel in `bindings[]`. Precedence: `bindings[panel].mode > targets.mode > "filter"`.

**Per-target `bindings[]`** — fine-grained overrides for individual panels in `targets`:

```json
"targets": {
  "scope": "dashboard",
  "panels": "all",
  "mode": "filter",
  "bindings": [
    { "panel": "sales-chart", "as": "region_key", "mode": "highlight" }
  ]
}
```

`panel` (required) — a panel id. `as` — re-maps the filter's selected value into a
**differently-named** `data.params` key on that specific panel (the key MUST already be
declared on the panel; otherwise it is a no-op and emits an author-time lint warning —
it never inserts a new key). Use `as` when two panels name the same concept differently.
`mode` — per-panel override (see above).

**`placement` and `showOnPages`** — top-level `FilterSpec` fields (not inside `targets`).
`placement: "page"` (default) renders the filter chrome on its home page; `"report"`
renders the chrome once at the report level, applying across pages. `showOnPages:
["pageId", …]` (**for `placement:"report"` only — ignored under `placement:"page"`**) restricts which pages render the report-level chrome (orthogonal to `targets.scope`,
which controls which panels re-query — the two are independent).

```json
{ "id": "region-filter", "type": "filter", "title": "Region",
  "data": { "sourceId": "db", "query": "SELECT DISTINCT region FROM orders ORDER BY 1" },
  "spec": {
    "param": "region", "valueField": "region", "control": "select",
    "valueType": "string", "unsetMode": "null", "allLabel": "All regions",
    "placement": "report",
    "targets": {
      "scope": "dashboard",
      "panels": "all",
      "mode": "filter",
      "bindings": [
        { "panel": "kpi-summary", "as": "region_key", "mode": "highlight" }
      ]
    }
  }
}
```

**`onClick`** (DVT-2719/2720/2721, ADR-0035 Amendment 1) — a property on **every panel type that
resolves a clicked datum**: every `chart:*` type (including animated) — but `chart:line:racing` is
inert at runtime (no affordance, no dispatch; DVT-3041) — plus `table`/`kpi`/`stat`/
`metric-strip`; the schema rejects it on `filter`, `filter-bar`, `container`, `divider`, `section`,
`text`, `html`, `hero`, `media`, `agent`, which surface no clicked datum. A single, **bare** action object
(NOT `{ action, affordance }`) fired by a plain **left-click** on a mark/row — DOM surfaces
(`table`/`kpi`/`stat`/`metric-strip`) additionally activate on **keyboard** Enter/Space. `type` ∈
`filter` | `drill` | `openOverlay` — the navigation-safe subset of `contextMenu`'s vocabulary (no
`link`/`copy`/`export`; those stay behind a deliberate right-click choice). The required `label`
doubles as the hover-affordance text: there is no author-facing affordance opt-out — `when` narrows
which datums are clickable, it does not hide the disclosure on a clickable one. The renderer itself
withholds the affordance when the action could never fire (see the actionability rule below), in
edit mode, and in a static render.

**Actionability (post-DVT-2722)** — what a real click carries differs by surface, and that gates
which `valueFrom`/`when.field` actually fires:

- A **non-animated `chart:*`** mark's click carries `category`/`value`/`seriesName` **and** the
  clicked row — but only on families whose compiled series data is numeric AND row-indexed.
  Elsewhere a row-field `valueFrom`/`when.field` is unreliable (DVT-3040) — the cases below
  illustrate the rule, they are not a closed list: object-item families (`chart:pie`,
  `chart:funnel`, `chart:map`, `chart:sunburst`, `chart:treemap`, `chart:sankey`, `chart:gauge`),
  array-tuple families (`chart:scatter`, `chart:heatmap`, `chart:calendar`), and any family whose
  matched datum compiles to the ECharts per-datum object form — `chart:waterfall`, or any
  row-indexed family carrying `colorRules`, where a matched datum compiles to `{value, itemStyle}`
  — the clicked item IS the ECharts datum, not a `queryResult.rows` entry, so the binding resolves
  to nothing; on pivoting families (`seriesField`/stacked — `dataIndex` indexes the pivoted shape)
  it can resolve against the WRONG row. Prefer `category`/`value`/`seriesName` on all of those.
- An **animated chart**'s click carries the same token triple but **NO row** — a row-field
  `valueFrom`/`when.field` is never actionable there.
- On `chart:*` the `when` disclosure is per-**SERIES**, not per-datum: a mark failing `when` still
  shows the cursor/emphasis/label and then no-ops on click — only the DOM surfaces
  (`table`/`kpi`/`stat`/`metric-strip`) suppress the affordance per datum.
- `table`/`kpi`/`stat`/`metric-strip` carry a **ROW ONLY** — never the token triple — so on those
  four, `valueFrom`/`when.field` **MUST** name a real row field; a click-only token
  (`category`/`value`/`seriesName`) or an **absent** `valueFrom` (default `category`) is never
  actionable there and shows **no affordance**. On `table` the mouse target is a data cell, but the
  bound datum is the whole **ROW** — `when` narrowing, keyboard focus, and dispatch are all per data
  row, one tab stop per actionable row (Enter/Space activates).
- `kpi`/`stat`/`metric-strip` additionally bind from **`rows[0]` only** — a field present on
  another row but absent from `rows[0]` never satisfies a `when`/binding on those three.
- The rule applies **per `bindings` entry and all-or-nothing**: on `table`/`kpi`/`stat`/`metric-strip`
  every entry's `valueFrom` must name a real row field — a single entry using a click-only token, or
  omitting `valueFrom` (default `category`), makes the whole action unactionable and withholds the
  affordance.

Use `when: { field }` to narrow **which datums** are clickable (never as an affordance opt-out on a
datum that IS clickable). Shares the exact same field vocabulary as the matching `contextMenu` action
below — see its fields there; the two can be declared on the same panel.

```json
{ "id": "rev-by-region", "type": "chart:bar", "title": "Revenue by region — click a bar to drill in",
  "data": { "sourceId": "db", "query": "SELECT region, SUM(amount) AS rev FROM demo.public.orders GROUP BY 1" },
  "onClick": { "type": "drill", "label": "Open {category} detail", "targetPage": "region-detail", "param": "region", "valueFrom": "category" },
  "spec": { "series": [{ "type": "bar", "dataField": "rev" }] } }
```

**`drill`** — a property on **any** panel (not a `type`). Retained for back-compat but **inert on
its own** (DVT-555) regardless of trigger: to wire real drill navigation, use `onClick` above (the
plain left-click quick path) or a `contextMenu` action of `type:"drill"` (right-click menu, better
when a source should offer several destinations, or drill sits alongside other actions on one
menu). The `drill` object fields (`targetPage`, `param`, `valueFrom`, `valueType`) are the SAME
fields either trigger carries, and the same binding contract applies — the clicked value enters the
target page's panels by name through `data.params`, never interpolated.

**Left-click first.** `onClick` (drill/`openOverlay`) is the DEFAULT interactivity on every chart
and table that has a detail target — reach for it before `contextMenu`. `contextMenu` is for
secondary actions (copy, export, multi-action menus) or a source that needs several destinations.
User-facing disclosure copy always says "Click…", never "Right-click…", even on a panel whose
only wired action lives behind `contextMenu`.

Until DVT-3040 lands, the Actionability rule above applies identically to `contextMenu` — a
row-field `valueFrom`/`when.field` is just as unreliable there (measured live on FCC 2026-08-28: a
custom right-click action on a scatter never appears in the menu, only the built-in entries):
**DEAD** on object-item families, array-tuple families, and any family whose matched datum compiles
to the per-datum `{value, itemStyle}` object form — `chart:waterfall`, or any row-indexed family
carrying `colorRules` (`bar`/`bar:horizontal`/`line`/`line:smooth`/`line:step`/`area`/`pie`/`donut`/
`scatter`) (only rule-matched datums compile to the object form — unmatched marks still bind, so
the failure is per-mark, not per-panel) — these cases illustrate the rule, not a closed list;
**LYING** on pivoting families
(`seriesField` pivot, `chart:bar:stacked`/`stacked-percent`). Prefer `category`/`value`/`seriesName`
bindings on those families, or route the action through a table/filter instead.

**`contextMenu`** — a property on **any** panel (and, additively, on any `table` column,
ADR-0035). The **right-click menu**: an ordered `actions[]` list, each parameterized by the clicked
mark/row, that turns a dashboard from read-only into explorable. Reach for it over `onClick` when a
datum needs several actions, or an action outside `onClick`'s navigation-safe subset (`link`,
`copy`, `export`). Like `onClick`/`filter`/`drill` it
is interactive-only (a no-op in a static PNG render). Six action types:

```json
{ "id": "rev-by-region", "type": "chart:bar", "title": "Revenue by Region",
  "data": { "sourceId": "db", "query": "SELECT region, SUM(amount) AS rev FROM demo.public.orders GROUP BY 1" },
  "contextMenu": { "actions": [
    { "type": "drill", "label": "Drill into {category}", "targetPage": "region-detail", "param": "region", "valueFrom": "category", "valueType": "string" }
  ] },
  "spec": { "series": [{ "type": "bar", "dataField": "rev" }] } }
```

The `region-detail` page's panels declare `%(region)s` + a `data.params` `region` default,
exactly like the filter targets above. It is a **regular, tab-bar-visible page** — which is
what makes `drill` the right mechanism here; a `hidden: true` target would need `openOverlay`
instead (see the `drill` rule below). `targetPage` (required) — a `pages[].id`. `param`
(required unless using `bindings[]` for a compound key, see below) — the params key set
on the target page's panels. `valueFrom`: `category`
(default) | `value` | `seriesName` | a field name from the clicked row (use a field name
for tables). `valueType` — as above.

```json
{ "id": "rev-by-region", "type": "chart:bar", "title": "Revenue by Region",
  "data": { "sourceId": "db", "query": "SELECT region, SUM(amount) AS rev, region_id FROM demo.public.orders GROUP BY 1, 3" },
  "spec": { "series": [{ "type": "bar", "dataField": "rev" }] },
  "contextMenu": { "actions": [
    { "type": "filter", "label": "Filter page to {category}", "param": "region", "valueFrom": "category" },
    { "type": "drill",  "label": "Open {category} detail", "targetPage": "region-detail", "param": "region", "valueFrom": "category" },
    { "type": "openOverlay", "label": "Inspect {category}", "targetPage": "region-inspector", "present": "modal", "param": "region", "valueFrom": "category" },
    { "type": "link",   "label": "Open {category} in CRM", "url": "https://crm.example.com/regions/{region_id}", "target": "tab" },
    { "type": "copy",   "label": "Copy value", "copy": "value" },
    { "type": "export", "label": "Export this row", "format": "csv", "scope": "row" }
  ] } }
// drill targets region-detail (a VISIBLE tab-bar page); openOverlay targets region-inspector
// (hidden: true). The mechanism follows the target's visibility — never drill at a hidden page.
```

- Every action has `type` (the discriminator), `label` (required — supports `{token}`
  templates), optional `icon`, and optional `when: { field }` (show the action only when
  the clicked datum has a non-null value for `field` — e.g. "Open in CRM" only on rows
  with an account id).
- **`{token}` templates** in `label` (and `link.url`): `{category}`, `{value}`,
  `{seriesName}`, and `{<field>}` for any field of the clicked row. On **tables** every
  field works. On **charts**, `{category}`/`{value}`/`{seriesName}` always work; arbitrary
  `{<field>}` / `valueFrom:<field>` resolve the clicked mark's source row on row-per-mark
  charts (bar, line, area) — unless the family carries `colorRules` (see the Actionability
  rule) — see the onClick Actionability rule above for the full DVT-3040
  mechanism — for a pivoting stacked/multi-series chart, bind from `category`/`value`/
  `seriesName` instead.
- **`filter`** — cross-filters the **current** page (no navigation): `param` (required
  unless using `bindings`), `valueFrom?` (default `category`), `valueType?`, `targets?`
  (`"all"` | panel-id list). Same value→query binding + targeting as a `filter` control.
- **`drill`** — navigates to a page: `targetPage` + `param` (required unless using
  `bindings`), `valueFrom?`, `valueType?`. Real drill navigation is wired via this contextMenu
  action or the equivalent `onClick` action above — the bare `drill` panel property stays inert
  either way (DVT-555). One menu can hold several drill destinations.
  ⛔ **`targetPage` must be visible in the tab bar.** `drill` *navigates*, and a `hidden: true`
  page has no tab to return through, so the viewer is stranded with browser Back. Use
  `openOverlay` for a hidden target. `dvt_spec_validate` raises the advisory
  `interaction-stranding` warning on a drill at a hidden page (DVT-3138); ADR-0036 §1 as
  amended 2026-08-21.
- **`openOverlay`** (ADR-0036) — opens `targetPage` as a **modal or drawer overlay** *over*
  the current page (detail-on-demand), instead of navigating away. A superset of `drill`:
  `targetPage` (required), optional `param`/`valueFrom`/`valueType` (or `bindings`, the
  clicked value is bound into the overlay page's panels, scoped to the overlay — it never
  touches the base page; closing the overlay discards it). Presentation: `present?`
  (`modal` default | `drawer`), `size?` (`sm`|`md`|`lg`|`full`), `side?` (`left`|`right`,
  drawer only). `size` is a fixed-width tier, narrower than the page at every tier below `full`:
  `sm` 480px · `md` 720px (default) · `lg` 1040px · `full` 95vw — set `size` (and `side`)
  deliberately for the content, and design the overlay page for that narrower grid: metric-strips
  ≤4 metrics on an overlay page (3–5 on a full page). A detail popover/overlay page is a **real insight page** — trend +
  mix/comparison + narrative panels bound to the incoming parameter — never just a header +
  metric-strip. Omit `param`/`bindings` for a context-free detail/help overlay. The target
  is **usually a hidden page** (see below) — and for a hidden target this is the **only**
  correct mechanism; a `drill` there strands the viewer. In a **static render or export** the
  action is a **no-op**, like every other context action — it does *not* fall back to
  navigating (ADR-0036 §4). **Inside an already-open overlay, a nested `openOverlay` — and a
  nested `drill` — are inert too**: the overlay body mounts without an overlay host or a
  navigate handler, so one overlay at a time is the shipped bound. (ADR-0036 §3 describes that
  bound as *replacing* the open overlay; the renderer goes inert instead — DVT-3284 tracks the
  divergence, and this skill documents the renderer.) Don't design a two-level overlay path;
  it silently does nothing.
- **`bindings[]`** (DVT-2104) — bind a **compound key** from one click instead of the
  scalar `param`, on `filter`/`drill`/`openOverlay`: `bindings: [{ param, valueFrom?,
  valueType? }, …]`, one entry per param, same value→query contract as the scalar form.
  Mutually exclusive with `param` on the same action — `filter`/`drill` require exactly
  one of the two; `openOverlay` may also omit both (bind nothing). **All-or-nothing:**
  if any binding's value is missing, `NULL`, or empty, the whole action does nothing —
  prefer `valueFrom` columns that are `NOT NULL`.

  ```json
  { "type": "drill", "label": "Open {category} {quarter} detail",
    "targetPage": "region-quarter-detail",
    "bindings": [
      { "param": "region", "valueFrom": "category" },
      { "param": "quarter", "valueFrom": "quarter" }
    ] }
  ```

- **`link`** — opens an external URL. Scheme must be `https` | `mailto` | `tel`
  (`javascript:`/`data:`/`http:` are rejected). Token values are URL-encoded, and a
  `{token}` may appear only in the path/query/fragment — never in the scheme or host (so
  `https://{host}/…` is rejected). `target?`: `tab` (default, opens a new tab with
  `noopener`/`no-referrer`) | `self`. A missing token disables the action.
- **`copy`** — `copy?`: `value` (default) | `row` (tab-separated) | a field name. Client-only.
- **`export`** — `scope?`: `row` (default, the clicked row client-side) | `result` (the
  panel's full result via the audited export endpoint); `format?`: `csv` (default) | `json`.

A column-level `contextMenu` on a `table` column **merges below** the panel-level menu
(panel actions first, then that column's actions).

### Exploration patterns — composing interactivity into a story

The section above is the **mechanics** (how to wire a filter, a drill, an overlay). This is
the **craft**: *which* moves to reach for. A dashboard becomes explorable by composing a small
number of **progressive-disclosure moves** on top of an already-coherent authored story
— the Martini Glass stem (see `docs/04-design-knowledge/analytical-narrative.md`). A dashboard
is an instrument, not a poster: it should answer the authored question *and* host the reader's
follow-up questions.

**Default — net-new dashboards ship interactive.** Every net-new dashboard of 3+ panels ships
with the **default interactivity package**: (a) at least one scoped `filter` (date-range or the
primary dimension) opening the exploratory zone below the guided band; (b) a `contextMenu` on
the hero chart and on every `table` (filter / `openOverlay` / `drill` / export actions); (c)
**per-category detail on demand** wherever a categorical breakdown has meaningful detail behind
it — `openOverlay` when the target page is `hidden: true`, `drill` when it is visible in the tab
bar. A brush cross-filter is optional, for 2+ panels sharing a time axis. Cut an individual
control only when it fails the self-check below. Ship **fully flat** only for a single-question
fixed readout, a kiosk loop, or a print/export target — and record that in `meta.decisions` as
`"Interactivity: none — <reason>"` so reviewers can tell a decision from an omission.

**The self-check (run before adding any control).** For every interactive element, answer both:

1. **Which insight changes** when the reader acts on it? (name the new question it answers)
2. **Which panel visibly re-renders** to surface that insight? (name the target panel id / page)

If you can't answer *both* concretely, it is **cargo-cult interactivity** — a control that
reshapes nothing the reader cares about — and you should cut it. (`dvt_spec_validate` warns
when a control's `param` is wired to nothing — a `targets`/`targetPage` that no panel consumes —
so fix that rather than ship a control that reshapes nothing.)

**Placement.** Exploration affordances live **below** the authored intro, never above it — the
headline + top-band numbers + insight sentence must read on their own first, *then* filters/drill.
A reader who never touches a control still gets the whole story.

The canonical moves, smallest to largest:

**1 — KPI/mark → drill-to-detail (DVT-141).** A summary mark or KPI tile answers "how much"; a
click opens a detail page answering "why". Use `onClick` for the default plain-left-click quick
path (below), or a `contextMenu` drill action when the source should offer several destinations, or
drill sits alongside other actions on one right-click menu. Use when each summary category has a
meaningful, same-shape breakdown a reader will want on demand. **Mind the actionability rule:** a
chart mark's click carries `category`/`value`/`seriesName`, but a `kpi`/`stat`/`metric-strip` click
carries only the clicked **row** — `valueFrom` must name a real row field there, never `category`.

```json
{ "id": "rev-by-region", "type": "chart:bar", "title": "Revenue by region",
  "data": { "sourceId": "db", "query": "SELECT region, SUM(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 2 DESC" },
  "onClick": { "type": "drill", "label": "Break down {category}", "targetPage": "region-detail",
    "param": "region", "valueFrom": "category", "valueType": "string" },
  "spec": { "series": [{ "type": "bar", "dataField": "revenue" }] } }
// region-detail's panels read %(region)s from data.params — the clicked value, never string-interpolated.
```

On a `kpi` tile the same `valueFrom:"category"` would be silently inert — there is no click token
triple to read `category` from, only the bound row — so name a real row field instead:

```json
{ "id": "top-region-kpi", "type": "kpi", "title": "Top region",
  "data": { "sourceId": "db", "query": "SELECT region, SUM(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 2 DESC LIMIT 1" },
  "onClick": { "type": "drill", "label": "Break down {region}", "targetPage": "region-detail",
    "param": "region", "valueFrom": "region", "valueType": "string" },
  "spec": { "valueField": "revenue", "agg": "sum" } }
// kpi/stat/metric-strip bind from rows[0] only, and only via a real row field — "category"/"value"/"seriesName" are never actionable there.
```

The target here is a **visible** page, so `drill` is the right mechanism; when the detail page
is `hidden: true`, use `openOverlay` instead (move 4) — see the rule under `drill` above.

*When NOT to use:* if the "detail" page would just repeat the same numbers, or there's only one
category worth seeing — that's drill-to-nowhere. A drill whose target page doesn't answer the
question the click implies is worse than no drill.

**2 — Metric switcher via param binding (ADR-0028).** A `segmented` filter sets a param that the
panel's query consumes in a `CASE`, letting one chart pivot between measures on the same axis.
Use when two–three measures share a frame ("revenue vs. orders vs. AOV over time") and showing
all at once would clutter.

```json
{ "id": "metric-switch", "type": "filter", "title": "Measure",
  "spec": { "control": "segmented", "param": "measure", "valueField": "value", "valueType": "string",
            "values": [ {"value":"revenue","label":"Revenue"}, {"value":"orders","label":"Orders"} ],
            "default": "revenue" } }
// the trend panel's query: SELECT month, CASE WHEN %(measure)s = 'revenue' THEN SUM(amount)
//   ELSE COUNT(*) END AS value FROM orders GROUP BY 1 ORDER BY 1 — the value is bound and compared, never used as an identifier.
```

*When NOT to use:* to switch a **column name** or table dynamically — params bind *values*, not
SQL identifiers (ADR-0028). If the measures don't share a y-axis or reading, use small multiples
or separate panels instead of a switcher.

**3 — Filter that reshapes the story (DVT-140 / DVT-170).** A `filter-bar` of slicers re-queries
the whole page so the same narrative can be read for any segment. Use for a dashboard an analyst
audience will slice repeatedly (by region, segment, date window) — the exploratory leg of a
Martini Glass. Multi-select binds an array (`in` / `not-in`, DVT-170).

```json
{ "id": "controls", "type": "filter-bar", "title": "Filters", "spec": { "panels": ["region-f", "date-f"] } }
{ "id": "region-f", "type": "filter", "title": "Region",
  "data": { "sourceId": "db", "query": "SELECT DISTINCT region FROM orders ORDER BY 1" },
  "spec": { "control": "multiselect", "param": "region", "valueField": "region",
            "chrome": "none", "allLabel": "All regions", "unsetMode": "null" } }
// each re-queried panel guards the predicate: WHERE (region IN %(region)s) — unsetMode:"null" means "no selection" rewrites to (1=1), so it shows all (DVT-1209, ADR-0028 Amendment 1).
```

*When NOT to use:* on a fixed answer-first exec dashboard, or when a filter would let a reader
land on an empty/misleading slice. If only one segment matters, pre-filter in SQL and state it
in the title — don't make the reader rediscover the point.

**4 — Detail-on-demand overlay (ADR-0036 / expand, DVT-136).** A `contextMenu` `openOverlay` opens
a **hidden page** as a modal/drawer *over* the current page — deep detail without leaving the
story. Use when the detail is occasional and shouldn't cost a page/tab or a navigation away.

```json
{ "contextMenu": { "actions": [
  { "type": "openOverlay", "label": "Inspect {category}", "targetPage": "order-inspector",
    "present": "drawer", "size": "lg", "param": "region", "valueFrom": "category" } ] } }
// order-inspector is a hidden page (not in the tab bar); the bound param scopes the overlay only, discarded on close.
```

*When NOT to use:* for content the reader needs side-by-side with the base page (use a real page
or panel), or when a plain `drill` navigation is clearer. In a **static render or export** an
`openOverlay` action is a **no-op** — it does *not* fall back to navigating (ADR-0036 §4), and
inside an already-open overlay a nested `openOverlay` or `drill` is inert as well (§3, one
overlay at a time). So don't put load-bearing content behind an overlay-only path, and don't
plan a second overlay level from inside one: in those contexts it is simply unreachable.

**Reachability.** Whichever move you choose, the exploration leg must be **reachable from the
intro** — a drill affordance on the panel that motivates it, a filter-bar directly under the
headline. Interactivity the reader can't find is the same as no interactivity.

### Animated / temporal charts — playback over a time dimension (ADR-0034)

Three chart types replay **one query result as frames** over a time/sequence column —
a bar-chart **race**, a **racing line**, and an animated **choropleth**. They are
**dvt Full** (non-portable, ECharts-coupled): a spec using one reports
`conformance: "full"`, and an **export/render captures a static poster frame** (the
final frame), not the motion. Live playback is a web-renderer capability.

| Type | Use it for | Mode |
|------|-----------|------|
| `chart:bar:racing` | top-N rankings that reshuffle over time (brands/regions by year) | continuous tween — bars **slide** |
| `chart:line:racing` | series drawing in / diverging over time (prices, cumulative metrics) | continuous tween — line **grows** |
| `chart:geo:animated` | a measure spreading across a map over periods (share by state by quarter) | fills **cross-fade** (large maps step) |

**One query, all frames.** The rows carry every frame stacked; the client groups them by
`animation.frameField` and iterates **in-browser** — there is **no per-frame query** and no
engine change (ADR-0011/0013). A 12-year race of 10 categories is 120 rows in one result,
not 12 queries. For a backend-free spec, bake all frames into `data.rows`.

**The `animation` block** (required on these three types):

```jsonc
"animation": {
  "frameField": "year",          // REQUIRED — the column rows are grouped/ordered by
  "frames": ["2019","2020","…"], // optional explicit order; else numeric/date-aware sort
  "speedDefault": 1,             // initial speed multiplier (∈ speeds)
  "speeds": [0.5, 1, 2, 4],      // selectable multipliers; scrubber + segmented control
  "loop": true,                  // restart after the last frame (DEFAULT true; set false to play once)
  "controls": { "placement": "below" }   // "below" (default) | "overlay"
}
```

The shared control bar (play/pause · scrubber · speed · period label · loop, keyboard-operable)
renders automatically; you don't author it. Panels **autoplay and loop on mount** by default so a
dashboard stays alive (set `loop:false` to play once and park on the final frame; OS
*prefers-reduced-motion* starts paused on the first frame). Speed scales the tick interval **and**
the tween duration together so motion stays smooth.

**Smoothness is automatic.** The bar and line races synthesize interpolated sub-frames between your
data periods (ADR-0034 Amendment 2), so sparse data (a handful of periods) still glides instead of
lurching — you don't author intermediate frames. Animated geo **cross-fades** too (Amendment 3): per-region
values interpolate so fills shift smoothly; regions with no data on a side snap at the boundary, and large
maps (>80 regions, e.g. `world`) stay discrete to avoid repaint jank. Reduced-motion steps discretely.

**Stable identity is the whole trick.** Each data item must keep a stable name across frames so
the renderer *slides* it instead of popping. For a **bar race**, `categoryField` is that identity
(one row per category per frame) and `valueField` is the measure; `yAxis.max: N-1` shows the
top-N (default 10). For a **line race**, `valueField` is the y measure and an optional
`seriesField` splits multiple lines. For **animated geo**, `series[].map` names a registered
asset (`USA`/`world`, ADR-0023), `labelField` is the region (matching the map's
`properties.name`, e.g. a full US state name), `valueField` the measure, and a single
`visualMap` colours all frames on one scale (set `min`/`max` so colours are comparable
period-to-period).

```jsonc
// Bar race — top regions by MRR over the year
{ "type": "chart:bar:racing", "title": "MRR by region",
  "data": { "rows": [
    {"month":"Jan","region":"AMER","mrr":120}, {"month":"Jan","region":"EMEA","mrr":131},
    {"month":"Feb","region":"AMER","mrr":135}, {"month":"Feb","region":"EMEA","mrr":141}
    /* …all months × regions… */ ] },
  "spec": {
    "categoryField": "region", "valueField": "mrr",
    "series": [{ "type": "bar" }],
    "animation": { "frameField": "month", "loop": true }
  } }
```

Tips: keep frames ≲ 50 and one row per entity per frame; tidy, numeric/date-sortable
`frameField` values order without an explicit `frames` list; for geo prefer smaller period
deltas (monthly > yearly) since fills don't interpolate.

## Canvas mode — immersive, full-bleed, scroll-driven layouts

Set **`layout.mode: "canvas"`** (the default is `"grid"`) to author a full-bleed,
free-form, scroll-driven dashboard instead of the 24-column grid — a scrollytelling
report or a kiosk/presentation view rather than a tile grid (ADR-0027). The **same
spec, panels, theme, data binding, and blocks** apply; only the layout shape changes.
Humans and agents author it identically — an agent can generate a canvas spec exactly
like a grid one.

```json
"layout": {
  "mode": "canvas",
  "fullBleed": true,
  "sections": [
    {
      "id": "hero",
      "background": "radial-gradient(circle at 30% 20%, #1E1B4B 0%, #0B0B0F 60%)",
      "width": 1440, "height": 810,
      "scroll": "none",
      "blocks": [
        { "ref": "hero-title", "x": 120, "y": 280, "w": 900, "h": 220, "z": 1,
          "motion": { "type": "rise", "trigger": "load", "duration": 600 } },
        { "ref": "headline-stat", "x": 120, "y": 540, "w": 1100, "h": 140, "z": 2,
          "motion": { "type": "count-up", "trigger": "in-view", "duration": 1200 } }
      ]
    }
  ]
}
```

**The model (a slide deck that scrolls):**

- A canvas layout is an ordered list of **`sections`**. The page scrolls top-to-bottom
  between them; each is a fixed **design-space rectangle** (`width`×`height`, default
  **1440×810**) the renderer **scales to fit the viewport width** — author once at
  1440-wide and it reads at any size (no per-breakpoint map).
- **`blocks`** are absolutely positioned *inside* a section, in design-space units:
  `{ "ref": panelId, "x", "y", "w", "h", "z?", "motion?" }`. `ref` points at a
  `panels[]` id (exactly like grid `items[].i`) — **content lives in `panels[]`,
  placement lives in blocks.** Blocks may overlap and layer by `z` (default 0); a panel
  may appear in more than one block.
- **`section.background`** takes any CSS background (solid / gradient / a token ref like
  `{page.background}`) — **sanitized** (no remote `url()`); use `media` blocks for images.
- **`fullBleed: true`** is a render hint (ADR-0027) with per-surface semantics (DVT-2374,
  slice 1C): on the immersive `/present` viewer, fullBleed is honored in full — app chrome
  (nav/tab-bar/drawer) is hidden, padding drops to 0, and content is unconstrained. The
  standard `/dashboard` viewer and the headless render/export surface honor fullBleed too,
  but ONLY as padding=0 + maxWidth=none — app chrome is NOT hidden there; only `/present`
  hides chrome (hiding nav in the main viewer would break navigation). Canvas mode implies
  full-bleed on `/present` and in the builder preview pane (which mirrors it, DVT-2374
  review r2 F3); the standard viewer and the headless render surface still require an
  explicit `fullBleed: true` — a canvas page without it keeps its padded/capped rendering on
  those two surfaces. Open a canvas dashboard, then click **Present** for the immersive
  viewer at `/present/:id`.

**Scroll behaviors** (`section.scroll`):

- `none` (default) — the section scrolls normally.
- `pin` — sticks to the top while later sections scroll up over it (stacked scrollytelling).
- `reveal` — its blocks rise/fade in as the section enters view (a default entrance for
  blocks that declare no `motion` of their own).

**Motion** (`block.motion`) — a declarative entrance animation compiled at render (data,
not functions — ADR-0016):

- `type`: `none | fade | rise | scale | count-up`. `count-up` rolls a `stat`/`metric-strip`/`kpi`
  number up on entrance (on any other panel it degrades to a plain fade); the others animate the block.
- `trigger`: `in-view` (default — plays when scrolled into view) or `load` (on first paint).
- `delay`, `duration` (ms; defaults 0 / 600).
- Motion always respects `prefers-reduced-motion` and is **off in static renders** (a
  headless capture lands on the final frame), so it never blocks or races a render.

**When to use canvas:** a flagship/executive narrative, a launch or quarterly report you
want to feel bespoke and full-bleed, a scrollytelling walk-through, a kiosk/presentation.
Use **grid** for an everyday analytical dashboard of tiles. The rich blocks
(`hero`/`stat`/`media`/`divider`) shine in canvas but work in either.

**Authoring tips:** open with a `hero` over a gradient `section.background`; use `stat`
blocks with `count-up` motion for headline figures; give each section **one idea**
(scrollytelling = one message per section, the canvas analogue of one-question-per-page);
keep blocks on a tidy implied grid inside the 1440×810 space and don't overlap text
illegibly; a `divider` or generous empty geometry gives breathing room. Verify the same
way (§4) — render at desktop width and read it; motion is off in the capture so you see
the final frame.

## HTML-slots mode — author-written pages with live panel mounts

Set **`layout.mode: "htmlSlots"`** plus **`layout.html`** (required) to author a full
custom HTML/CSS page template that replaces the grid entirely (ADR-0059) — the grid and
canvas layout fields (`columns`/`rowHeight`/`items`/`sections`) are unused. `panels[]`
still holds the real content; the page just decides where they mount. htmlSlots is
always **`conformance: "full"`** — it is the escape hatch, never portable/Core.

**Default to `grid` unless the user explicitly asks for a bespoke HTML page.** htmlSlots
trades portability and easy layout editing for total layout freedom — reach for it only
when the brief is genuinely bespoke.

**When to use:** a print-like report, an editorial/magazine-style page, a one-off
branded layout the 24-column grid can't express. Not for everyday KPI walls or analyst
views — use `grid` for those, `canvas` for scroll-driven narratives.

**Slot rules:** panels mount wherever `<dvt-slot ref="panelId"></dvt-slot>` markers
appear in `layout.html` — the markers ARE the slot manifest; there is no separate
declaration. `ref` must match `^[A-Za-z0-9_-]{1,64}$` and must reference an EXISTING id
in `panels[]`. `ref` is the *only* allowed attribute on a `<dvt-slot>` — no inline
config, no children; any other attribute is stripped. A dangling `ref` (no matching
panel) renders empty; a duplicate `ref` mounts that panel more than once. A `<dvt-slot>`
nested in a non-HTML namespace (e.g. inside `<svg>`) is dropped.

**Slot sizing:** a slot ships as `display: block; height: 100%`, so it fills its wrapper.
That `100%` resolves against the wrapper's **definite** height — which can come from an
explicit `height`, from a flex line sized by a taller sibling, or from a grid row. When
nothing in the chain supplies a height, the slot has nothing to resolve against and the
chart renders at 0px, because a panel's card and its chart are `height: 100%` all the way
down. The reliable move is to give the wrapper a definite height.

⚠️ **Wrap your slots.** Put `<dvt-slot>` inside a wrapper element rather than making it a
direct flex item of a flex container. A flex item with `height: 100%` no longer stretches
to its flex line, so a bare slot in an auto-height row collapses to 0px where a wrapped
one fills the line its siblings establish. Wrapping is necessary, not sufficient — if
nothing else sizes the line, size the wrapper too.

Size the wrapper (`.figure { height: 280px }`) — the default then resolves against it —
**or** override the slot itself (`.figure dvt-slot { height: 280px }`); only the latter is
a cascade override, which is why the default carries no `!important`. An override rule
must meet or beat the app default's specificity, `.dvt-htmlslots-html dvt-slot` at
**(0,1,1)** — scope it under a wrapper class (`.figure dvt-slot`), never a bare
`dvt-slot { height: … }` (specificity (0,0,1)), which loses regardless of source order.
An equal-specificity rule like `.figure dvt-slot` wins on source order alone: the
authored `<style>` is injected into the page after index.css, so a tie always resolves
to the author's rule. A sized slot is clipped to its box — the card is `overflow: hidden`
— so size generously.
`.figure dvt-slot { height: auto }` is a narrow escape hatch for intrinsically-sized
panel content (text, html, table) **only — never a chart**: inside a wrapper, every
ECharts panel is `height: 100%` down to the canvas host, so `auto` leaves the chart at
0px. An `auto` slot also isn't contained by its wrapper and can exceed it. Rough starting
heights: a KPI or stat slot ~120–140px, a chart figure ~240–360px, a full table 500px+.

**Sanitizer:** `layout.html` passes the same DOMPurify gate as `html` panels —
`<script>`, `javascript:` URLs, and `on*` handlers are stripped; `<style>` is allowed.
Scope your style selectors under an authored wrapper class (e.g. `.my-report h1 { … }`)
— styles currently apply document-wide, not just to your frame (DVT-890 tracks tighter
scoping; don't rely on isolation yet).

**No interpolation:** unlike a panel's own `html`, `layout.html` is never interpolated —
no `{{ field | agg | format }}` — it has no bound query result of its own. All live data
lives in the panels mounted into the slots, not the frame.

**Theme tokens:** author frame text/surfaces with the same theme vocabulary as `html`
panels — `var(--ink)`, `var(--muted)`, `var(--accent)`, `var(--accent-2)`. Untinted
authored text renders default-dark and disappears on dark themes — always tint it.

**The frame is inert by design:** the authored HTML is a non-interactive decorative
frame (`pointer-events: none`) — only mounted `<dvt-slot>` subtrees re-enable pointer
events. Authored `<a>` links and buttons in the frame don't respond to clicks. Put every
interactive affordance (links, buttons, filters) inside a panel, never in the frame.

```json
"layout": {
  "mode": "htmlSlots",
  "html": "<div class=\"quarterly-report\"><style>.quarterly-report{padding:48px;font-family:inherit;}.quarterly-report h1{font-size:36px;font-weight:800;color:var(--ink);margin-bottom:8px;}.quarterly-report .subhead{color:var(--muted);margin-bottom:32px;}.quarterly-report .stat-row{display:flex;gap:24px;margin-bottom:32px;}.quarterly-report .stat-row > div{flex:1;height:120px;}.quarterly-report .trend{height:360px;}</style><h1>Q3 Board Report</h1><div class=\"subhead\">Prepared for the board — revenue and growth overview</div><div class=\"stat-row\"><div><dvt-slot ref=\"headline-revenue\"></dvt-slot></div><div><dvt-slot ref=\"headline-growth\"></dvt-slot></div></div><div class=\"trend\"><dvt-slot ref=\"trend-chart\"></dvt-slot></div></div>"
}
```

`headline-revenue`, `headline-growth`, and `trend-chart` must each be a real `panels[]`
id — the same referential-integrity discipline as grid `items[].i` and canvas
`blocks[].ref`.

## Page rhythm — gap, padding, maxWidth, align

Four `layout` fields (Lane-1) control the page's spacing and width, on top of the grid
itself: **`gap`** (`{ x, y }` px, inter-tile gutter), **`padding`** (px, an integer for all
sides or `{ top, right, bottom, left }`), **`maxWidth`** (px, or `"none"` for
unconstrained), and **`align`** (`"left"`|`"center"`|`"right"`, or `{ preset?, x?, offset? }`
for a raw position plus a pixel nudge). Three of the four have an ambient theme-token
sibling as the next-lowest precedence tier — `gap`→`grid.xGap`/`grid.yGap`,
`padding`→`page.padding`, `maxWidth`→`page.content.width` — so a dashboard-wide default can
live in the theme while individual pages override it. `align` is spec-only: there is no
ambient alignment token, and an invented `page.align` token key would validate (tokens are
an open map) but have no effect on rendering. Per doctrine (preset → nudge → raw), every
shorthand still has a numeric sibling: `align`'s enum presets are backed by the
`{ preset, offset }` object form, and there is no `sm`/`md`/`lg` tier anywhere — dial actual
px numbers.

```jsonc
// Dense — tight KPI wall
"layout": {
  "gap": { "x": 8, "y": 8 },
  "padding": 16
  // …plus the required columns / rowHeight / items
}

// Airy — generous editorial spacing
"layout": {
  "gap": { "x": 24, "y": 20 },
  "padding": { "top": 40, "right": 44, "bottom": 56, "left": 44 },
  "maxWidth": 1280
  // …plus the required columns / rowHeight / items
}
```

`gap` and `padding` apply at ALL widths (no separate mobile knob — an explicit `gap`/`padding`, or
the ambient token, overrides the responsive default at every breakpoint). Page-scope
only — ignored in a container element's per-tab sub-grid, which keeps its own separate
defaults.

## Theme & tokens (the customization engine)

Tokens are a 3-tier tree (`primitive` → `semantic` → `component`). Any value may be
a literal (`"#4F46E5"`) or a reference (`"{color.brand-indigo}"`) — with one exception:
the **font-family** slots below are a *closed allow-set*, not free text (see
`typography.fontFamily`). Change one primitive and every chart updates. Useful tokens:

- `chart.series.1..6` — the series palette (drives chart colors automatically)
- `chart.axis.label.color`, `chart.grid.line.color`, `chart.axis.line.color` — chart chrome (retint these on dark surfaces)
- `chart.*` component style (renderer-neutral themeable defaults — ADR-0014 Amendment 1): `chart.font.family`; axis `chart.axis.label.size`/`.weight`, `chart.axis.name.size`/`.weight`, `chart.axis.tick.show`; tooltip card `chart.tooltip.background`/`.border.color`/`.border.width`/`.text.color`/`.text.size`/`.radius`/`.shadow`/`.padding`; legend `chart.legend.icon`/`.item.size`/`.gap`/`.text.size`; bars `chart.bar.maxWidth`/`.categoryGap`/`.radius`; lines `chart.line.width`/`.showSymbol`; plot insets `chart.grid.left`/`.right`/`.top`/`.bottom`. Set any in `theme.tokens.component` or a panel `overrides` block to restyle chrome without raw ECharts passthrough.
- `heatmap.low`, `heatmap.high` — heatmap value ramp endpoints
- `page.background` — the canvas behind panels (or set `page.background` per page via `pages[].background`)
- `panel.background`, `panel.border.color`, `panel.border.width`, `panel.radius`, `panel.shadow` — per-card chrome
- `panel.title.size`, `panel.title.weight`
- `panel.subtitle.size`, `panel.subtitle.weight`, `panel.subtitle.color` — per-card subtitle typography (falls back to `text.secondary`)
- `text.primary`, `text.secondary`, `text.muted`
- `typography.fontFamily` (and any `*.family` token) — a **closed allow-set, not free text**. Use exactly one of these stacks (or a `"{typography.fontFamily}"` ref): `Inter Variable, Inter, sans-serif` · `Inter, sans-serif` · `JetBrains Mono, monospace` · `JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace` · `ui-sans-serif, system-ui, sans-serif` · `ui-serif, Georgia, serif` · `ui-monospace, monospace`. An off-list stack (e.g. `"Helvetica, Arial, sans-serif"`) is **rejected with a 422 by `dvt_spec_validate`** — a font stack has no safe-literal grammar, so the schema gates it as an enum, not free text (DVT-294, ADR-0032 §A3). Brand identity is carried via the weight/tracking of the allowed faces, not a different typeface — remote font loads (e.g. Google Fonts) are also blocked by the app's CSP, so an off-list stack isn't just a 422, it can never render.

**Start lean.** Don't scaffold all three token tiers by default. Prefer `theme.preset` plus a
minimal `primitive` set (a couple of brand colors) and let the preset's `semantic`/`component`
defaults carry the rest; only author `semantic` series tokens (`chart.series.1..6`) when you
mean to override the preset's palette, and keep them as `{chart.series.N}` refs elsewhere in the
spec (`colorRules`, `annotations`, etc.) rather than repeating literal hex values.

**Per-panel overrides:** any panel may set `"overrides": { "panel.background": "#0F1E2E", "text.primary": "#E8EEF5", "chart.axis.label.color": "#8DA2B8", "chart.grid.line.color": "rgba(255,255,255,0.06)", "chart.series.1": "#5BBFBA" }`
to restyle just that card. This is how you make one panel dark, recolor a single
chart, or retint axes/gridlines — without touching the rest.

**A whole dark page, though, is `pages[].theme` — not a per-card workaround.** Since
DVT-2376 a page carries its own `theme: { preset?, overrides? }`, so an entire page
switches mood in one place: `"theme": {"preset": "exec-dark"}`, or an explicit
`"theme": {"overrides": {"panel.background": "#1E293B", "text.primary": "#E8EEF5"}}`
(worked example below). Reach for a shared dark `overrides` block on each card only
when you genuinely want *some* cards dark, not the page.

### Dashboard-scoped overrides — `theme.overrides` (DVT-1006/1008, ADR-0014 Amendment 4)

`theme.overrides` is a flat token map on `theme`, the dashboard-scoped analogue of a panel's own
`overrides` — same token keys, same `ColorTokenValue` default-deny gate, but it applies to the
**whole dashboard** instead of one card:

```json
{ "theme": {
    "tokens": { "primitive": {}, "semantic": {} },
    "overrides": { "chart.series.1": "#5BBFBA", "text.primary": "#1F2933" }
} }
```

- **Full precedence (lowest → highest):** `builtin defaults → org branding baseline →
  theme.preset → tokens.primitive → tokens.semantic → tokens.component → theme.overrides →
  pages[].theme.preset → pages[].theme.overrides → panel overrides`. `theme.overrides` sits
  **above every token tier, including `component`**, and loses only to the active page's
  `theme` tiers and to a panel's own `overrides` for the same key.
- **The page tier (DVT-2376)** is scoped to ONE page of a multi-page dashboard, so a single
  dashboard can hold a light overview page and a dark deep-dive page. Note the ordering: a
  page's **preset** sits ABOVE the dashboard's *explicit* `theme.overrides`, not below it —
  otherwise a dark page under a light dashboard override set would be inexpressible. A page's
  own `background` FIELD is not part of this cascade at all: it is the more specific explicit
  form and wins over a `page.background` token from any tier. And a CSS gradient is never a
  legal token *value* at any tier (colors are `{ref}`/hex/`rgb()`/`hsl()`/named only) — author
  a page gradient with that `background` field.
- **Core wins over authored detail, field-wise (ADR-0014 Amendment 4):** an explicitly *present*
  `theme.overrides` key (or panel `overrides` key) wins over hand-authored raw-ECharts detail for
  the same visual property — key **presence** is the signal, not which tier it lives in. Today's
  forced sinks are narrow and explicit:
  - `chart.series.N` → that series' `itemStyle.color` (bar/line/scatter)
  - `text.primary` → the chart's `textStyle.color`
  - `typography.fontSize.base` → the chart's `textStyle.fontSize`
  Everything else still wins through ordinary token resolution — no forced series/textStyle
  clobber. Ambient token tiers (`primitive`/`semantic`/`component`, and **every** preset —
  `theme.preset` and `pages[].theme.preset` alike) **never** force a value over authored detail;
  only an explicitly present `theme.overrides`, `pages[].theme.overrides`, or panel `overrides`
  key does.
- **Use sparingly, and never scaffold by default.** `theme.overrides` exists for explicit,
  dashboard-wide intent — "force every chart's primary series to this exact teal," "force this
  exact text color everywhere" — not a routine authoring habit on every new dashboard. Reach for
  `theme.preset` + a lean primitive set first (see "Start lean" above); add a `theme.overrides`
  entry only when you need to force a specific value that a token/preset wouldn't otherwise
  resolve to.

### Theme presets — `exec-light` · `exec-dark` · `exec-brand` (A7/DVT-471, ADR-0043)

For a polished starting point, set `theme.preset` to a named, pre-baked token pack instead of
hand-authoring every token:

```json
{ "theme": { "preset": "exec-dark", "tokens": { "primitive": {}, "semantic": {} } } }
```

- **Closed enum:** `exec-light`, `exec-dark`, `exec-brand`. An off-list value is **rejected by
  `dvt_spec_validate`** (and fails closed to an empty tier at resolve time).
- `theme.tokens` (with `primitive` + `semantic`) is **still required** alongside `preset` — leave
  the maps empty to take the preset as-is, or fill keys to override it.
- **Precedence (lowest → highest):** `BUILTIN_DEFAULTS → org baseline → PRESET → your primitive →
  semantic → component → theme.overrides → panel overrides`. So the dashboard's own tokens always
  win per-key, and the preset sits **above** the org baseline. See "Dashboard-scoped overrides —
  `theme.overrides`" above for the explicit-override tier between `component` and panel `overrides`.
- **Org-brand inheritance:** `exec-brand` inherits org branding by **omitting** the accent palette
  (`chart.series.1`–`6`) and the page background (`color.page` / `page.background`) — the org
  baseline beneath the preset flows through for exactly those keys. Do **not** hard-code accent or
  background tokens at the dashboard tier or you block co-branding (ADR-0037). Pick `exec-dark` for
  presentation/kiosk, `exec-light` for embedded/print/daytime, `exec-brand` when co-branding a tenant.
- The spec stays **dvt Core** — presets are just a token tier.

### Two moods in one dashboard — a worked `pages[].theme` example

A light executive dashboard with one dark deep-dive page:

```json
{
  "theme": {
    "preset": "exec-light",
    "tokens": { "primitive": {}, "semantic": {} },
    "overrides": { "chart.series.1": "#5BBFBA" }
  },
  "pages": [
    {
      "id": "overview", "title": "Overview",
      "layout": { /* … */ }, "panels": [ /* … */ ]
    },
    {
      "id": "deep-dive", "title": "Deep Dive",
      "layout": { /* … */ }, "panels": [ /* … */ ],
      "theme": {
        "preset": "exec-dark",
        "overrides": { "chart.series.2": "#F2A65A" }
      }
    }
  ]
}
```

- **Overview** carries no `theme` at all — it just inherits the dashboard cascade
  (`exec-light`, then the dashboard's own `chart.series.1` override), and costs nothing to
  leave that way.
- **Deep Dive**'s `preset` outranks the dashboard's *explicit* `theme.overrides` — see
  "Dashboard-scoped overrides" above for the full precedence chain. Its own
  `overrides.chart.series.2` is a **nudge on top of** `exec-dark`, not a restatement of it:
  `exec-dark` already sets the axis/grid/text/tooltip chrome, so only the one accent worth
  changing is retinted.
- A page's own `background` FIELD (not used here) is a separate, more specific mechanism
  outside this cascade entirely — see "Dashboard-scoped overrides" above for the carve-out,
  not a theme token.
- The dashboard's `chart.series.1` **stays an explicitly-forced key on Deep Dive** — key
  presence is the forcing signal (see "Dashboard-scoped overrides" above), and Deep Dive
  never un-forces it — but the page preset **re-values** it: Deep Dive's charts force
  `exec-dark`'s series-1 color, not the dashboard's teal. Reclaim the key in the page's own
  `overrides` to choose the forced value yourself.

### Color encoding (DVT-411 / E7)

dvt provides three declarative color-encoding directives on `ChartSpec` (all dvt Core, stripped before the ECharts option is emitted):

**`palette`** — override the series palette with a named categorical color scheme:

```json
{ "palette": "okabe-ito" }
```

Registered schemes: `okabe-ito` (colorblind-safe, 8 colors), `set2` (soft, print-safe, 8 colors), `viridis`, `magma`, `blues` (sequential), `rdbu`, `brbg`, `spectral` (diverging). An invalid name is silently ignored (keeps the default brand palette). A raw passthrough `color` array in the spec still wins.

**`colorRules`** — conditional per-datum color (bar, line, area, scatter, pie, donut). Rules are evaluated in order; the first match wins:

```json
{
  "colorRules": [
    { "when": { "field": "delta", "op": "lt", "value": 0 }, "color": "{semantic.negative}" },
    { "when": { "field": "delta", "op": "gt", "value": 0 }, "color": "{semantic.positive}" }
  ]
}
```

Operators: `lt` / `lte` / `gt` / `gte` / `eq` (numeric or string), `in` (value is an array — membership check), `between` (value is `[lo, hi]` — inclusive range). `color` may be a hex literal or a `{token}` ref. Absent columns skip the rule (no throw).

**`colorScale`** — continuous or stepped value-to-color encoding for heatmap and scatter:

```json
{ "colorScale": { "type": "sequential", "scheme": "viridis" } }
{ "colorScale": { "type": "diverging",  "scheme": "rdbu", "domainMid": 0 } }
{ "colorScale": { "type": "piecewise",  "scheme": "blues", "buckets": 5, "domain": [0, 100] } }
```

Compiles to an ECharts `visualMap`. `domain: [min, max]` overrides the auto-computed data extent. `domainMid` centers a diverging ramp. `buckets` splits a piecewise map into equal-width bins.

When a scatter sets both `colorScale` and `colorRules`, `colorRules` takes precedence per datum (a rule-matched point keeps its explicit color; unmatched points are colored by the scale).

**Semantic tokens** — built-in defaults (overridable per dashboard or org):

- `{semantic.positive}` → `#16A34A` (green-600)
- `{semantic.negative}` → `#DC2626` (red-600)
- `{semantic.warning}` → `#D97706` (amber-600)

Use these in `colorRules.color` to get consistent traffic-light color on unthemed dashboards. Override via `theme.tokens.semantic` to retheme globally.

All color values (hex, rgb, token refs) are validated through the SSRF guard (`safeChartColor`) — `image://`, `url(`, `javascript:`, and `expression(` are rejected at compile time. Raw ECharts `visualMap` and per-series `itemStyle.color` remain the Full escape hatch and win over dvt Core directives.

### Annotations (DVT-413 / E8)

dvt provides a declarative `annotations[]` array on `ChartSpec` for reference lines, shaded bands, and callout markers — the "draw a line at our goal/SLA/budget" feature. Annotations are *dvt Core* (portable, themed, validated) and are stripped before the ECharts option is emitted.

**Supported on cartesian families only** (line/area/bar/scatter/combo). Ignored on axis-less families (pie, gauge, funnel, sankey).

**Annotation types:**

- `"line"` — a full-width/height reference rule (`markLine`)
- `"band"` — a shaded range (`markArea`)
- `"point"` — a single marker at a coordinate (`markPoint`)
- `"text"` — a label callout with no symbol (`markPoint` with `symbol:"none"`)

**Placement keys:**

- `value` (number) — fixed scalar position on the chosen axis (`axis:"y"` for horizontal rules, `axis:"x"` for vertical rules)
- `from` + `to` (numbers, *band only*) — the band extent on `axis`
- `at` (string or number) — categorical or time position on the x-axis for event markers (e.g. `"2024-06-01"` or a category label); emitted as a coordinate, never evaluated
- `stat` (`"avg"` | `"median"` | `"min"` | `"max"`) — computed at compile time from the host series' bound data and emitted as a numeric literal; a stat over empty or all-non-numeric data *drops the annotation* (no NaN coordinate)

**Example — target line + average line + launch marker + target-zone band:**

```json
{
  "annotations": [
    {
      "type": "line",
      "axis": "y",
      "value": 100,
      "label": "Target",
      "style": "dashed",
      "color": "{semantic.warning}"
    },
    {
      "type": "line",
      "axis": "y",
      "stat": "avg",
      "label": "Average"
    },
    {
      "type": "line",
      "axis": "x",
      "at": "2024-06-01",
      "label": "Launch"
    },
    {
      "type": "band",
      "axis": "y",
      "from": 80,
      "to": 100,
      "label": "Target zone",
      "color": "{semantic.positive}",
      "opacity": 0.12
    }
  ]
}
```

**Per-annotation style keys:**

- `style` — `"solid"` | `"dashed"` | `"dotted"` (line type, defaults to `"dashed"`)
- `width` — line width in px for `line` annotations (defaults to the `annotation.line.width` token, `1`; clamped to `(0, 100]`)
- `color` — hex literal or token ref; validated by `safeChartColor` — `image://`, `url(`, `javascript:`, `expression(` are rejected to the default
- `opacity` — `[0, 1]` fill opacity for bands; clamped defensively at compile time
- `label` — either a **plain string** (just the text) *or* a **styled object** (DVT-493):
  - `text` (required) — the label text (truncated to 256 chars)
  - `color` — label text color (hex or token ref, `safeChartColor`-guarded). **Defaults to the mark's own color** for `line`/`point` labels (so the label reads as part of the line, not a decoupled grey); band labels default to the `annotation.label.color` token
  - `size` — font size in px (clamped to `[1, 100]`; defaults to the `annotation.label.size` token, `11`)
  - `bold` — `true` for a bold font weight
  - `italic` — `true` for an italic font style
  - `maxWidth` — max label width in px; **enables wrapping** (the text breaks onto multiple lines instead of running off the plot). Clamped to `[1, 2000]`
  - `position` (DVT-500) — placement, mapped per mark type: `line` honors `start`/`middle`/`end` (along the line, kept inside the grid); `point`/`text`/`band` honor `top`/`bottom`/`left`/`right`/`inside`. Values that don't apply to the mark type fall back to the default (line: end; point/text: top). Use it to spread several labels that would otherwise stack
  - `offset` (DVT-500) — a pixel nudge `[dx, dy]` applied to the label (e.g. `[0, 12]` bumps it down). Each component clamped to `[-1000, 1000]`
  - `rotate` (DVT-500) — label rotation in degrees, clamped `[-90, 90]`. Vertical (x-axis) event-marker labels default to `0` (horizontal) so they read normally instead of running along the line

  ```json
  { "type": "line", "axis": "y", "value": 100, "color": "#DC2626",
    "width": 2, "style": "solid",
    "label": { "text": "Hard limit — do not exceed", "bold": true,
               "maxWidth": 120, "position": "start", "offset": [0, 10] } }
  ```

  Labels are always emitted as a **static string** — no `backgroundColor`/`rich` (the `image://` SSRF sinks, ADR-0041 §5); reference-line labels default to `insideEndTop` so they stay inside the plot (DVT-492). `point` markers render as a small circle with the label above it; **lines and point/text markers are interactive** — hover shows the label + value (bands stay passive so they don't block the axis tooltip) (DVT-500).

**Annotation tokens** (`annotation.*` namespace, overridable per dashboard or org):

- `annotation.line.color` — default `#71717A` (zinc-500)
- `annotation.line.width` — default `1`
- `annotation.line.style` — default `"dashed"`
- `annotation.band.color` — default `#E4E4E7`
- `annotation.band.opacity` — default `0.12`
- `annotation.label.color` — default `#52525B`
- `annotation.label.size` — default `11`
- `annotation.point.color` — default `#71717A`
- `annotation.font` — defaults to `chart.font.family`

**Semantic tokens for annotation colors** (same traffic-light tokens as `colorRules`):

- `{semantic.positive}` → `#16A34A` (green-600)
- `{semantic.negative}` → `#DC2626` (red-600)
- `{semantic.warning}` → `#D97706` (amber-600)

**Full escape hatch:** a raw `series[].markLine` / `series[].markArea` / `series[].markPoint` set directly on a series is the ECharts passthrough (`layer:echarts`) and takes precedence over dvt-layer annotations for that series. dvt *defensively themes* these raw marks — the neutral annotation defaults are merged underneath the author's mark (so the escape hatch no longer renders raw ECharts blue), and every color leaf is run through `safeChartColor` to block `image://` SSRF values.

#### Query-bound thresholds (DVT-419)

Two additional placement keys let an annotation read its scalar position from the panel's **own result rows** rather than a literal — join your target or SLA value into the query (e.g. via `CROSS JOIN` or a subquery that broadcasts it as a repeated constant column) and point the annotation at that column. An absent or all-non-numeric column **drops the annotation silently** at render time (the server cannot see live query columns; this is by design per ADR-0011).

- `valueField` (string) — take the **first finite numeric value** of that named column across the result rows (case-tolerant: exact match wins, then case-insensitive unique match). Applies to `line`, `point`, and `text` types.
- `of` (string) — used together with `stat` to compute the stat over a **named result column** instead of the host series' bound data. Without `of`, `stat` keeps its original meaning (computed over the host series' values).

Placement precedence: `stat` → `valueField` → `value` (literal) → `at` (categorical, `line` only).

```json
{ "type": "line", "axis": "y", "valueField": "plan_target", "label": "Plan" }
```

```json
{ "type": "line", "axis": "y", "stat": "avg", "of": "revenue", "label": "Avg revenue" }
```

### Trendline (DVT-3219)

`trendline` is a *dvt Core* sugar key on `ChartSpec` — a fitted regression line overlaid on a chart, computed via an ECharts `ecStat:regression` dataset transform without touching the host series (its own `data`/`itemStyle`/`symbolSize` are left exactly as compiled — including its own `encode`/`datasetIndex`, when present: the fit runs over the SAME dataset entry and columns the host series plots, never a hardcoded default). 🔴 **The host is always `series[0]`, unconditionally — there is currently no way to target a different series.** It is stripped before the ECharts option is emitted, and never clickable/hoverable on its own (`silent:true` by default; excluded from a panel's `clickAffordance` unconditionally, since it's ecStat's fit output — a formula string standing in for one point's real datum, points re-sorted by x — never a real data mark).

**Two authored forms:**

```json
{ "trendline": true }
```

```json
{ "trendline": { "method": "polynomial", "order": 2 } }
```

`true` is shorthand for `{ "method": "linear" }`. `method` is one of `linear` (default), `exponential`, `logarithmic`, `polynomial`; a value outside those four invalidates the whole key (no silent fallback to linear — a typo must not look like it worked). `order` (integer ≥ 1) sets the polynomial degree.

🔴 **`order` is meaningful only for `method:"polynomial"`** — for any other method it's dropped before the emitted transform config is built at all, never reaching `ecStat:regression`. Author it only alongside `polynomial`.

**Applies to `chart:scatter` and to dataset-shaped cartesian specs today** — a `series[]` entry that points at a top-level `dataset` via `encode`/`datasetIndex` (no `dataField`), the same dataset-shaped path scatter panels compile through (DVT-3219 D3 piece 1). 🔴 **A category-axis `chart:bar`/`chart:line`/`chart:area` (the ordinary query-bound shape, no authored `dataset`) is a documented NO-OP TODAY** — those compile to a flat scalar `series[0].data` array (`[10,20,15]`), which `trendline`'s positional `[x,y]`-tuple reader can't use; widening it to that family is tracked in DVT-3360, not yet built. It is also a silent no-op on every non-cartesian family (pie, gauge, funnel, sankey, …) — the same primary gate `annotations` uses (`option.xAxis`/`option.yAxis`).

**Axis inheritance:** the emitted fit series inherits the host series' `xAxisIndex`/`yAxisIndex` (and `xAxisId`/`yAxisId`, when the host declares them) — on a dual-axis or multi-grid chart, the fit plots against the host's own axis rather than ECharts' default axis 0.

**Escape hatch:** any key besides `method`/`order` (e.g. `name`, `lineStyle`, `showSymbol`, `z`) passes through onto the emitted line series — the ejectable-macro doctrine, never a gate. This includes a **mistyped** key (e.g. `"methd"` instead of `"method"`): it validates (schema `additionalProperties:true`) and spreads onto the emitted line series as inert junk rather than erroring — the ejectability doctrine working as intended, not a key allow-list. 🔴 One key is not purely additive like the others: passing `yAxisIndex` (or `xAxisIndex`/`xAxisId`/`yAxisId`) through `trendline` **overrides** the axis binding inherited above, rather than merely setting a fresh default:

```json
{ "trendline": { "method": "linear", "name": "Trend", "lineStyle": { "color": "#71717A", "type": "dashed" } } }
```

🔴 The passthrough can go further than styling: an authored `datasetIndex`/`data`/`silent:false` overrides the appended series into a real, independently-plotted data series rather than a fit line — it still stays excluded from a panel's `clickAffordance`, because that exclusion is by the series' *index* in `option.series`, not by what the series contains.

**Legend interaction — measured, not assumed:**

- Auto-legend eligibility is decided *before* `trendline` appends its series (the auto-legend check runs as part of the base chart compile; `trendline` is a later, cross-cutting enrichment). A solo scatter/line with `trendline` does **not** get an auto-legend — at the moment that decision is made, only the host series exists.
- Where a legend already exists (≥2 series, or an explicit `legend:{}` with no `data`), the appended trendline series does **not** intrude on it by default — ECharts filters unnamed series out of the legend at render time.
- 🔴 **A declared `legend.data` wins**, regardless of `name`: an author who lists specific series names in `legend.data` gets exactly that legend — an unnamed (or even a named) trendline series is excluded unless its `name` is itself listed there.
- To put the trendline **in** an auto-populated legend, set `name` via the passthrough — ECharts reads series names live from `option.series` at render, so a named trendline series does appear in a pre-existing legend (as long as no `legend.data` list overrides it, per above).

### Chart footnotes and source note (DVT-569, ADR-0045 §3)

*dvt Core.* `ChartSpec.footnotes[]` and `ChartSpec.sourceNote` mirror the table footnotes vocabulary (DVT-517) for charts — rendered as a notes block beneath the chart visualization.

- **`footnotes[]`** — array of `{ text, mark?, where?: { column } }`. `where.column` anchors the superscript to a matching series or axis label; omit `where` and the note appears in the block without an anchor.
- **`sourceNote`** — string rendered after any `footnotes[]` as a source-attribution line.

Both `text` and `sourceNote` are **sanitized markdown** (https/mailto links only; no raw HTML).

```jsonc
{
  "type": "chart:bar",
  "data": { "sourceId": "db", "query": "SELECT quarter, SUM(revenue) AS revenue FROM analytics.public.orders GROUP BY 1" },
  "spec": {
    "series": [{ "type": "bar", "dataField": "revenue" }],
    "footnotes": [
      {
        "where": { "column": "revenue" },
        "text": "Revenue recognized at contract close date; excludes refunds."
      }
    ],
    "sourceNote": "Source: [analytics.public.orders](https://docs.example.com/orders)"
  }
}
```

See "Document as you build" below for when to add footnotes vs. intent/assumptions.

## Formats

`format` objects are dvt's portable number-display vocabulary (dvt Core) — they compile to a formatter at render time so a spec stays declarative (no JS). One shape, reused everywhere a value is rendered: table columns, `valueFormat`, axis labels, tooltip fields, value labels, funnel rates.

`{ "type": "currency"|"percentage"|"number"|"compact"|"date", "decimals": 1, "currency": "USD", "compact": true, "prefix": "~", "suffix": " /mo", "locale": "en-US" }`

- **type** — `number` (grouped), `currency` (with `currency` ISO code), `percentage` (input is a whole-number percent — `12.5` → `12.5%`), `compact` (1234567 → `1.2M`), `date`.
- **decimals** — fixed decimal places.
- **compact** — K/M/B/T notation; combine with `currency` for `$1.2M`.
- **prefix / suffix** — arbitrary affixes wrapped around the formatted value (empty/blank values stay blank — no bare affix).
- **locale** — BCP-47 separators; defaults to `en-US` for deterministic output.

Place a format where a value renders: `"axisLabel": { "format": {…} }`, a table column `format`, `valueFormat` on a chart, a `tooltip.fields` entry, or a value `label` (see "Number display" above).

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
2. **Panel by panel.** `dvt_element_create` each panel (~1–2KB each), narrating as you go ("page 1/3: panel 4/6 — revenue trend"). **Always pass an explicit, stable `slug`** derived from the panel's title/id in the design (e.g. `revenue-trend`) — never leave it empty. An empty slug is regenerated fresh on every call, so a lost-response retry after a create that actually landed will duplicate the panel; an explicit slug makes the create idempotent (see step 4). Pass the optional per-breakpoint `layout` param when your design carries responsive (md/sm) geometry; flat x/y/w/h is fine otherwise. Create later pages with `dvt_page_create` as you reach them; fix ordering at the end with `dvt_pages_reorder`.
3. **Render checkpoint per page — never per panel.** `dvt_dashboard_render_inline` after each page completes. The render budget is 10/hour per org; a per-panel cadence will exhaust it mid-build.
4. **If one element fails,** surface the server's Problem `detail`/`suggestion` verbatim and retry that one element — the retry re-sends 1–2KB, not the whole spec. This retry is safe **because** step 2's explicit slug makes it idempotent: if the original create actually landed and only the response was lost, the retry gets a 409 slug-taken — treat that as success (the panel is already there) and move on, don't error out or duplicate it. A briefly incomplete dashboard is expected here; the user is watching it assemble.
5. **Final integrity pass.** Run `dvt_spec_validate` on the full spec you assembled and applied (already in context — no need to re-fetch it) and surface any remaining `collision`, `data-binding`, `interaction-stranding`, and provenance warnings to the user. (`dvt_dashboard_check_overlap` is the pre-build duplicate-content search from the Authoring method's step-1 data audit — not an integrity check; don't re-run it here.) Then `dvt_dashboard_get(format="concise")` the persisted dashboard for its `layoutSummary` — the final, ground-truth layout (built page-by-page, so it may differ from what you narrated mid-build) — this is what becomes the closing table (§5).

**Headless/scheduled runs (no user watching): keep the single full-spec apply** — transactional, all-or-nothing; never leave a half-built dashboard unattended.

Record which persist path you took in `meta.decisions` (e.g. `"Persist: incremental (interactive)"` or `"Persist: single apply (headless run)"`).

### 5. Build, then SEE it — verify and iterate

Headless/batch net-new builds persist via the single-apply path below; interactive net-new builds persist via the incremental flow in §4b above. **Surgical edits do not use either** — an edit scoped to one element, one page, or `spec.meta` persists through its own patch route (`dvt_element_patch` / `dvt_page_patch` / `dvt_dashboard_meta_patch`, §"Choosing your approach"), not by re-sending the spec. Re-send only when the patch route itself refuses the edit — e.g. a `layout.mode` transition, `dvt_page_patch`'s single-page restriction, or a `legacy-dashboard` 409 on a dashboard predating granular editing — which is a documented fallback, not the default. Read the refusal rather than assuming: the `legacy-dashboard` and single-page cases are 409s whose `suggestion` names the full re-apply outright, but a `layout.mode` change comes back as a **400 `invalid-patch`** whose `suggestion` merely lists which page paths *are* patchable — treat that one as "not through this route", not as "malformed patch, retry".

1. Write the spec (mechanics above). Bind each panel to a fully-qualified `query`.
2. Validate with `dvt_spec_validate` — fix field errors and heed `warnings` (typos, and panels that will render EMPTY).
3. **Render and actually look at it:** `dvt_dashboard_render_inline` at desktop (`width` ~1280–1440) AND mobile (`width` ~390–414), for each `page`. Read the image: is there a clear headline? Any unreadable text, squished labels, empty panels, flat bars? Does it answer the question?
4. Iterate on what you saw, then save via the API / MCP. **Don't ship a dashboard you haven't looked at.**

**When render-verify is unavailable (DVT-1014).** Render depends on the dvt-render (Chromium)
service, a heavier path than the JSON API. From some hosted MCP/agent sessions
`dvt_dashboard_render_inline` fails with `api_unreachable` (a transport-level failure on the
long-held inline request) or `api_timeout` **even when plain calls — `dvt_data_query`,
`dvt_dashboard_get` — succeed against the same API**. That means the render dispatch path is
unavailable in this context, NOT that the API is down; don't report it as an outage and don't
retry it in a loop. Fall back to structural verification — `dvt_spec_validate` plus
`dvt_data_query` on each panel's SQL — or run render-verify from a local `make dev` context
where the render service is reachable. Say which verification you actually did.

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

## Document as you build — self-documenting dashboards (ADR-0045)

The agent authors the spec — so the agent should document it. dvt's Documentation Layer (ADR-0045) gives you a structured place to record **why** each element exists, **what assumptions** it rests on, and **what caveats** a reader needs. Writing this at authoring time costs almost nothing; reconstructing it from a cold read later is expensive.

### Two audiences, two field families

The doc layer distinguishes two scopes:

| Audience | Where | Fields | Rendered? |
|---|---|---|---|
| **Human / exposed** | `ChartSpec.footnotes[]` / `sourceNote`, `TableSpec.footnotes[]` / `sourceNote`, `Page.doc.description`, `Page.doc.intent` | Footnotes, source attribution, page description/intent | Yes — rendered in chart/table notes block and the docs drawer |
| **Research / agent** | `Page.doc.assumptions[]`, `Page.doc.notes`, `meta.panels[id].purpose`, `meta.panels[id].intent`, `meta.panels[id].assumptions[]`, `meta.panels[id].notes` | Analytical assumptions, data-quality caveats, element rationale | No — read over MCP, never rendered in the UI |

Use **exposed fields** for caveats, source attribution, and narrative context that human readers should see. Use **research fields** to document the analytical reasoning that an AI agent needs to reproduce or extend the dashboard.

### Chart footnotes and source attribution

`ChartSpec.footnotes[]` + `ChartSpec.sourceNote` — see "Chart footnotes and source note" above for the full reference. Use whenever a metric has a definition caveat or a data-source citation a viewer needs:

```jsonc
{
  "type": "chart:line",
  "spec": {
    "series": [{ "type": "line", "dataField": "arr" }],
    "footnotes": [
      { "where": { "column": "arr" }, "text": "ARR computed at contract start date; excludes expansions mid-period." }
    ],
    "sourceNote": "Source: analytics.public.contracts"
  }
}
```

### Page documentation (`Page.doc`)

`Page.doc` attaches to a page object inside `pages[]`. `description` and `intent` are **exposed** — rendered as sanitized inline markdown in the docs drawer. `assumptions[]` and `notes` are **research-audience** only.

```jsonc
{
  "id": "pipeline",
  "title": "Pipeline Health",
  "doc": {
    "description": "Open pipeline as of the last CRM sync. Excludes closed-won and closed-lost.",
    "intent": "Enable the VP of Sales to identify whether pipeline coverage (3× quota) is on track before the weekly forecast call.",
    "assumptions": [
      {
        "text": "CRM sync runs nightly at 02:00 UTC; same-day closes may not appear until tomorrow.",
        "assertedBy": "agent"
      }
    ],
    "notes": "stage_order column drives the funnel sequence; reorder the lookup table to change funnel stage ranks."
  }
}
```

`ProvenanceClaim` shape: `{ "text": string, "assertedBy": "agent" | "human", "validatedAt"?: ISO-8601 }`. **Never emit an `assumptions`/`conclusions` entry without `assertedBy`** — every claim you author is either `agent` (your own inference) or `human` (a human explicitly confirmed it in this conversation); there is no unlabeled default. `agent` is the honest default for AI-asserted assumptions — use `assertedBy: "human"` only when a human has explicitly confirmed the claim. Both `assertedBy` and `validatedAt` are **author-asserted, not server-attested**: the server does not verify who actually wrote the claim, so never claim `assertedBy: "human"` (or set `validatedAt`) unless a human genuinely said so in-session. An honest `agent`-asserted, unvalidated claim is a known, surfaced epistemic gap (a Tier-3 `info` nudge) — not an error, and far better than a false attestation.

### Element intent and assumptions (`meta.panels[id]`)

Per-element documentation lives in the dashboard manifest at `meta.panels`, keyed by panel `id`. These fields are **agent-facing** — never rendered in the UI, read over `dvt_dashboard_docs`. They let a future agent understand what decision each panel informs and what analytical choices were made.

```jsonc
{
  "meta": {
    "title": "Pipeline Health",
    "brief": "3× coverage holds in ENT; SMB slipping.",
    "panels": {
      "pipeline-funnel": {
        "purpose": "Show stage-by-stage conversion so the team can see where deals stall.",
        "serves_question": 0,
        "intent": "Highlight the Proposal→Negotiation drop, which is the bottleneck this quarter.",
        "assumptions": [
          {
            "text": "Win rate denominator is all deals reaching Proposal stage, not total created.",
            "assertedBy": "agent"
          }
        ],
        "notes": "If deal volume is <20 per stage, funnel rates become statistically noisy — caveat verbally in the forecast meeting."
      }
    }
  }
}
```

`serves_question` is a zero-based index into `meta.keyQuestions` — the dashboard-level list of the questions the dashboard is designed to answer. An out-of-range index logs a ProvenanceCheck WARN; omit for decoration/navigation panels.

**Editing this documentation after the build** — everything on this page lives in `spec.meta`, and you can patch it in place with `dvt_dashboard_meta_patch` (see "Choosing your approach" above): dashboard-level fields at `/brief`, `/keyQuestions`, `/assumptions`, `/conclusions`, `/decisions`, `/findings`, `/readme`, `/dataAsOf`, and per-panel provenance at `/panels/{panelId}`. Reach for it whenever documentation is the only thing changing — re-applying the whole spec through `dvt_dashboard_apply_spec` just to correct a `purpose` string re-keys every element and resets its revision history, which is exactly what you want to avoid on an existing dashboard. `documentationStale` is server-set and cannot be patched at either level; `/createdBy` is immutable.

### Researching existing dashboards with `dvt_dashboard_docs`

Before authoring a new dashboard that covers the same subject area as an existing one, call `dvt_dashboard_docs` to read the existing dashboard's full documentation tree. It returns:

- **`provenance`** — dashboard-level meta (brief, purpose, audience, keyQuestions, assumptions, conclusions, findings, tags, readme, decisions, dataAsOf).
- **`pages[*].doc`** — per-page description, intent, assumptions, notes.
- **`elements[*]`** — per-element purpose, intent, assumptions, notes, plus **`sql`** — the raw stored `data.query` for each element.

The SQL is a **read-only reference** — dvt exposes it so you can understand exactly how each metric was built (joins, filters, grain, table names). dvt never executes it via this tool (ADR-0011). If you want to run the SQL, execute it yourself in your warehouse CLI (snowsql, psql, bq, etc.).

```
dvt_dashboard_docs(dashboard_id="<uuid>")
```

**When to call it:**

- You are authoring a dashboard that should reuse a metric definition already captured in another dashboard. Pull the SQL from `elements[*].sql` so you copy the exact join/filter logic rather than re-deriving it.
- You need to understand the analytical assumptions behind another team's numbers before building a comparison or follow-on analysis. Read `elements[*].assumptions` instead of guessing.
- You want to confirm data freshness or scope before citing another dashboard's numbers. Check `provenance.dataAsOf` and `provenance.assumptions`.

This tool is far cheaper than `dvt_dashboard_get(format="full")` when you only need the documentation — it omits the heavy ECharts/layout spec payload.

### Quick reference — which field to use

| What you want to express | Field | Audience |
|---|---|---|
| Where this data comes from | `sourceNote` (chart or table) | Human |
| Metric definition caveat | `footnotes[*].text` (chart or table) | Human |
| What this page is about | `Page.doc.description` | Human |
| Why this page exists / what decision it supports | `Page.doc.intent` | Human |
| Analytical assumptions behind this page | `Page.doc.assumptions[]` | Agent / research |
| Data-quality caveats for this page | `Page.doc.notes` | Agent / research |
| Why this element exists | `meta.panels[id].purpose` | Agent / research |
| Which key question this element answers | `meta.panels[id].serves_question` | Agent / research |
| What decision this element informs | `meta.panels[id].intent` | Agent / research |
| Metric-level assumptions (joins, filters, grain) | `meta.panels[id].assumptions[]` | Agent / research |
| Data-quality caveats for this element | `meta.panels[id].notes` | Agent / research |

## Data sources & querying (`dvt_data_query`)

Every panel's `data.query` runs against a dvt **data source**. `dvt_data_query` runs the
same SQL ad-hoc, through the same pushdown engine: dvt pushes the SQL down, the caller's
warehouse executes it, only result rows come back. The warehouse role and any
statement-timeout on that role bound what a query can do and how long it may run.

### Naming a source — `source_id`

`source_id` is the data source's **NAME**, not a UUID. Find it on an element's `sourceId`
(via `dvt_dashboard_get`) or in the workspace's data-sources list.

- **Omit it** (or pass `""`) to query **`demo-postgres`** — a shared, read-only sample
  Postgres every workspace can query with no connection setup at all. This is the easiest
  way to explore dvt or test a query shape before a real warehouse connection exists.
- In **snowflake native mode** (`DVT_MODE=snowflake`) the app boot-provisions exactly one
  secretless, caller's-rights source named **`Host Snowflake`**. Pass
  `source_id="Host Snowflake"` to run against the caller's own Snowflake account.

### Table naming depends on the source type

| Source type | Table reference |
|---|---|
| Warehouse (Snowflake, BigQuery, Databricks SQL, Redshift, Postgres, …) | **fully-qualified** `database.schema.table` |
| `csv` | **bare** table name — the source's own sanitized name |
| `google_sheets` | **bare** table name — one table per tab |

Warehouse connections may carry no default database/schema, so an unqualified
`FROM orders` can fail; `Host Snowflake`'s caller's-rights session pins no default
database/schema either. Fully-qualified names are also deterministic regardless of
session context and role defaults. Never rely on an implicit current db/schema.

csv and google_sheets are the **opposite** — a database/schema qualifier is an error.

**`google_sheets` tab names.** Every tab in the spreadsheet is one queryable table:
`SELECT … FROM <tab>`, with no spreadsheet-name or connection-name prefix. The table name
is the tab's title sanitized to a SQL identifier:

1. lowercased,
2. each non-alphanumeric character replaced with `_`,
3. a `t_` prefix added if the result would otherwise start with a digit,
4. `_2`, `_3`, … appended to disambiguate tabs whose titles sanitize to the same name.

So a tab titled `"Q1 2026"` becomes `q1_2026`; a second tab that also sanitizes to
`q1_2026` becomes `q1_2026_2`. If unsure of a source's exact table names, describe the
source or inspect a prior successful query's `columns` — don't guess from the tab labels.

### `Host Snowflake` — the shared-object rule (DVT-1767)

Shared (imported) databases — `SNOWFLAKE.ACCOUNT_USAGE`, `SNOWFLAKE_SAMPLE_DATA`, any
Marketplace or data-share import — **cannot be queried directly** under caller's rights.
Snowflake forbids CALLER grants on shared objects, so such queries always fail, and a
panel authored against one always fails too. Wrap the shared data in an **owned** table,
view, or model first and query that:

```sql
create view my_db.my_schema.v as select ... from snowflake.account_usage....
```

Owned objects additionally need a CALLER grant to the APPLICATION — granted **once
per database** (not per object); `INHERITED CALLER` on the `ON ALL` form cascades by
containment, covering schemas/tables/views created later too:

```sql
grant caller usage on database <db> to application <app>;
grant inherited caller usage on all schemas in database <db> to application <app>;
grant inherited caller select on all tables in database <db> to application <app>;
grant inherited caller select on all views in database <db> to application <app>;
```

### Execution paths and result shapes

- **Fast path** — when `ASYNC_QUERY_ENABLED` is off on the Go API, or a cached result is
  immediately available, the endpoint returns 200 and the tool returns the result directly:
  one call, one result. The tool is therefore useful even before the flag is enabled.
- **Async path** — longer warehouse queries return 202 and the tool polls to completion
  (budget ~2 minutes; 1s ticks for the first 10s, then 2s). If the poll window is exhausted
  the in-flight record comes back with `status:"running"` and a `note` pointing at
  `dvt_data_query_status`. Use `dvt_data_query_cancel` to abort a job you no longer need.

| Outcome | Shape |
|---|---|
| succeeded | `{status:"succeeded", columns, rows, rowCount, …}` |
| failed | `{status:"failed", error, elapsed_ms}` |
| canceled | `{status:"canceled", elapsed_ms}` |

If a query succeeded but its result cache has since expired (rare), the record is returned
as-is with a `note` advising a re-run — there is no result to surface in that case.

**Errors.** A 409 `oauth-consent-required` means the source needs OAuth re-authorization in
the dvt UI before queries can run. A 403 means the caller's API key lacks permission to
query this source.

## Scheduled exports (DVT-731, DVT-791, ADR-0051)

Recurring PDF or PNG exports let a dashboard deliver itself on a schedule — no human
has to remember to check.  **Use a scheduled export** when someone wants the same
dashboard on a recurring cadence (a Monday exec digest, an end-of-month report);
**use a one-off render** (`dvt_dashboard_render`) when they want the artifact once,
right now.  Six tools cover the full lifecycle:

| Tool | Verb | Permission | Purpose |
|------|------|-----------|---------|
| `dvt_export_schedule_preview` | dry-run | `dashboard:write` | Validate a recurrence and see the next fire times **before** creating/updating — persists nothing |
| `dvt_export_schedule_create`  | write   | `dashboard:write` | Create a schedule, add recipients, wire webhook destinations (Slack / Teams / Google Chat) in one call; optionally scope to a single chart panel (`panel_id`, PNG-only) or a single page (`page_id`, pdf/png) |
| `dvt_export_schedule_list`    | read    | `dashboard:read`  | List all schedules for a dashboard |
| `dvt_export_schedule_get`     | read    | `dashboard:read`  | Fetch one schedule with its recipients + run state |
| `dvt_export_schedule_update`  | write   | `dashboard:write` | Partially update a schedule (merge patch) |
| `dvt_export_schedule_delete`  | write   | `dashboard:write` | Permanently delete a schedule and its run history |

**Recommended agent workflow:** `preview` the recurrence → `create` the schedule →
`list`/`get` to confirm → `update` to adjust → `delete` when retired.  Previewing
first turns an opaque cron string into concrete timestamps you can sanity-check
against the audience's calendar, so you never ship a schedule that fires at 3am.

### Previewing a recurrence — `dvt_export_schedule_preview`

The "see before committing" tool.  Call it before `create` or `update` to confirm
a cron or preset fires at the intended wall-clock times — it validates the
expression and returns the next fire times **without persisting anything**.

```
dvt_export_schedule_preview(
    dashboard_id = "<uuid>",
    cron         = "*/15 9-17 * * 1-5",   # every 15 min, 9am–5pm, weekdays
    timezone     = "America/New_York",
    count        = 5,                       # next N occurrences (default 5, clamped 1–20)
)
# → { "cron": "*/15 9-17 * * 1-5",
#     "timezone": "America/New_York",
#     "nextRuns": ["2026-06-30T13:00:00Z", "2026-06-30T13:15:00Z", ...] }  # UTC
```

Supply `cron` **or** `preset` (same preset shape as `create`), not both.  The cron
is evaluated in `timezone` (IANA name, default `UTC`); every returned `nextRuns`
timestamp is in UTC.  On bad input the tool returns a structured error whose message
describes the exact validation failure — a bad cron expression or unknown timezone
(the server's rejection reason is carried in the error `detail`), or supplying both
or neither recurrence (caught with a `suggestion` before the call is made).

> The Go API is the **only** cron parser in the stack — the engine and web both defer
> to it (DVT-746).  Preview therefore returns the same fire times the server runner
> will actually use, so what you preview is what you get.

### Creating a schedule — `dvt_export_schedule_create`

One tool call composes the full setup: create the schedule, add email recipients,
and wire webhook destinations (Slack, Teams, or Google Chat).

```
dvt_export_schedule_create(
    dashboard_id = "<uuid>",
    format       = "pdf",           # "pdf" | "png"
    preset       = { "kind": "weekly", "dayOfWeek": 1, "atHour": 9 },
    timezone     = "America/New_York",
    title        = "Monday morning exec digest",
    recipients   = ["ceo@acme.com", "cfo@acme.com"],
    slack_channels = [
        { "label": "#leadership", "webhook_url": "https://hooks.slack.com/services/…" },
        { "label": "exec-team", "webhook_url": "https://prod-12.westus.logic.azure.com/workflows/…",
          "kind": "teams_workflows" },
    ],
)
```

**Recurrence — pick one, not both:**

- **`cron`** — a raw 5-field POSIX expression (`"MIN HOUR DOM MON DOW"`).  Use when
  you need a schedule that no preset can express (e.g. every 15th and last day of
  the month).  Validation is server-side; a 400 response carries a `suggestion` with
  the corrected form.
- **`preset`** — the simpler, self-documenting option for common patterns:

  | `kind`    | Extra fields                              | Example cron |
  |-----------|-------------------------------------------|--------------|
  | `hourly`  | `atMinute` (default 0)                    | `"0 * * * *"` |
  | `daily`   | `atHour`, `atMinute`                      | `"0 9 * * *"` |
  | `weekly`  | `atHour`, `atMinute`, `dayOfWeek` (0=Sun) | `"0 9 * * 1"` |
  | `monthly` | `atHour`, `atMinute`, `dayOfMonth` (1–28) | `"0 9 15 * *"` |

Always supply `timezone` (IANA name, e.g. `"America/New_York"`) so the cron fires
at the right wall-clock time for the audience — default is `UTC`.

**Element-grain exports (`panel_id`):** supply a panel id to export a single chart
rather than the whole dashboard.  The server enforces PNG for panel-scoped schedules
— always set `format="png"` when providing `panel_id`.  Panel ids come from the
`panels[*].id` field in the dashboard spec; use `dvt_dashboard_get` to enumerate them.

```
dvt_export_schedule_create(
    dashboard_id = "<uuid>",
    panel_id     = "panel-revenue-trend",   # scope to one chart
    format       = "png",                   # required when panel_id is set
    preset       = { "kind": "daily", "atHour": 8 },
    timezone     = "America/Chicago",
    slack_channels = [{ "label": "#revenue", "webhook_url": "https://hooks.slack.com/services/…" }],
)
```

**Page-grain exports (`page_id`):** supply a page id to export a single dashboard
page rather than the whole dashboard (DVT-1193).  Page ids come from the
`pages[*].id` field in the spec; use `dvt_page_list` or `dvt_dashboard_get` to
enumerate them.  Both `"pdf"` and `"png"` formats are supported (no PNG-only
restriction — a page is a full layout).  Only multi-page dashboards have
addressable pages: a single-page dashboard (top-level `panels`, no `pages[]`)
returns a 400 — schedule the whole dashboard instead.  `page_id` and `panel_id`
are mutually exclusive; a schedule targets the whole dashboard, one page, or one
chart, never a combination.

```
dvt_export_schedule_create(
    dashboard_id = "<uuid>",
    page_id      = "pipeline-health",       # scope to one page
    format       = "pdf",                   # pdf or png — both allowed
    preset       = { "kind": "weekly", "atHour": 8, "dayOfWeek": 1 },
    timezone     = "America/Chicago",
    recipients   = ["exec-team@example.com"],
)
```

**Recipients:** internal org members are `active` immediately; external addresses
enter `pending_approval` and must be approved by a dashboard owner or org admin
before they would receive deliveries.

**Webhook destinations (`slack_channels`):** three destination kinds are supported
(ADR-0051 §9, DVT-864).  Each entry in `slack_channels` needs `label` (a friendly
name) and `webhook_url`.  `kind` is optional and defaults to `"slack_webhook"`.

| `kind` | URL pattern | How to obtain the URL |
|--------|------------|----------------------|
| `slack_webhook` (default) | `https://hooks.slack.com/<path>` — https, exact host, no port, non-empty path | Slack → *Apps → Incoming Webhooks → Add to Slack* |
| `teams_workflows` | `https://<label>.logic.azure.com/workflows/<path>` — port absent or 443 (integer-equal), no userinfo | Microsoft Teams → *Power Automate → Workflows → "Post to a channel when a webhook request is received"* |
| `google_chat` | `https://chat.googleapis.com/v1/spaces/<path>` — exact host, no port, no userinfo | Google Chat Space → *Apps & integrations → Webhooks* |

URL rules are enforced server-side (ADR-0051 §9) and the tool surfaces a 400 with a
`suggestion` on mismatch.  The webhook secret is never returned on any read path
(ADR-0012).

### Listing schedules — `dvt_export_schedule_list`

```
dvt_export_schedule_list(dashboard_id="<uuid>")
```

Returns all schedules for the dashboard.  The `recipients` (email + approval status)
and `destinations` (webhook destination label + kind + last delivery status) arrays
are populated only for `dashboard:write` callers (split read model — PII protection);
read-only callers see schedule metadata only.  The webhook secret is never included in
any read response (ADR-0012).

### Fetching one schedule — `dvt_export_schedule_get`

```
dvt_export_schedule_get(dashboard_id="<uuid>", schedule_id="<uuid>")
```

Returns the full `ExportSchedule` record for a single schedule, including its
recurrence (`cron`, `timezone`), `format`, `enabled` flag, run state (`nextRunAt`,
`lastRunAt`), and — when present — `panelId` (element-grain scope).  As with `list`,
the `recipients` (email + approval status) and `destinations` (webhook destination
label, `kind`, and last delivery status) arrays are populated only for
`dashboard:write` callers; absent/empty for read-only callers.  The webhook secret
is never included in any read response (ADR-0012).  A 404 means the schedule or
dashboard is not visible to the caller's key.

Per-delivery run logs are **not** surfaced here — only the schedule-level
`lastRunAt`.  A dedicated runs endpoint is deferred (DVT-744).

### Updating a schedule — `dvt_export_schedule_update`

A merge patch: only the fields you pass are changed; omit a field to leave it as-is.

```
dvt_export_schedule_update(
    dashboard_id = "<uuid>",
    schedule_id  = "<uuid>",
    preset       = { "kind": "weekly", "dayOfWeek": 5, "atHour": 17 },  # move to Fri 5pm
    enabled      = false,                                               # pause it
)
```

Patchable fields: `title`, `format`, `enabled`, `timezone`, and the recurrence
(`cron` **or** `preset` — not both; omit both to leave the recurrence unchanged).
`timezone` is independently patchable: change it alone to shift an existing schedule
to a new wall-clock zone without touching its cron.  When `cron` or `timezone`
changes, `next_run_at` is recomputed atomically server-side, so the next fire
reflects the new recurrence immediately.

**Out of scope:** this tool does not edit recipients or webhook destinations — manage
those via the REST `…/recipients` and `…/destinations` endpoints (a dedicated MCP
tool for recipient/destination mutation is a planned follow-up).

**Tip:** run `dvt_export_schedule_preview` with the new recurrence first to confirm
the fire times before patching.

### Deleting a schedule — `dvt_export_schedule_delete`

```
dvt_export_schedule_delete(dashboard_id="<uuid>", schedule_id="<uuid>")
```

Hard delete — removes the schedule, all recipients, all webhook destinations, and the
full delivery run history.  Irreversible.  Confirm the schedule id from
`dvt_export_schedule_list` before calling.

### Worked example — from a request to a confirmed schedule

> **User:** "Post the revenue dashboard to our #finance Slack every weekday morning
> at 8am Eastern."

**1 — Preview the recurrence first** (turn the ask into concrete fire times the user
can confirm; nothing is persisted yet):

```
dvt_export_schedule_preview(
    dashboard_id = "rev-dash-uuid",
    preset       = { "kind": "daily", "atHour": 8, "atMinute": 0 },  # weekday-only → see note
    timezone     = "America/New_York",
)
# → nextRuns: ["2026-06-30T12:00:00Z", "2026-07-01T12:00:00Z", ...]  (08:00 EDT = 12:00Z)
```

The `daily` preset fires every day; "every weekday" needs a raw cron, so preview that
instead and confirm it skips the weekend:

```
dvt_export_schedule_preview(
    dashboard_id = "rev-dash-uuid",
    cron         = "0 8 * * 1-5",        # 08:00, Mon–Fri
    timezone     = "America/New_York",
)
# → nextRuns: ["2026-06-30T12:00:00Z" (Tue), ... skips Sat/Sun ...]
```

**2 — Create the schedule** with the confirmed cron and the webhook destination:

```
dvt_export_schedule_create(
    dashboard_id   = "rev-dash-uuid",
    format         = "pdf",
    cron           = "0 8 * * 1-5",
    timezone       = "America/New_York",
    title          = "Weekday revenue digest → #finance",
    # kind defaults to "slack_webhook"; use "teams_workflows" or "google_chat" for other platforms
    slack_channels = [{ "label": "#finance", "webhook_url": "https://hooks.slack.com/services/…" }],
)
# → { "id": "sched-uuid", "nextRunAt": "2026-06-30T12:00:00Z", ... }
```

**3 — Confirm** the schedule is wired as intended:

```
dvt_export_schedule_get(dashboard_id="rev-dash-uuid", schedule_id="sched-uuid")
# → nextRunAt + recurrence; tell the user "first delivery Tue 8:00am ET."
```

To pause it later, `dvt_export_schedule_update(..., enabled=false)`; to retire it,
`dvt_export_schedule_delete(...)`.

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
