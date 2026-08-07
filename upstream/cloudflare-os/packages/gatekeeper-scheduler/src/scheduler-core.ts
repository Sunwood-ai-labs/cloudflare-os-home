import { Temporal } from "temporal-polyfill/implementation";
import type {
  CalendarRule,
  NormalizedScheduleOccurrences,
  OneShotTime,
  RecurringScheduleOptions,
  ScheduleOptions,
  Weekday,
} from "./types.js";
import { WEEKDAY_TOKENS, type CalendarScheduleRule, type ScheduleSpec } from "./schedule-types.js";

/** Minimum supported elapsed interval. */
export const MIN_INTERVAL_MS = 60_000;
/** Milliseconds in an ordinary hour. */
export const HOUR_MS = 3_600_000;
/** Milliseconds in an ordinary day. */
export const DAY_MS = 86_400_000;
/** Milliseconds in an ordinary seven-day week. */
export const WEEK_MS = 7 * DAY_MS;
const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_SCHEDULE_TITLE_LENGTH = 200;
const MAX_SCHEDULE_DESCRIPTION_LENGTH = 2_000;
const MAX_TIME_ZONE_LENGTH = 128;
const MAX_WEEKDAYS = 7;
const EPOCH_DATE = Temporal.PlainDate.from("1970-01-01");

/** Validates and trims schedule presentation metadata. */
export function normalizeScheduleOptions(options: ScheduleOptions): ScheduleOptions {
  if (!options || typeof options !== "object")
    throw new TypeError("Schedule options are required.");
  const title = boundedText(options.title, "Schedule title", MAX_SCHEDULE_TITLE_LENGTH);
  if (hasControlCharacter(title)) {
    throw new TypeError("Schedule title must not contain control characters.");
  }
  return {
    title,
    description: boundedText(
      options.description,
      "Schedule description",
      MAX_SCHEDULE_DESCRIPTION_LENGTH,
    ),
  };
}

/** Validates presentation metadata and an optional finite recurrence bound. */
export function normalizeRecurringScheduleOptions(
  options: RecurringScheduleOptions,
  spec: ScheduleSpec,
  registeredAt: number,
): ScheduleOptions & { occurrences?: NormalizedScheduleOccurrences } {
  const normalized = normalizeScheduleOptions(options);
  const bound = options.occurrences;
  if (bound === undefined) return normalized;
  if (!bound || typeof bound !== "object") {
    throw new TypeError("Schedule occurrences must specify count or until.");
  }
  if ("count" in bound && "until" in bound) {
    throw new TypeError("Schedule occurrences must specify count or until, not both.");
  }
  if ("count" in bound) {
    assertSafePositiveInteger(bound.count, "Schedule occurrence count");
    return { ...normalized, occurrences: { count: bound.count } };
  }
  // An object carrying neither key lands here, where normalizeOneShot rejects the missing time.
  const { fireAt } = normalizeOneShot(bound.until, registeredAt);
  const first = nextFireAfter(spec, registeredAt);
  if (first === undefined || first > fireAt) {
    throw new RangeError("Schedule occurrence cutoff precedes the first occurrence.");
  }
  return { ...normalized, occurrences: { until: fireAt } };
}

/** Creates a canonical elapsed-time schedule anchored at registration. */
export function normalizeInterval(everyMs: number, registeredAtMs: number): ScheduleSpec {
  const spec: ScheduleSpec = { kind: "interval", everyMs, anchorMs: registeredAtMs };
  assertValidSpec(spec);
  return spec;
}

/** Creates a canonical calendar schedule anchored at registration. */
export function normalizeCalendarRule(rule: CalendarRule, registeredAtMs: number): ScheduleSpec {
  if (!rule || typeof rule !== "object") throw new TypeError("Calendar rule is required.");
  const timeZone = requiredTimeZone(rule.timeZone);
  const interval = rule.interval ?? 1;
  assertTimestamp(registeredAtMs);

  if (rule.byDay && rule.byDay.length > MAX_WEEKDAYS) {
    throw new RangeError(`A weekly schedule accepts at most ${MAX_WEEKDAYS} weekdays.`);
  }

  let normalizedRule: CalendarScheduleRule;
  switch (rule.freq) {
    case "hourly":
      if (rule.hour !== undefined) throw new TypeError("An hourly rule must not specify hour.");
      if (rule.byDay !== undefined) throw new TypeError("An hourly rule must not specify byDay.");
      normalizedRule = {
        freq: "hourly",
        interval,
        minute: rule.minute,
        anchorMs: registeredAtMs,
      };
      break;
    case "daily":
      if (rule.byDay !== undefined) throw new TypeError("A daily rule must not specify byDay.");
      normalizedRule = {
        freq: "daily",
        interval,
        hour: requiredHour(rule.hour, "daily"),
        minute: rule.minute,
        anchorMs: registeredAtMs,
      };
      break;
    case "weekly":
      normalizedRule = {
        freq: "weekly",
        interval,
        byDay: normalizeWeekdays(rule.byDay),
        hour: requiredHour(rule.hour, "weekly"),
        minute: rule.minute,
        anchorMs: registeredAtMs,
      };
      break;
    default:
      throw new TypeError("Calendar frequency must be hourly, daily, or weekly.");
  }

  const spec: ScheduleSpec = { kind: "calendar", timeZone, rule: normalizedRule };
  assertValidSpec(spec);
  assertCalendarRecurrenceRepresentable(spec, registeredAtMs);
  return spec;
}

