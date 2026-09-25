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
