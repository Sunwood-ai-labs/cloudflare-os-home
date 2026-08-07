import type { NormalizedCalendarRule, ScheduleCadence, Weekday } from "./types.js";

/** Canonical persisted calendar recurrence. */
export type CalendarScheduleRule = NormalizedCalendarRule;

/** Canonical plain-data schedule definition. */
export type ScheduleSpec = ScheduleCadence;

/** Projects a persisted schedule definition to an independent public cadence value. */
export function toScheduleCadence(spec: ScheduleSpec): ScheduleCadence {
  if (spec.kind === "interval") {
    return { kind: "interval", everyMs: spec.everyMs, anchorMs: spec.anchorMs };
  }
  if (spec.kind === "once") {
    return { kind: "once", fireAt: spec.fireAt, timeZone: spec.timeZone };
  }

  return {
    kind: "calendar",
    timeZone: spec.timeZone,
    rule: toCalendarCadenceRule(spec.rule),
  };
}

function toCalendarCadenceRule(rule: CalendarScheduleRule): NormalizedCalendarRule {
  if (rule.freq === "hourly") {
    return {
      freq: "hourly",
      interval: rule.interval,
      minute: rule.minute,
      anchorMs: rule.anchorMs,
    };
  }
  if (rule.freq === "daily") {
    return {
      freq: "daily",
      interval: rule.interval,
      hour: rule.hour,
      minute: rule.minute,
      anchorMs: rule.anchorMs,
    };
  }
  return {
    freq: "weekly",
    interval: rule.interval,
    byDay: [...rule.byDay],
    hour: rule.hour,
    minute: rule.minute,
    anchorMs: rule.anchorMs,
  };
}

/** Weekday tokens in canonical Sunday-first order. */
export const WEEKDAY_TOKENS: readonly Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
