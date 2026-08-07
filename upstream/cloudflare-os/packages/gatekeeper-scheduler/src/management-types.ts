import type { ScheduleStatus, ScheduleSummary } from "./types.js";

/** Account-management projection of one schedule. */
export type ManagementSchedule = ScheduleSummary & {
  /** The workspace this schedule delivers into. The host resolves its live title and route. */
  workspaceId: string;
  /** The gadget within that workspace, when the schedule is pinned to one. */
  gadgetId?: number;
};

/** Read-only filters accepted by the Scheduler management capability. */
export type ManagementListOptions = {
  /** Opaque continuation token. Pages are weakly consistent if schedules change between requests. */
  cursor?: string;
  query?: string;
  statuses?: ScheduleStatus[];
};

/** One bounded page returned to the Scheduler management app. */
export type ManagementSchedulePage = {
  schedules: ManagementSchedule[];
  cursor?: string;
};
