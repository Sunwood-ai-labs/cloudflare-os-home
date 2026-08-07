/**
 * Supabase API for Gadgets.
 *
 * A connection is to either a single Supabase **project** (`SupabaseProject`) — a hosted Postgres
 * database plus its auth, storage, and edge functions — or a whole **organization**
 * (`SupabaseOrganization`), from which individual projects can be opened.
 */

/** A JSON-ish value that can appear in a SQL row or be passed as a query parameter. */
export type SupabaseValue =
  | string
  | number
  | boolean
  | null
  | SupabaseValue[]
  | { [key: string]: SupabaseValue };

/**
 * A single row returned by a SQL query, keyed by column name.
 *
 * Postgres values map to JSON as follows:
 * - `numeric`, `bigint`/`int8`, and other arbitrary-precision types are returned as **strings**,
 *   to preserve precision that JavaScript numbers would lose.
 * - `timestamp`/`timestamptz`/`date` are returned as strings in Postgres' text format — e.g.
 *   `"2026-06-18 16:04:35.916111+00"` (a space separator and `+00`-style offset), **not** ISO-8601
 *   with a `T`. Parse accordingly if you need a `Date`.
 * - `json`/`jsonb` are returned as parsed objects/arrays; SQL arrays as JSON arrays.
 * - `bytea` is returned as a byte-array object of the form `{ type: "Buffer", data: number[] }`
 *   (the upstream API gives no column-type metadata, so raw bytes are passed through verbatim
 *   rather than being reformatted). To get hex/base64 instead, `encode(col, 'hex')` in your SQL.
 */
export type SupabaseRow = { [column: string]: SupabaseValue };

/** The result of running a read-only SQL query. */
export type SupabaseQueryResult = {
  /** Rows produced by the statement (e.g. by `SELECT`). Empty for statements that return no rows. */
  rows: SupabaseRow[];
  /** Number of rows in `rows`. */
  rowCount: number;
};

/** Lifecycle status of a project. */
export type SupabaseProjectStatus =
  | "INACTIVE"
  | "ACTIVE_HEALTHY"
  | "ACTIVE_UNHEALTHY"
  | "COMING_UP"
  | "GOING_DOWN"
  | "INIT_FAILED"
  | "REMOVED"
  | "RESTORING"
  | "UPGRADING"
  | "PAUSING"
  | "RESTARTING"
  | "PAUSE_FAILED"
  | "RESTORE_FAILED"
  | "RESIZING"
  | "UNKNOWN";

/** A Supabase organization and the projects within it. */
export interface SupabaseOrganization {
  /** Returns basic metadata about this organization. */
  getInfo(): Promise<SupabaseOrganizationInfo>;

  /** Lists all projects in this organization. */
  listProjects(): Promise<SupabaseProjectSummary[]>;

  /**
   * Opens a specific project in this organization by its project ref (the 20-character
   * identifier, e.g. `"abcdefghijklmnopqrst"`). Throws if the project is not part of this
   * organization.
   */
  getProject(ref: string): Promise<SupabaseProject>;
}

/** Basic organization metadata. */
export type SupabaseOrganizationInfo = {
  /** Stable, URL-safe organization identifier (e.g. `"my-org"`). */
  slug: string;
  /** Human-readable organization name. */
  name: string;
  /** The organization's dashboard URL. */
  url: string;
};

/** A compact project summary returned when listing an organization's projects. */
export type SupabaseProjectSummary = {
  /** The 20-character project ref, used as the project's stable identifier. */
  ref: string;
  /** Human-readable project name. */
  name: string;
  /** Slug of the organization that owns the project. */
  organizationSlug: string;
  /** Cloud region the project runs in (e.g. `"us-east-1"`). */
  region: string;
  /** Current lifecycle status. */
  status: SupabaseProjectStatus;
  /** When the project was created. */
  createdAt: Date;
  /** The project's dashboard URL. */
  url: string;
};

/**
 * A single Supabase project: a hosted Postgres database together with its auth, storage,
 * and edge-function surfaces.
 *
 * The database is the primary capability — obtain it with `getDatabase()`. The remaining
 * methods provide read-only awareness of the project's other services.
 */
