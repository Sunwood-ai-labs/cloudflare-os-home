/**
 * Notion gatekeeper Session API.
 *
 * Notion organizes everything as **pages** and **databases**. A database is a collection of
 * pages ("rows") that share a schema of typed **properties**. A page has both a set of property
 * values (when it lives in a database) and a body of rich **content** (text, headings, lists,
 * to-dos, etc.).
 *
 * To keep the API approachable, page/database bodies are exchanged as **Markdown** rather than
 * Notion's native block JSON, and property values use the simplified {@link NotionPropertyValue}
 * union rather than Notion's verbose property objects. Rich text is flattened to Markdown/plain
 * strings.
 *
 * Three resource granularities are offered, each with its own Session type:
 *  - {@link NotionWorkspace} — everything the connection can see (search + open pages/databases).
 *  - {@link NotionPage} — a single page (and, transitively, its sub-pages).
 *  - {@link NotionDatabase} — a single database (query rows, read schema, add rows).
 */

/**
 * The whole connected Notion workspace: every page and database the user shared with this
 * connection. Use this when an agent should be able to roam the workspace; grant a single
 * {@link NotionPage} or {@link NotionDatabase} instead to limit reach.
 */
export interface NotionWorkspace {
  /** Basic info about the connected workspace (name, icon, the authorizing user). */
  getMetadata(): Promise<NotionWorkspaceMetadata>;

  /**
   * Searches pages and databases shared with the connection by title.
   *
   * With no `query`, returns everything shared. Results stream through the returned cursor; call
   * `next()` until it returns `null`. Note Notion search is title-only and eventually consistent —
   * very recently created items may not appear immediately.
   *
   * Caution: results can include database **templates** (the preset "New item" entries). A template
   * appears here as an ordinary page and resolves via {@link getPage} with a database parent, but is
   * intentionally absent from {@link NotionDatabase.query} (which returns only real rows). So a page
   * with a database parent that you can't find via `query` may simply be a template.
   */
  search(options?: NotionSearchOptions): Promise<Cursor<NotionItemSummary>>;

  /**
   * Opens a specific page by its Notion URL or 32-character ID. Throws if the ID actually refers
   * to a database, or if the page isn't shared with the connection.
   */
  getPage(idOrUrl: string): Promise<NotionPage>;

  /**
   * Opens a specific database by its Notion URL or 32-character ID. Throws if the ID actually
   * refers to a page, or if the database isn't shared with the connection.
   */
  getDatabase(idOrUrl: string): Promise<NotionDatabase>;

  /**
   * Creates a new page in the workspace. Notion's API can't create a truly top-level page, so the
   * page is created under a writable shared page. To control the location, use
   * {@link NotionPage.createSubPage} or {@link NotionDatabase.createPage} instead.
   */
  createPage(options: NotionCreatePageOptions): Promise<NotionPage>;

  /** Lists the people (and bots) that are members of the workspace. */
  listUsers(options?: NotionPageOptions): Promise<Cursor<NotionUser>>;
}

/**
 * A single Notion page.
 *
 * A page has a **body** (free-form content, exchanged as Markdown) and, when it lives inside a
 * database, a set of typed **property** values (its database "row" fields). A standalone page has
 * only a title.
 */
export interface NotionPage {
  /** Returns page metadata: title, URL, icon, parent, timestamps, archived/locked state. */
  getMetadata(): Promise<NotionPageMetadata>;

  /**
   * Returns the page's property values, keyed by property name. For a standalone page this is
   * just the title; for a page in a database it is the full row. See {@link NotionPropertyValue}.
   */
  getProperties(): Promise<Record<string, NotionPropertyValue>>;

  /**
   * Returns the page body converted to Markdown.
   *
   * Supported blocks are mapped to Markdown (headings, paragraphs, bullet/numbered lists, to-dos,
   * quotes, callouts, code, dividers, toggles, tables, and child-page links). Unsupported or
   * media blocks are rendered as a best-effort placeholder. Child pages appear as Markdown links;
   * fetch them with {@link NotionWorkspace.getPage} or {@link listChildPages}.
   */
  getContent(): Promise<string>;

