# dvt spec authoring — Scheduled exports, panel export, emailing a report (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

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

## Exporting a panel's data — `dvt_panel_export` (DVT-137, DVT-4174, DVT-4196)

One panel, one file.  `dvt_panel_export` re-runs the panel's own query **live** (never
from cache) and hands back a CSV or Excel file, with the panel's column labels and
number formats already applied — so the download reads like the panel rather than like
raw SQL output.  Reach for it when someone wants *the numbers*; reach for
`dvt_dashboard_render_inline` when they want a *picture* of the panel.

| Tool | Verb | Permission | Purpose |
|------|------|-----------|---------|
| `dvt_panel_export` | write (egress) | `data:query` **and** `data:export` | Export one panel's rows as `csv` or `xlsx`, optionally with the table's on-screen styling baked in |

Address the panel exactly as `dvt_element_get` does — `dashboard_id`, `page_id`,
`element_id`, each of the latter two a UUID **or** the readable slug (`"panel-revenue"`).
Pass the dashboard's current filter/drill values as `params` so what the user sees is
what they get.

**The two styles.**

- `style="data"` (default) — the flat workbook: resolved column labels, number/date
  formats, frozen header, autofilter.  Works on **every** panel type.
- `style="formatted"` — the same, plus the table's rendered look **baked in as static
  cell styles**: cell colors from conditional formatting and color scales, fonts,
  alignment, column widths, frozen columns.  **Table panels only, and xlsx only.**

`formatted` is refused before any query runs for a chart, KPI or metric panel (there is
no cell presentation to bake) and for CSV (a CSV file has no styling at all).  Both
refusals name the fallback: `style="data"`, which always works.

**Baked, not live (DVT-4195).**  A formatted export is a *snapshot* of how the table
rendered.  The workbook carries no Excel conditional-formatting rules, no color-scale
rules and no formulas — editing a value in Excel will not recolor its cell.  Say that
when you hand the file over; a user who expects live rules will think the export is
broken.

**Fidelity.**  When the export reports full fidelity, the workbook is the same one the
panel's ⋯ menu produces in the browser: data cells, conditional-format results, color scales
*and* the themed header row all match the screen, because the panel's full resolved theme
travels with the export, not just the tokens its rules happen to name.  A formatted result says so explicitly in
`themeFidelity`: `"full"` means you may tell the user the file matches what they see.  Any
other value means part of the theme did not reach the export, and `themeNote` says exactly
what degraded — `"subset"` (a dvt API too old to hand over the full theme: header row falls
back, and cells and rules are exact unless the note also reports drops), `"partial"` (some
tokens did not fit the export API's limits — over-long, or past its entry cap — and were
dropped), or `"none"` (no usable theme reached the export — rule and color-scale fills are
**not** baked either, not just the header).  Read the note before you describe
the file; never promise a match on anything but `"full"`.

**Reading the result.**  `rowCount`, `bytes` and `filename` describe the file;
`contentBase64` carries the bytes themselves when the file is small enough to travel in
a tool result.  A larger file still exported successfully — `contentBase64` is simply
absent and `note` explains why, so narrow the query if you need the bytes.  Two fields
you must never swallow: `truncated: true` means the warehouse result hit dvt's row cap
and **the file is a prefix, not the whole dataset**; a panel with baked-in rows and no
query cannot be exported at all.

Every export is a deliberate data-egress event: it bypasses the result cache and writes
an audit row naming who exported what.

## Emailing a report (DVT-4201, DVT-4264, DVT-4266) — Snowflake native app only

A dvt dashboard can email **itself** — not a link and not an attachment, but the report
*as the mail body*: KPI and stat tiles and tables as inline HTML, each chart panel as an
inline PNG with a "View in dvt →" link (DVT-4264).  An interactive send runs
`SYSTEM$SEND_EMAIL` on the **caller's own** Snowflake session, so it can never carry data
its sender could not already see.  An unattended scheduled send reads its rows as the
**task-owner role** the consumer's editor chose instead (see below), so its contents are
that role's, not its creator's.

These routes exist **only in the Snowflake native app**.  Everywhere else — dvt Gallery,
self-host — every tool below returns a 404 whose `error.meaning` says so; read that
field before telling a user their dashboard is missing.

| Tool | Verb | Permission | Purpose |
|------|------|-----------|---------|
| `dvt_dashboard_email`        | write (sends mail) | `data:query` + `data:export` + `dashboard:read`  | Email the dashboard (or one page) as an HTML report, right now |
| `dvt_email_schedule_create`  | write   | `dashboard:write` | **Usually absent.** Save a cadence + recipient list for that report |
| `dvt_email_schedule_list`    | read    | `dashboard:read`  | **Usually absent.** List a dashboard's saved email schedules (recipients only for `dashboard:write`) |
| `dvt_email_schedule_update`  | write   | `dashboard:write` | **Usually absent.** Enable/disable, move the cadence, or **replace** the recipient set |
| `dvt_email_schedule_delete`  | write   | `dashboard:write` | **Usually absent.** Permanently delete a schedule |
| `dvt_email_schedule_run`     | write (sends mail) | `dashboard:write` + `data:query` + `data:export` | **Usually absent.** Send a saved schedule's report now, on your session |
| `dvt_email_schedule_setup`   | read    | `dashboard:write` | **Usually absent.** The statements a Snowflake **admin** runs once to create the consumer-owned task that fires a schedule, plus its `taskState` |

