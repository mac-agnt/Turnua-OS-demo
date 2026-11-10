/* The seam between the Pulse shell logic (PulseLogic.js) and the Turnua OS
   records: tabs, badges, Home rail, notifications, search and the KPI band. */
import { getDB } from "./store";
import { getRoute, moduleByPage, navigate, openApproval, openTask, openTicket, getPrefs } from "./ui";
import { openRef } from "./kit";
import { answer, SUGGESTIONS, type Answer } from "./assistant";
import {
  badges, isOpen, isOverdue, myOpenTasks, nameOf, portfolio, ppm, project, workforce, occurrences, involves, credsDue, AQC_SITES, labelOf, isUnresolved,
} from "./selectors";
import { ago, dueLabel, eur, eurShort, fmtDate, greetingFor, hhmm, keyOf, addDays, todayKey, pct, relDay } from "./time";

export { navigate, getRoute, moduleByPage, answer, SUGGESTIONS };
export type { Answer };

const TONE: Record<string, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", plain: "var(--neutral)" };

/* ── side rail badges ────────────────────────────────────────────── */
export function railBadge(key?: string): { text: string; urgent: boolean } | null {
  if (!key) return null;
  const b = badges(getDB()) as Record<string, number>;
  return b[key] !== undefined ? { text: String(b[key]), urgent: key === "helpdesk" && b[key] > 0 } : null;
}

/* ── top-bar tabs ────────────────────────────────────────────────── */
export function tabsFor(page: string) {
  const mod = moduleByPage(page);
  const r = getRoute();
  if (!mod || !mod.tabs.length) return null;
  const db = getDB();
  const now = Date.now();
  const count = (id: string): string => {
    if (mod.id === "work" && id === "my") return String(myOpenTasks(db, getPrefs().myWorkPerson).length);
    if (mod.id === "work" && id === "approvals") return String(db.approvals.filter((a) => a.status === "Pending").length);
    if (mod.id === "agents" && id === "approvals") return String(db.approvals.filter((a) => a.status === "Pending" && a.agentId).length);
    if (mod.id === "helpdesk" && id === "queue") return String(db.tickets.filter(isUnresolved).length);
    if (mod.id === "projects" && id === "portfolio") return String(db.projects.length);
    if (mod.id === "people" && id === "certifications") return String(credsDue(db, now, 45).length);
    return "";
  };
  return {
    tabs: mod.tabs.map((t) => ({ id: t.id, label: t.label, active: r.module === mod.id && (r.tab === t.id || (r.tab === "detail" && t.id === mod.tabs[0].id)), count: count(t.id),
      go: () => navigate("/" + mod.id + "/" + t.id) })),
    hint: mod.hint + " · " + (r.tab === "detail" ? (r.id || "").toUpperCase() : (mod.tabs.find((t) => t.id === r.tab)?.label || "").toUpperCase()),
  };
}

