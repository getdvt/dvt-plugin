# dvt spec authoring — Top-level shape, layout modes, page rhythm, formats (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

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
itself: **`gap`** (`{ x, y }` px object — a bare number is rejected — inter-tile gutter), **`padding`** (px, an integer for all
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

## Formats

`format` objects are dvt's portable number-display vocabulary (dvt Core) — they compile to a formatter at render time so a spec stays declarative (no JS). One shape, reused everywhere a value is rendered: table columns, `valueFormat`, axis labels, tooltip fields, value labels, funnel rates.

`{ "type": "currency"|"percentage"|"number"|"compact"|"date", "decimals": 1, "currency": "USD", "compact": true, "prefix": "~", "suffix": " /mo", "locale": "en-US" }`

- **type** — `number` (grouped), `currency` (with `currency` ISO code), `percentage` (input is a whole-number percent — `12.5` → `12.5%`), `compact` (1234567 → `1.2M`), `date`.
- **decimals** — fixed decimal places.
- **compact** — K/M/B/T notation; combine with `currency` for `$1.2M`.
- **prefix / suffix** — arbitrary affixes wrapped around the formatted value (empty/blank values stay blank — no bare affix).
- **locale** — BCP-47 separators; defaults to `en-US` for deterministic output.

Place a format where a value renders: `"axisLabel": { "format": {…} }`, a table column `format`, `valueFormat` on a chart, a `tooltip.fields` entry, or a value `label` (see "Number display" above).
