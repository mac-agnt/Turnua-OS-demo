/* Derived values. Every total in the UI comes from here, never from literals. */
import type { DB, Task, Ticket, Credential, Person, Project, Occurrence, CalEvent, Milestone, ID } from "./types";
import { addDays, at, atMs, keyOf, todayKey, weekdayOf, daysBetween, endOfDay, dublinParts } from "./time";
import { SLA_TARGET } from "./seed";

const H48 = 48 * 3600000;

/* ── lookups ─────────────────────────────────────────────────────── */
export const person = (db: DB, id?: ID | null) => db.people.find((p) => p.id === id);
export const project = (db: DB, id?: ID | null) => db.projects.find((p) => p.id === id);
export const site = (db: DB, id?: ID | null) => db.sites.find((s) => s.id === id);
export const client = (db: DB, id?: ID | null) => db.clients.find((c) => c.id === id);
export const asset = (db: DB, id?: ID | null) => db.assets.find((a) => a.id === id);
export const task = (db: DB, id?: ID | null) => db.tasks.find((t) => t.id === id);
export const ticket = (db: DB, id?: ID | null) => db.tickets.find((t) => t.id === id);
export const approval = (db: DB, id?: ID | null) => db.approvals.find((a) => a.id === id);
export const doc = (db: DB, id?: ID | null) => db.docs.find((d) => d.id === id);
export const team = (db: DB, id?: ID | null) => db.teams.find((t) => t.id === id);
export const workArea = (db: DB, id?: ID | null) => db.workAreas.find((w) => w.id === id);
export const nameOf = (db: DB, id?: ID | null) => person(db, id)?.name || "Unassigned";

