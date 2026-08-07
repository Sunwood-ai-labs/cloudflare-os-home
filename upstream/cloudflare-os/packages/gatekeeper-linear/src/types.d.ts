// Session API exposed to Gadgets/agents by the Linear gatekeeper.
//
// Linear is a team-based issue tracker. The gatekeeper exposes three grantable resource
// granularities, each with its own Session interface:
//
//   - LinearWorkspace — the whole workspace: every team and issue.
//   - LinearTeam      — a single team and the issues, cycles, labels and states it owns.
//   - LinearIssue     — a single issue.
//
// `LinearIssue` is both a standalone grantable resource AND the object returned when you open
// an issue from a workspace/team session, so the same capability shape is reused everywhere an
// issue is referenced.
//
// Projects are not separately grantable, but they are still referenced: issues report their
// project, can be filed under one, and projects can be listed for discovery.

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Access to an entire Linear workspace: all of its teams, projects, and issues.
 */
export interface LinearWorkspace {
  /** Returns basic information about the workspace (organization). */
  getMetadata(): Promise<LinearWorkspaceMetadata>;

  /** Lists the teams in this workspace. */
  listTeams(options?: LinearPageOptions): Promise<Cursor<LinearTeamSummary>>;

  /**
   * Opens a specific team by its key (e.g. `"ENG"`) or UUID.
   *
   * Throws if no such team exists or it is not accessible.
   */
  getTeam(teamKeyOrId: string): Promise<LinearTeam>;

  /** Lists the projects in this workspace (for discovery; projects are not separately grantable). */
  listProjects(options?: LinearPageOptions): Promise<Cursor<LinearProjectSummary>>;

  /**
   * Lists issues across the whole workspace, most-recently-updated first by default.
   *
   * Results are streamed through the returned cursor — call `next()` repeatedly until it
   * returns `null`.
   */
  listIssues(filter?: LinearIssueFilter): Promise<Cursor<LinearIssueSummary>>;

  /** Full-text searches issues across the whole workspace. `query.text` is the search string. */
  searchIssues(query: LinearIssueSearch): Promise<Cursor<LinearIssueSummary>>;

  /** Opens a specific issue by its identifier (e.g. `"ENG-123"`) or UUID. */
  getIssue(id: string): Promise<LinearIssue>;

  /**
   * Creates a new issue. Because a workspace spans multiple teams, `options.teamKey` (or
   * `options.teamId`) is required here.
   */
  createIssue(options: LinearCreateIssueOptions): Promise<LinearIssue>;

  /**
   * Looks up workspace members (up to 50). With a `query`, filters by a case-insensitive
   * name/email substring; with no query (or an empty string), returns the first members.
   * Useful for resolving assignees before creating or updating issues.
   */
  findMembers(query?: string): Promise<LinearUser[]>;
}

/**
 * Access to a single Linear team and everything it owns: issues, workflow states, labels,
 * cycles, and the projects it participates in.
 */
export interface LinearTeam {
  /** Returns metadata about the team. */
  getMetadata(): Promise<LinearTeamMetadata>;

  /** Lists issues in this team, most-recently-updated first by default. */
  listIssues(filter?: LinearIssueFilter): Promise<Cursor<LinearIssueSummary>>;

  /** Full-text searches issues within this team. */
  searchIssues(query: LinearIssueSearch): Promise<Cursor<LinearIssueSummary>>;

  /** Opens a specific issue in this team by identifier (e.g. `"ENG-123"`) or UUID. */
  getIssue(id: string): Promise<LinearIssue>;

  /**
   * Creates a new issue in this team.
   *
   * `options.teamKey`/`options.teamId` are ignored here — the issue is always created in this team.
   */
  createIssue(options: LinearCreateIssueOptions): Promise<LinearIssue>;

  /**
   * Lists the team's workflow states (the possible values of an issue's "status", e.g.
   * "Todo", "In Progress", "Done"). Use these names with {@link LinearIssue.setState}.
   */
  listWorkflowStates(): Promise<LinearWorkflowState[]>;

  /**
   * Lists the team's labels, including any you have created with {@link LinearTeam.createLabel}.
   * Use these names with {@link LinearIssue.addLabels}.
   */
  listLabels(): Promise<LinearLabel[]>;

  /**
   * Creates a new label in this team.
   *
   * This is the explicit way to introduce a label — {@link LinearIssue.addLabels} never creates
   * labels implicitly. Throws if a label with the same name already exists in the team.
   */
  createLabel(name: string, options?: LinearCreateLabelOptions): Promise<LinearLabel>;

  /** Lists the projects this team participates in (for discovery; projects are not grantable). */
  listProjects(options?: LinearPageOptions): Promise<Cursor<LinearProjectSummary>>;

