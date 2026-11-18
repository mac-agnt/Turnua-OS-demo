/* Mutations for the Field App, Sales and Marketing modules. Same rules as
   actions.ts: one update per change, with activity, audit and notifications. */
import type { Bid, Campaign, ContentItem, Deal, DealStage, FieldIssue, ID, IssueCategory, IssueSeverity, Lead, SocialPost, TicketPriority } from "./types";
import { update, getDB, newId, nowIso } from "./store";
import { toast } from "./ui";
import { log, notify } from "./actions";
import { SLA_TARGET } from "./seed";
import { nameOf, person } from "./selectors";
import { addDays, endOfDay, keyOf, todayKey, eur, fmtDateTime } from "./time";

const ME = "P01";
const touch = (x: { origin: string; touched?: boolean }) => { if (x.origin === "seed") (x as { touched?: boolean }).touched = true; };

/* ── Field App: clock in and out ─────────────────────────────────── */
export function clockIn(personId: ID, siteId: ID, method: "App" | "Geofence" | "Supervisor" = "App") {
  const db = getDB();
  if (db.clockings.some((c) => c.personId === personId && !c.outAt)) { toast(nameOf(db, personId) + " is already clocked in", "warn"); return; }
  const s = db.sites.find((x) => x.id === siteId);
  update((d) => {
    d.clockings.unshift({ id: newId("CLK"), personId, siteId, projectId: s?.projectId || null, inAt: nowIso(), method, origin: "user" });
    const p = d.people.find((x) => x.id === personId);
    if (p) p.status = "On site";
    log(d, { actorId: personId, text: "Clocked in at " + (s?.name || siteId) + " (" + method.toLowerCase() + ")", sourceType: "site", sourceId: siteId, category: "Field" });
  });
  toast(nameOf(getDB(), personId).split(" ")[0] + " clocked in at " + (s?.name || siteId));
}
/** Clock out writes a draft timesheet line for the hours on site. */
export function clockOut(clockId: ID, note = "") {
  const c0 = getDB().clockings.find((c) => c.id === clockId);
  if (!c0 || c0.outAt) return;
  let hours = 0;
  update((d) => {
    const c = d.clockings.find((x) => x.id === clockId)!;
    c.outAt = nowIso();
    if (note) c.note = note;
    hours = Math.max(0.25, Math.round(((Date.parse(c.outAt) - Date.parse(c.inAt)) / 3600000) * 4) / 4);
    const tsId = newId("TS");
    const site = d.sites.find((s) => s.id === c.siteId);
    d.timesheets.push({ id: tsId, personId: c.personId, projectId: c.projectId, label: "On site, " + (site?.name || c.siteId), date: keyOf(Date.parse(c.inAt)), hours, status: "Draft",
      history: [{ at: nowIso(), text: "Created from Field App clock out" }] });
    c.timesheetId = tsId;
    touch(c);
    const p = d.people.find((x) => x.id === c.personId);
    if (p && p.status === "On site") p.status = "In office";
    log(d, { actorId: c.personId, text: "Clocked out of " + (site?.name || c.siteId) + " after " + hours + "h; draft timesheet created", sourceType: "timesheet", sourceId: tsId, category: "Field" });
  });
  toast("Clocked out, " + hours + "h added to timesheets as a draft");
}

/* ── Field App: issues ───────────────────────────────────────────── */
export type RaiseAs = "issue" | "task" | "ticket";
const SEV_TO_P: Record<IssueSeverity, TicketPriority> = { Critical: "P1", High: "P2", Medium: "P3", Low: "P4" };
const SEV_TO_PRI = { Critical: "Urgent", High: "High", Medium: "Normal", Low: "Low" } as const;