/* ── Home ────────────────────────────────────────────────────────── */
export function homeVals() {
  const db = getDB();
  const now = Date.now();
  const pending = db.approvals.filter((a) => a.approverId === "P01" && a.status === "Pending");
  const held = pending.reduce((n, a) => n + (a.amount && a.amount > 1000 ? a.amount : 0), 0);
  const mine = db.tasks.filter((t) => t.ownerId === "P01").sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const live = db.tickets.filter((t) => isUnresolved(t) && t.priority === "P1");
  const inbox = [
    ...pending.map((a) => ({ title: a.title, why: a.reason, age: relDay(a.dueAt || a.requestedAt, now), dot: a.amount && a.amount > 1000 ? "var(--warn)" : "var(--accent)", open: () => openApproval(a.id) })),
    ...live.map((t) => ({ title: t.id + " " + t.title, why: db.sites.find((s) => s.id === t.siteId)?.name + ", " + nameOf(db, t.engineerId) + " assigned", age: "P1", dot: "var(--bad)", open: () => openTicket(t.id) })),
  ];
  const today = todayKey();
  const upcoming = occurrences(db, today, addDays(today, 3)).filter((o) => involves(o, "P01") && Date.parse(o.end) > now && o.type !== "On call").slice(0, 4);
  const pf = portfolio(db, now);
  const w = workforce(db);
  return {
    greetingPrefix: greetingFor(now),
    greetingName: "David",
    homeSubline: "Ask about any project, person, site or approval in Turnua OS.",
    approvalsPill: pending.length + " APPROVALS · " + eurShort(held) + " AWAITING DECISION",
    homeEyebrow: "DEMO WORKSPACE · LIVE ACROSS " + db.sites.length + " SITES",
    inboxCount: String(inbox.length), inboxEmpty: inbox.length === 0,
    inboxTop: inbox.slice(0, 4),
    tasks: mine.slice(0, 6).map((t) => {
      const open = isOpen(t);
      const dl = dueLabel(t.dueAt, !open, now);
      return { id: t.id, title: t.title, due: dl.text, dueColor: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : "var(--faint)", strike: !open, open: () => openTask(t.id) };
    }),
    taskSummary: mine.filter((t) => !isOpen(t)).length + " of " + mine.length + " done",
    activity: db.activity.slice(0, 5).map((a) => ({ who: a.actor, what: a.text.charAt(0).toLowerCase() + a.text.slice(1), event: (a.sourceType + "." + a.category).toLowerCase(), when: ago(a.at, now),
      dot: a.actorType === "agent" ? "var(--accent)" : a.actorType === "system" ? "var(--neutral)" : "var(--ok)", open: () => openRef(a.sourceType, a.sourceId) })),
    miniKpis: [
      { label: "Active projects", value: String(pf.active), delta: pf.health["On track"] + " on track", deltaColor: "var(--ok)" },
      { label: "Open tasks", value: String(pf.tasks.open), delta: pf.tasks.overdue + " overdue", deltaColor: pf.tasks.overdue ? "var(--bad)" : "var(--ok)" },
      { label: "P1 live", value: String(live.length), delta: live.length ? "response running" : "none", deltaColor: live.length ? "var(--bad)" : "var(--ok)" },
      { label: "Crew utilisation", value: pct(w.crewUtil), delta: "planned", deltaColor: "var(--faint)" },
    ],
    visitWidget: upcoming.map((o) => ({ title: o.title, when: relDay(o.start, now) === "Today" ? hhmm(o.start) : relDay(o.start, now).slice(0, 3) + " " + hhmm(o.start), dot: o.type === "Client" ? "var(--accent)" : o.type === "Site visit" ? "var(--ok)" : "var(--warn)", open: () => navigate("/calendar/day?d=" + keyOf(Date.parse(o.start))) })),
    suggestions: SUGGESTIONS,
  };
}

/* ── notifications ───────────────────────────────────────────────── */
export function notificationVals() {
  const db = getDB();
  const now = Date.now();
  const list = db.notifications.slice(0, 8);
  return {
    unread: db.notifications.filter((n) => !n.read).length,
    items: list.map((n) => ({ dot: TONE[n.tone], text: n.text, meta: ago(n.at, now), event: n.sourceType + " · " + n.sourceId, open: () => openRef(n.sourceType, n.sourceId) })),
  };
}