  /** Lists the team's cycles (sprints), most recent first. */
  listCycles(options?: LinearPageOptions): Promise<Cursor<LinearCycleSummary>>;

  /** Lists the members of this team. */
  listMembers(): Promise<LinearUser[]>;
}

/**
 * A single Linear issue.
 *
 * Read methods (`getDetails`, `readComments`) are observations. Every other method is an
 * action with an externally-visible side effect.
 */
export interface LinearIssue {
  /** Returns the current issue details, including the Markdown description. */
  getDetails(): Promise<LinearIssueDetails>;

  /** Replaces the issue title. */
  setTitle(title: string): Promise<void>;

  /** Replaces the issue description (Markdown). */
  setDescription(descriptionMarkdown: string): Promise<void>;

  /**
   * Moves the issue to a different workflow state.
   *
   * `state` matches a workflow state by name (case-insensitive, e.g. "In Progress") within the
   * issue's team. Use {@link LinearTeam.listWorkflowStates} to discover valid names.
   */
  setState(state: string): Promise<void>;

  /**
   * Assigns the issue to a user, or unassigns it when given `null`.
   *
   * `assignee` may be a user's email, display name, or UUID. Throws if it cannot be resolved to
   * exactly one workspace member.
   */
  setAssignee(assignee: string | null): Promise<void>;

  /** Sets the issue priority. */
  setPriority(priority: LinearPriority): Promise<void>;

  /**
   * Attaches existing labels to the issue, by name (case-insensitive).
   *
   * `addLabels` never creates labels — to introduce a new label, call {@link LinearTeam.createLabel}
   * and then attach it by name here. Throws if no label with the given name exists.
   *
   * Adding and removing different labels compose correctly, so concurrent `addLabels` and
   * `removeLabels` calls don't clobber each other's changes.
   */
  addLabels(labels: string[]): Promise<void>;

  /** Removes labels from the issue, by name. Names not currently on the issue are ignored. */
  removeLabels(labels: string[]): Promise<void>;

  /** Moves the issue into a project (by UUID), or removes it from its project when given `null`. */
  setProject(projectId: string | null): Promise<void>;

  /** Sets or clears the issue due date. `date` is an ISO calendar date like `"2026-03-01"`. */
  setDueDate(date: string | null): Promise<void>;

  /** Sets or clears the issue's parent (making this a sub-issue). */
  setParent(parentId: string | null): Promise<void>;

  /** Reads the issue's comment thread, oldest first. */
  readComments(options?: LinearPageOptions): Promise<Cursor<LinearComment>>;

  /** Posts a new Markdown comment to the issue. */
  postComment(bodyMarkdown: string): Promise<void>;

  /** Creates a sub-issue under this issue, in the same team. */
  createSubIssue(options: LinearCreateIssueOptions): Promise<LinearIssue>;

  /** Archives the issue (Linear's soft-delete). Reversible via the Linear UI or `unarchive`. */
  archive(): Promise<void>;

