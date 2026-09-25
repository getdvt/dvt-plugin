# dvt spec authoring — Panel types (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

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
| `chart:bar` / `chart:bar:horizontal` / `chart:bar:stacked` / `chart:bar:stacked-percent` | ECharts bar | `xAxis`, `yAxis`, `series[].dataField`, `series[].itemStyle.color`; stacked uses `categoryField`/`seriesField`/`valueField`. On `chart:bar`/`chart:bar:horizontal` (the stacked types use a different binder and are exempt) every `series[i]` must bind its own `dataField` (or inline `data`; a lone series may inherit a top-level `valueField`), and `xField`/`yField` beside `categoryField`/`valueField`/`series[].dataField` is a hard `binding` 422 (DVT-4427) |
| `chart:line` / `chart:line:smooth` / `chart:line:step` / `chart:area` | ECharts line | `series[].dataField`, `series[].smooth`, `series[].lineStyle`, dual `yAxis` + `yAxisIndex`; `chart:area` adds `areaStyle`. A `series[i]` with no `dataField`/`data` fails validation (hard `binding` 422 — a lone series may inherit a top-level `valueField`, but `yField` does not rescue it), and `xField`/`yField` beside `categoryField`/`valueField`/`series[].dataField` is rejected as a contradictory binding (DVT-4427); the `xField`+`yField` shorthand is valid only when no such real binding is present |
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
| `table` | Data table (dvt-native, portable) | `columns[]` — each `{ field, label?, format?, align?, sortable?, filterable? }` (`label` is the header-text key — there is no `header`); omit for every query column in result order. `defaultSort{ field, direction }` seeds an initial sort; click-to-sort + per-column filter run client-side over the fetched rows (`sortable`/`filterable` default true). Row order follows the query `ORDER BY` unless `defaultSort` overrides it; `format` uses the shared format objects. `grouping{ groupBy[], aggregations[]{field,agg}, subtotals?, grandTotal?, defaultExpanded? }` collapses rows into a grouped tree with subtotal/grand-total rows — computed client-side over the fetched rows (no re-query, no SQL rewrite), `groupBy` order = nesting levels, `agg` ∈ sum/avg/min/max/count (default sum). `pivot{…}` switches the panel to cross-tab mode (see Rich tables → Pivot); pivot panels also show a viewer-facing `Fields` tray that quick-swaps pivot rows/columns/values as ephemeral view state — parallel to client-side sort/filter, never persisted (DVT-897) |
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
| `python` | Full-profile escape hatch (ADR-0014), Snowflake-only (DVT-4255/DVT-4259, ADR-0084) — the author writes Python that runs on the warehouse as an anonymous procedure under the connection's own identity, never owner's rights | `code` (required, 1 MiB byte cap, no `$$`, must define `def main(session, <params…>)`), `params` (typed `string`\|`number`\|`boolean`, bound BY NAME from filter/drill values like a SQL panel's `data.params`, one CALL argument each in declared order), `packages` (allow-list: `pandas`\|`numpy`\|`matplotlib`\|`scipy`\|`pyarrow`\|`openpyxl`; `snowflake-snowpark-python` is implicit), `output` (`table` default\|`value`\|`image`), `presentation` (reuses `TableSpec`/`KpiSpec` — no new visual vocabulary). Requires `data.sourceId` of a Snowflake source. `onClick` is forbidden in v1 (it may still be a filter/drill TARGET via `params`). Authoring requires the `python:author` capability; executes since DVT-4259 (engine assembles a Snowpark anonymous procedure per run, ~4–6 s floor; Snowflake sources only), gated behind the `pythonPanels` deployment switch (granted by every edition row; ON on the Snowflake native app as of DVT-4453, risk accepted 2026-09-19 — the ADR-0084 H5 measurement is still owed for the next cut; still the provider-side kill switch — a native-app install cannot flip it itself, rollback is a package patch, and the in-account lever is the `python:author` editor floor; read `editionCapabilities.pythonPanels`). Honesty clause: `POST /v1/data/query` executes the code and returns a real `table`/`value`/`image` result; a python panel saves but no first-party surface (SPA, MCP tools, exports, renders) renders it until the renderer + tray editor land in DVT-4260 — do not deliver one as a working result; for runnable Python today, use a `python` action on an `action-button` (see the Rule under python panels) |
| `action-button` | Pressable call-to-action block: `style` (aesthetics) + `action` (click behavior) + `align?`/`offset?`/`width?` (its own slot placement) (DVT-4216) | `style` (required, `ButtonStyleSpec`: `label` required, plus `icon`/`iconText`/`iconPosition`/`variant`/`size` presets and raw siblings, plus `states?` — per-interaction-state `background`/`color`/`borderColor` overrides for `hover`/`active`/`focus`/`disabled`/`busy` (DVT-4517; `busy` is now set: `ActionButtonPanel` holds `data-busy` for the lifetime of a python action's run, DVT-4520) — and the raw chrome keys `shadow`/`borderWidth`/`borderStyle`/`fontFamily`/`letterSpacing`/`textTransform`/`height`), `action` (required, `ActionSpec`, `kind`-discriminated: `navigate`\|`filter`\|`exportPage`\|`exportAll`\|`python`; a `python` action's own shape is `code` (required), `params`, `packages`, `result` (omitting it entirely defaults to `toast`; when authored, `mode` `download`\|`toast`\|`refresh` is required), `confirm` (prompt string) — the owning panel needs `data.sourceId` of a Snowflake source, and authoring needs the `python:author` capability). Honesty clause: schema + render in DVT-4217; dispatch per kind: `navigate` + `filter` are live (DVT-4218 / DVT-4219); `exportPage`/`exportAll` are inert until DVT-4220; `python` (DVT-4518) is live end to end, subject to the deployment's `pythonPanels` capability — ON on the Snowflake native app as of DVT-4453, risk accepted 2026-09-19 — the `POST /v1/data/query` wire dispatch shipped in DVT-4519 (synchronous v1; `result.mode:"download"` returns the artifact's bytes inline, nothing is written to a stage) and the product UI's own click handler shipped in DVT-4520: one POST per click, client-debounced, with an optional two-step `confirm`. A `python` action on an `action-button` is THE way to run Python from a dashboard today — author this, not a `python` panel, for "a button that runs Python" |

Any panel can also carry a `contextMenu` object (right-click action menu — filter/drill/link/copy/export/openOverlay) and/or a `drill` object (retained for back-compat, inert on its own — DVT-555; wire drill navigation via `onClick` or a `contextMenu` action instead). `onClick` (a single, disclosed left-click action — filter/drill/openOverlay) is narrower: a property on every panel type that resolves a clicked datum (every `chart:*` type, plus `table`/`kpi`/`stat`/`metric-strip`) — but `chart:line:racing` is inert at runtime (no affordance, no dispatch; DVT-3041); the schema rejects it on `filter`, `filter-bar`, `container`, `divider`, `section`, `text`, `html`, `hero`, `media`, `agent`, `action-button`, `python` (a python panel may still be a filter/drill TARGET via its own `params`), which surface no clicked datum. See **Filters & drill-downs** for the full field reference and the post-DVT-2722 actionability rule (which surfaces need a row-field `valueFrom` vs. `category`/`value`/`seriesName` vs. — on `table`, `column`/`columnLabel`, gated for keyboard by `onClick.column`, DVT-4205).

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

**`Host Snowflake` cannot query shared databases.** Its caller's-rights sessions can
only reach objects the app owner has pre-delegated with CALLER grants, and Snowflake
forbids CALLER grants on shared (imported) objects — so `SNOWFLAKE.ACCOUNT_USAGE`,
`SNOWFLAKE_SAMPLE_DATA`, and any Marketplace/data-share import will ALWAYS fail (never
author panels directly against them). Wrap the shared data in an owned table, view, or
model first (e.g. `CREATE VIEW my_db.my_schema.v AS SELECT ... FROM
SNOWFLAKE.ACCOUNT_USAGE....`) and point the panel's query at that owned object. Owned
databases additionally need the APPLICATION CALLER-granted, once per database (not per
object). An admin with ACCOUNTADMIN or MANAGE CALLER GRANTS does that in Snowsight
(Catalog » Apps » the app » Settings » Privileges » **Restricted caller's rights**):
pick the database as scope, then select the database and the schema, table and view
object types — not the database alone. Snowsight only grants USAGE on the types you
select, so the database alone leaves database-level USAGE and panels still fail; pick
SELECT for tables and views. If that section is absent (it is a Snowflake preview) or
a panel still reports a CALLER gap on a database, schema, table or view afterwards,
fall back to SQL: `GRANT CALLER USAGE ON DATABASE <db> TO APPLICATION
<app>; GRANT INHERITED CALLER USAGE ON ALL SCHEMAS IN DATABASE <db> TO APPLICATION
<app>; GRANT INHERITED CALLER SELECT ON ALL TABLES IN DATABASE <db> TO APPLICATION
<app>; GRANT INHERITED CALLER SELECT ON ALL VIEWS IN DATABASE <db> TO APPLICATION
<app>;`. `INHERITED CALLER` cascades by containment, so this also covers
schemas/tables/views created later — no re-grant needed.

**Canonical cartesian form — author the measure as `series[].dataField`.** For the plain
value families (`chart:bar`/`chart:line`/`chart:area`), the single authored form used by
every dvt example, seed demo, and golden spec is an explicit `series[].dataField` (the
category axis comes from the first returned column, or an explicit `categoryField`). Author
to that form so specs stay consistent across surfaces. The renderer *also* tolerates a
`series[]`-less **Core shorthand** — `valueField` (+`categoryField`) for bar, `yField`
(+`xField`) for line/area — and synthesizes a single series from it (DVT-1085), but that is
a render-time convenience, **not** the authored convention: prefer `series[].dataField`.
Since DVT-4427 the validator enforces the split on every cartesian-binder type as a hard
`binding` 422 (`dvt_spec_validate` → `valid:false`; apply/create/patch → 422): (1) every
`series[i]` must bind its own value column — `dataField`, non-empty inline `data`, or —
only when there is exactly one series — a top-level `valueField`; passthrough shapes
also bind (a non-empty series `nodes` array, a numeric `datasetIndex`, or any series
once the spec carries a non-empty top-level `dataset`) — so a bare `{"type":"line"}`
entry fails at `…/spec/series/<i>` under the panel's JSON pointer, and `yField` does
**not** rescue it; and (2) `xField`/`yField` left beside
`categoryField`/`valueField`/`series[].dataField` are rejected as contradictory
bindings at `…/spec/xField`/`…/spec/yField`. `xField`/`yField` stay valid only while
no such real binding is present.
(`chart:bar:stacked`/`chart:bar:stacked-percent` use a different binder and are exempt from
both rules.) (Note the nullish-coalescing edge the
validator also flags: a present-but-empty `valueField: ""` wins over a set `yField` and
renders blank — omit the field entirely rather than passing `""`.)

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
| `nameLocation` | `"start"` \| `"middle"` \| `"center"` \| `"end"` | Where along the axis the name anchors. Default `"end"` (the engine default). Every position is contained inside the plot insets, so `end` does not clip (except on very small panels where ECharts' 25% `outerBoundsClamp` binds); use `"middle"` with `nameGap` 28–40 when you want a centred title (a style choice, not a workaround). |
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

On horizontal bars an `end`-positioned axis `name` shares the right edge with `label.position: "right"`
values; the renderer keeps it clear of tick labels, but if it crowds the last value label prefer
`nameLocation: "middle"`, or fold the unit into the panel subtitle.

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

`density:"compact"` is for panels where space is scarce (e.g. a narrow column). For most charts, omit it (the `"comfortable"` default). A partial `gridPadding` (e.g. only `left`) deep-merges over the defaults — the other three insets and the axis-label/name containment (`outerBoundsMode:"same"`, `outerBoundsContain:"all"`) stay in place.

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

#### Freeze leading columns — `TableSpec.frozenColumns` (DVT-3837)

Column headers are always pinned to the top of the table's scroll area. To also keep the first N
columns in view while a wide table scrolls sideways (spreadsheet freeze panes), set
`frozenColumns` on the table spec:

```json
{ "type": "table", "spec": { "columns": [{ "field": "customer" }, { "field": "jan" }, { "field": "feb" }], "frozenColumns": 1 } }
```

Integer 0–20, counted in rendered order (pivot: `1` pins the first row-dimension stub). Pure
view-time layout — no data transform. `columnGroups` spanner rows are not pinned.

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

### python panels — Snowflake-only escape hatch

> **Rule — to run Python from a dashboard today, author a `python` action on an
> `action-button`, never a `python` panel.**
>
> - A `python` panel saves, but **nothing renders it yet** — not the SPA, not
>   exports, not renders, not the MCP render tools — until DVT-4260 ships. Do not
>   deliver one as a working result, and do not tell a user it will show output.
> - When a user asks for "a button that runs Python", "run my Python on click", or
>   an export produced by Python, author an `action-button` whose `action` is a
>   `python` action. The Snowflake source goes on the **panel's** `data.sourceId`,
>   not inside the action. Leave it out and the spec still saves, but the click
>   fails with "This button isn't attached to a data source yet.":
>   `{ "type": "action-button", "data": { "sourceId": "<snowflake source id>" }, "spec": { "style": { "label": "…" }, "action": { "kind": "python", "code": "…", "params"?, "packages"?, "result"?: { "mode": "download" | "toast" | "refresh", "filename"?, "message"? }, "confirm"? } } }`
>   (`result` omitted = `toast`). For `download`, `main` returns `bytes` or
>   `{"content": bytes, "filename": "report.xlsx"}` to name the file; for
>   `toast`/`refresh`, a `str` returned by `main` (first line, ≤ 280 chars)
>   becomes the status text and overrides `result.message`. Do not author a
>   python panel for it.
> - Never replace a working button (or its python action) with a python panel,
>   and never add a python panel as the "output" of a button. Buttons cannot
>   target a panel, so the result is a button that does nothing.
> - The placeholder a python panel shows is not a setting or an edition switch.
>   Do not tell users to ask the provider to "enable execution"; nothing can be
>   enabled until DVT-4260 ships the renderer.
> - Test the button before handing it over: call `dvt_action_run` (`preview: true`
>   first to see the bound request, then a real run — confirm with the user
>   first, it spends credits and may write). It runs the action exactly as a
>   click would, under the dashboard's source-connection identity (caller's
>   rights or the shared service credential — see the identity paragraph
>   below), — an MCP caller is a human-bound `agent` principal, admitted by
>   ADR-0084's 2026-09-23 amendment; a service-credential run is refused
>   once DVT-4588 enforces the identity gate — and returns the result shape
>   or the failure with its `grants` — never tell the user to click and
>   paste the error back (DVT-4685).

Use `python` when SQL genuinely cannot express the compute — a stats routine, a
custom transform, a chart matplotlib can render but ECharts can't. It is a
**Full-profile** escape hatch (ADR-0014, alongside `html`/`media`/`chart:custom`)
and **Snowflake-only**: dvt runs `spec.code` on the warehouse as an anonymous
Snowpark procedure, under the connection's **own identity** — the viewer's own
rights under caller's rights, or the shared service identity on a service
connection — never owner's rights, so it grants no privilege a SQL panel on
that connection doesn't already have. `code` must define
`def main(session, <params…>)`; `params` bind BY NAME from filter/drill values
exactly like a SQL panel's `data.params`, one CALL argument each in declared
order. `onClick` is forbidden on a python panel; it may still be a filter/drill
TARGET through its own `params`.

```json
{ "type": "python", "title": "Revenue percentile",
  "data": { "sourceId": "snowflake_db" },
  "spec": {
    "code": "def main(session, min_amount):\n    df = session.sql(\"SELECT * FROM analytics.public.orders WHERE amount >= ?\", params=[min_amount]).to_pandas()\n    return df",
    "params": { "min_amount": { "type": "number" } },
    "packages": ["pandas"],
    "output": "table"
  } }
```

`packages` is a closed allow-list (`pandas`, `numpy`, `matplotlib`, `scipy`,
`pyarrow`, `openpyxl`; `snowflake-snowpark-python` is implicit). `output` selects `table`
(default), `value`, or `image` (a base64 PNG); `presentation` reuses the
existing `TableSpec`/`KpiSpec` vocabulary — no new visual keys. Authoring
requires the `python:author` capability; viewing needs only `dashboard:read`.
Execution runs behind the `pythonPanels` deployment capability and only against a
Snowflake source — expect a ~4–6 second floor per run (the engine assembles
and calls a Snowpark anonymous procedure). **On the Snowflake native app that
capability is ON as of DVT-4453 (risk accepted 2026-09-19):** before this patch
the native app shipped the literal `"false"`, held off pending the security
gate (DVT-4489 follow-up / ADR-0084 H5) — H5 remains a hard gate for the next
cut after Monday 2026-09-22, not a closed item. `PYTHON_PANELS_ENABLED` now
renders `true` there; it is the provider-side kill switch, baked into the
package at build time — a native-app install cannot flip it itself, rollback is
a package patch from dvt, and the in-account lever is the `python:author`
editor floor via the app roles. A spec CARRYING a python panel still validates
regardless of the cell — the rows are forward-compatible and are not stripped —
so read `editionCapabilities.pythonPanels` before telling anyone a python panel
will run, and do not author one where it is false. Honesty clause: `POST /v1/data/query`
executes the code and returns a real `table`/`value`/`image` result, but no
first-party surface (SPA, MCP tools, exports, renders) renders a python panel
until the renderer + tray editor land in DVT-4260 — see the Rule above: for
runnable Python today, author a `python` action on an `action-button`.

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

**Two shapes look right and break on every driver** (both flagged by
`dvt_spec_validate`, DVT-3646): `col = ANY(%(k)s)` — the engine expands a set
list into a parenthesized value list, not an array, so `= ANY` errors on
Postgres and Snowflake alike once a selection is set, and the unset state is
never rewritten to show-all — and the double-wrapped `col IN (%(k)s)`, which
the engine's own expansion turns into `IN ((a, b))`, a ROW value (`Invalid
argument types for function 'IN'`). The bundled Pipeline Control Room example
uses the portable form; copy that. Unset (no interaction) shows all rows; an
explicitly emptied selection expands to `IN (NULL)` and shows none.

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

**Cascading filters (DVT-539 / DVT-3841).** A parent filter narrows a child filter's own *option list* by binding the parent's param into the child's value-source query. The recommended, declarative way is `spec.dependsOn: [paramName, …]` naming the parent's `param` (or `loParam`/`hiParam`) — it implies the parent's `targets` and the child's `data.params` default, so both become optional:

```json
{ "id": "customer-filter", "type": "filter",
  "data": { "sourceId": "db",
            "query": "SELECT DISTINCT customer FROM demo.public.orders WHERE (region = %(region)s OR %(region)s IS NULL) ORDER BY 1" },
  "spec": { "param": "customer", "valueField": "customer", "dependsOn": ["region"] } }
```

The query must still reference `%(region)s` with a null-guard — `dependsOn` only wires the binding, it doesn't rewrite the query. Golden example: `spec/examples/filter-cascading-dependson.json`. The equivalent raw long-hand — list the child's id in the parent's `targets` and set `data.params: {"region": null}` on the child explicitly — is what `dependsOn` desugars to and still works; see `spec/examples/filter-cascading.json`.

Filter panels receive merged params like any other panel, so the child re-queries on every parent change; an unset parent binds NULL and `OR %(region)s IS NULL` falls through to the full list. Chains work (state → county → zip) with either form, and the two can mix. A committed child selection that drops out of the narrowed, query-sourced list is cleared automatically (multiselect is pruned) and removed from the URL; this never applies to a static `spec.values` list, a `searchMode:"server"` filter (its selected value is kept — DVT-540 pins it as a row for multiselect; single-select keeps it on the trigger — a parent change resets the cached search so the next keystroke re-queries), a `required` filter, a row-capped (truncated) result, or a static render. A circular chain across two or more filters (via `dependsOn` or via raw `data.params` bindings, e.g. region → customer → region) is rejected at validation (422) with the cycle named — `dvt_spec_validate` and the validate/apply endpoints both surface it. Advisory lint warnings: self-narrowing (a filter binding its own param, via `data.params` or via `dependsOn`), a `dependsOn` entry naming a param no filter panel declares, and a `dependsOn` key the child's query never references as `%(key)s`. Backend-free / baked `data.rows` filters never cascade. A multiselect parent with `unsetMode:"null"` needs the DVT-1209 parenthesized form `(col IN %(k)s)` on the child's value-source query, which the existing lint already checks.

**The `%%` rule.** In ANY param-bound query, a literal `%` in the SQL text must be written `%%` —
the pyformat binding parses a bare `%` as the start of a `%(name)s` placeholder — and prefer
`mod()` over the `%` operator to sidestep the escaping entirely. This `%%`→`%` collapse applies
only to query *text*, never to a bound parameter *value*: don't double-percent a real term;
`"50%%"` as a *value* would bind `50` followed by anything, not a literal `50%`. Enforced since DVT-3702: `dvt_spec_validate` flags a bare `%` in a param-bound query (data-binding warning), and on Snowflake and Postgres-family connections the engine refuses it before execute with error code `literal-percent` (BigQuery/DuckDB pass a bare `%` through, but `%%` is portable — always write it).

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
`text`, `html`, `hero`, `media`, `agent`, `action-button`, `python` (may still be a filter/drill
TARGET via its own `params`), which surface no clicked datum. A single, **bare** action object
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
  row, one tab stop per actionable row (Enter/Space activates). **Exception (DVT-4205):** on
  `table` only, `valueFrom: "column"` / `valueFrom: "columnLabel"` ARE actionable — the table's
  mouse-click equivalent of a chart's `category` — carried by a **MOUSE** cell click or a
  column/panel `contextMenu` click, and by keyboard row activation (Enter/Space) only when
  `onClick.column` is authored and resolves to a rendered column (that gated column is the one
  bound); otherwise a `bindings[]` entry using either token has **no row tab stop** (no keyboard
  affordance without dispatch), and its keyboard-menu entry renders **disabled** in every case.
- `kpi`/`stat`/`metric-strip` additionally bind from **`rows[0]` only** — a field present on
  another row but absent from `rows[0]` never satisfies a `when`/binding on those three.
- The rule applies **per `bindings` entry and all-or-nothing**: on `table`/`kpi`/`stat`/`metric-strip`
  every entry's `valueFrom` must name a real row field — a single entry using a click-only token, or
  omitting `valueFrom` (default `category`), makes the whole action unactionable and withholds the
  affordance. On `table`, `column`/`columnLabel` count as actionable tokens for this rule
  (DVT-4205) — a `bindings[]` entry may use either alongside row-field entries — but see above:
  mixing one in still gates the whole action's keyboard affordance per that rule.

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

**The one exception — a named column (DVT-4165).** A `table`'s `onClick` is row-scoped by default:
the click fires from ANY cell in the row. If the user names a column ("clicking *move-ins* should
open the detail"), set `onClick.column` to that `columns[].field` — the mouse click then fires only
from that column's cells, and only those cells show the clickable cursor/label. Everything else is
unchanged: the bound datum is still the whole ROW (so `valueFrom` still names any row field, not
necessarily the gated column), and keyboard activation of the focused row still fires the action
regardless of column, because the row owns the tab stop. `column` is table-only — the schema
rejects it on every other panel type — and it must name a column the table actually RENDERS. If it
resolves to none, the panel's whole click surface closes: no clickable cells, no row tab stops, and
no keyboard-menu entry either (a partial failure would leave a keyboard-only path to an action no
cell would fire). The trap to watch is a **pivot** table — its measure columns are generated from
the data, so only a `pivot.rows` field can be named there, never a `spec.columns[]` measure.
`dvt_spec_validate` warns in both cases whenever the column set is knowable at author time. Omit
`column` unless the user actually scoped the drill to a column: a whole-row click is the friendlier
default.

**Binding the clicked column (DVT-4205).** `onClick.column` (above) **gates** which cells are
clickable; `valueFrom: "column"` / `valueFrom: "columnLabel"` **binds** which column fired — the
table's mouse-click equivalent of a chart's `category`/`seriesName`. They resolve to the clicked
cell's `columns[].field` (`column`) or its rendered header text (`columnLabel`), work in
`onClick`/`contextMenu` `param`/`bindings[].valueFrom`/`when.field`, and are also usable as
`{column}`/`{columnLabel}` template tokens in `label` and `link.url`. Reach for the **gate**
(`column`) when only one column should ever be clickable at all — a fixed target, same action
every time. Reach for the **bind** (`column`/`columnLabel`) when *which* column was clicked
changes the action's behavior — most often a **SQL-pivoted table with auto columns** (a raw SQL
`PIVOT`/`CASE` cross-tab, so `columns[]` is omitted and the columns are whatever the query
returns), where nothing in the spec can name the generated columns ahead of time. **Not yet
supported on a dvt-native `pivot:` table** (`TableSpec.pivot`, "Rich tables — pivot" above) — its
rendered columns are composed at render time from the row × column dimension cross, and binding
into that composition is a follow-up (`dvt_spec_validate` flags a `column`/`columnLabel`
`valueFrom`/`bindings[]`/`when.field` on a `pivot:` table so this isn't a silent no-op); bind a
real `pivot.rows` field there instead, or reach for a SQL pivot with auto columns if the click
needs to carry the generated column. The gate and bind tokens do compose on the SQL-pivot /
auto-columns shape: gate to a subset of columns with `onClick.column` while still binding which
one fired with `valueFrom: "column"` — though on a fixed, declared column set, gating to one
column and then binding from it is usually redundant with just reading that column's field
directly. Unlike `onClick.column`, neither token requires `columns[]` to exist — they read the
actually-rendered column, generated or explicit. Both are **table-only** (the schema rejects them
elsewhere) and fire on a **mouse** cell click or a column/panel `contextMenu` click, plus keyboard
row activation (Enter/Space) when `onClick.column` resolves to a rendered column; otherwise an
action bound to either token has no row tab stop, and its keyboard-menu entry always renders
disabled (see the Actionability rule above). See the SQL-pivot example below (under
`onClick.column`).

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
for tables) | — `column` / `columnLabel` (DVT-4205; the table's clicked column field / rendered
header label — mouse cell click or `contextMenu`, plus keyboard row activation only when
`onClick.column` resolves). `valueType` — as above.

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
  field works, and — DVT-4205, gated per the Exception above — so do `{column}` (the clicked
  column's field) and `{columnLabel}` (its rendered header label), e.g. `"Show tenants behind
  {columnLabel}"`. On **charts**, `{category}`/`{value}`/`{seriesName}` always work; arbitrary
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

The left-click counterpart is `onClick.column` (DVT-4165) — one action, scoped to one column's
cells rather than to the whole row:

```json
{ "id": "prime-pl", "type": "table", "title": "Prime Storage P&L",
  "data": { "sourceId": "db", "query": "SELECT facility, facility_id, move_ins, revenue FROM demo.public.pl" },
  "spec": { "columns": [{ "field": "facility" }, { "field": "move_ins" }, { "field": "revenue" }] },
  "onClick": { "type": "drill", "label": "Move-ins for {facility}", "targetPage": "move-ins-detail",
    "param": "facility_id", "valueFrom": "facility_id", "valueType": "string",
    "column": "move_ins" } }
// Only the move_ins cells are clickable and disclose the label; the bound value is still read from
// the whole row (facility_id, a column the table doesn't even display). Enter/Space on the focused
// row still fires — the row, not the cell, owns the tab stop.
```

Drop `column` and every cell in the row fires the same action — that is the default, and the right
choice unless the user scoped the drill to a particular column. A `column` naming something the
table does not render (a typo, or a measure on a pivot) is not a partial degradation — it closes
every click surface the panel has, keyboard menu included, and `dvt_spec_validate` says so.

`onClick.column` gates; `valueFrom: "column"` / `valueFrom: "columnLabel"` (DVT-4205) binds which
column fired — the case above scopes the drill to one fixed column (`move_ins`), but a
**SQL-pivoted table with auto columns** — the query itself does a SQL `PIVOT`/`CASE` cross-tab and
`columns[]` is omitted — has generated columns, so nothing in the spec can gate or name one. Bind
from the clicked column instead (a dvt-native `pivot:` table generates its columns the same way,
but `valueFrom`/`bindings[]`/`when.field` binding from one isn't wired yet — bind a `pivot.rows`
field there instead, see "Binding the clicked column" above):

```json
{ "id": "tenant-status-by-month", "type": "table", "title": "Tenant status by month",
  "data": { "sourceId": "db",
    "query": "select * from base pivot (sum(val) for mo in (any order by mo))" },
  "onClick": { "type": "drill", "targetPage": "tenant-detail",
    "bindings": [ { "param": "metric", "valueFrom": "metric" }, { "param": "month", "valueFrom": "column" } ],
    "label": "Show tenants behind {columnLabel}" } }
// no columns[] — the month columns come from the SQL PIVOT, not spec.pivot (dvt-native pivot
// doesn't support this binding yet). Clicking the Mar-26 cell of the "Vacated" row opens
// tenant-detail scoped to metric='Vacated' AND month='Mar-26' (target page:
// "... where metric = :metric and month = :month"), and keeps working when a filter changes which
// months exist, because nothing in the spec names a month.
```

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
chart mark's click carries `category`/`value`/`seriesName`, but a `kpi`/`stat`/`metric-strip`/
`table` click carries only the clicked **row** — `valueFrom` must name a real row field there,
never `category` (on `table`, a **mouse** click additionally carries the clicked `column`/
`columnLabel`, DVT-4205 — see the gate-vs-bind note above).

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
// (table is the exception on a mouse click: "column"/"columnLabel" bind too, DVT-4205.)
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
