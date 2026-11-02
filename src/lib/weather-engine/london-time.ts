// Clock times for spray windows, always in UK time with an explicit zone so a
// phone set elsewhere (or a server in UTC) reads the same. 24 h, no zone label.
export const ENGINE_TIME_ZONE = "Europe/London";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: ENGINE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});

function read(epoch: number) {
  const p = Object.fromEntries(parts.formatToParts(epoch).map(({ type, value }) => [type, value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: p.weekday };
}

/** "today", "tomorrow" or the short weekday, in UK time. */
export function dayWord(epoch: number, nowEpoch: number) {
  const at = read(epoch);
  const now = read(nowEpoch);
  if (at.day === now.day) return "today";
  if (at.day === read(nowEpoch + 86_400_000).day) return "tomorrow";
  return at.weekday;
}

export function clockTime(epoch: number) {
  return read(epoch).time;
}

/** The day a range ends on: a range ending exactly at 00:00 belongs to the
 * day it ran in. */
export function endDayWord(endEpoch: number, nowEpoch: number) {
  return dayWord(endEpoch - 1, nowEpoch);
}

/**
 * One rule for every spray range (window line, legend, aria-label):
 * same day "today 10:00–11:00" (no spaces; the day dropped when
 * showStartDay is false), across days "today 15:00 – tomorrow 03:00".
 * 24 h, UK time, never a zone label.
 */
export function rangeText(startEpoch: number, endEpoch: number, nowEpoch: number, showStartDay = true) {
  const startDay = dayWord(startEpoch, nowEpoch);
  const endDay = endDayWord(endEpoch, nowEpoch);
  if (endDay === startDay) return `${showStartDay ? `${startDay} ` : ""}${clockTime(startEpoch)}–${clockTime(endEpoch)}`;
  return `${startDay} ${clockTime(startEpoch)} – ${endDay} ${clockTime(endEpoch)}`;
}