/* ── tasks ───────────────────────────────────────────────────────── */
export const isOpen = (t: Task) => t.status !== "Done";
export const isOverdue = (t: Task, now: number) => isOpen(t) && Date.parse(t.dueAt) < now;
export const isDue48 = (t: Task, now: number) => isOpen(t) && Date.parse(t.dueAt) >= now && Date.parse(t.dueAt) <= now + H48;
export function taskCounts(tasks: Task[], now: number) {
  const open = tasks.filter(isOpen);
  return {
    total: tasks.length, open: open.length, done: tasks.length - open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    due48: open.filter((t) => isDue48(t, now)).length,
    byStatus: (["Backlog", "To Do", "In Progress", "QA / Sign Off", "Done"] as const).map((s) => ({ status: s, count: tasks.filter((t) => t.status === s).length })),
  };
}
export const projectTasks = (db: DB, pid: ID) => db.tasks.filter((t) => t.projectId === pid).sort((a, b) => a.order - b.order);
export const myOpenTasks = (db: DB, personId: ID) => db.tasks.filter((t) => t.ownerId === personId && isOpen(t));
export function workGroups(tasks: Task[], now: number) {
  const today = keyOf(now);
  const weekEnd = addDays(today, 6 - weekdayOf(today));
  const g = { overdue: [] as Task[], today: [] as Task[], week: [] as Task[], later: [] as Task[], done: [] as Task[] };
  for (const t of tasks) {
    if (!isOpen(t)) { g.done.push(t); continue; }
    const due = Date.parse(t.dueAt);
    const k = keyOf(due);
    if (due < now) g.overdue.push(t);
    else if (k === today) g.today.push(t);
    else if (k <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  const by = (a: Task, b: Task) => Date.parse(a.dueAt) - Date.parse(b.dueAt);
  Object.values(g).forEach((l) => l.sort(by));
  return g;
}

/* ── projects and commercials ────────────────────────────────────── */
export const approvedVariations = (db: DB, pid: ID) =>
  db.changes.filter((c) => c.projectId === pid && c.kind === "Variation" && c.status === "Approved").reduce((n, c) => n + (c.amount || 0), 0);
export const currentContract = (db: DB, p: Project) => (p.contractValue || 0) + approvedVariations(db, p.id);
export const earnedValue = (p: Project) => (p.contractValue ? Math.round(p.progress * p.contractValue) : null);
export const burn = (p: Project) => (p.cost !== null && p.contractValue ? p.cost / p.contractValue : p.cost !== null && p.budget ? p.cost / p.budget : null);
export function portfolio(db: DB, now: number) {
  const active = db.projects;
  const works = active.filter((p) => p.model === "Works contract");
  const internal = active.filter((p) => p.model === "Internal budget");
  const health = { "On track": 0, "At risk": 0, "Off track": 0 } as Record<string, number>;
  active.forEach((p) => { health[p.health] = (health[p.health] || 0) + 1; });
  const pendingChanges = db.changes.filter((c) => c.status === "Awaiting approval" && c.amount);
  const tc = taskCounts(db.tasks, now);
  return {
    active: active.length, health, onTrackPct: active.length ? health["On track"] / active.length : 0,
    originalValue: works.reduce((n, p) => n + (p.contractValue || 0), 0),
    approvedVariations: works.reduce((n, p) => n + approvedVariations(db, p.id), 0),
    externalCost: works.reduce((n, p) => n + (p.cost || 0), 0),
    earned: works.reduce((n, p) => n + (earnedValue(p) || 0), 0),
    internalBudget: internal.reduce((n, p) => n + (p.budget || 0), 0),
    internalCost: internal.reduce((n, p) => n + (p.cost || 0), 0),
    pendingPriced: pendingChanges.reduce((n, c) => n + (c.amount || 0), 0), pendingChanges,
    tasks: tc,
  };
}
export function milestoneState(m: Milestone, now: number): "Complete" | "Late" | "Upcoming" {
  if (m.completedAt) return "Complete";
  if (Date.parse(m.dueAt) < now || Date.parse(m.dueAt) > Date.parse(m.baselineAt)) return "Late";
  return "Upcoming";
}
export const slipDays = (p: Project) => daysBetween(keyOf(Date.parse(p.baselineFinish)), keyOf(Date.parse(p.forecastFinish)));

/* ── people ──────────────────────────────────────────────────────── */
export const allocated = (db: DB, pid: ID) => db.allocations.filter((a) => a.personId === pid).reduce((n, a) => n + a.hours, 0);
export const utilisation = (db: DB, p: Person) => allocated(db, p.id) / p.available;
export const utilTone = (u: number) => (u > 0.95 ? "bad" : u > 0.85 ? "warn" : "ok");
export const CREW = ["P03", "P04", "P05", "P06", "P07", "P08", "P09", "P11"];
export function workforce(db: DB) {
  const alloc = db.people.reduce((n, p) => n + allocated(db, p.id), 0);
  const avail = db.people.reduce((n, p) => n + p.available, 0);
  const crew = db.people.filter((p) => CREW.includes(p.id));
  const cAlloc = crew.reduce((n, p) => n + allocated(db, p.id), 0);
  const cAvail = crew.reduce((n, p) => n + p.available, 0);
  const status: Record<string, number> = { "On site": 0, "In office": 0, "In a meeting": 0, "On leave": 0, "On call": 0 };
  db.people.forEach((p) => { status[p.status] = (status[p.status] || 0) + 1; });
  return { alloc, avail, util: alloc / avail, crewAlloc: cAlloc, crewAvail: cAvail, crewUtil: cAlloc / cAvail, status };
}
export function credState(c: Credential, now: number): { label: string; tone: "ok" | "warn" | "bad" | "plain"; days: number | null } {
  if (c.renewedAt) return { label: "Renewed", tone: "ok", days: null };
  if (!c.dueAt) return { label: "No expiry", tone: "plain", days: null };
  const days = daysBetween(keyOf(now), keyOf(Date.parse(c.dueAt)));
  if (days < 0) return { label: c.dueKind === "Expiry" || c.dueKind === "Renewal" ? "Lapsed" : "Overdue review", tone: "bad", days };
  if (days <= 45) return { label: (c.dueKind === "Renewal" ? "Renewal due" : c.dueKind) + " in " + days + " days", tone: days <= 30 ? "bad" : "warn", days };
  if (days <= 90) return { label: "Due in " + days + " days", tone: "warn", days };
  return { label: "Valid", tone: "ok", days };
}
export const credsDue = (db: DB, now: number, days: number) =>
  db.credentials.filter((c) => !c.renewedAt && c.dueAt && Date.parse(c.dueAt) >= now - 86400000 && daysBetween(keyOf(now), keyOf(Date.parse(c.dueAt))) <= days)
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));