/* ── command palette search ──────────────────────────────────────── */
export interface SearchItem { title: string; meta: string; hint: string; glyph: string; go: () => void }
export function searchGroups(q: string): { group: string; scope: string; items: SearchItem[] }[] {
  const db = getDB();
  const ql = q.toLowerCase().trim();
  const m = (s: string) => !ql || s.toLowerCase().includes(ql);
  const projects = db.projects.filter((p) => m(p.id + " " + p.name + " " + p.short + " " + labelOf(db, "client", p.clientId) + " " + p.location)).map((p) => ({
    title: p.id + " " + p.name, meta: labelOf(db, "client", p.clientId) + " · " + p.health, hint: "PROJECT", glyph: "page", go: () => navigate("/projects/p/" + p.id + "/overview") }));
  const people = db.people.filter((p) => m(p.name + " " + p.role + " " + p.location)).map((p) => ({
    title: p.name, meta: p.role + " · " + p.status, hint: "PERSON", glyph: "person", go: () => navigate("/people/p/" + p.id) }));
  const sites = db.sites.filter((s) => m(s.name + " " + labelOf(db, "client", s.clientId))).map((s) => ({
    title: s.name, meta: labelOf(db, "client", s.clientId) + " · " + s.type, hint: "SITE", glyph: "org", go: () => navigate("/sites/s/" + s.id) }));
  const tasks = db.tasks.filter((t) => m(t.title + " " + t.id + " " + (project(db, t.projectId)?.short || ""))).slice(0, ql ? 12 : 4).map((t) => ({
    title: t.title, meta: (project(db, t.projectId)?.short || "") + " · " + t.status + " · due " + fmtDate(t.dueAt), hint: "TASK", glyph: "task", go: () => openTask(t.id) }));
  const tickets = db.tickets.filter((t) => m(t.id + " " + t.title + " " + labelOf(db, "site", t.siteId))).map((t) => ({
    title: t.id + " " + t.title, meta: t.priority + " · " + t.status + " · " + labelOf(db, "site", t.siteId), hint: "TICKET", glyph: "action", go: () => openTicket(t.id) }));
  const approvals = db.approvals.filter((a) => a.status === "Pending" && m(a.title + " " + a.id)).map((a) => ({
    title: a.title, meta: "Approval · " + (a.amount ? eur(a.amount) : "no amount"), hint: "APPROVE", glyph: "action", go: () => openApproval(a.id) }));
  return [
    { group: "Projects", scope: "Projects", items: projects },
    { group: "People", scope: "People", items: people },
    { group: "Sites", scope: "Sites", items: sites },
    { group: "Tasks", scope: "Tasks", items: tasks },
    { group: "Tickets", scope: "Tickets", items: tickets },
    { group: "Approvals", scope: "Tasks", items: approvals },
  ];
}

/* ── KPI band (Dashboard) ────────────────────────────────────────── */
export function kpiVals() {
  const db = getDB();
  const now = Date.now();
  const pf = portfolio(db, now);
  const w = workforce(db);
  const r = ppm(db);
  const slaPct = (db.sla.met / db.sla.eligible * 100).toFixed(1) + "%";
  const go = (p: string) => () => navigate(p);
  return {
    projects: { value: String(pf.active), delta: pf.health["Off track"] + " off track", dir: pf.health["Off track"] ? "down" : "up", hint: pf.health["At risk"] + " at risk", open: go("/projects/portfolio") },
    ontrack: { value: Math.round(pf.onTrackPct * 100) + "%", delta: pf.health["On track"] + " of " + pf.active, dir: "up", hint: "projects", open: go("/projects/portfolio?health=On%20track") },
    tasks: { value: String(pf.tasks.open), delta: pf.tasks.overdue + " overdue", dir: pf.tasks.overdue ? "down" : "up", hint: "open", open: go("/work/team?due=overdue") },
    sla: { value: slaPct, delta: db.sla.met + "/" + db.sla.eligible, dir: "up", hint: "managed-service SLA, 90 days", open: go("/helpdesk/sla") },
    crew: { value: Math.round(w.crewUtil * 100) + "%", delta: w.crewAlloc + "/" + w.crewAvail + "h", dir: "up", hint: "planned, crews", open: go("/people/capacity") },
    changes: { value: eurShort(pf.pendingPriced), delta: pf.pendingChanges.length + " items", dir: "down", hint: "awaiting approval", open: go("/projects/commercials") },
    ppm: { value: Math.round(r.ratio * 100) + "%", delta: r.done + "/" + r.total, dir: "up", hint: "jobs, current cycle", open: go("/sites/maintenance") },
    due48: { value: String(pf.tasks.due48), delta: "next 48h", dir: "down", hint: "unfinished", open: go("/work/team?due=48h") },
  } as Record<string, { value: string; delta: string; dir: string; hint: string; open: () => void }>;
}