export interface SupabaseProject {
  /** Returns metadata about this project (name, region, status, Postgres version, etc.). */
  getInfo(): Promise<SupabaseProjectInfo>;

  /**
   * Returns the database capability for running queries and introspecting schema.
   *
   * Returned as a promise you can pipeline against without awaiting (Cap'n Web promise
   * pipelining). Dispose it when finished.
   */
  getDatabase(): Promise<SupabaseDatabase>;

  /**
   * Checks the health of the project's services (database, auth, storage, etc.).
   *
   * Read-only.
   */
  checkHealth(): Promise<SupabaseServiceHealth[]>;

  /**
   * Lists the project's deployed edge functions.
   *
   * Read-only. Returns metadata only; use `getEdgeFunctionSource()` to read a function's code.
   */
  listEdgeFunctions(): Promise<SupabaseEdgeFunction[]>;

  /**
   * Returns the deployed source code of a single edge function, identified by its slug.
   *
   * Read-only. Throws if no function with that slug exists.
   */
  getEdgeFunctionSource(slug: string): Promise<string>;

  /**
   * Lists the project's storage buckets.
   *
   * Read-only.
   */
  listStorageBuckets(): Promise<SupabaseStorageBucket[]>;
}

/** Full project metadata returned by `SupabaseProject.getInfo()`. */
export type SupabaseProjectInfo = SupabaseProjectSummary & {
  /** Database connection details. */
  database: {
    /** Hostname of the project's Postgres database. */
    host: string;
    /** Postgres major version (e.g. `"15"`). */
    postgresVersion: string;
  };
};

/** Health of a single project service. */
export type SupabaseServiceHealth = {
  /** Service name, e.g. `"db"`, `"auth"`, `"rest"`, `"storage"`, `"realtime"`. */
  service: string;
  /** Coarse status reported by the platform. */
  status: "COMING_UP" | "ACTIVE_HEALTHY" | "UNHEALTHY";
  /** Optional error detail when the service is unhealthy. */
  error?: string;
};

