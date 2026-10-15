# dvt spec authoring — Data sources & querying (reference)

> Part of the `dvt-spec-author` skill, loaded on demand. The authoring method lives in the
> main skill file; this file holds the detailed reference it points to.

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

### Using dvt Sheet data in a dashboard

A dvt Sheet's rows can feed a panel once the sheet has flushed to the warehouse. The panel
queries the flushed table with ordinary SQL — there is no separate "sheet" source type.

**Where the rows live.** `dvt_sheet_get` returns `targetDatabase`, `targetSchema` and
`targetTable`. They are **null until the sheet's first flush** (the UI's "Sync now", or
`dvt_sheet_flush`) — there is nothing to query before then. On Snowflake `targetDatabase`
is the install's writeback database (`dvt_writeback`; on the native app `DVT_WRITEBACK`, or the
name the install was set up with); on Postgres and Redshift it reads `dvt_writeback`, but the
rows live in the connection's own database (see below). The rest depends on the warehouse:

- **Snowflake:** the writeback database (`dvt_writeback`, or `DVT_WRITEBACK` / the install's own name on the native app), a schema per root folder (`unfiled` for sheets
  outside any folder), and a table named for the sheet. The table and its columns are
  created **double-quoted** (table lowercased; columns keep declared case), so unquoted SQL
  does not resolve. Query `<targetDatabase>.<targetSchema>."<targetTable>"` and double-quote each
  column name with exact case. The querying role needs `USAGE` on the database and schema
  plus `SELECT`.
- **Postgres and Redshift:** a single schema `dvt_writeback` (it exists only on these two) in the
  connection's own database, with the folder path folded into the table name. Query
  `dvt_writeback."<targetTable>"` (double-quote the table, and the columns if their names
  are not plain lowercase). The querying role needs `USAGE` on schema `dvt_writeback` plus
  `SELECT`.

**The table lags the sheet.** It holds only flushed rows. Edits still pending (see
`dvt_sheet_rows_pending`) do not appear until the next flush.

**Exclude the system columns.** A standard sheet's flushed table carries `row_uid` and
`_dvt_flushed_seq` (a flush watermark) alongside the sheet's own columns, and usually
`_dvt_edited_by` and `_dvt_edited_at` (who last edited the row, and when). Select the
sheet's own columns by name — never `SELECT *` — so these stay out of panels.

**Which data source reads it.** The sheet's writeback connection is never a query source:
dvt refuses to run panel queries through it. Use a *different*, non-writeback connection
on the same warehouse whose role can read the sheet's writeback tables:

- **Snowflake native app:** `source_id="Host Snowflake"`, and an admin must grant the
  querying role the app's read-only `dvt_writeback_reader` application role (plus `USAGE`
  on the install's writeback database — `targetDatabase`). A linked sheet uses `dvt_linked_reader` instead, and
  its flushed table is a changelog of extension-column edits, not the merged rows.
- **Hosted / other warehouses:** a pushdown connection whose role has the grants listed
  above on the sheet's writeback tables (see "Where the rows live").