/** Creates a canonical absolute one-shot schedule. */
export function normalizeOneShot(
  when: OneShotTime | number,
  now: number,
): Extract<ScheduleSpec, { kind: "once" }> {
  assertTimestamp(now);
  if (typeof when === "number") {
    const spec: ScheduleSpec = { kind: "once", fireAt: when, timeZone: "UTC" };
    assertValidSpec(spec);
    return spec;
  }
  if (!when || typeof when !== "object") throw new TypeError("One-shot time is required.");

  const timeZone = requiredTimeZone(when.timeZone);
  const fireAt = resolveOneShotWallClock(when, timeZone, now);
  const spec: ScheduleSpec = { kind: "once", fireAt, timeZone };
  assertValidSpec(spec);
  return spec;
}

/** Returns the first occurrence strictly after activation time. */
export function initialNextFire(spec: ScheduleSpec, now: number): number | undefined {
  const next = nextFireAfter(spec, now);
  if (spec.kind !== "once" && next === undefined) {
    throw new RangeError("Recurring schedule has no next occurrence.");
  }
  return next;
}

/** Returns the first occurrence strictly after the supplied timestamp. */
export function nextFireAfter(spec: ScheduleSpec, afterMs: number): number | undefined {
  assertTimestamp(afterMs);
  assertValidSpec(spec);

  if (spec.kind === "interval") {
    if (afterMs < spec.anchorMs) return spec.anchorMs;
    const occurrence = Math.floor((afterMs - spec.anchorMs) / spec.everyMs) + 1;
    return checkedTimestamp(spec.anchorMs + occurrence * spec.everyMs);
  }
  if (spec.kind === "once") return spec.fireAt > afterMs ? spec.fireAt : undefined;

  const threshold = checkedTimestamp(afterMs + 1);
  const result =
    spec.rule.freq === "hourly"
      ? nextHourly(spec.timeZone, spec.rule, threshold)
      : spec.rule.freq === "daily"
        ? nextDaily(spec.timeZone, spec.rule, threshold)
        : nextWeekly(spec.timeZone, spec.rule, threshold);
  return checkedTimestamp(result);
}

function assertValidSpec(spec: ScheduleSpec): void {
  if (!spec || typeof spec !== "object") throw new TypeError("Schedule definition is required.");
  switch (spec.kind) {
    case "interval":
      assertTimestamp(spec.anchorMs);
      assertSafePositiveInteger(spec.everyMs, "Elapsed interval");
      if (spec.everyMs < MIN_INTERVAL_MS) {
        throw new RangeError(`Elapsed interval must be at least ${MIN_INTERVAL_MS} milliseconds.`);
      }
      return;
    case "once":
      assertTimestamp(spec.fireAt);
      requiredTimeZone(spec.timeZone);
      return;
    case "calendar":
      requiredTimeZone(spec.timeZone);
      assertCalendarRule(spec.rule);
      return;
    default:
      throw new TypeError("Unknown schedule kind.");
  }
}

function assertCalendarRule(rule: CalendarScheduleRule): void {
  if (!rule || typeof rule !== "object") throw new TypeError("Calendar rule is required.");
  assertTimestamp(rule.anchorMs);
  assertSafePositiveInteger(rule.interval, "Calendar interval");
  assertMinute(rule.minute);
  if (rule.freq === "hourly") return;
  assertHour(rule.hour);
  if (rule.freq === "daily") return;
  if (rule.freq !== "weekly") throw new TypeError("Unknown calendar frequency.");
  if (!Array.isArray(rule.byDay) || rule.byDay.length === 0) {
    throw new TypeError("A weekly rule requires at least one weekday.");
  }
  if (rule.byDay.length > MAX_WEEKDAYS) {
    throw new RangeError(`A weekly rule accepts at most ${MAX_WEEKDAYS} weekdays.`);
  }
  let previous = -1;
  for (const weekday of rule.byDay) {
    const index = WEEKDAY_TOKENS.indexOf(weekday);
    if (index < 0 || index <= previous) {
      throw new TypeError("Weekly weekdays must be sorted unique weekday tokens.");
    }
    previous = index;
  }
}