  /**
   * Lists the page's child pages and databases, as summaries. This includes sub-pages nested
   * inside layout blocks (columns, toggles, etc.), not just top-level children.
   */
  listChildPages(options?: NotionPageOptions): Promise<Cursor<NotionItemSummary>>;

  /**
   * Appends Markdown content to the end of the page body.
   *
   * Supported Markdown: headings (`#`–`###`; Notion has only three heading levels — deeper `#`s
   * become a level-3 heading), paragraphs, bold/italic/strikethrough/inline code, links, bullet and
   * numbered lists, `- [ ]`/`- [x]` to-dos, `>` quotes, fenced code blocks (with language), `---`
   * dividers. Unsupported constructs degrade to plain paragraphs.
   */
  appendContent(markdown: string): Promise<void>;

  /** Replaces the page title. */
  setTitle(title: string): Promise<void>;

  /**
   * Sets one or more property values on the page (only meaningful for pages in a database).
   * Properties not named are left unchanged. Property names and types must match the parent
   * database schema — read it via {@link NotionDatabase.getSchema}. Throws if a named property
   * doesn't exist or the value type is incompatible.
   */
  setProperties(properties: Record<string, NotionPropertyInput>): Promise<void>;

  /** Sets or clears the page icon (an emoji, or an external image URL). Pass `null` to clear. */
  setIcon(icon: NotionIconInput | null): Promise<void>;

  /** Creates a new sub-page nested under this page. */
  createSubPage(options: NotionCreatePageOptions): Promise<NotionPage>;

  /** Moves the page to the trash. Reversible via {@link restore} while it remains in the trash. */
  archive(): Promise<void>;

  /** Restores the page from the trash. */
  restore(): Promise<void>;

  /** Reads the page-level comment thread. */
  listComments(options?: NotionPageOptions): Promise<Cursor<NotionComment>>;

  /** Posts a new comment to the page-level comment thread. */
  addComment(text: string): Promise<void>;
}

/**
 * A single Notion database: a collection of pages ("rows") sharing a {@link NotionDatabaseSchema}.
 *
 * In Notion's current data model a database contains one or more "data sources"; this API
 * operates on the database's primary (first) data source, which is the only one for the vast
 * majority of databases.
 */
export interface NotionDatabase {
  /** Returns database metadata: title, description, URL, timestamps. */
  getMetadata(): Promise<NotionDatabaseMetadata>;

  /**
   * Returns the database's property schema (the columns and their types/options).
   *
   * Note: Notion's built-in special databases (e.g. the workspace "People"/members directory) may
   * expose synthetic columns on rows (such as an `Email` rollup) that Notion omits from the schema
   * response. For ordinary user databases the schema and row properties agree.
   */
  getSchema(): Promise<NotionDatabaseSchema>;

  /**
   * Queries the database's pages (rows), with optional filtering and sorting.
   *
   * Results stream through the returned cursor; call `next()` until it returns `null`. Filters
   * reference properties by name (see {@link NotionQueryFilter}).
   *
   * Note: database *templates* (the preset "New item" entries) are not rows and are intentionally
   * excluded here, matching Notion. They can still be opened individually with {@link getPage}.
   */
  query(options?: NotionQueryOptions): Promise<Cursor<NotionPageSummary>>;

  /**
   * Opens a specific page (row) in this database by Notion URL or 32-character ID. Throws if the
   * page is not in this database.
   */
  getPage(idOrUrl: string): Promise<NotionPage>;

  /**
   * Creates a new page (row) in the database with the given property values, and optional body
   * content. Property names/types must match the schema. The new page's `title` property is set
   * from `title` if provided, otherwise from a `title`-typed entry in `properties`.
   */
  createPage(options: NotionCreateDatabasePageOptions): Promise<NotionPage>;
}

// ---------------------------------------------------------------------------------------------
// Cursors & paging

/**
 * A pagination cursor. This is an RPC object: call `next()` repeatedly on the *same* cursor to
 * fetch successive batches, until it returns `null`. Dispose the cursor when finished.
 */
export interface Cursor<T> {
  next(): Promise<T[] | null>;
}

/** Generic paging options for cursor-backed result sets. */
export type NotionPageOptions = {
  /** Items per batch. Clamped to Notion's supported range of 1–100; defaults to the maximum. */
  pageSize?: number;
}