Only `dvt_dashboard_email` is on every install.  The six `dvt_email_schedule_*` tools are
registered **together or not at all**, and as dvt ships today they are **not registered**
— see the section below before you tell anyone a report can be scheduled.

This family is **disjoint** from `dvt_export_schedule_*` above: those deliver recurring
**PDF/PNG artifact** exports by email or webhook; these deliver the **inline HTML
report**.  The two REST surfaces do not share ids — a schedule id from one 404s on the
other — so never pass an id between them.

### A saved schedule sends by itself only once it is activated (DVT-4490 / DVT-4300, ADR-0069)

**This is the one thing you must not get wrong**, and what "by itself" even means depends
on the install — so check, do not assume.  **Are the `dvt_email_schedule_*` tools in your
tool list?**  That one question separates the two cases; all six of them are registered
together or not at all, so any one of them answers it.

**Case 1 — they are absent: this deployment has no email schedules.**  This is how dvt
ships today.  There is no cadence to save, and every
`/v1/dashboards/{id}/email-schedules` route answers 404 `feature-disabled` if something
calls one anyway.  Do not describe a workaround and do not offer to "set one up" — say so
plainly: "This deployment emails a report on demand, but it can't schedule one."  What you
*can* do is `dvt_dashboard_email`, which sends the report now, with its chart images and
the filters the user is looking at.  An earlier release listed the schedule tools while
nothing fired them; that was withdrawn precisely because it let an agent tell a user their
report was scheduled when it never would be.

**Case 2 — they are present: a saved schedule fires only once its Snowflake task
exists.**  dvt does not create that task from an API or MCP call — activating one is a
UI action, gated on `dashboard:write` (an editor, not an admin).  In the Schedule tab, an
editor clicks **Activate automatic sending**, picks a warehouse (defaulting to their own
`CURRENT_WAREHOUSE`), and dvt creates and resumes the task on that editor's own live
Snowflake session — never a standing dvt credential (ADR-0069).  `CURRENT_ROLE()` at the
moment they click becomes the task's owning role, which is what gives the 07:00 run a
Snowflake identity to read the data as.  The one-time grants that role needs run first,
best-effort; any grant the clicking editor's Snowflake role cannot issue comes back
pre-filled as a one-time block of SQL for an admin to run, after which the same click
finishes activation.  The manual path still exists for accounts where the clicking
editor's role lacks the privileges outright: copy the generated statements from "Show
SQL" (or `dvt_email_schedule_setup`) and hand them to someone who can run them by hand —
same statements, same task, just not one-click.

There is no `dvt_email_schedule_activate` MCP tool yet.  An agent can create and inspect a
schedule and fetch its setup SQL via `dvt_email_schedule_setup`, but it cannot activate
one itself — that is a UI/editor action today, and a follow-up, not something this tool
family does.  Say so plainly rather than implying an agent can turn a schedule on.  Until
a task exists — by either path — the schedule is saved and previewed and **nothing
arrives**; `dvt_email_schedule_run` still sends now, on your own session.  The result of
every schedule tool carries an `automaticSending` sentence saying the same thing.

In case 2, `dvt_email_schedule_setup` returns the manual-path statements — grants,
`CREATE TASK`, `DROP TASK` — and `taskState`, which has three live values: `absent` (no
task exists yet, by either path), `declared` (dvt itself created and resumed the task via
Activate automatic sending — dvt has not yet seen it fire), and `confirmed` (the task has
called in — dvt has seen it drive a run).  **Only at `confirmed` may you say the report
will arrive by itself**; `declared` means activation succeeded, not that a send has
happened yet.  One limit to pass on: the task's `SCHEDULE` **must match** the cadence dvt
generated or the run is refused (`no-scheduled-occurrence`).  On a one-click-activated
task (dvt knows its `taskWarehouse`), a cadence change re-issues the task automatically —
no separate re-activation step.  A hand-pasted task (no known `taskWarehouse`) cannot be
re-issued this way: the cadence edit 409s, and the fix is Deactivate, then edit, then
Activate (or, on the manual path, re-run the statements with the new cadence).  dvt sees
only whether the task has called in and when it last fired — it cannot edit or disable a
task it does not own, but deleting a schedule does remove its task (deactivated first,
same as one-click Deactivate).

Either way, a report sent from a schedule *does* embed chart images, the same as an
interactive send — the render is server-side, from the rows dvt already holds (in case 2,
the ones the task staged for that run, plus any panel carrying its own inline
`data.rows`, whose `query` is kept for the SQL inspector and is never executed), under the
same limits (at most 4 chart images; a chart that fails or would blow the 700 KB body
budget falls back to its "view in dvt" note instead).  A scheduled send re-reads
(re-queries) every panel that carries a `query`, even when the spec also carries baked
`data.rows` beside it (DVT-4476, Option B) — baked rows are only what a scheduled send
actually uses for a panel that has no query at all.  (Separate, still true: **artifact**
export schedules run off a cron worker wired only in dvt's cloud editions — nothing fires
those in the native app.)