function assertCalendarRecurrenceRepresentable(
  spec: Extract<ScheduleSpec, { kind: "calendar" }>,
  registeredAtMs: number,
): void {
  initialNextFire(spec, registeredAtMs);
  const anchor = zoned(spec.rule.anchorMs, spec.timeZone);
  if (spec.rule.freq === "hourly") {
    const phase = checkedInteger(dayOrdinal(anchor) * 24 + anchor.hour, "hour ordinal");
    const nextPhase = checkedInteger(phase + spec.rule.interval, "hour ordinal");
    calendarCandidate(
      spec.timeZone,
      floorDiv(nextPhase, 24),
      modulo(nextPhase, 24),
      spec.rule.minute,
    );
    return;
  }
  if (spec.rule.freq === "daily") {
    const nextPhase = checkedInteger(dayOrdinal(anchor) + spec.rule.interval, "day ordinal");
    calendarCandidate(spec.timeZone, nextPhase, spec.rule.hour, spec.rule.minute);
    return;
  }
  const nextPhase = checkedInteger(
    weekOrdinal(dayOrdinal(anchor)) + spec.rule.interval,
    "week ordinal",
  );
  const monday = checkedInteger(nextPhase * 7 - 3, "day ordinal");
  for (const weekday of spec.rule.byDay) {
    const day = checkedInteger(
      monday + modulo(WEEKDAY_TOKENS.indexOf(weekday) + 6, 7),
      "day ordinal",
    );
    calendarCandidate(spec.timeZone, day, spec.rule.hour, spec.rule.minute);
  }
}

function nextHourly(
  timeZone: string,
  rule: Extract<CalendarScheduleRule, { freq: "hourly" }>,
  threshold: number,
): number {
  const anchor = zoned(rule.anchorMs, timeZone);
  const current = zoned(threshold, timeZone);
  const phase = checkedInteger(dayOrdinal(anchor) * 24 + anchor.hour, "hour ordinal");
  const currentOrdinal = checkedInteger(dayOrdinal(current) * 24 + current.hour, "hour ordinal");
  return nextByUnit(phase, currentOrdinal, rule.interval, threshold, (ordinal) => {
    const day = floorDiv(ordinal, 24);
    return calendarCandidate(timeZone, day, modulo(ordinal, 24), rule.minute);
  });
}

function nextDaily(
  timeZone: string,
  rule: Extract<CalendarScheduleRule, { freq: "daily" }>,
  threshold: number,
): number {
  const phase = dayOrdinal(zoned(rule.anchorMs, timeZone));
  const current = dayOrdinal(zoned(threshold, timeZone));
  return nextByUnit(phase, current, rule.interval, threshold, (ordinal) =>
    calendarCandidate(timeZone, ordinal, rule.hour, rule.minute),
  );
}

function nextWeekly(
  timeZone: string,
  rule: Extract<CalendarScheduleRule, { freq: "weekly" }>,
  threshold: number,
): number {
  const phase = weekOrdinal(dayOrdinal(zoned(rule.anchorMs, timeZone)));
  const current = weekOrdinal(dayOrdinal(zoned(threshold, timeZone)));
  let index = Math.max(0, Math.floor((current - phase) / rule.interval));

  for (;;) {
    const week = checkedInteger(phase + index * rule.interval, "week ordinal");
    const monday = checkedInteger(week * 7 - 3, "day ordinal");
    let nextCandidate: number | undefined;
    for (const weekday of rule.byDay) {
      const day = checkedInteger(
        monday + modulo(WEEKDAY_TOKENS.indexOf(weekday) + 6, 7),
        "day ordinal",
      );
      const candidate = calendarCandidate(timeZone, day, rule.hour, rule.minute);
      if (candidate >= threshold && (nextCandidate === undefined || candidate < nextCandidate)) {
        nextCandidate = candidate;
      }
    }
    if (nextCandidate !== undefined) return nextCandidate;
    index = checkedIncrement(index);
  }
}

function nextByUnit(
  phase: number,
  current: number,
  step: number,
  threshold: number,
  makeCandidate: (ordinal: number) => number,
): number {
  let index = Math.max(0, Math.ceil((current - phase) / step));
  for (;;) {
    const ordinal = checkedInteger(phase + index * step, "calendar ordinal");
    const candidate = makeCandidate(ordinal);
    if (candidate >= threshold) return candidate;
    index = checkedIncrement(index);
  }
}

