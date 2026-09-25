# dvt spec authoring — Theme & tokens (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

## Theme & tokens (the customization engine)

Tokens are a 3-tier tree (`primitive` → `semantic` → `component`). Any value may be
a literal (`"#4F46E5"`) or a reference (`"{color.brand-indigo}"`) — with one exception:
the **font-family** slots below are a *closed allow-set*, not free text (see
`typography.fontFamily`). Change one primitive and every chart updates.
**Every token value is a string** — numeric ones included: write `"panel.border.width": "3"` (or
`"3px"`), never `3`. A bare number or boolean anywhere under `theme.tokens.*`, `theme.overrides`,
`pages[].theme.overrides`, or a panel `overrides` block fails validation (the error now says so).
Useful tokens:

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
when you genuinely want *some* cards dark, not the page. Note the shape: `pages[].theme` is
`{ preset?, overrides? }` **only** — it has no `tokens`; the three tiers live solely on the root
`theme.tokens`, and a page `theme` carrying `tokens` is rejected as an unknown property (the
mirror-image of a root `theme` missing `tokens`).

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
  - `chart.series.N` → `itemStyle.color` for bar/line/scatter; for any series compiling to
    ECharts `type: 'line'` (`chart:line*`/`chart:area*`, plus an explicitly typed line
    series in a combo panel) also `lineStyle.color` and `areaStyle.color` when the series
    carries an `areaStyle`; sankey/graph excluded (their `lineStyle` colours links)
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

See "Document as you build" in `documenting.md` for when to add footnotes vs. intent/assumptions.
