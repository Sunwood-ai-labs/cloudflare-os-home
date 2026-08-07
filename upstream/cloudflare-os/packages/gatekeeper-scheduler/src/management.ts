import type { ScheduleStatus, ScheduleSummary } from "./types.js";
import type {
  ManagementListOptions,
  ManagementSchedule,
  ManagementSchedulePage,
} from "./management-types.js";

export type {
  ManagementListOptions,
  ManagementSchedule,
  ManagementSchedulePage,
} from "./management-types.js";

/** Fixed maximum number of schedules returned to the management app per request. */
export const MANAGEMENT_PAGE_SIZE = 100;

const MAX_QUERY_LENGTH = 200;
const MAX_CURSOR_LENGTH = 1_024;
const STATUSES = ["active", "dead", "completed", "expired"] as const;

/** Internal storage-keyed row used to provide deterministic ordering. */
export type ManagementScheduleEntry = {
  key: string;
  schedule: ManagementSchedule;
};

// ponytail: Offset pages are weakly consistent; add revisions if large accounts see concurrent churn.
type Cursor = {
  version: 1;
  offset: number;
  query: string;
  statuses: ScheduleStatus[];
};

/** Filters, globally orders, and pages the account's bounded schedule set. */
export function paginateManagementSchedules(
  entries: readonly ManagementScheduleEntry[],
  options: ManagementListOptions = {},
): ManagementSchedulePage {
  const query = normalizeQuery(options.query);
  const statuses = normalizeStatuses(options.statuses);
  const offset = options.cursor ? decodeCursor(options.cursor, query, statuses) : 0;
  const selected = entries
    .filter(({ schedule }) => {
      if (!statuses.includes(schedule.status)) return false;
      if (!query) return true;
      return `${schedule.title}\n${schedule.description}`.toLowerCase().includes(query);
    })
    .toSorted(compareEntries);
  if (offset > selected.length) throw new TypeError("Invalid management cursor.");

  const end = Math.min(offset + MANAGEMENT_PAGE_SIZE, selected.length);
  return {
    schedules: selected.slice(offset, end).map(({ schedule }) => schedule),
    cursor:
      end < selected.length
        ? encodeCursor({ version: 1, offset: end, query, statuses })
        : undefined,
  };
}

function normalizeQuery(query: string | undefined): string {
  if (query === undefined) return "";
  if (typeof query !== "string") throw new TypeError("Schedule query must be a string.");
  const normalized = query.trim().toLowerCase();
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`Schedule query must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeStatuses(statuses: ScheduleStatus[] | undefined): ScheduleStatus[] {
  if (statuses === undefined) return [...STATUSES];
  if (!Array.isArray(statuses)) throw new TypeError("Schedule statuses must be an array.");
  const selected = new Set<ScheduleStatus>();
  for (const status of statuses) {
    if (!(STATUSES as readonly unknown[]).includes(status)) {
      throw new TypeError("Invalid schedule status.");
    }
    selected.add(status);
  }
  return STATUSES.filter((status) => selected.has(status));
}

function compareEntries(left: ManagementScheduleEntry, right: ManagementScheduleEntry): number {
  const status = statusRank(left.schedule.status) - statusRank(right.schedule.status);
  if (status !== 0) return status;
  let time = 0;
  if (left.schedule.status === "active" && right.schedule.status === "active") {
    time = activeTime(left.schedule) - activeTime(right.schedule);
  } else if (left.schedule.status !== "active" && right.schedule.status !== "active") {
    time = terminalTime(right.schedule) - terminalTime(left.schedule);
  }
  return time || left.key.localeCompare(right.key);
}

function statusRank(status: ScheduleStatus): number {
  if (status === "active") return 0;
  if (status === "dead") return 1;
  return 2;
}

function activeTime(schedule: Extract<ScheduleSummary, { status: "active" }>): number {
  return schedule.nextFire ?? Number.MAX_SAFE_INTEGER;
}

function terminalTime(schedule: Exclude<ScheduleSummary, { status: "active" }>): number {
  if (schedule.status === "dead") return schedule.failedAt;
  if (schedule.status === "completed") return schedule.completedAt;
  return schedule.expiredAt;
}

function encodeCursor(cursor: Cursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(value: string, query: string, statuses: ScheduleStatus[]): number {
  try {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_CURSOR_LENGTH) {
      throw new TypeError();
    }
    const encoded = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    const cursor = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))),
    ) as Partial<Cursor>;
    if (
      cursor.version !== 1 ||
      !Number.isSafeInteger(cursor.offset) ||
      (cursor.offset ?? 0) <= 0 ||
      typeof cursor.query !== "string" ||
      !Array.isArray(cursor.statuses)
    ) {
      throw new TypeError();
    }
    if (cursor.query !== query || !sameStatuses(cursor.statuses, statuses)) {
      throw new TypeError("Cursor does not match the current filters.");
    }
    return cursor.offset!;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("Cursor does not match"))
      throw error;
    throw new TypeError("Invalid management cursor.", { cause: error });
  }
}

function sameStatuses(left: ScheduleStatus[], right: ScheduleStatus[]): boolean {
  return left.length === right.length && left.every((status, index) => status === right[index]);
}