/* ── Agents chat (Directory tab reuses the Pulse agent conversation UI) ── */
const STATE: Record<string, string> = { briefing: "complete", watchdog: "attention", recovery: "waiting", workforce: "idle", compliance: "complete", triage: "working", commercial: "complete", reporting: "idle" };
export function agentChat() {
  const db = getDB();
  const now = Date.now();
  return db.agents.map((a) => {
    const runs = db.runs.filter((r) => r.agentId === a.id).slice(0, 6).reverse();
    const last = runs[runs.length - 1];
    const pendingFromAgent = db.approvals.some((x) => x.agentId === a.id && x.status === "Pending");
    const live = a.id === "triage" && db.tickets.some((t) => isUnresolved(t) && t.priority === "P1");
    const thread: unknown[] = [];
    runs.forEach((r) => {
      thread.push({ kind: "stamp", text: relDay(r.at, now) + " " + hhmm(r.at) });
      thread.push({ kind: "routine", text: "Ran", routine: r.trigger === "Schedule" ? "Scheduled run" : r.trigger === "Manual" ? "Run now" : "On record change" });
      thread.push({ kind: "agent", text: r.headline, lines: r.lines.map((l) => {
        const i = l.indexOf(": ");
        return i > 0 && i < 28 ? { k: l.slice(0, i), v: l.slice(i + 2) } : { k: "Note", v: l };
      }) });
      if (r.actions.length) thread.push({ kind: "agent", text: r.actions.map((x) => x.label).join(". ") + "." });
    });
    if (!runs.length) thread.push({ kind: "agent", text: "No runs yet. Type a request or “run” to run me against the current records." });
    return {
      id: a.id, name: a.name, shape: a.shape, tint: a.tint, role: a.purpose,
      state: live ? "working" : pendingFromAgent ? "waiting" : (STATE[a.id] || "idle"),
      when: last ? (keyOf(Date.parse(last.at)) === keyOf(now) ? hhmm(last.at) : relDay(last.at, now)) : "Never",
      preview: last ? last.headline.charAt(0).toLowerCase() + last.headline.slice(1) : "no runs yet", thread,
    };
  });
}

/* ── Records hero for the non-ontology tabs ─────────────────────── */
export function recordsHero(tab: string) {
  const db = getDB();
  const H: Record<string, { eyebrow: string; title: string; kind: string; suggestions: string[] }> = {
    files: { eyebrow: db.docs.length + " DOCUMENTS · LINKED TO WORK", title: "Documents", kind: "documents", suggestions: ["RAMS", "PER-DLR-017", "test pack", "Hall 4"] },
    contacts: { eyebrow: db.clients.length + " ACCOUNTS · " + db.contacts.filter((c) => c.clientId).length + " DEMO CONTACTS", title: "Customers & Contacts", kind: "accounts", suggestions: ["AquaComms", "council", "NBI"] },
    register: { eyebrow: "EVERY TYPED RECORD", title: "Register", kind: "records", suggestions: ["Hall 4", "HD-4821", "Paul", "PER-DLR-017"] },
    suppliers: { eyebrow: db.suppliers.length + " SUPPLIERS · " + db.purchaseOrders.length + " ORDERS", title: "Suppliers", kind: "suppliers", suggestions: ["containment", "late", "training"] },
  };
  return H[tab] || H.register;
}

export function credentialsDue45() { return credsDue(getDB(), Date.now(), 45); }
export function isOverdueTask(id: string) { const t = getDB().tasks.find((x) => x.id === id); return !!t && isOverdue(t, Date.now()); }
export { AQC_SITES };