  /** Restores a previously archived issue. */
  unarchive(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * A pagination cursor. This is an RPC object: call `next()` repeatedly on the same cursor to
 * fetch subsequent batches. `next()` returns `null` once exhausted. Dispose the cursor when done.
 */
export interface Cursor<T> {
  next(): Promise<T[] | null>;
}

/** Generic paging options for cursor-backed result sets. */
export type LinearPageOptions = {
  /** Maximum number of results per `next()` batch (Linear caps this at 250). */
  resultsPerPage?: number;
  /** Include archived items in results. Defaults to false. */
  includeArchived?: boolean;
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Filters for listing issues. */
export type LinearIssueFilter = LinearPageOptions & {
  /** Filter by workflow state name (e.g. "In Progress") or by state category. */
  state?: string | LinearStateCategory;
  /** Filter by assignee email, display name, or UUID. */
  assignee?: string;
  /** Only issues carrying all of these label names. */
  labels?: string[];
  /** Filter by priority. */
  priority?: LinearPriority;
  /** Filter to a specific project UUID. */
  projectId?: string;
  /** Sort field. Defaults to "updated". Both sorts are newest-first. */
  sort?: "created" | "updated";
};

/** Filters for searching issues. Extends {@link LinearIssueFilter} with a text query. */
export type LinearIssueSearch = LinearIssueFilter & {
  /** Plain-text search string, matched against issue title and description. */
  text: string;
};

// ---------------------------------------------------------------------------
// Create / update options
// ---------------------------------------------------------------------------

/** Options for creating a new issue. */
export type LinearCreateIssueOptions = {
  title: string;
  descriptionMarkdown?: string;
  /**
   * Team key (e.g. "ENG") that the issue belongs to. Required for {@link LinearWorkspace}
   * sessions; ignored by {@link LinearTeam.createIssue}.
   */
  teamKey?: string;
  /** Team UUID, as an alternative to `teamKey`. */
  teamId?: string;
  /** Initial workflow state name (e.g. "Todo"). Defaults to the team's default state. */
  state?: string;
  /** Assignee email, display name, or UUID. */
  assignee?: string;
  /** Label names to attach. */
  labels?: string[];
  /** Initial priority. Defaults to "none". */
  priority?: LinearPriority;
  /** Project UUID to file the issue under. */
  projectId?: string;
  /** Due date as an ISO calendar date like `"2026-03-01"`. */
  dueDate?: string;
  /** Parent issue identifier or UUID, to create this as a sub-issue. */
  parentId?: string;
};

/** Options for {@link LinearTeam.createLabel}. */
export type LinearCreateLabelOptions = {
  /** Hex color string like `"#5e6ad2"`. */
  color?: string;
  description?: string;
};

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/** Issue priority, exposed as friendly names (Linear stores these as 0–4 internally). */
export type LinearPriority = "none" | "urgent" | "high" | "medium" | "low";

/** The category a workflow state falls into. */
export type LinearStateCategory =
  | "triage"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

/** High-level lifecycle status of a project. */
export type LinearProjectStatus =
  | "backlog"
  | "planned"
  | "started"
  | "paused"
  | "completed"
  | "canceled";

/** Basic information about the workspace (organization). */
export type LinearWorkspaceMetadata = {
  id: string;
  name: string;
  /** The workspace's URL key (the first path segment of linear.app URLs). */
  urlKey: string;
  url: string;
};

/** A reference to a team. */
export type LinearTeamRef = {
  id: string;
  /** Short team key, e.g. "ENG". */
  key: string;
  name: string;
  url: string;
};

/** A compact team summary. */
export type LinearTeamSummary = LinearTeamRef & {
  description?: string;
  private: boolean;
};

/** Full team metadata. (Currently identical to {@link LinearTeamSummary}.) */
export type LinearTeamMetadata = LinearTeamSummary;

/** A Linear user (workspace member). */
export type LinearUser = {
  id: string;
  name: string;
  displayName?: string;
  /** Present only when the connected account is allowed to see member emails. */
  email?: string;
  avatarUrl?: string;
  /** False for deactivated/suspended members. */
  active: boolean;
};

/** A label that can be attached to issues. */
export type LinearLabel = {
  id: string;
  name: string;
  color?: string;
};

/** A workflow state (issue "status") belonging to a team. */
export type LinearWorkflowState = {
  id: string;
  name: string;
  type: LinearStateCategory;
  color?: string;
  /** Ordering position within the team's workflow. */
  position?: number;
};

/** A reference to a project. */
export type LinearProjectRef = {
  id: string;
  name: string;
  url: string;
};

/** A compact project summary. */
export type LinearProjectSummary = LinearProjectRef & {
  status: LinearProjectStatus;
  lead?: LinearUser | null;
  /** Fraction complete, 0–1, if Linear reports it. */
  progress?: number;
  /** ISO calendar dates. */
  startDate?: string;
  targetDate?: string;
};

/** A reference to a cycle (sprint). */
export type LinearCycleSummary = {
  id: string;
  number: number;
  name?: string;
  /** ISO timestamps. */
  startsAt?: string;
  endsAt?: string;
  /** True if this is the team's current cycle. */
  isActive: boolean;
};

/** A reference to an issue. */
export type LinearIssueRef = {
  /** The issue's identifier (e.g. `"ENG-123"`). Usable as a lookup key with `getIssue`. */
  id: string;
  /** The issue's stable UUID. */
  uuid?: string;
  title: string;
  url: string;
};

/** The workflow state of an issue, summarized inline. */
export type LinearIssueState = {
  name: string;
  type: LinearStateCategory;
};

/** A compact issue summary returned from list and search operations. */
export type LinearIssueSummary = LinearIssueRef & {
  state: LinearIssueState;
  priority: LinearPriority;
  assignee: LinearUser | null;
  labels: LinearLabel[];
  team: LinearTeamRef;
  project: LinearProjectRef | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  canceledAt?: Date;
  /** ISO calendar date. */
  dueDate?: string;
};

/** Full issue details returned by {@link LinearIssue.getDetails}. */
export type LinearIssueDetails = LinearIssueSummary & {
  descriptionMarkdown: string;
  creator: LinearUser | null;
  parent: LinearIssueRef | null;
  cycle: LinearCycleSummary | null;
  /** Suggested git branch name for the issue. */
  branchName?: string;
};

/** A single comment on an issue. */
export type LinearComment = {
  id: string;
  author: LinearUser | null;
  bodyMarkdown: string;
  createdAt: Date;
  updatedAt?: Date;
  url: string;
};
