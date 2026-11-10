/* Home chat answers. Deterministic, computed from the current local records,
   with links to the source records. No live model and no external actions. */
import type { DB, ID } from "./types";
import { getDB } from "./store";
import { addDays, daysBetween, eur, fmtDate, fmtKey, keyOf, monthTitle, parseKey, pct, hhmm } from "./time";
import {
  availabilityOn, burn, credState, isOpen, isOverdue, isUnresolved, nameOf, nextWeekday, portfolio, project, sla, workforce, slipDays, ppm, AQC_SITES,
} from "./selectors";
import { briefingLines } from "./agents";

export interface Answer {
  text: string; tool: string; effect?: string;
  cols?: string[]; rows?: string[][];
  links: { label: string; type: string; id: ID; primary?: boolean }[];
}

const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

function blockingHall4(db: DB, now: number): Answer {
  const p = project(db, "TRN-2052")!;
  const po = db.purchaseOrders.find((x) => x.id === "PO-5521")!;
  const delay = po.revisedDueAt ? daysBetween(keyOf(Date.parse(po.dueAt)), keyOf(Date.parse(po.revisedDueAt))) : 0;
  const ap = db.approvals.find((a) => a.id === "APR-2052-02")!;
  const blocked = db.tasks.filter((t) => t.projectId === p.id && isOpen(t) && (t.dependsOn.length || /blocked/i.test(t.description || "")));
  const overdue = db.tasks.filter((t) => t.projectId === p.id && isOverdue(t, now));
  return {
    tool: "projects.read · procurement.read · approvals.read",
    text: "Hall 4 is blocked by the containment package. PO-5521 from Leinster Containment Supply (Demo) was due " + fmtDate(po.dueAt) + " and is now due " + fmtDate(po.revisedDueAt) + ", " + delay + " days late, so Zones C and D cannot start. "
      + "Physical progress is " + pct(p.progress) + " against " + pct(burn(p) || 0) + " cost burn. Forecast handover is " + fmtDate(p.forecastFinish) + " against the " + fmtDate(p.baselineFinish) + " baseline. "
      + (ap.status === "Pending" ? "The €42,000 recovery proposal (CR-2052-02) targets " + fmtDate(p.scenario?.finish) + " and is waiting for your decision." : "The recovery proposal was " + ap.status.toLowerCase() + " " + fmtDate(ap.decidedAt) + ". The delivery itself is still pending.")
      + " " + overdue.length + " Hall 4 tasks are overdue.",
    cols: ["Blocker", "Owner", "Due", "State"],
    rows: [
      ["PO-5521 containment delivery", "Ciarán Murphy", fmtDate(po.revisedDueAt), delay + " days late"],
      ...blocked.map((t) => [t.title, nameOf(db, t.ownerId), fmtDate(t.dueAt), t.status]),
      ["CR-2052-02 recovery proposal", "David Cox", fmtDate(ap.dueAt), ap.status],
    ],
    links: [
      { label: "Open Hall 4 timeline", type: "project-timeline", id: "TRN-2052", primary: true },
      { label: "Review recovery proposal", type: "approval", id: "APR-2052-02" },
      { label: "PO-5521", type: "po", id: "PO-5521" },
    ],
  };
}