### Sending one now — `dvt_dashboard_email`

```
dvt_dashboard_email(
  dashboard_id="rev-dash-uuid",
  recipients=["dana@example.com", "sam@example.com"],
  page_id="overview",            # optional — the SPEC page id (slug), not the page UUID
  subject="Q3 revenue — week 37", # optional
  params={"region": "West"},     # optional — filter the report
)
```

**`params` filters the report.**  Pass it when the user asks for a filtered send ("email
me just the West numbers") — do NOT describe the filter in the subject line and mail the
whole thing.  Every key must be a param some panel on the emailed page declares in its
`data.params` (`dvt_dashboard_get` shows them); an undeclared key comes back as a 422
that names it, never a silent unfiltered send.  Values are bound to each panel's query,
so the tables and the chart images agree, and the mail carries a `Filtered: Region =
West` line so the recipient knows what they are looking at.  Omit it to send the
report's own default view.  A stored **schedule** carries no filter state — running one
always sends the default view.

**Confirm with the user before you call it.**  There is no undo, no preview and no
dedupe: calling twice sends twice.  To see the report first, render the page with
`dvt_dashboard_render_inline`.

**Recipients are the usual failure.**  1–50 **bare** addresses (`dana@example.com`,
never `Dana <dana@example.com>`), and Snowflake requires each to be a user of the
consumer's own account with a verified email — **one bad address fails the entire send,
so nobody receives it.**  That check happens at send time and cannot be anticipated, so
prove a new recipient list with one real send.

**Read the audit summary before you report success.**  A 202 means the mail went out,
not that it went out whole: panels that failed to load, or that fell past the per-email
panel/chart caps, are replaced by a note and the mail still ships.  The result carries
`panelsRendered` / `panelsFailed` / `panelsOmitted` plus a `reportComplete` flag — when
it is `false`, say which panels did not make it.  (Note also that Gmail strips `data:`
image URIs and shows a chart's alt text instead; Apple Mail, Outlook desktop and iOS
Mail render them inline.)

### What the failures mean

Every failure carries `error.meaning` in plain language — whether anything was sent,
whether a retry can possibly help, and whose problem it is.  The four worth knowing
cold:

- **409 `email-not-configured` / `email-integration-not-authorized`** — email is not set
  up for this app.  Nothing was sent and no retry will help: a Snowflake ACCOUNTADMIN
  must create a NOTIFICATION INTEGRATION, point the app at it with the app's
  `set_email_integration` procedure, and grant the application both `USAGE` and
  `CALLER USAGE` on it.  Tell the user to ask their admin.
- **413 `email-too-large`** — the rendered report exceeds the email byte budget even
  with every table dropped.  Email **one page** (`page_id`) or trim the dashboard's text
  panels.
- **504 `email-send-unconfirmed`** — dvt issued the send but Snowflake did not confirm
  in time.  **The mail may still arrive.**  Do not retry blind; have the user check
  inboxes first, or they get it twice.
- **502 `report-unavailable`** — every data-bound panel failed, so dvt deliberately did
  **not** send a report full of error placeholders.  Debug the panel SQL with
  `dvt_data_query`; the real warehouse error is deliberately kept out of the email.

### Scheduling one — worked example

**Only reachable in case 2.**  On a shipped install none of the calls below exist; if a
user asks for a recurring report there, say it is not offered and send one now with
`dvt_dashboard_email` instead.

```
# 1. Save the cadence.  preset kinds: daily | weekly | monthly | hourly;
#    dayOfWeek 0=Sunday…6=Saturday refines weekly, dayOfMonth 1–28 refines monthly.
dvt_email_schedule_create(
  dashboard_id="rev-dash-uuid",
  recipients=["dana@example.com"],
  preset={"kind": "weekly", "dayOfWeek": 1, "atHour": 7},
  timezone="America/New_York",
  title="Monday revenue digest",
)
# → id, normalised cron "0 7 * * 1", nextRunAt (UTC)

# 2. Prove it actually delivers — the only way to test the recipient list.
dvt_email_schedule_run(dashboard_id="rev-dash-uuid", schedule_id="sched-uuid")

# 3. Get the statements an admin must run to make it fire on its own, and check state.
dvt_email_schedule_setup(dashboard_id="rev-dash-uuid", schedule_id="sched-uuid")
# → grantsSql / createTaskSql / dropTaskSql, taskState: "absent"

# 4. Tell the user: "Saved — Mondays 07:00 ET, and I sent one just now so you can check
#    it.  It won't arrive on its own until an ACCOUNTADMIN runs these statements; once
#    they have, the Monday send is fully automatic, chart images included."
```

`recipients` on `dvt_email_schedule_update` **replaces** the whole set — it is not
additive, so read the current list with `dvt_email_schedule_list` first or you will
silently drop everyone else.