/** A deployed edge function. */
export type SupabaseEdgeFunction = {
  /** Stable slug used to address the function. */
  slug: string;
  /** Human-readable name. */
  name: string;
  /** Deployment status. */
  status: "ACTIVE" | "REMOVED" | "THROTTLED";
  /** Monotonically increasing deployment version. */
  version: number;
  /** Whether the function verifies the caller's JWT before running. */
  verifyJwt: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** A storage bucket. */
export type SupabaseStorageBucket = {
  id: string;
  name: string;
  /** Whether objects in the bucket are publicly readable. */
  public: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A project's Postgres database.
 *
 * Reads and writes are cleanly separated:
 *   - `query()` runs a **read-only** statement. It executes as a restricted read-only role, so
 *     any attempt to mutate data or schema fails. Use it for `SELECT` and other read-only SQL.
 *   - `execute()` runs a **mutating** statement (`INSERT`/`UPDATE`/`DELETE`/DDL/etc.). Mutations
 *     require human approval before they take effect and aren't reflected by reads until then;
 *     see `execute()`.
 *
 * The introspection helpers (`listSchemas`, `listTables`, `describeTable`) are read-only
 * conveniences so a Gadget does not have to hand-write `information_schema`/`pg_catalog`
 * queries.
 */
export interface SupabaseDatabase {
  /**
   * Runs a read-only SQL statement and returns its rows.
   *
   * Executes in a read-only transaction as a restricted read-only database role, so statements
   * that write data or modify schema fail. This method is for **reads only** — do not use it to
   * cause side effects. Calls to known side-effecting primitives (network/file extensions such as
   * `pg_net`, `http`, `dblink`, `pg_read_file`, etc.) are rejected; do anything with external
   * effects through `execute()` instead.
   *
   * Entity references should be schema-qualified (e.g. `public.users`).
   *
   * Results are returned in full — there is no streaming — so include a `LIMIT` for
   * potentially large result sets. A result larger than ~16 MB is rejected; page through big
   * tables with `LIMIT`/`OFFSET`. Queries are also bound to roughly 30 seconds.
   *
   * `params` are bound positionally as `$1`, `$2`, … in `sql`. Always parameterize
   * untrusted values rather than interpolating them, to avoid SQL injection.
   *
   * A change made by a recent `execute()` is not visible here until it has been approved and
   * applied (there is no simulation of pending writes), so don't rely on reading back your own
   * writes — see `execute()`.
   */
  query(sql: string, params?: SupabaseValue[]): Promise<SupabaseQueryResult>;

  /**
   * Runs a mutating SQL statement — `INSERT`/`UPDATE`/`DELETE`/DDL/etc.
   *
   * Mutating statements require human approval. Calling this **submits** the statement; it does
   * not run until a person approves it, which may happen later. The change is **not** observed by a
   * subsequent `query()` until it has been approved and applied — this is expected, not a failure,
   * so don't retry or treat the not-yet-visible data as an error. Values a statement would produce
   * (e.g. via `RETURNING`) are likewise unavailable; if you need an identifier for a row you insert,
   * generate it in the statement (e.g. bind a `gen_random_uuid()` value you choose) rather than
   * relying on `RETURNING`.
   *
   * `params` are bound positionally as `$1`, `$2`, …; always parameterize untrusted values to
   * avoid SQL injection.
   */
  execute(sql: string, params?: SupabaseValue[]): Promise<void>;

  /** Lists the names of non-system schemas in the database. Read-only. */
  listSchemas(): Promise<string[]>;

  /**
   * Lists tables and views in the database. Read-only.
   *
   * By default only the `public` schema is listed; pass `options.schema` to target another.
   */
  listTables(options?: SupabaseListTablesOptions): Promise<SupabaseTable[]>;

  /**
   * Returns detailed information about a single table or view: its columns, primary key,
   * foreign keys, whether row-level security is enabled, and an approximate row count.
   *
   * Read-only. Throws if the table does not exist.
   */
  describeTable(schema: string, name: string): Promise<SupabaseTableDetails>;
}

/** Options for `SupabaseDatabase.listTables()`. */
export type SupabaseListTablesOptions = {
  /** Schema to list tables from. Defaults to `"public"`. */
  schema?: string;
  /** Whether to include views in addition to tables. Defaults to `true`. */
  includeViews?: boolean;
};

/** A table or view summary. */
export type SupabaseTable = {
  schema: string;
  name: string;
  kind: "table" | "view";
  /** Whether row-level security is enabled (always `false` for views). */
  rlsEnabled: boolean;
  /**
   * Approximate row count from planner statistics (`pg_class.reltuples`). May be stale, and is
   * `null` when no statistics have been collected yet — i.e. a freshly created table that has not
   * been `ANALYZE`d (run `ANALYZE <table>`, or wait for autovacuum, to populate it) — and always
   * `null` for views.
   */
  approximateRowCount: number | null;
  /** Table comment, if any. */
  comment?: string;
};

/** Detailed table information returned by `SupabaseDatabase.describeTable()`. */
export type SupabaseTableDetails = SupabaseTable & {
  columns: SupabaseColumn[];
  /** Column names making up the primary key, in order. Empty if none. */
  primaryKey: string[];
  foreignKeys: SupabaseForeignKey[];
};

/** A single column of a table or view. */
export type SupabaseColumn = {
  name: string;
  /** Postgres data type (e.g. `"text"`, `"int4"`, `"timestamptz"`). */
  dataType: string;
  nullable: boolean;
  /** Default value expression, if any. */
  defaultValue?: string;
  /** Whether the column is an identity / auto-incrementing column. */
  isIdentity: boolean;
  /** Column comment, if any. */
  comment?: string;
};

/** A foreign-key relationship from a table's column(s) to another table. */
export type SupabaseForeignKey = {
  /** Local column names participating in the foreign key. */
  columns: string[];
  /** The referenced table's schema. */
  referencedSchema: string;
  /** The referenced table's name. */
  referencedTable: string;
  /** The referenced column names, positionally matched to `columns`. */
  referencedColumns: string[];
};