function whoIsFree(db: DB, now: number, q: string): Answer {
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  let wd = dayNames.findIndex((d) => q.includes(d));
  if (wd < 0) wd = q.includes("tomorrow") ? -2 : 3;
  const day = wd === -2 ? addDays(keyOf(now), 1) : nextWeekday(wd, now);
  const skill = has(q, "electric") ? "Electrical" : has(q, "fibre", "splic") ? "Fibre" : undefined;
  const av = availabilityOn(db, day, skill);
  const order = { Available: 0, "Partly booked": 1, Unavailable: 2 } as Record<string, number>;
  av.sort((a, b) => order[a.state] - order[b.state] || a.load - b.load);
  const free = av.filter((a) => a.state === "Available" && (!skill || a.person.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))));
  return {
    tool: "calendar.read · people.read · credentials.read",
    text: "For " + fmtKey(day, { long: true, year: false }) + " (08:00 to 17:00): " + free.length + " people are fully available" + (skill ? " with a recorded " + skill.toLowerCase() + " skill" : "") + ". "
      + "This uses calendar events, leave, on-call rest windows and recorded skills. An empty calendar alone is not proof someone can do electrical or fibre work.",
    cols: ["Person", "State", "Free", "Why"],
    rows: av.map((a) => [a.person.name, a.state, a.state === "Unavailable" ? "0h" : Math.round(a.freeMins / 6) / 10 + "h", a.reasons.join("; ") || "No bookings in the working window"]),
    links: [{ label: "Open capacity view", type: "nav", id: "/people/capacity", primary: true }, { label: "Open calendar for that day", type: "nav", id: "/calendar/day?d=" + day }],
  };
}

function certsThisMonth(db: DB, now: number): Answer {
  const today = keyOf(now);
  const { y, m } = parseKey(today);
  const monthEnd = addDays(y + "-" + String(m).padStart(2, "0") + "-01", 0);
  const nextMonth = new Date(Date.UTC(y, m, 1));
  const endKey = addDays(nextMonth.getUTCFullYear() + "-" + String(nextMonth.getUTCMonth() + 1).padStart(2, "0") + "-01", 0);
  void monthEnd;
  const inMonth = db.credentials.filter((c) => c.dueAt && !c.renewedAt && keyOf(Date.parse(c.dueAt)) >= today && keyOf(Date.parse(c.dueAt)) < endKey);
  const in45 = db.credentials.filter((c) => c.dueAt && !c.renewedAt && daysBetween(today, keyOf(Date.parse(c.dueAt))) >= 0 && daysBetween(today, keyOf(Date.parse(c.dueAt))) <= 45);
  return {
    tool: "credentials.read",
    text: inMonth.length + " credential " + (inMonth.length === 1 ? "review falls" : "reviews fall") + " due in " + monthTitle(today) + " (calendar month, not a rolling window)"
      + (inMonth.length ? ": " + inMonth.map((c) => nameOf(db, c.personId) + ", " + c.name + " on " + fmtDate(c.dueAt)).join("; ") : "") + ". "
      + "Within 45 days there are " + in45.length + " in total. Due dates are demo assumptions, not compliance advice.",
    cols: ["Person", "Credential", "Due", "Status"],
    rows: in45.sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!)).map((c) => [nameOf(db, c.personId), c.name, fmtDate(c.dueAt), (keyOf(Date.parse(c.dueAt!)) < endKey ? "This month · " : "") + credState(c, now).label + (c.bookingId ? " · booked" : "")]),
    links: [{ label: "Open certifications", type: "nav", id: "/people/certifications", primary: true }, ...inMonth.slice(0, 2).map((c) => ({ label: nameOf(db, c.personId), type: "person", id: c.personId }))],
  };
}

function myApprovals(db: DB): Answer {
  const list = db.approvals.filter((a) => a.approverId === "P01" && a.status === "Pending").sort((a, b) => Date.parse(a.dueAt || a.requestedAt) - Date.parse(b.dueAt || b.requestedAt));
  return {
    tool: "approvals.read",
    text: list.length ? list.length + " approvals are waiting for you. " + list.filter((a) => a.amount && a.amount > 1000).map((a) => a.title).join(" and ") + (list.some((a) => a.amount && a.amount > 1000) ? " carry money. " : "")
      + "Approving updates the source record and the activity log; nothing is sent outside this workspace." : "Nothing is waiting for your approval.",
    cols: ["Approval", "Requested by", "Amount", "Due"],
    rows: list.map((a) => [a.title, nameOf(db, a.requestedById), a.amount ? eur(a.amount) : "No amount", fmtDate(a.dueAt)]),
    links: [{ label: "Open approvals", type: "nav", id: "/work/approvals", primary: true }, ...list.slice(0, 2).map((a) => ({ label: a.id, type: "approval", id: a.id }))],
  };
}

