export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type { CalendarAvailabilityMode } from "../calendar-types";

export type CalendarConfiguratorValues = {
  calendarId?: string | null;
  availabilityMode?: CalendarAvailabilityMode | null;
}

export interface CalendarConfiguratorRpc {
  listCalendars(query: string): Promise<ConfiguratorOption[]>;
}
