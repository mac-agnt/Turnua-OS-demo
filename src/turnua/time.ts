/* Europe/Dublin date handling. Every "today" in the demo is the browser's
   current clock read in Dublin local time, including daylight-saving changes.
   Date keys are "YYYY-MM-DD" local calendar dates; instants are ISO strings. */

export const TZ = "Europe/Dublin";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export type Parts = { y: number; m: number; d: number; h: number; min: number; s: number };

export function dublinParts(ms: number): Parts {
  const o: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") o[p.type] = parseInt(p.value, 10);
  }
  return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, min: o.minute, s: o.second };
}

/** Minutes Dublin is ahead of UTC at an instant (0 in winter, 60 in summer). */
function offsetMin(ms: number): number {
  const p = dublinParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** UTC instant for a Dublin wall-clock time. */
export function dublinToMs(y: number, m: number, d: number, h = 0, min = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let ms = guess - offsetMin(guess) * 60000;
  const again = guess - offsetMin(ms) * 60000;
  if (again !== ms) ms = again;
  return ms;
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function keyOf(ms: number): string {
  const p = dublinParts(ms);
  return p.y + "-" + pad(p.m) + "-" + pad(p.d);
}
export function nowMs(): number { return Date.now(); }
export function todayKey(): string { return keyOf(Date.now()); }

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}
/** Calendar-day arithmetic on date keys (no time zone involved). */
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
}
export function daysBetween(a: string, b: string): number {
  const pa = parseKey(a), pb = parseKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: string): number {
  const { y, m, d } = parseKey(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export function mondayOf(key: string): string { return addDays(key, -weekdayOf(key)); }
export function firstOfMonth(key: string): string { const { y, m } = parseKey(key); return y + "-" + pad(m) + "-01"; }
export function addMonths(key: string, n: number): string {
  const { y, m } = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-01";
}
export function daysInMonth(key: string): number {
  const { y, m } = parseKey(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ISO instant for a local time on a date key. */
export function at(key: string, hh: number, mm = 0): string {
  const { y, m, d } = parseKey(key);
  return new Date(dublinToMs(y, m, d, hh, mm)).toISOString();
}
export function atMs(key: string, hh: number, mm = 0): number {
  const { y, m, d } = parseKey(key);
  return dublinToMs(y, m, d, hh, mm);
}
/** Explicit local end-of-day deadline: 23:59 Dublin time. */
export function endOfDay(key: string): string { return at(key, 23, 59); }
export function startOfDayMs(key: string): number { return atMs(key, 0, 0); }

export function hhmm(iso: string): string {
  const p = dublinParts(Date.parse(iso));
  return pad(p.h) + ":" + pad(p.min);
}
export function minutesOfDay(iso: string): number {
  const p = dublinParts(Date.parse(iso));
  return p.h * 60 + p.min;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export { DOW, DOW_LONG, MON, MON_LONG };

/** "Tue 10 Nov" */
export function fmtKey(key: string, opts: { year?: boolean; long?: boolean } = {}): string {
  const { y, m, d } = parseKey(key);
  const w = weekdayOf(key);
  if (opts.long) return DOW_LONG[w] + " " + d + " " + MON_LONG[m - 1] + (opts.year === false ? "" : " " + y);
  return DOW[w] + " " + d + " " + MON[m - 1] + (opts.year ? " " + y : "");
}
export function fmtDate(iso: string | undefined | null, opts: { year?: boolean; long?: boolean } = {}): string {
  if (!iso) return "No date";
  return fmtKey(keyOf(Date.parse(iso)), opts);
}
export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return "";
  return fmtDate(iso) + ", " + hhmm(iso);
}
/** "10 Nov 2026" */
export function fmtShort(iso: string | undefined | null): string {
  if (!iso) return "";
  const { y, m, d } = parseKey(keyOf(Date.parse(iso)));
  return d + " " + MON[m - 1] + " " + y;
}
export function monthTitle(key: string): string {
  const { y, m } = parseKey(key);
  return MON_LONG[m - 1] + " " + y;
}

/** Relative calendar label: Today / Tomorrow / Yesterday / In 3 days / 2 days ago. */
export function relDay(iso: string, now = Date.now()): string {
  const diff = daysBetween(keyOf(now), keyOf(Date.parse(iso)));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return DOW_LONG[weekdayOf(keyOf(Date.parse(iso)))];
  if (diff > 0) return fmtDate(iso);
  return Math.abs(diff) + " days ago";
}
/** Due label for unfinished work: overdue reads in days late. */
export function dueLabel(iso: string | undefined, done: boolean, now = Date.now()): { text: string; tone: "bad" | "warn" | "plain" } {
  if (!iso) return { text: "No due date", tone: "plain" };
  const t = Date.parse(iso);
  if (!done && t < now) {
    const days = daysBetween(keyOf(t), keyOf(now));
    return { text: days <= 0 ? "Overdue, due " + hhmm(iso) : days === 1 ? "1 day overdue" : days + " days overdue", tone: "bad" };
  }
  const r = relDay(iso, now);
  if (!done && (r === "Today" || r === "Tomorrow")) return { text: r, tone: "warn" };
  return { text: r, tone: "plain" };
}

export function fmtDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return h + "h " + pad(r) + "m";
  return Math.floor(h / 24) + "d " + (h % 24) + "h";
}
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ":" + pad(m) : String(m)) + ":" + pad(x);
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 50) return "Just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400 && keyOf(now) === keyOf(Date.parse(iso))) return "Today " + hhmm(iso);
  const d = daysBetween(keyOf(Date.parse(iso)), keyOf(now));
  if (d === 1) return "Yesterday " + hhmm(iso);
  if (d < 7) return d + " days ago";
  return fmtShort(iso);
}

export function greetingFor(ms = Date.now()): string {
  const h = dublinParts(ms).h;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* ── money and numbers ───────────────────────────────────────────── */
const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export function eur(n: number): string { return eur0.format(n); }
export function eurShort(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "−" : "";
  if (a >= 1e6) return sign + "€" + (a / 1e6).toFixed(a % 1e6 === 0 ? 0 : a >= 1e7 ? 2 : 3).replace(/\.?0+$/, "") + "m";
  if (a >= 1e3) return sign + "€" + (a / 1e3).toFixed(a % 1e3 === 0 ? 0 : 1).replace(/\.0$/, "") + "k";
  return sign + "€" + a;
}
export function num(n: number): string { return new Intl.NumberFormat("en-IE").format(n); }
export function pct(n: number, digits = 0): string { return (n * 100).toFixed(digits) + "%"; }