/* ── helpdesk ────────────────────────────────────────────────────── */
export const isUnresolved = (t: Ticket) => t.status !== "Resolved";
export function sla(t: Ticket, now: number) {
  const c = t.cycles[t.cycles.length - 1];
  const target = SLA_TARGET[t.priority] * 60000;
  const due = Date.parse(c.dueAt);
  if (t.status === "Resolved" && !c.acknowledgedAt) return { state: "closed" as const, remaining: 0, share: 1, label: "Resolved", tone: "plain" as const, cycle: c };
  if (c.acknowledgedAt) {
    const took = Date.parse(c.acknowledgedAt) - Date.parse(c.startedAt);
    const met = Date.parse(c.acknowledgedAt) <= due;
    return { state: "acknowledged" as const, remaining: due - Date.parse(c.acknowledgedAt), share: Math.min(1, took / target), took,
      label: (met ? "Responded in " : "Responded late, ") + Math.max(1, Math.round(took / 60000)) + " min", tone: met ? "ok" as const : "bad" as const, cycle: c };
  }
  const remaining = due - now;
  const share = Math.min(1, Math.max(0, (now - Date.parse(c.startedAt)) / target));
  if (remaining < 0) return { state: "breached" as const, remaining, share: 1, label: "Breached by " + fmtMins(-remaining), tone: "bad" as const, cycle: c };
  return { state: "running" as const, remaining, share, label: fmtMins(remaining) + " left", tone: share > 0.9 ? "bad" as const : share > 0.7 ? "warn" as const : "ok" as const, cycle: c };
}
function fmtMins(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 120) return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
  return m + ":" + String(s % 60).padStart(2, "0");
}

/* ── sites and maintenance ───────────────────────────────────────── */
export function ppm(db: DB, siteIds?: ID[]) {
  const jobs = siteIds ? db.maintenance.filter((j) => siteIds.includes(j.siteId)) : db.maintenance;
  const done = jobs.filter((j) => j.completedAt).length;
  return { done, total: jobs.length, ratio: jobs.length ? done / jobs.length : 0 };
}
export const siteAssets = (db: DB, sid: ID) => db.assets.filter((a) => a.siteId === sid);
export const siteTickets = (db: DB, sid: ID) => db.tickets.filter((t) => t.siteId === sid);
export const AQC_SITES = ["S-LS1", "S-LS2"];

/* ── badges for the side rail ────────────────────────────────────── */
export function badges(db: DB) {
  return {
    projects: db.projects.length,
    work: myOpenTasks(db, "P01").length,
    helpdesk: db.tickets.filter((t) => isUnresolved(t) && (t.priority === "P1" || t.priority === "P2")).length,
  };
}