export function reportIssue(f: { title: string; description: string; siteId: ID; category: IssueCategory; severity: IssueSeverity; reportedById: ID; photos: number; location?: string; raiseAs: RaiseAs; assigneeId?: ID | null }): ID {
  const id = "FI-" + (300 + getDB().fieldIssues.length + 1);
  update((d) => {
    const site = d.sites.find((s) => s.id === f.siteId)!;
    const issue: FieldIssue = { id, title: f.title, description: f.description, siteId: f.siteId, projectId: site.projectId, category: f.category, severity: f.severity,
      reportedById: f.reportedById, reportedAt: nowIso(), status: f.assigneeId ? "Assigned" : "Reported", assigneeId: f.assigneeId || null, photos: f.photos, location: f.location, origin: "user" };
    if (f.raiseAs === "task") issue.taskId = pushTask(d, issue);
    if (f.raiseAs === "ticket") {
      const tid = "HD-" + (4830 + d.tickets.filter((t) => t.origin === "user").length + 1);
      const now = nowIso();
      d.tickets.unshift({ id: tid, title: f.title, description: f.description + " (raised from Field App " + id + ")", siteId: f.siteId, clientId: site.clientId,
        priority: SEV_TO_P[f.severity], status: f.assigneeId ? "Assigned" : "Open", engineerId: f.assigneeId || null, createdAt: now,
        cycles: [{ startedAt: now, dueAt: new Date(Date.now() + SLA_TARGET[SEV_TO_P[f.severity]] * 60000).toISOString() }],
        timeline: [{ at: now, actor: nameOf(d, f.reportedById), text: "Raised from the Field App" }], notes: [], origin: "user" });
      issue.ticketId = tid;
    }
    d.fieldIssues.unshift(issue);
    log(d, { actorId: f.reportedById, text: "Reported " + f.severity.toLowerCase() + " " + f.category.toLowerCase() + " issue at " + site.name + ": " + f.title, sourceType: "site", sourceId: f.siteId, category: "Field" });
    notify(d, "Field issue " + id + " at " + site.name + ": " + f.title, f.severity === "Critical" ? "bad" : f.severity === "High" ? "warn" : "plain", "site", f.siteId);
  });
  toast("Issue " + id + " reported" + (f.raiseAs === "task" ? " and a task created" : f.raiseAs === "ticket" ? " and a helpdesk ticket opened" : ""), "ok");
  return id;
}
function pushTask(d: ReturnType<typeof getDB>, i: FieldIssue): ID {
  const tid = newId("T");
  const projectId = i.projectId || d.projects[0].id;
  d.tasks.push({ id: tid, title: i.title, projectId, ownerId: i.assigneeId, dept: i.assigneeId ? (d.teams.find((t) => t.id === person(d, i.assigneeId)?.teamId)?.name || "") : "",
    status: "To Do", priority: SEV_TO_PRI[i.severity], tag: i.category === "Safety" ? "Safety" : i.category === "Materials" ? "Procurement" : i.category === "Client request" ? "Client" : "QA",
    dueAt: endOfDay(addDays(todayKey(), i.severity === "Critical" ? 0 : i.severity === "High" ? 1 : 3)), order: d.tasks.filter((t) => t.projectId === projectId && t.status === "To Do").length,
    checklist: [{ id: newId("CK"), text: "Make safe and confirm on site", done: false }, { id: newId("CK"), text: "Photo evidence of the fix", done: false }],
    comments: [], docIds: [], dependsOn: [], siteId: i.siteId, description: i.description + " (from Field App " + i.id + ")", estimate: 2, startAt: nowIso(), origin: "user" });
  return tid;
}
export function assignIssue(id: ID, personId: ID) {
  update((d) => {
    const i = d.fieldIssues.find((x) => x.id === id);
    if (!i) return;
    const before = nameOf(d, i.assigneeId);
    i.assigneeId = personId;
    if (i.status === "Reported") i.status = "Assigned";
    if (!i.taskId) i.taskId = pushTask(d, i);
    else { const t = d.tasks.find((x) => x.id === i.taskId); if (t) t.ownerId = personId; }
    touch(i);
    log(d, { text: "Assigned field issue " + id + " to " + nameOf(d, personId), sourceType: "task", sourceId: i.taskId!, category: "Field", audit: [{ field: "Assignee", before, after: nameOf(d, personId) }] });
    if (personId !== ME) notify(d, nameOf(d, personId) + " assigned field issue “" + i.title + "”", "plain", "task", i.taskId!);
  });
  toast("Assigned to " + nameOf(getDB(), personId) + ", task on their Field App list");
}
export function setIssueStatus(id: ID, status: FieldIssue["status"]) {
  update((d) => {
    const i = d.fieldIssues.find((x) => x.id === id);
    if (!i) return;
    const before = i.status;
    i.status = status;
    if (status === "Closed") {
      i.closedAt = nowIso();
      const t = d.tasks.find((x) => x.id === i.taskId);
      if (t && t.status !== "Done") { t.lastActive = t.status; t.status = "Done"; t.completedAt = nowIso(); }
    }
    touch(i);
    log(d, { text: "Field issue " + id + " " + status.toLowerCase(), sourceType: "site", sourceId: i.siteId, category: "Field", audit: [{ field: "Status", before, after: status }] });
  });
  toast("Issue " + id + " " + status.toLowerCase());
}

