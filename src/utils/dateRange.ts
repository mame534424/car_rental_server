import { APP_TIMEZONE_OFFSET_HOURS } from "../constants";

/**
 * Returns the UTC start/end instants that correspond to "today" in
 * Africa/Addis_Ababa (UTC+3, no DST), so DB queries stored in UTC
 * line up with what a receptionist in Addis Ababa would call "today".
 */
export function getTodayRangeInAppTimezone(): { start: Date; end: Date } {
  const now = new Date();
  const offsetMs = APP_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    0,
    0,
    0
  );
  const start = new Date(localMidnight - offsetMs);
  const end = new Date(localMidnight - offsetMs + 24 * 60 * 60 * 1000);
  return { start, end };
}