/* ── calendar ────────────────────────────────────────────────────── */
export function occurrences(db: DB, fromKey: string, toKey: string): Occurrence[] {
  const lo = atMs(fromKey, 0), hi = atMs(toKey, 0);
  const out: Occurrence[] = [];
  const push = (ev: CalEvent, date: string, start: string, end: string, extra: Partial<Occurrence> = {}) => {
    if (Date.parse(start) < hi && Date.parse(end) > lo) {
      out.push({ key: ev.id + "@" + date, eventId: ev.id, date, title: ev.title, type: ev.type, ownerId: ev.ownerId, attendeeIds: ev.attendeeIds,
        start, end, allDay: !!ev.allDay, location: ev.location, provisional: ev.provisional, recurring: !!ev.recurrence,
        projectId: ev.projectId, siteId: ev.siteId, note: ev.notes, ...extra });
    }
  };
  for (const ev of db.events) {
    const r = ev.recurrence;
    if (!r) { push(ev, keyOf(Date.parse(ev.start)), ev.start, ev.end); continue; }
    const [hh, mm] = r.startTime.split(":").map(Number);
    for (let k = addDays(fromKey, -1); k < toKey; k = addDays(k, 1)) {
      if (k < r.from || (r.until && k > r.until)) continue;
      if (!r.byDay.includes(weekdayOf(k))) continue;
      const ex = ev.exceptions?.[k];
      if (ex?.deleted) continue;
      const start = ex?.start || at(k, hh, mm);
      const end = ex?.end || new Date(Date.parse(start) + r.durationMins * 60000).toISOString();
      push(ev, k, start, end, { attendeeIds: ex?.attendeeIds || ev.attendeeIds, title: ex?.title || ev.title, note: ex?.note || ev.notes });
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
export const involves = (o: Occurrence, pid: ID) => o.ownerId === pid || o.attendeeIds.includes(pid);

/** The next Thursday on or after today; if today's working day has ended, the following week. */
export function nextWeekday(weekday: number, now = Date.now()): string {
  const today = keyOf(now);
  let k = addDays(today, (weekday - weekdayOf(today) + 7) % 7);
  if (k === today && dublinParts(now).h >= 17) k = addDays(k, 7);
  return k;
}

export interface Availability {
  person: Person; state: "Available" | "Partly booked" | "Unavailable"; freeMins: number; reasons: string[]; conflicts: Occurrence[]; load: number;
}
/** Availability for a working day (08:00 to 17:00), from events, leave, on-call rest and load. */
export function availabilityOn(db: DB, date: string, skill?: string): Availability[] {
  const occ = occurrences(db, addDays(date, -1), addDays(date, 1));
  const winLo = atMs(date, 8), winHi = atMs(date, 17);
  return db.people.map((p) => {
    const reasons: string[] = [];
    const mine = occ.filter((o) => involves(o, p.id));
    const leave = mine.find((o) => o.type === "Leave" && Date.parse(o.start) <= winLo && Date.parse(o.end) >= winHi);
    const night = mine.find((o) => o.type === "On call" && Date.parse(o.start) < atMs(date, 0) && Date.parse(o.end) > atMs(date, 6));
    const dayCall = mine.find((o) => o.type === "On call" && !night && Date.parse(o.start) <= winLo + 3600000 && Date.parse(o.end) >= winHi);
    const tonight = mine.find((o) => o.type === "On call" && keyOf(Date.parse(o.start)) === date && dublinParts(Date.parse(o.start)).h >= 18);
    const booked = mine.filter((o) => !o.allDay && o.type !== "On call" && o.type !== "Leave" && Date.parse(o.start) < winHi && Date.parse(o.end) > winLo);
    const bookedMins = booked.reduce((n, o) => n + (Math.min(winHi, Date.parse(o.end)) - Math.max(winLo, Date.parse(o.start))) / 60000, 0);
    const allDayBlocks = mine.filter((o) => o.allDay && o.type !== "Leave");
    const load = utilisation(db, p);
    let state: Availability["state"] = "Available";
    if (leave) { state = "Unavailable"; reasons.push("On leave"); }
    else if (night) { state = "Unavailable"; reasons.push("Rest after night on-call (protected until 15:00)"); }
    if (state !== "Unavailable") {
      if (dayCall) reasons.push("Primary on-call 07:00 to 19:00, may be pulled to incidents");
      if (tonight) reasons.push("Night on-call from " + dublinParts(Date.parse(tonight.start)).h + ":00");
      allDayBlocks.forEach((o) => reasons.push((o.provisional ? "Provisional: " : "") + o.title));
      if (bookedMins > 0) reasons.push(Math.round(bookedMins / 60 * 10) / 10 + "h booked in meetings and visits");
      if (bookedMins >= 300 || allDayBlocks.some((o) => o.type === "Permit window" || o.type === "Training")) state = "Partly booked";
      if (dayCall) state = "Partly booked";
      if (load > 0.95) { reasons.push("Planned load " + Math.round(load * 100) + "%, above 95%"); state = "Partly booked"; }
    }
    if (skill && !p.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))) reasons.push("No recorded " + skill.toLowerCase() + " skill");
    return { person: p, state, freeMins: state === "Unavailable" ? 0 : Math.max(0, 540 - bookedMins), reasons, conflicts: booked, load };
  });
}

/* ── references: one way to label and open any record ─────────────── */
export function labelOf(db: DB, type: string, id: ID): string {
  switch (type) {
    case "project": return project(db, id) ? id + " " + project(db, id)!.short : id;
    case "person": return person(db, id)?.name || id;
    case "task": return task(db, id)?.title || id;
    case "ticket": { const t = ticket(db, id); return t ? id + " " + t.title : id; }
    case "site": return site(db, id)?.name || id;
    case "asset": return asset(db, id)?.name || id;
    case "approval": return approval(db, id)?.title || id;
    case "doc": return doc(db, id)?.title || id;
    case "client": return client(db, id)?.name || id;
    case "supplier": return db.suppliers.find((s) => s.id === id)?.name || id;
    case "contact": return db.contacts.find((s) => s.id === id)?.name || id;
    case "change": return id;
    case "permit": return id;
    case "credential": { const c = db.credentials.find((x) => x.id === id); return c ? nameOf(db, c.personId) + ", " + c.name : id; }
    case "event": return db.events.find((e) => e.id === id)?.title || id;
    case "agent": return db.agents.find((a) => a.id === id)?.name || id;
    case "workArea": return workArea(db, id)?.name || id;
    case "po": return id;
    default: return id;
  }
}

export function due(iso: string) { return endOfDay(keyOf(Date.parse(iso))); }
export { todayKey };