/* ── Sales ───────────────────────────────────────────────────────── */
export function moveDeal(id: ID, stage: DealStage, lostReason = "") {
  const d0 = getDB().deals.find((x) => x.id === id);
  if (!d0 || d0.stage === stage) return;
  update((d) => {
    const x = d.deals.find((y) => y.id === id)!;
    const from = x.stage;
    x.stage = stage;
    if (stage === "Lost" && lostReason) x.lostReason = lostReason;
    if (stage === "Won" || stage === "Lost") x.closeAt = nowIso();
    x.history.unshift({ at: nowIso(), text: from + " to " + stage + (lostReason ? ": " + lostReason : "") });
    touch(x);
    log(d, { text: "Moved " + x.id + " “" + x.name + "” to " + stage, sourceType: "deal", sourceId: id, category: "Sales", audit: [{ field: "Stage", before: from, after: stage }] });
    if (stage === "Won") notify(d, "Won: " + x.name + ", " + eur(x.value), "ok", "deal", id);
  });
  toast(stage === "Won" ? "Deal won. Handover to delivery can start." : "Moved to " + stage, stage === "Lost" ? "plain" : "ok");
}
export function updateDeal(id: ID, patch: Partial<Deal>, note: string) {
  update((d) => {
    const x = d.deals.find((y) => y.id === id);
    if (!x) return;
    Object.assign(x, patch);
    x.history.unshift({ at: nowIso(), text: note });
    touch(x);
    log(d, { text: note + " on " + x.id, sourceType: "deal", sourceId: id, category: "Sales" });
  });
  toast(note);
}
export function createDeal(f: { name: string; accountId: ID; service: string; value: number; ownerId: ID; closeAt: string; nextStep: string; source: string; contact: string; leadId?: ID }): ID {
  const id = "OPP-" + (140 + getDB().deals.filter((x) => x.origin === "user").length + 1);
  update((d) => {
    d.deals.unshift({ id, ...f, stage: "Qualified", nextStepAt: endOfDay(addDays(todayKey(), 3)), createdAt: nowIso(), origin: "user", history: [{ at: nowIso(), text: "Opportunity created" }] });
    log(d, { text: "Created opportunity " + id + " “" + f.name + "”, " + eur(f.value), sourceType: "deal", sourceId: id, category: "Sales" });
  });
  toast("Opportunity " + id + " added to the pipeline");
  return id;
}
export function setBidStatus(id: ID, status: Bid["status"]) {
  update((d) => {
    const b = d.bids.find((x) => x.id === id);
    if (!b) return;
    const before = b.status;
    b.status = status;
    log(d, { text: "Bid " + id + " " + before + " to " + status, sourceType: "bid", sourceId: id, category: "Sales", audit: [{ field: "Status", before, after: status }] });
  });
  toast("Bid " + id + " set to " + status);
}

