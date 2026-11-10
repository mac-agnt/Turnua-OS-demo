/* Fixture validation: the scenario's published numbers and every foreign key.
   Runs against a fresh seed in development and logs any failure to the console. */
import type { DB } from "./types";
import { buildSeed } from "./seed";
import { badges, credsDue, isDue48, isOpen, isOverdue, isUnresolved, myOpenTasks, portfolio, ppm, workforce, AQC_SITES } from "./selectors";
import { daysBetween, keyOf } from "./time";

export function validate(db: DB, now = Date.now()): string[] {
  const errs: string[] = [];
  const eq = (label: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(label + ": got " + JSON.stringify(got) + ", want " + JSON.stringify(want)); };
  const pf = portfolio(db, now);
  eq("active projects", pf.active, 6);
  eq("health", [pf.health["On track"], pf.health["At risk"], pf.health["Off track"]], [3, 2, 1]);
  eq("external works value", pf.originalValue, 14160000);
  eq("external works cost", pf.externalCost, 8563200);
  eq("internal budget/cost", [pf.internalBudget, pf.internalCost], [380000, 110200]);
  eq("pending priced changes", pf.pendingPriced, 126000);
  eq("tasks", db.tasks.length, 72);
  eq("status counts", ["Backlog", "To Do", "In Progress", "QA / Sign Off", "Done"].map((s) => db.tasks.filter((t) => t.status === s).length), [10, 16, 18, 9, 19]);
  eq("open", db.tasks.filter(isOpen).length, 53);
  eq("overdue", db.tasks.filter((t) => isOverdue(t, now)).length, 7);
  eq("due within 48h", db.tasks.filter((t) => isDue48(t, now)).length, 14);
  eq("tasks per project", db.projects.map((p) => db.tasks.filter((t) => t.projectId === p.id).length), [12, 12, 12, 12, 12, 12]);
  eq("David open / overdue", [myOpenTasks(db, "P01").length, myOpenTasks(db, "P01").filter((t) => isOverdue(t, now)).length], [5, 1]);
  const w = workforce(db);
  eq("people", db.people.length, 12);
  eq("status counts", [w.status["On site"], w.status["In office"], w.status["In a meeting"], w.status["On leave"], w.status["On call"]], [6, 2, 1, 1, 2]);
  eq("utilisation hours", [w.alloc, w.avail, w.crewAlloc, w.crewAvail], [386, 464, 278, 320]);
  eq("credentials due within 45 days", credsDue(db, now, 45).map((c) => c.id + "+" + daysBetween(keyOf(now), keyOf(Date.parse(c.dueAt!)))), ["CERT-06-IPAF+18", "CERT-03-SP+24", "CERT-05-ELEC+34", "CERT-08-FA+41"]);
  eq("sites / assets", [db.sites.length, db.assets.length], [6, 344]);
  eq("assets per site", db.sites.map((s) => db.assets.filter((a) => a.siteId === s.id).length), [48, 36, 124, 32, 18, 86]);
  const all = ppm(db), aq = ppm(db, AQC_SITES);
  eq("PPM", [all.done, all.total, aq.done, aq.total], [199, 212, 92, 100]);
  eq("tickets", [db.tickets.length, db.tickets.filter(isUnresolved).length, db.tickets.filter((t) => isUnresolved(t) && t.priority === "P1").length, db.tickets.filter((t) => isUnresolved(t) && t.priority === "P2").length], [7, 6, 1, 2]);
  eq("badges", badges(db), { projects: 6, work: 5, helpdesk: 3 });
  eq("SLA report", [db.sla.eligible, db.sla.met, db.sla.missed, db.sla.byPriority.reduce((n, p) => n + p.eligible, 0), db.sla.byPriority.reduce((n, p) => n + p.met, 0)], [1284, 1274, 10, 1284, 1274]);

  // foreign keys
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const P = ids(db.people), PR = ids(db.projects), S = ids(db.sites), A = ids(db.assets), T = ids(db.tasks), W = ids(db.workAreas), D = ids(db.docs);
  const fk = (label: string, v: string | null | undefined, set: Set<string>) => { if (v && !set.has(v)) errs.push("Missing " + label + " " + v); };
  db.tasks.forEach((t) => { fk("task project", t.projectId, PR); fk("task owner", t.ownerId, P); fk("task site", t.siteId, S); fk("task work area", t.workAreaId, W);
    t.dependsOn.forEach((x) => fk("task dependency", x, T)); t.docIds.forEach((x) => fk("task doc", x, D));
    if (t.permitId) fk("task permit", t.permitId, ids(db.permits)); if (t.ticketId) fk("task ticket", t.ticketId, ids(db.tickets)); if (t.approvalId) fk("task approval", t.approvalId, ids(db.approvals));
    if (t.projectId === "TRN-2063" && (t.siteId === "S-RTH" || (t.workAreaId && !t.workAreaId.startsWith("WA-2063")))) errs.push("DLR task linked to Rathdrum: " + t.id);
    const p = db.projects.find((x) => x.id === t.projectId);
    if (p && t.ownerId && !p.team.includes(t.ownerId) && p.sponsorId !== t.ownerId) errs.push("Task owner outside project team: " + t.id); });
  db.tickets.forEach((t) => { fk("ticket site", t.siteId, S); fk("ticket asset", t.assetId, A); fk("ticket engineer", t.engineerId, P); fk("ticket task", t.taskId, T); });
  db.maintenance.forEach((j) => { fk("job asset", j.assetId, A); fk("job assignee", j.assigneeId, P); if (db.assets.find((a) => a.id === j.assetId)?.siteId !== j.siteId) errs.push("Job site mismatch " + j.id); });
  db.approvals.forEach((a) => { fk("approval requester", a.requestedById, P); a.evidenceDocIds.forEach((x) => fk("approval doc", x, D));
    const src = a.sourceType === "change" ? ids(db.changes) : a.sourceType === "permit" ? ids(db.permits) : a.sourceType === "training" ? ids(db.training) : a.sourceType === "milestone" ? ids(db.milestones) : null;
    if (src) fk("approval source", a.sourceId, src); });
  db.events.forEach((e) => { fk("event owner", e.ownerId, P); e.attendeeIds.forEach((x) => fk("event attendee", x, P)); fk("event project", e.projectId, PR); fk("event site", e.siteId, S); });
  db.credentials.forEach((c) => fk("credential person", c.personId, P));
  db.allocations.forEach((a) => { fk("allocation person", a.personId, P); fk("allocation project", a.projectId, PR); });
  db.docs.forEach((d) => { fk("doc owner", d.ownerId, P); fk("doc project", d.projectId, PR); });
  db.changes.forEach((c) => c.evidenceDocIds.forEach((x) => fk("change doc", x, D)));
  db.permits.forEach((p) => { fk("permit doc", p.docId, D); p.blockedTaskIds.forEach((x) => fk("permit task", x, T)); });
  db.rams.forEach((r) => { fk("rams doc", r.docId, D); r.taskIds.forEach((x) => fk("rams task", x, T)); });
  db.findings.forEach((f) => fk("finding task", f.taskId, T));
  return errs;
}

export function validateFreshSeed(): string[] { return validate(buildSeed(Date.now())); }
