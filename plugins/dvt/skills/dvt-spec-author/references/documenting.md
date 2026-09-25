# dvt spec authoring — Document as you build (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

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

`ChartSpec.footnotes[]` + `ChartSpec.sourceNote` — see "Chart footnotes and source note" in `theme-and-tokens.md` for the full reference. Use whenever a metric has a definition caveat or a data-source citation a viewer needs:

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