function calendarCandidate(
  timeZone: string,
  ordinal: number,
  hour: number,
  minute: number,
): number {
  const date = EPOCH_DATE.add({ days: ordinal });
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { disambiguation: "compatible", overflow: "constrain" },
  ).epochMilliseconds;
}

function resolveOneShotWallClock(when: OneShotTime, timeZone: string, now: number): number {
  assertHour(when.hour);
  assertMinute(when.minute);
  const second = when.second ?? 0;
  assertIntegerInRange(second, "Second", 0, 59);

  const dateParts = [when.year, when.month, when.day];
  const supplied = dateParts.filter((value) => value !== undefined).length;
  if (supplied !== 0 && supplied !== 3) {
    throw new TypeError("Provide year, month, and day together, or omit all three.");
  }

  if (supplied === 3) {
    assertIntegerInRange(when.year!, "Year", 1_000, 9_999);
    const candidate = Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: when.year!,
        month: when.month!,
        day: when.day!,
        hour: when.hour,
        minute: when.minute,
        second,
        millisecond: 0,
      },
      { disambiguation: "compatible", overflow: "reject" },
    );
    return checkedTimestamp(candidate.epochMilliseconds);
  }

  const localNow = zoned(now, timeZone);
  let date = localNow.toPlainDate();
  let candidate = oneShotCandidate(date, timeZone, when.hour, when.minute, second);
  if (candidate <= now) {
    date = date.add({ days: 1 });
    candidate = oneShotCandidate(date, timeZone, when.hour, when.minute, second);
  }
  return checkedTimestamp(candidate);
}

function oneShotCandidate(
  date: Temporal.PlainDate,
  timeZone: string,
  hour: number,
  minute: number,
  second: number,
): number {
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      minute,
      second,
      millisecond: 0,
    },
    { disambiguation: "compatible", overflow: "reject" },
  ).epochMilliseconds;
}

function zoned(timestamp: number, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(timestamp).toZonedDateTimeISO(timeZone);
}

function dayOrdinal(value: Temporal.ZonedDateTime): number {
  return value.toPlainDate().since(EPOCH_DATE, { largestUnit: "day" }).days;
}

function weekOrdinal(day: number): number {
  return floorDiv(day + 3, 7);
}

function normalizeWeekdays(byDay: Weekday[] | undefined): Weekday[] {
  if (!byDay || byDay.length === 0) {
    throw new TypeError("A weekly rule requires at least one weekday.");
  }
  if (byDay.some((token) => !WEEKDAY_TOKENS.includes(token))) {
    throw new TypeError("Weekly rule contains an invalid weekday.");
  }
  return [...new Set(byDay)].toSorted(
    (left, right) => WEEKDAY_TOKENS.indexOf(left) - WEEKDAY_TOKENS.indexOf(right),
  );
}

function requiredTimeZone(timeZone: string | undefined): string {
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    throw new Error(
      "An IANA timezone is required for a wall-clock schedule. Ask the user which timezone " +
        "they want; do not guess UTC or infer it from locale.",
    );
  }
  const normalized = timeZone.trim();
  if (normalized.length > MAX_TIME_ZONE_LENGTH) {
    throw new RangeError(`IANA timezone must be at most ${MAX_TIME_ZONE_LENGTH} characters.`);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: normalized }).format(0);
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${normalized}`);
  }
  return normalized;
}

function boundedText(value: string, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} must not be empty.`);
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new RangeError(`${label} must be at most ${maximum} characters.`);
  }
  return normalized;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

function requiredHour(hour: number | undefined, frequency: string): number {
  if (hour === undefined) throw new TypeError(`A ${frequency} rule requires an hour.`);
  assertHour(hour);
  return hour;
}

function assertHour(hour: number): void {
  assertIntegerInRange(hour, "Hour", 0, 23);
}

function assertMinute(minute: number): void {
  assertIntegerInRange(minute, "Minute", 0, 59);
}

function assertIntegerInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function assertSafePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DATE_MS) {
    throw new RangeError(
      `Schedule timestamp must be a safe integer from 0 through ${MAX_DATE_MS}.`,
    );
  }
}

function checkedTimestamp(value: number): number {
  assertTimestamp(value);
  return value;
}

function checkedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} exceeds the supported range.`);
  return value;
}

function checkedIncrement(value: number): number {
  return checkedInteger(value + 1, "calendar occurrence index");
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