function aquacommsIncident(db: DB, now: number): Answer {
  const t = db.tickets.find((x) => x.id === "HD-4821")!;
  const s = sla(t, now);
  const asset = db.assets.find((a) => a.id === t.assetId);
  const r = ppm(db, AQC_SITES);
  const others = db.tickets.filter((x) => AQC_SITES.includes(x.siteId) && isUnresolved(x) && x.id !== t.id);
  return {
    tool: "helpdesk.read · assets.read",
    text: t.id + " (" + t.priority + ") " + t.title + " at Landing Station 1, opened " + hhmm(t.createdAt) + ". " + nameOf(db, t.engineerId) + " is assigned; status " + t.status.toLowerCase() + ", " + s.label.toLowerCase() + ". "
      + (asset?.reading ? asset.name + " " + asset.reading.label.toLowerCase() + ": " + asset.reading.value + ". " : "")
      + (t.status === "Resolved" ? "Resolution: " + t.resolutionNote + " " : "Redundant units are carrying the load. ")
      + "Other open AquaComms tickets: " + (others.map((x) => x.id + " " + x.priority).join(", ") || "none") + ". PPM cycle " + r.done + "/" + r.total + "; managed-service SLA 99.2% over the last 90 days.",
    cols: ["Time", "By", "Event"],
    rows: t.timeline.map((e) => [hhmm(e.at), e.actor, e.text]),
    links: [{ label: "Open " + t.id, type: "ticket", id: t.id, primary: true }, { label: "Landing Station 1", type: "site", id: "S-LS1" }, { label: "Response task", type: "task", id: t.taskId || "T-2035-01" }],
  };
}

function briefing(db: DB, now: number): Answer {
  const b = briefingLines(db, now);
  const pf = portfolio(db, now);
  return {
    tool: "briefing.compose",
    text: "Here is where things stand. " + b.lines.join(" "),
    cols: ["Measure", "Now"],
    rows: [["Active projects", String(pf.active)], ["On track", pct(pf.onTrackPct)], ["Open tasks", pf.tasks.open + " (" + pf.tasks.overdue + " overdue)"], ["Due in 48h", String(pf.tasks.due48)], ["Pending priced changes", eur(pf.pendingPriced)]],
    links: [{ label: "Open Command Centre", type: "nav", id: "/dashboard/executive", primary: true }, { label: "Hall 4", type: "project", id: "TRN-2052" }, { label: "Rathdrum", type: "project", id: "TRN-2041" }],
  };
}

function projectAnswer(db: DB, pid: string, now: number): Answer {
  const p = project(db, pid)!;
  const tasks = db.tasks.filter((t) => t.projectId === pid);
  const open = tasks.filter(isOpen);
  return {
    tool: "projects.read",
    text: p.id + " " + p.name + " for " + db.clients.find((c) => c.id === p.clientId)?.name + ": " + p.health.toLowerCase() + ", " + p.progressLabel + ". "
      + (p.contractValue ? "Contract " + eur(p.contractValue) + ", cost to date " + eur(p.cost || 0) + " (" + pct(burn(p) || 0) + " burn). " : p.model === "Internal budget" ? "Internal budget " + eur(p.budget || 0) + ", spend " + eur(p.cost || 0) + ". " : "Managed service. ")
      + "Forecast " + fmtDate(p.forecastFinish) + (slipDays(p) > 0 ? ", " + slipDays(p) + " days after baseline" : ", on baseline") + ". " + (p.blocker ? "Blocker: " + p.blocker + ". " : "")
      + open.length + " of " + tasks.length + " tasks open, " + open.filter((t) => isOverdue(t, now)).length + " overdue.",
    links: [{ label: "Open " + p.short, type: "project", id: p.id, primary: true }, { label: "Board", type: "project-board", id: p.id }],
  };
}