Data sources are named in `dvt_dashboard_get` output (each element's `sourceId`). If the
workspace has no such data source, ask an admin to add one — do not guess a `source_id`.

On the native app, reading the app-owned writeback database through `Host Snowflake` runs under
restricted caller's rights. If a panel reports a missing caller grant, grant the
per-database CALLER delegation for that database as described in the shared-object rule
section below.

**Governance warning.** A panel over `dvt_writeback` is governed by the *querying role's
warehouse grants* (for `Host Snowflake`, each viewer's own role), not by the sheet's own
access control. dvt's per-sheet, per-user permissions do not reach this path: what the
panel can read is whatever that role can read. A role granted `dvt_writeback_reader` can read
**every** sheet's rows in the writeback schemas, including sheets created later. Grant
`dvt_writeback_reader` (or a pushdown role with those grants) only to people who may see all of that data. On a shared pushdown connection, every viewer of the panel sees what that connection's role can read.

**Minimal example** — a table panel over a sheet flushed to `dvt_writeback.unfiled."budget"`
on Snowflake (substitute the FQN from `dvt_sheet_get`). Result column names keep their
declared case (lowercase in this example), so `spec.columns[].field` must match exactly:

```json
{
  "id": "budget",
  "type": "table",
  "title": "Budget",
  "data": {
    "sourceId": "Host Snowflake",
    "query": "SELECT \"department\", \"owner\", \"amount\" FROM dvt_writeback.unfiled.\"budget\" ORDER BY \"department\""
  },
  "spec": {
    "columns": [
      { "field": "department" },
      { "field": "owner" },
      { "field": "amount" }
    ]
  }
}
```

**Exporting sheet data.** Two routes work.

- On demand: the sheet panel itself is exportable. `dvt_panel_export` as `csv` or `xlsx`
  works on a sheet panel (plain data, the sheet's rows in the panel's default sort, max
  10,000, under the sheet ACL; dashboard filters are not applied), and so does a table panel
  over the sheet's warehouse table (see the exports reference).
- Scheduled Excel: on a native-app install (1.1.1 and later) where an admin opted into the
  customer SMTP relay, a scheduled email report of the dashboard attaches each table panel
  as an `.xlsx` (up to 50 rows; see "Opt-in customer SMTP relay" in the exports reference).
  That is the relay route for a recurring Excel of sheet data. The non-relay route: an export
  schedule (`dvt_export_schedule_create`) with `format: "xlsx"` on a table panel over the sheet's
  warehouse table (the sheet panel itself is rejected). The export-schedule route is hosted dvt
  only (it is not available on a native-app install), and its xlsx/csv file is attached to the
  email and never stored (email recipients only, no webhook channels). Non-relay email report sends attach nothing. A scheduled send delivers those rows to every
  recipient it names, whether or not they can open the sheet.

Every table-panel route is governed by the querying role's warehouse grants, like the query
itself, not by the sheet's own access control. Only the on-demand sheet-panel export uses the
sheet ACL.

#### Scheduled Excel reports

The supported route for a recurring Excel of sheet data is a **table panel over the sheet's
warehouse table**, and which scheduler carries it depends on the edition.

- **Hosted.** An export schedule (`dvt_export_schedule_create` with `format: "xlsx"`) on a
  table panel over the sheet's warehouse table, on a **non-writeback** pushdown connection.
  It is governed by the querying role's `SELECT` on the sheet's writeback tables (see
  "Where the rows live"), not by the sheet ACL. Choosing this route is an explicit owner decision: every named recipient
  receives those rows whether or not they can open the sheet.
- **Native app 1.1.1 and later.** A relay email report: each table panel is attached as an
  `.xlsx` (up to 50 rows), and it requires the admin opt-in to the customer SMTP relay. It is
  governed by the `dvt_writeback_reader` role's warehouse grants (linked sheets use
  `dvt_linked_reader`, and their table is the extension changelog, not the merged rows; see the
  bullet under "Which data source reads it"), not by the sheet ACL, with
  the same owner decision about recipients. `dvt_export_schedule_create` is not available
  on a native-app install.
- **Why it differs from the sheet-panel rule.** A sheet panel's rows are sheet-ACL data, so
  a scheduled or emailed delivery never carries them (a recipient's access could not be
  checked against the sheet at send time). Only the requester can export a sheet panel, on
  demand. A table panel is an ordinary warehouse query, which the owner has chosen to
  expose through grants.
- **Future.** A sheet-as-data-source slice, when it lands, follows the sheet-panel rule
  (sheet ACL, no scheduled recipient delivery), not this one.

### `Host Snowflake` — the shared-object rule (DVT-1767)

Shared (imported) databases — `SNOWFLAKE.ACCOUNT_USAGE`, `SNOWFLAKE_SAMPLE_DATA`, any
Marketplace or data-share import — **cannot be queried directly** under caller's rights.
Snowflake forbids CALLER grants on shared objects, so such queries always fail, and a
panel authored against one always fails too. Wrap the shared data in an **owned** table,
view, or model first and query that:

```sql
create view my_db.my_schema.v as select ... from snowflake.account_usage....
```

Owned objects additionally need a CALLER grant to the APPLICATION, granted **once per
database** (not per object). An admin with ACCOUNTADMIN or MANAGE CALLER GRANTS does
this in Snowsight first (Catalog » Apps » the app » Settings » Privileges » **Restricted
caller's rights**): pick the database as scope, then select the database and the
schema, table and view object types — not the database alone, which only grants
database-level USAGE and leaves panels failing. SQL fallback, for accounts where that
section is absent (it is a Snowflake preview) or a panel still reports a CALLER gap on
a database, schema, table or view — `INHERITED
CALLER` on the `ON ALL` form cascades by containment, covering schemas/tables/views
created later too:

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
| succeeded | `{status:"succeeded", columns, rows, rowCount, returnedRows, nextCursor?, rowTruncated?, …}` |
| failed | `{status:"failed", error, elapsed_ms}` |
| canceled | `{status:"canceled", elapsed_ms}` |

If a query succeeded but its result cache has since expired (rare), the record is returned
as-is with a `note` advising a re-run — there is no result to surface in that case.

**A succeeded result can be PARTIAL — on the fast path too.** `rows` is one page, not
necessarily the whole result, and three different facts say so. Do not conflate them:

| field | means |
|---|---|
| `returnedRows` | how many rows this page holds (`limit`, default 1000, max 10000) |
| `nextCursor` | more rows exist — pass it back as `cursor` to get the next page |
| `rowTruncated` | a single row was too wide for the response budget, so its oversized cell values were elided — each elided cell carries an explicit marker (`…<N chars elided>`, `…<value omitted: N chars>` or `…<N more cells omitted>`). Elided content is NOT recoverable by paging; narrow the query or select fewer columns |
| `truncated` | something else entirely: the WAREHOUSE result hit the engine's row ceiling, so `rowCount` is itself a prefix |

**Prefer narrowing the query over walking pages.** Paging re-runs the query — there is no
server-side result handle on the fast path, and a caller's-rights (`Host Snowflake`)
connection is not cacheable at all — so each page is a separate, separately-billed
warehouse execution, and the row order is only stable across pages if the query has a
deterministic `ORDER BY`. Add `ORDER BY` + `LIMIT`, or aggregate, instead of paging a wide
scan. This tool is an authoring/validation primitive, not a data-exploration surface.

**Errors.** A 409 `oauth-consent-required` means the source needs OAuth re-authorization in
the dvt UI before queries can run. A 403 means the caller's API key lacks permission to
query this source.