// ---------------------------------------------------------------------------------------------
// Workspace / search

/** Display metadata for the connected workspace. */
export type NotionWorkspaceMetadata = {
  /** Workspace name, if available. */
  name?: string;
  /** Workspace icon (emoji or image URL), if available. */
  icon?: string;
  /** The user who authorized this connection. */
  authorizedBy: NotionUser | null;
}

/** Options for {@link NotionWorkspace.search}. */
export type NotionSearchOptions = NotionPageOptions & {
  /** Title text to match. Omit to return everything shared with the connection. */
  query?: string;
  /** Restrict results to one object kind. */
  filter?: "page" | "database";
  /** Sort by last-edited time. Defaults to Notion's relevance ranking. */
  sort?: "lastEditedAscending" | "lastEditedDescending";
}

/** The kind of a Notion object. */
export type NotionObjectKind = "page" | "database";

/** A compact summary of a page or database, returned by search and listing operations. */
export type NotionItemSummary = {
  kind: NotionObjectKind;
  /** The 32-character Notion object ID. */
  id: string;
  /** Plain-text title. */
  title: string;
  url: string;
  icon?: string;
  createdAt: Date;
  lastEditedAt: Date;
}

// ---------------------------------------------------------------------------------------------
// Pages

/**
 * A reference to a page's parent container.
 *
 * A `block` parent means the page is nested inside a layout block (a column or toggle) rather than
 * directly under a page; `blockId` identifies that block, which is not itself openable via
 * `getPage`. Use {@link NotionPage.listChildPages} on the containing page to navigate such pages.
 */
export type NotionParent =
  | { type: "workspace" }
  | { type: "page"; pageId: string }
  | { type: "database"; databaseId: string }
  | { type: "block"; blockId: string };

/** Full page metadata. */
export type NotionPageMetadata = {
  id: string;
  title: string;
  url: string;
  icon?: string;
  parent: NotionParent;
  createdAt: Date;
  lastEditedAt: Date;
  createdBy: NotionUser | null;
  lastEditedBy: NotionUser | null;
  /** True if the page is currently in the trash. */
  archived: boolean;
  /** True if the page is locked from editing in the Notion app. */
  locked: boolean;
}

/** A page summary returned from database queries (includes its property values). */
export type NotionPageSummary = {
  id: string;
  title: string;
  url: string;
  icon?: string;
  createdAt: Date;
  lastEditedAt: Date;
  /** The row's property values, keyed by property name. */
  properties: Record<string, NotionPropertyValue>;
}

/** A Notion user or bot. */
export type NotionUser = {
  id: string;
  /** Display name, if available. */
  name?: string;
  /** Avatar image URL, if available. */
  avatarUrl?: string;
  /** "person" or "bot". */
  type?: "person" | "bot";
  /** Email, only present for people the connection is allowed to see it for. */
  email?: string;
}

/** Options for creating a standalone or sub-page. */
export type NotionCreatePageOptions = {
  title: string;
  /** Optional initial body content, as Markdown (see {@link NotionPage.appendContent}). */
  content?: string;
  /** Optional page icon. */
  icon?: NotionIconInput;
}

/** A page icon to set: a single emoji character, or an external image URL. */
export type NotionIconInput =
  | { emoji: string }
  | { imageUrl: string };

// ---------------------------------------------------------------------------------------------
// Databases & properties

/** Full database metadata. */
export type NotionDatabaseMetadata = {
  id: string;
  title: string;
  description?: string;
  url: string;
  icon?: string;
  createdAt: Date;
  lastEditedAt: Date;
}

/** The schema of a database: its properties, keyed by property name. */
export type NotionDatabaseSchema = {
  properties: Record<string, NotionPropertySchema>;
}

/** Description of one database property (column). */
export type NotionPropertySchema = {
  /** Notion's internal property ID. */
  id: string;
  /** The property's value type (e.g. `"title"`, `"select"`, `"number"`, `"date"`...). */
  type: NotionPropertyType;
  /** For `select`, `multi_select`, and `status` properties: the allowed option names. */
  options?: string[];
}