/* ── Marketing ───────────────────────────────────────────────────── */
export function setCampaignStatus(id: ID, status: Campaign["status"]) {
  update((d) => {
    const c = d.campaigns.find((x) => x.id === id);
    if (!c) return;
    const before = c.status;
    c.status = status;
    log(d, { text: "Campaign “" + c.name + "” " + status.toLowerCase(), sourceType: "campaign", sourceId: id, category: "Marketing", audit: [{ field: "Status", before, after: status }] });
  });
  toast("Campaign " + status.toLowerCase());
}
export function setLead(id: ID, patch: Partial<Lead>, note: string) {
  update((d) => {
    const l = d.leads.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    log(d, { text: note + ": " + l.name + ", " + l.company, sourceType: "lead", sourceId: id, category: "Marketing" });
    if (patch.ownerId && patch.ownerId !== ME) notify(d, nameOf(d, patch.ownerId) + " assigned lead " + l.name, "plain", "lead", id);
  });
  toast(note);
}
/** Qualified lead becomes an opportunity in the Sales pipeline. */
export function convertLead(id: ID): ID | null {
  const l = getDB().leads.find((x) => x.id === id);
  if (!l) return null;
  const db = getDB();
  const acc = db.accounts.find((a) => a.name.toLowerCase().includes(l.company.split(" ")[0].toLowerCase())) || db.accounts.find((a) => a.sector === l.sector) || db.accounts.find((a) => a.tier === "Target")!;
  const dealId = createDeal({ name: l.interest, accountId: acc.id, service: "Critical IT Infrastructure", value: l.estValue, ownerId: l.ownerId || ME,
    closeAt: endOfDay(addDays(todayKey(), 75)), nextStep: "Discovery call with " + l.name, source: "Marketing: " + l.source, contact: l.name + ", " + l.role, leadId: id });
  update((d) => {
    const x = d.leads.find((y) => y.id === id)!;
    x.status = "Converted"; x.dealId = dealId;
    const c = d.campaigns.find((y) => y.id === x.campaignId);
    if (c) { c.sqls += 1; c.pipeline += x.estValue; }
    log(d, { text: "Converted lead " + x.name + " to opportunity " + dealId, sourceType: "deal", sourceId: dealId, category: "Marketing" });
  });
  return dealId;
}
export function setContentStatus(id: ID, status: ContentItem["status"]) {
  update((d) => {
    const c = d.content.find((x) => x.id === id);
    if (!c) return;
    c.status = status;
    log(d, { text: "Content “" + c.title + "” " + status.toLowerCase(), sourceType: "content", sourceId: id, category: "Marketing" });
  });
  toast("Marked " + status.toLowerCase());
}

/* ── Social Studio ───────────────────────────────────────────────── */
export function savePost(p: Omit<SocialPost, "id" | "createdAt" | "origin"> & { id?: ID }): ID {
  const id = p.id || "PST-" + (20 + getDB().posts.filter((x) => x.origin === "user").length + 1);
  update((d) => {
    const existing = d.posts.find((x) => x.id === id);
    const rec: SocialPost = { ...p, id, createdAt: existing?.createdAt || nowIso(), origin: existing?.origin || "user" } as SocialPost;
    if (existing) Object.assign(existing, rec); else d.posts.unshift(rec);
    const what = p.status === "Scheduled" ? "Scheduled “" + p.title + "” for " + fmtDateTime(p.scheduledAt) + " on " + p.platforms.join(", ")
      : p.status === "Published" ? "Published “" + p.title + "” to " + p.platforms.join(", ") + " (demo, not posted)" : "Saved draft post “" + p.title + "”";
    log(d, { text: what, sourceType: "post", sourceId: id, category: "Marketing" });
    if (p.status === "Scheduled" && !d.content.some((c) => c.title === p.title)) {
      d.content.push({ id: newId("CNT"), title: p.title, kind: p.mediaKind === "video" ? "Video" : "LinkedIn post", ownerId: p.ownerId, dueAt: p.scheduledAt!, status: "Scheduled", campaignId: p.campaignId, channel: p.platforms.join(", "), origin: "user" });
    }
  });
  toast(p.status === "Scheduled" ? "Scheduled across " + p.platforms.length + " channels" : p.status === "Published" ? "Published (demo: nothing leaves this browser)" : "Draft saved");
  return id;
}
export function publishPostNow(id: ID) {
  update((d) => {
    const p = d.posts.find((x) => x.id === id);
    if (!p) return;
    p.status = "Published"; p.publishedAt = nowIso(); p.scheduledAt = p.scheduledAt || p.publishedAt;
    p.stats = { reach: 0, engagement: 0, clicks: 0 };
    log(d, { text: "Published “" + p.title + "” to " + p.platforms.join(", ") + " (demo, not posted)", sourceType: "post", sourceId: id, category: "Marketing" });
  });
  toast("Published (demo: nothing leaves this browser)");
}
export function deletePost(id: ID) {
  update((d) => {
    const p = d.posts.find((x) => x.id === id);
    d.posts = d.posts.filter((x) => x.id !== id);
    if (p) log(d, { text: "Deleted post “" + p.title + "”", sourceType: "post", sourceId: id, category: "Marketing" });
  });
  toast("Post deleted");
}
