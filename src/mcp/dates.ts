const DAY_MS = 86_400_000;

export const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => isoDate(toMs(iso) + days * DAY_MS);
export const daysInclusive = (start: string, end: string) => Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1;

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(toMs(value)) && isoDate(toMs(value)) === value;
}

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date and hour at the location, e.g. { day: "2026-10-08", hour: "2026-10-08T15:00" }. */
export function localNow(timezone: string, now = new Date()): { day: string; hour: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: isTimezone(timezone) ? timezone : "UTC",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, hour: `${day}T${parts.hour}:00` };
}

export function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y - years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) return isoDate(Date.UTC(y - years, m, 0));
  return isoDate(target.getTime());
}

export function monthEnd(year: number, month: number): string {
  return isoDate(Date.UTC(year, month, 0));
}