function overdueAnswer(db: DB, now: number): Answer {
  const od = db.tasks.filter((t) => isOverdue(t, now)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return {
    tool: "tasks.read",
    text: od.length + " tasks are overdue across the portfolio.",
    cols: ["Task", "Project", "Owner", "Due"],
    rows: od.map((t) => [t.title, project(db, t.projectId)?.short || "", nameOf(db, t.ownerId), fmtDate(t.dueAt)]),
    links: [{ label: "Open team tasks", type: "nav", id: "/work/team", primary: true }],
  };
}

function peopleAnswer(db: DB): Answer {
  const w = workforce(db);
  return {
    tool: "people.read",
    text: "Of 12 people in this demo team: " + Object.entries(w.status).map(([k, v]) => v + " " + k.toLowerCase()).join(", ") + ". Planned utilisation is " + pct(w.util) + " overall (" + w.alloc + " of " + w.avail + " hours) and " + pct(w.crewUtil) + " for delivery crews (" + w.crewAlloc + " of " + w.crewAvail + "). Live status is demo state, not tracking.",
    links: [{ label: "Open people directory", type: "nav", id: "/people/directory", primary: true }],
  };
}

export function answer(question: string): Answer {
  const db = getDB();
  const now = Date.now();
  const q = question.toLowerCase();
  if (has(q, "hall 4", "hall4", "2052", "containment") && has(q, "block", "late", "delay", "why", "stuck", "status", "what")) return blockingHall4(db, now);
  if (has(q, "free", "available", "availability", "cover")) return whoIsFree(db, now, q);
  if (has(q, "cert", "credential", "expir", "ipaf", "safe pass", "training", "renewal")) return certsThisMonth(db, now);
  if (has(q, "approv", "decide", "decision", "sign off")) return myApprovals(db);
  if (has(q, "aquacomms", "incident", "p1", "hd-4821", "cooling", "landing station")) return aquacommsIncident(db, now);
  if (has(q, "brief", "morning", "what changed", "summary", "summarise the business", "what's happening", "whats happening", "attention")) return briefing(db, now);
  if (has(q, "overdue", "late tasks", "running late")) return overdueAnswer(db, now);
  if (has(q, "people", "team", "utilisation", "utilization", "who is on site", "on site")) return peopleAnswer(db);
  const proj = db.projects.find((p) => q.includes(p.id.toLowerCase()) || q.includes(p.short.toLowerCase()) || p.short.toLowerCase().split(" ").some((w) => w.length > 4 && q.includes(w)));
  if (proj) return projectAnswer(db, proj.id, now);
  const words = q.split(/[^a-z0-9áéíóú’'-]+/).filter((w) => w.length > 3);
  const hits: Answer["links"] = [];
  for (const p of db.people) if (words.some((w) => p.name.toLowerCase().includes(w))) hits.push({ label: p.name, type: "person", id: p.id });
  for (const t of db.tasks) if (hits.length < 6 && words.some((w) => t.title.toLowerCase().includes(w))) hits.push({ label: t.title, type: "task", id: t.id });
  for (const s of db.sites) if (words.some((w) => s.name.toLowerCase().includes(w))) hits.push({ label: s.name, type: "site", id: s.id });
  return {
    tool: "search.records",
    text: "This demo answers questions about Turnua’s projects, approvals, people and availability, credentials, the helpdesk queue and the morning briefing, from records in this workspace. "
      + (hits.length ? "These records match your words:" : "Nothing matched directly. Try “What’s blocking Hall 4?”, “Who’s free Thursday?” or search with /."),
    links: hits.length ? hits.slice(0, 6) : [{ label: "Open search", type: "palette", id: "", primary: true }],
  };
}

export const SUGGESTIONS = ["What’s blocking Hall 4?", "Who’s free Thursday?", "Certs expiring this month", "What needs my approval?", "Summarise the AquaComms incident"];
export { fmtDate };