/* ── Ontology: real record counts, record paths, and node clicks ─── */
import { openOverlay as _openOverlay } from "./ui";
import { CHAINS } from "./drawers/Records";
const CLUSTER_TYPES: [string, (db: ReturnType<typeof getDB>) => { type: string; id: string }[]][] = [
  ["Clients", (db) => db.clients.map((c) => ({ type: "client", id: c.id })).concat(db.contacts.filter((c) => c.clientId).map((c) => ({ type: "contact", id: c.id })))],
  ["People", (db) => db.people.map((p) => ({ type: "person", id: p.id }))],
  ["Documents", (db) => db.docs.map((d) => ({ type: "doc", id: d.id }))],
  ["Tasks", (db) => db.tasks.map((t) => ({ type: "task", id: t.id }))],
  ["Tickets", (db) => db.tickets.map((t) => ({ type: "ticket", id: t.id }))],
  ["Sites & assets", (db) => db.sites.map((s) => ({ type: "site", id: s.id })).concat(db.assets.map((a) => ({ type: "asset", id: a.id })))],
  ["Projects", (db) => db.projects.map((p) => ({ type: "project", id: p.id })).concat(db.milestones.map((m) => ({ type: "milestone", id: m.id })))],
  ["Approvals", (db) => db.approvals.map((a) => ({ type: "approval", id: a.id })).concat(db.changes.map((c) => ({ type: "change", id: c.id })), db.permits.map((p) => ({ type: "permit", id: p.id })))],
];
export function ontologyStats() {
  const db = getDB();
  const per = CLUSTER_TYPES.map(([, f]) => f(db).length);
  const records = per.reduce((n, x) => n + x, 0) + db.maintenance.length + db.events.length + db.credentials.length;
  // every stored ID reference is one relationship
  let rel = 0;
  const walk = (v: unknown, key = "") => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
    if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, k); return; }
    if (typeof v === "string" && key !== "id" && /(Id|Ids|^id)$/.test(key)) rel++;
  };
  for (const k of ["tasks", "tickets", "assets", "maintenance", "approvals", "changes", "permits", "rams", "milestones", "docs", "credentials", "events", "allocations", "sites", "projects", "findings", "purchaseOrders", "contacts"] as const) walk((db as unknown as Record<string, unknown>)[k]);
  return { records, relationships: rel, per };
}
export function ontologyPaths() {
  const db = getDB();
  const hue = ["#e86c7a", "#f0a35e", "#8b9cf7"];
  return Object.entries(CHAINS).map(([id, c], i) => {
    const last = c.hops[c.hops.length - 2];
    const st = last.type === "approval" ? db.approvals.find((a) => a.id === last.id)?.status : last.type === "task" ? db.tasks.find((t) => t.id === last.id)?.status : last.type === "permit" ? db.permits.find((p) => p.id === last.id)?.status : "";
    return { hue: hue[i % hue.length], label: c.title, detail: c.hops.length - 1 + " hops" + (st ? " · " + st.toLowerCase() : ""), progress: "100%", open: () => _openOverlay({ kind: "chain", id }) };
  });
}
/** A click on a graph node opens a real record from that node's cluster; the core opens a path. */
export function ontologyPick(cluster: number, kind: string, index: number) {
  const db = getDB();
  if (kind === "core" || cluster < 0) { const ids = Object.keys(CHAINS); _openOverlay({ kind: "chain", id: ids[index % ids.length] }); return; }
  const list = CLUSTER_TYPES[cluster] ? CLUSTER_TYPES[cluster][1](db) : [];
  if (!list.length) return;
  const pick = kind === "hub" ? list[0] : list[index % list.length];
  openRef(pick.type, pick.id);
}
export function clusterCount(i: number) { return CLUSTER_TYPES[i] ? CLUSTER_TYPES[i][1](getDB()).length : 0; }
