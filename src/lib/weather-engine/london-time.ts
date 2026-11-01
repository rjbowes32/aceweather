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

/** "today 17:00 – tomorrow 03:00", or "today 10:00 – 14:00" within one day. */
export function rangeText(startEpoch: number, endEpoch: number, nowEpoch: number) {
  const startDay = dayWord(startEpoch, nowEpoch);
  // A window ending at midnight belongs to the day it ran in.
  const endDay = dayWord(endEpoch - 1, nowEpoch);
  return `${startDay} ${clockTime(startEpoch)} – ${endDay === startDay ? "" : `${endDay} `}${clockTime(endEpoch)}`;
}
