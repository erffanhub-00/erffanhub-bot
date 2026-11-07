// Tehran wall-clock helpers. Asia/Tehran is UTC+3:30 with no DST.
// The Tehran time is used only for logging; the due check compares
// epoch milliseconds directly, so no timezone math affects scheduling.

export function tehranNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  // en-CA with hour12:false can render midnight as "24"; normalize it.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

export function isDue(publishAt, nowMs = Date.now()) {
  return Number(publishAt) <= Number(nowMs);
}