/** The set of Notion property value types. */
export type NotionPropertyType =
  | "title" | "rich_text" | "number" | "select" | "multi_select" | "status"
  | "date" | "checkbox" | "url" | "email" | "phone_number" | "people"
  | "relation" | "formula" | "rollup" | "files" | "unique_id"
  | "created_time" | "last_edited_time" | "created_by" | "last_edited_by";

/**
 * A property value as read from a page. A discriminated union on `type`. Rich text is flattened
 * to plain strings. Types the gatekeeper doesn't model are surfaced as `{ type: "unsupported" }`.
 */
export type NotionPropertyValue =
  | { type: "title"; text: string }
  | { type: "rich_text"; text: string }
  | { type: "number"; number: number | null }
  | { type: "select"; option: string | null }
  | { type: "multi_select"; options: string[] }
  | { type: "status"; status: string | null }
  | { type: "date"; start: string | null; end: string | null }
  | { type: "checkbox"; checked: boolean }
  | { type: "url"; url: string | null }
  | { type: "email"; email: string | null }
  | { type: "phone_number"; phoneNumber: string | null }
  | { type: "people"; people: NotionUser[] }
  | { type: "relation"; pageIds: string[] }
  | { type: "formula"; value: string | number | boolean | null }
  | { type: "rollup"; summary: string }
  | { type: "files"; files: { name: string; url: string }[] }
  | { type: "unique_id"; value: string }
  | { type: "created_time"; time: Date }
  | { type: "last_edited_time"; time: Date }
  | { type: "created_by"; user: NotionUser | null }
  | { type: "last_edited_by"; user: NotionUser | null }
  | { type: "unsupported"; rawType: string };

/**
 * A writable property value, used by {@link NotionPage.setProperties} and database page creation.
 * Only properties Notion permits writing are included (computed types like `formula`, `rollup`,
 * `created_time`, etc. are read-only and cannot be set).
 */
export type NotionPropertyInput =
  | { type: "title"; text: string }
  | { type: "rich_text"; text: string }
  | { type: "number"; number: number | null }
  | { type: "select"; option: string | null }
  | { type: "multi_select"; options: string[] }
  | { type: "status"; status: string | null }
  | { type: "date"; start: string | null; end?: string | null }
  | { type: "checkbox"; checked: boolean }
  | { type: "url"; url: string | null }
  | { type: "email"; email: string | null }
  | { type: "phone_number"; phoneNumber: string | null }
  | { type: "people"; userIds: string[] }
  | { type: "relation"; pageIds: string[] }
  | { type: "files"; files: { name: string; url: string }[] };

/** Options for {@link NotionDatabase.query}. */
export type NotionQueryOptions = NotionPageOptions & {
  /** Optional filter on property values. */
  filter?: NotionQueryFilter;
  /** Optional ordering. Earlier sorts take precedence. */
  sorts?: NotionQuerySort[];
}

/** A sort directive for a database query. */
export type NotionQuerySort = {
  /** Property name to sort by, or a timestamp. */
  property?: string;
  timestamp?: "created_time" | "last_edited_time";
  direction: "ascending" | "descending";
}

/**
 * A database query filter.
 *
 * Either a single condition on a named property, or a compound `and`/`or` of nested filters.
 * `value` is interpreted according to the property's type and the chosen `condition`.
 */
export type NotionQueryFilter =
  | {
      property: string;
      /**
       * The comparison to apply, e.g. `"equals"`, `"contains"`, `"greater_than"`,
       * `"is_empty"`, `"before"`, `"after"`. Must be valid for the property's type.
       */
      condition: string;
      /** The comparison operand. Omit for unary conditions like `is_empty`. */
      value?: string | number | boolean;
    }
  | { and: NotionQueryFilter[] }
  | { or: NotionQueryFilter[] };

/** Options for creating a page (row) in a database. */
export type NotionCreateDatabasePageOptions = {
  /** Convenience for setting the title property. */
  title?: string;
  /** Property values to set on the new row, keyed by property name. */
  properties?: Record<string, NotionPropertyInput>;
  /** Optional body content, as Markdown. */
  content?: string;
  /** Optional page icon. */
  icon?: NotionIconInput;
}

// ---------------------------------------------------------------------------------------------
// Comments

/** A comment on a page. */
export type NotionComment = {
  id: string;
  /** Plain-text comment body. */
  text: string;
  author: NotionUser | null;
  createdAt: Date;
}
