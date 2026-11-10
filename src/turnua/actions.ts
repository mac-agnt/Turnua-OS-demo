/* Every mutation in the demo goes through here, so state, activity and audit agree. */
import type { DB, Task, TaskStatus, CalEvent, Ticket, TicketPriority, Activity, ID, Project, Approval } from "./types";
import { update, getDB, newId, nowIso } from "./store";
import { toast } from "./ui";
import { SLA_TARGET } from "./seed";
import { addDays, endOfDay, todayKey, fmtDate, eur, hhmm } from "./time";
import { nameOf, person, project, approvedVariations } from "./selectors";

const ME = "P01";

/* ── activity, audit, notifications ──────────────────────────────── */
export function log(d: DB, a: Omit<Activity, "id" | "at" | "actorType" | "actorId" | "actor"> & Partial<Pick<Activity, "actorType" | "actorId" | "actor">>) {
  const actorId = a.actorId || ME;
  d.activity.unshift({
    id: newId("ACT"), at: nowIso(), actorType: a.actorType || "person", actorId,
    actor: a.actor || person(d, actorId)?.name || actorId, text: a.text, sourceType: a.sourceType, sourceId: a.sourceId, category: a.category, audit: a.audit,
  });
}
export function notify(d: DB, text: string, tone: "ok" | "warn" | "bad" | "plain", sourceType: string, sourceId: ID) {
  d.notifications.unshift({ id: newId("NT"), at: nowIso(), text, tone, sourceType, sourceId });
}
const touch = (t: { touched?: boolean; origin: string }) => { if (t.origin === "seed") t.touched = true; };

/* ── tasks ───────────────────────────────────────────────────────── */
export function moveTask(id: ID, status: TaskStatus, beforeId?: ID | null): boolean {
  const db = getDB();
  const t = db.tasks.find((x) => x.id === id);
  if (!t) return false;
  if (status === "Done" && t.approvalId) {
    const ap = db.approvals.find((a) => a.id === t.approvalId);
    if (ap && ap.status === "Pending") { toast("Decide " + ap.id + " to complete this task. The task completes with the decision.", "warn"); return false; }
  }
  if (t.status === status && beforeId === undefined) return false;
  const from = t.status;
  update((d) => {
    const x = d.tasks.find((y) => y.id === id)!;
    if (from !== status) {
      if (status === "Done") { x.lastActive = from; x.completedAt = nowIso(); }
      if (from === "Done") x.completedAt = undefined;
      x.status = status;
    }
    // ordering inside the destination column
    const col = d.tasks.filter((y) => y.projectId === x.projectId && y.status === status && y.id !== id).sort((a, b) => a.order - b.order);
    const at = beforeId ? Math.max(0, col.findIndex((y) => y.id === beforeId)) : col.length;
    col.splice(at === -1 ? col.length : at, 0, x);
    col.forEach((y, i) => { y.order = i; });
    touch(x);
    if (from !== status) {
      log(d, { text: "Moved “" + x.title + "” to " + status + (x.ownerId && x.ownerId !== ME ? "; " + nameOf(d, x.ownerId) + " notified" : ""), sourceType: "task", sourceId: id, category: "Tasks",
        audit: [{ field: "Status", before: from, after: status }] });
      if (x.ownerId && x.ownerId !== ME) notify(d, nameOf(d, x.ownerId) + " notified: “" + x.title + "” moved to " + status, "plain", "task", id);
      storyHooks(d, x, from);
    }
  });
  if (from !== status) {
    const owner = t.ownerId && t.ownerId !== ME ? nameOf(db, t.ownerId) + " notified" : "you own this task";
    toast("Moved to " + status + ", " + owner);
  }
  return true;
}
export function toggleDone(id: ID) {
  const t = getDB().tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.status === "Done") moveTask(id, t.lastActive && t.lastActive !== "Done" ? t.lastActive : "To Do");
  else moveTask(id, "Done");
}
/** Story side effects that follow from finishing a piece of work. */
function storyHooks(d: DB, t: Task, from: TaskStatus) {
  if (t.id === "T-2048-01" && t.status === "Done") {
    const v = d.valuations.find((x) => x.id === "VAL-2048-05");
    if (v) { v.readiness = 0.8; v.evidence = v.evidence.map((e) => e.startsWith("Splice QA") ? "Splice QA complete (96 records)" : e); }
    const doc = d.docs.find((x) => x.id === "DOC-2048-TP");
    if (doc) { doc.status = "Approved"; doc.version = "v6"; doc.updatedAt = nowIso(); doc.body = doc.body.concat(["Final QA complete: 96 of 96 splice records checked."]); }
    log(d, { text: "Kildare acceptance readiness advanced: splice QA complete. Premises passed unchanged at 1,248 of 1,680.", sourceType: "valuation", sourceId: "VAL-2048-05", category: "Commercial",
      audit: [{ field: "Valuation 5 evidence readiness", before: "55%", after: "80%" }] });
  }
  if (t.id === "T-2048-01" && from === "Done" && t.status !== "Done") {
    const v = d.valuations.find((x) => x.id === "VAL-2048-05");
    if (v) { v.readiness = 0.55; v.evidence = v.evidence.map((e) => e.startsWith("Splice QA") ? "Splice QA (96 records pending)" : e); }
  }
}

export function updateTask(id: ID, patch: Partial<Task>, quiet = false) {
  update((d) => {
    const x = d.tasks.find((y) => y.id === id);
    if (!x) return;
    const audit: { field: string; before: string; after: string }[] = [];
    const show = (k: string, v: unknown) => k === "ownerId" ? nameOf(d, v as string) : k === "dueAt" ? fmtDate(v as string) : String(v ?? "");
    for (const k of Object.keys(patch) as (keyof Task)[]) {
      if (["checklist", "comments", "order"].includes(k)) continue;
      if (JSON.stringify(x[k]) !== JSON.stringify(patch[k])) audit.push({ field: k === "ownerId" ? "Owner" : k === "dueAt" ? "Due" : k.charAt(0).toUpperCase() + k.slice(1), before: show(k, x[k]), after: show(k, patch[k]) });
    }
    const from = x.status;
    if (patch.status && patch.status !== from) {
      if (patch.status === "Done") { x.lastActive = from; x.completedAt = nowIso(); }
      if (from === "Done") x.completedAt = undefined;
    }
    Object.assign(x, patch);
    touch(x);
    if (audit.length && !quiet) {
      log(d, { text: "Updated “" + x.title + "”: " + audit.map((a) => a.field.toLowerCase()).join(", "), sourceType: "task", sourceId: id, category: "Tasks", audit });
      if (patch.ownerId && patch.ownerId !== ME) notify(d, nameOf(d, patch.ownerId) + " assigned “" + x.title + "”", "plain", "task", id);
    }
    if (patch.status && patch.status !== from) storyHooks(d, x, from);
  });
}
export function addComment(id: ID, text: string, mentions: ID[]) {
  update((d) => {
    const x = d.tasks.find((y) => y.id === id);
    if (!x) return;
    x.comments.push({ id: newId("CM"), authorId: ME, text, at: nowIso(), mentions });
    touch(x);
    log(d, { text: "Commented on “" + x.title + "”" + (mentions.length ? ", mentioned " + mentions.map((m) => nameOf(d, m)).join(", ") : ""), sourceType: "task", sourceId: id, category: "Tasks" });
    mentions.forEach((m) => notify(d, nameOf(d, m) + " was mentioned on “" + x.title + "” (internal demo notification)", "plain", "task", id));
  });
  toast(mentions.length ? "Comment posted, " + mentions.map((m) => nameOf(getDB(), m).split(" ")[0]).join(", ") + " notified" : "Comment posted");
}
export function createTask(fields: Partial<Task> & { title: string; projectId: ID }): ID {
  const id = newId("T");
  update((d) => {
    const status = fields.status || "To Do";
    const order = d.tasks.filter((t) => t.projectId === fields.projectId && t.status === status).length;
    const owner = fields.ownerId ?? null;
    d.tasks.push({
      id, title: fields.title, projectId: fields.projectId, ownerId: owner, dept: owner ? (d.teams.find((t) => t.id === person(d, owner)?.teamId)?.name || "") : "",
      status, priority: fields.priority || "Normal", tag: fields.tag || "Client", dueAt: fields.dueAt || endOfDay(addDays(todayKey(), 7)), order,
      checklist: fields.checklist || [], comments: [], docIds: fields.docIds || [], dependsOn: fields.dependsOn || [], origin: "user",
      siteId: fields.siteId, workAreaId: fields.workAreaId, description: fields.description, estimate: fields.estimate ?? 4,
      ticketId: fields.ticketId, findingId: fields.findingId, maintenanceId: fields.maintenanceId, startAt: nowIso(),
    });
    log(d, { text: "Created task “" + fields.title + "”" + (owner ? " for " + nameOf(d, owner) : ""), sourceType: "task", sourceId: id, category: "Tasks" });
    if (owner && owner !== ME) notify(d, nameOf(d, owner) + " assigned “" + fields.title + "”", "plain", "task", id);
  });
  toast("Task created");
  return id;
}

/* ── approvals and the records they drive ────────────────────────── */
export function decideApproval(id: ID, decision: "Approved" | "Rejected", note = ""): boolean {
  const ap0 = getDB().approvals.find((a) => a.id === id);
  if (!ap0) return false;
  if (ap0.status !== "Pending") { toast(id + " was already " + ap0.status.toLowerCase(), "warn"); return false; }
  update((d) => {
    const ap = d.approvals.find((a) => a.id === id)!;
    ap.status = decision; ap.decidedAt = nowIso(); ap.note = note || undefined;
    const ok = decision === "Approved";
    const audit: { field: string; before: string; after: string }[] = [{ field: "Approval", before: "Pending", after: decision }];
    if (ap.sourceType === "change") {
      const c = d.changes.find((x) => x.id === ap.sourceId);
      if (c) {
        const p = project(d, c.projectId)!;
        const beforeVar = approvedVariations(d, p.id);
        c.status = ok ? "Approved" : "Rejected"; c.decidedAt = nowIso();
        if (c.kind === "Variation" && ok) {
          audit.push({ field: "Approved variations", before: eur(beforeVar), after: eur(beforeVar + (c.amount || 0)) },
            { field: "Current contract value", before: eur((p.contractValue || 0) + beforeVar), after: eur((p.contractValue || 0) + beforeVar + (c.amount || 0)) },
            { field: "Original contract value", before: eur(p.contractValue || 0), after: eur(p.contractValue || 0) + " (unchanged)" });
          p.update = { authorId: ME, at: nowIso(), text: p.update.text + " Update: CR-2041-03 approved by David Cox; instruction to proceed can issue." };
        }
        if (c.kind === "Recovery proposal" && p.scenario) {
          p.scenario.state = ok ? "Approved" : "Rejected";
          if (ok) {
            audit.push({ field: "Forecast handover", before: fmtDate(p.forecastFinish), after: fmtDate(p.scenario.finish) + " (approved recovery target)" },
              { field: "Baseline handover", before: fmtDate(p.baselineFinish), after: fmtDate(p.baselineFinish) + " (unchanged)" });
            p.forecastFinish = p.scenario.finish;
            p.team.filter((m) => m !== ME).forEach((m) => notify(d, nameOf(d, m) + " notified: Hall 4 recovery plan approved, target " + fmtDate(p.scenario!.finish), "ok", "project", p.id));
          }
        }
      }
    }
    if (ap.sourceType === "permit") {
      const pm = d.permits.find((x) => x.id === ap.sourceId);
      if (pm && ok) { pm.escalatedAt = nowIso(); audit.push({ field: "Permit status", before: pm.status, after: pm.status + " (unchanged: council decision)" }); }
    }
    if (ap.sourceType === "training") {
      const tr = d.training.find((x) => x.id === ap.sourceId);
      if (tr) {
        tr.status = ok ? "Booked" : "Rejected";
        const cred = d.credentials.find((c) => c.id === tr.credentialId);
        if (ok) {
          if (!tr.eventId) {
            const evId = newId("EV");
            d.events.push({ id: evId, title: tr.course + ", " + nameOf(d, tr.personId), type: "Training", ownerId: tr.personId, attendeeIds: [tr.personId],
              start: tr.date, end: new Date(Date.parse(tr.date) + 7 * 3600000).toISOString(), location: tr.provider, origin: "user", notes: "Booking only. The credential stays due until renewal evidence is uploaded." });
            tr.eventId = evId;
          }
          if (cred) cred.bookingId = tr.id;
        }
      }
    }
    if (ap.sourceType === "milestone" && ok) audit.push({ field: "Gate", before: "Awaiting decision", after: "Passed" });
    // the decision completes the task that asked for it
    d.tasks.filter((t) => t.approvalId === id && t.status !== "Done").forEach((t) => {
      t.lastActive = t.status; t.status = "Done"; t.completedAt = nowIso(); touch(t);
    });
    log(d, { text: decision + " " + ap.title + (note ? ": “" + note + "”" : ""), sourceType: "approval", sourceId: id, category: "Approvals", audit });
    if (ap.requestedById !== ME) notify(d, nameOf(d, ap.requestedById) + " notified: " + ap.title + " " + decision.toLowerCase(), ok ? "ok" : "warn", "approval", id);
  });
  toast(ap0.title + " " + decision.toLowerCase(), decision === "Approved" ? "ok" : "warn");
  return true;
}
export function createApproval(a: Omit<Approval, "id" | "requestedAt" | "status" | "origin">): ID {
  const id = newId("APR");
  update((d) => {
    d.approvals.push({ ...a, id, requestedAt: nowIso(), status: "Pending", origin: "user" });
    log(d, { text: "Requested approval: " + a.title, sourceType: "approval", sourceId: id, category: "Approvals", actorId: a.requestedById, actorType: a.agentId ? "agent" : "person", actor: a.agentId ? (d.agents.find((x) => x.id === a.agentId)?.name || "Agent") : undefined });
  });
  return id;
}

/** A licence decision is external: record it with provenance, never "approve" it. */
export function recordPermitDecision(permitId: ID, outcome: "Approved" | "Refused" | "Granted with conditions", reference: string, provenance: string) {
  update((d) => {
    const pm = d.permits.find((x) => x.id === permitId);
    if (!pm) return;
    const before = pm.status;
    pm.status = outcome;
    pm.decision = { at: nowIso(), outcome, reference, provenance, recordedBy: ME };
    const p = project(d, pm.projectId);
    const granted = outcome !== "Refused";
    const audit: { field: string; before: string; after: string }[] = [{ field: "Permit status", before, after: outcome }];
    if (p && p.id === "TRN-2063") {
      const ev = d.events.find((e) => e.id === "EV-DLR-CREW");
      if (ev && granted) { ev.provisional = false; ev.title = "DLR main works crew (Eoin + 2 operatives)"; ev.notes = "Confirmed after PER-DLR-017 decision " + reference + "."; }
      const ms = d.milestones.find((m) => m.id === "MS-2063-2");
      if (ms) ms.completedAt = nowIso();
      if (granted) {
        audit.push({ field: "Project health", before: p.health, after: "On track" }, { field: "Forecast handover", before: fmtDate(p.forecastFinish), after: fmtDate(p.baselineFinish) });
        p.health = "On track"; p.forecastFinish = p.baselineFinish; p.blocker = undefined;
        const ph = d.phases.find((x) => x.id === "TRN-2063-PH2"); if (ph) ph.pct = 1;
      } else {
        audit.push({ field: "Project health", before: p.health, after: "Off track" });
        p.health = "Off track"; p.blocker = "Road opening licence PER-DLR-017 refused; resubmission needed";
      }
    }
    log(d, { text: "Recorded council decision on " + permitId + ": " + outcome + " (" + reference + "). Provenance: " + provenance, sourceType: "permit", sourceId: permitId, category: "Permits", audit });
  });
  toast(permitId + " recorded as " + outcome.toLowerCase(), outcome === "Refused" ? "warn" : "ok");
}

/* ── helpdesk ────────────────────────────────────────────────────── */
function tk(d: DB, id: ID) { return d.tickets.find((t) => t.id === id)!; }
export function acknowledgeTicket(id: ID) {
  update((d) => {
    const t = tk(d, id);
    const c = t.cycles[t.cycles.length - 1];
    if (c.acknowledgedAt) return;
    c.acknowledgedAt = nowIso();
    c.result = Date.parse(c.acknowledgedAt) <= Date.parse(c.dueAt) ? "Met" : "Missed";
    t.status = "In progress";
    t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Acknowledged. First response recorded (" + c.result.toLowerCase() + " target)." });
    const rt = d.tasks.find((x) => x.id === t.taskId);
    if (rt) { const item = rt.checklist.find((i) => /acknowledge/i.test(i.text)); if (item) item.done = true; touch(rt); }
    log(d, { text: "Acknowledged " + id + " (" + t.title + "), response target " + c.result.toLowerCase(), sourceType: "ticket", sourceId: id, category: "Helpdesk",
      audit: [{ field: "Status", before: "Assigned", after: "In progress" }, { field: "First response", before: "None", after: c.result }] });
  });
  toast(id + " acknowledged. Response time frozen.");
}
export function assignTicket(id: ID, personId: ID) {
  update((d) => {
    const t = tk(d, id);
    const before = nameOf(d, t.engineerId);
    t.engineerId = personId;
    if (t.status === "Open") t.status = "Assigned";
    t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Assigned to " + nameOf(d, personId) + "." });
    log(d, { text: "Assigned " + id + " to " + nameOf(d, personId), sourceType: "ticket", sourceId: id, category: "Helpdesk", audit: [{ field: "Engineer", before, after: nameOf(d, personId) }] });
    if (personId !== ME) notify(d, nameOf(d, personId) + " assigned " + id, "plain", "ticket", id);
  });
  toast(id + " assigned to " + nameOf(getDB(), personId));
}
/** Policy: a priority change re-bases an unacknowledged response target from the
    original open time; an acknowledged cycle keeps its recorded result. */
export function changeTicketPriority(id: ID, priority: TicketPriority, reason: string) {
  update((d) => {
    const t = tk(d, id);
    const before = t.priority;
    t.priority = priority;
    const c = t.cycles[t.cycles.length - 1];
    if (!c.acknowledgedAt) c.dueAt = new Date(Date.parse(c.startedAt) + SLA_TARGET[priority] * 60000).toISOString();
    t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Priority " + before + " to " + priority + ". Reason: " + reason });
    log(d, { text: "Changed " + id + " priority " + before + " to " + priority + " (" + reason + ")", sourceType: "ticket", sourceId: id, category: "Helpdesk", audit: [{ field: "Priority", before, after: priority }] });
  });
  toast(id + " is now " + priority);
}
export function escalateTicket(id: ID, note: string) {
  let taskId = "";
  update((d) => {
    const t = tk(d, id);
    const lead = "P05";
    taskId = newId("T");
    d.tasks.push({ id: taskId, title: "Escalation: " + id + " " + t.title, projectId: d.sites.find((s) => s.id === t.siteId)?.projectId || "TRN-2035", ownerId: lead, dept: "Critical Facilities & IT",
      status: "To Do", priority: "Urgent", tag: "PPM", dueAt: new Date(Date.now() + 2 * 3600000).toISOString(), order: 0, checklist: [], comments: [], docIds: [], dependsOn: [], origin: "user",
      siteId: t.siteId, ticketId: id, description: note, startAt: nowIso() });
    t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Escalated to " + nameOf(d, lead) + ". " + note });
    log(d, { text: "Escalated " + id + " to " + nameOf(d, lead) + " and created an escalation task", sourceType: "ticket", sourceId: id, category: "Helpdesk" });
    notify(d, "Escalation on " + id + " sent to " + nameOf(d, lead) + " (internal demo notification)", "warn", "ticket", id);
  });
  toast(id + " escalated, task created for Paul O’Neill");
  return taskId;
}
export function resolveTicket(id: ID, note: string) {
  update((d) => {
    const t = tk(d, id);
    const c = t.cycles[t.cycles.length - 1];
    if (!c.acknowledgedAt) { c.acknowledgedAt = nowIso(); c.result = Date.parse(c.acknowledgedAt) <= Date.parse(c.dueAt) ? "Met" : "Missed"; }
    const before = t.status;
    t.status = "Resolved"; t.resolvedAt = nowIso(); t.resolutionNote = note;
    t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Resolved: " + note });
    const rt = d.tasks.find((x) => x.id === t.taskId);
    if (rt && rt.status !== "Done") { rt.lastActive = rt.status; rt.status = "Done"; rt.completedAt = nowIso(); rt.checklist.forEach((i) => { i.done = true; }); touch(rt); }
    if (t.assetId) { const a = d.assets.find((x) => x.id === t.assetId); if (a && a.state === "Fault") { a.state = "In service"; a.reading = a.reading ? { ...a.reading, value: id === "HD-4821" ? "24.6 °C (setpoint 24 °C)" : a.reading.value, at: nowIso() } : a.reading; } }
    log(d, { text: "Resolved " + id + " (" + t.title + "): " + note, sourceType: "ticket", sourceId: id, category: "Helpdesk", audit: [{ field: "Status", before, after: "Resolved" }] });
  });
  toast(id + " resolved");
}
export function reopenTicket(id: ID, reason: string) {
  update((d) => {
    const t = tk(d, id);
    const start = nowIso();
    t.cycles.push({ startedAt: start, dueAt: new Date(Date.now() + SLA_TARGET[t.priority] * 60000).toISOString() });
    t.status = t.engineerId ? "Assigned" : "Open"; t.resolvedAt = undefined;
    t.timeline.push({ at: start, actor: nameOf(d, ME), text: "Reopened: " + reason + ". New response cycle started; previous cycle kept." });
    log(d, { text: "Reopened " + id + ": " + reason, sourceType: "ticket", sourceId: id, category: "Helpdesk", audit: [{ field: "Status", before: "Resolved", after: t.status }] });
  });
  toast(id + " reopened with a new response cycle");
}
export function addTicketNote(id: ID, text: string) {
  update((d) => { const t = tk(d, id); t.notes.push({ at: nowIso(), authorId: ME, text }); t.timeline.push({ at: nowIso(), actor: nameOf(d, ME), text: "Note: " + text }); });
  toast("Note added");
}
export function createTicket(f: { title: string; description: string; siteId: ID; assetId?: ID; priority: TicketPriority; engineerId: ID | null }): ID {
  const id = "HD-" + (Math.max(...getDB().tickets.map((t) => parseInt(t.id.slice(3), 10) || 0)) + 1);
  update((d) => {
    const s = d.sites.find((x) => x.id === f.siteId)!;
    const start = nowIso();
    const t: Ticket = { id, title: f.title, description: f.description, siteId: f.siteId, assetId: f.assetId, clientId: s.clientId, priority: f.priority,
      status: f.engineerId ? "Assigned" : "Open", engineerId: f.engineerId, createdAt: start,
      cycles: [{ startedAt: start, dueAt: new Date(Date.now() + SLA_TARGET[f.priority] * 60000).toISOString() }],
      timeline: [{ at: start, actor: nameOf(d, ME), text: "Ticket opened." }], notes: [], origin: "user" };
    d.tickets.unshift(t);
    log(d, { text: "Opened " + id + " (" + f.priority + ") " + f.title + " at " + s.name, sourceType: "ticket", sourceId: id, category: "Helpdesk" });
  });
  toast(id + " opened");
  return id;
}

/* ── maintenance and inspections ─────────────────────────────────── */
export function completeJob(id: ID, evidence: string) {
  update((d) => {
    const j = d.maintenance.find((x) => x.id === id)!;
    j.completedAt = nowIso(); j.evidence = evidence; j.checklist.forEach((c) => { c.done = true; });
    log(d, { text: "Completed maintenance " + id + ": " + j.title, sourceType: "maintenance", sourceId: id, category: "Maintenance", audit: [{ field: "Status", before: "Open", after: "Complete" }] });
  });
  toast(id + " completed");
}
export function reopenJob(id: ID) {
  update((d) => {
    const j = d.maintenance.find((x) => x.id === id)!;
    j.completedAt = undefined; j.evidence = undefined; j.checklist.forEach((c) => { c.done = false; });
    log(d, { text: "Reopened maintenance " + id, sourceType: "maintenance", sourceId: id, category: "Maintenance", audit: [{ field: "Status", before: "Complete", after: "Open" }] });
  });
  toast(id + " reopened");
}
export function closeFinding(id: ID, note: string) {
  update((d) => {
    const f = d.findings.find((x) => x.id === id)!;
    f.status = "Closed"; f.closedAt = nowIso();
    const t = d.tasks.find((x) => x.id === f.taskId);
    if (t) { t.comments.push({ id: newId("CM"), authorId: ME, text: "Inspection finding " + id + " closed: " + note, at: nowIso(), mentions: [] }); touch(t); }
    log(d, { text: "Closed finding " + id + ": " + f.text + (note ? " (" + note + ")" : ""), sourceType: "finding", sourceId: id, category: "HSEQ", audit: [{ field: "Status", before: "Open", after: "Closed" }] });
  });
  toast(id + " closed");
}
export function findingTask(id: ID): ID {
  const f = getDB().findings.find((x) => x.id === id)!;
  const ins = getDB().inspections.find((x) => x.id === f.inspectionId)!;
  const s = getDB().sites.find((x) => x.id === ins.siteId)!;
  const tid = createTask({ title: "Corrective action: " + f.text, projectId: s.projectId, ownerId: f.ownerId, priority: f.severity === "High" ? "High" : "Normal", tag: "Safety", dueAt: f.dueAt, siteId: s.id, findingId: id });
  update((d) => { const x = d.findings.find((y) => y.id === id)!; x.taskId = tid; });
  return tid;
}

/* ── calendar ────────────────────────────────────────────────────── */
export function createEvent(e: Omit<CalEvent, "id" | "origin">): ID {
  const id = newId("EV");
  update((d) => {
    d.events.push({ ...e, id, origin: "user" });
    log(d, { text: "Created event “" + e.title + "” " + fmtDate(e.start) + (e.attendeeIds.length > 1 ? ", invited " + e.attendeeIds.filter((x) => x !== e.ownerId).map((x) => nameOf(d, x)).join(", ") + " (simulated invitation)" : ""), sourceType: "event", sourceId: id, category: "Calendar" });
  });
  toast("Event saved" + (e.attendeeIds.length > 1 ? ", invitations simulated" : ""));
  return id;
}
export function updateEvent(id: ID, patch: Partial<CalEvent>, scope: "series" | "occurrence" = "series", date?: string) {
  update((d) => {
    const ev = d.events.find((x) => x.id === id);
    if (!ev) return;
    if (ev.recurrence && scope === "occurrence" && date) {
      ev.exceptions = ev.exceptions || {};
      ev.exceptions[date] = { ...(ev.exceptions[date] || {}), title: patch.title, attendeeIds: patch.attendeeIds, start: patch.start, end: patch.end };
    } else {
      if (ev.recurrence && (patch.start || patch.end)) {
        const s = patch.start || ev.start, e = patch.end || ev.end;
        ev.recurrence = { ...ev.recurrence, startTime: hhmm(s), durationMins: Math.round((Date.parse(e) - Date.parse(s)) / 60000) };
        const { start: _s, end: _e, ...rest } = patch; void _s; void _e;
        Object.assign(ev, rest);
      } else Object.assign(ev, patch);
    }
    touch(ev);
    log(d, { text: "Edited event “" + (patch.title || ev.title) + "”" + (ev.recurrence ? (scope === "occurrence" ? " (this occurrence)" : " (series)") : ""), sourceType: "event", sourceId: id, category: "Calendar" });
  });
  toast("Event updated");
}
export function deleteEvent(id: ID, scope: "series" | "occurrence" = "series", date?: string) {
  update((d) => {
    const ev = d.events.find((x) => x.id === id);
    if (!ev) return;
    if (ev.recurrence && scope === "occurrence" && date) {
      ev.exceptions = ev.exceptions || {};
      ev.exceptions[date] = { deleted: true };
      touch(ev);
    } else d.events = d.events.filter((x) => x.id !== id);
    log(d, { text: "Deleted event “" + ev.title + "”" + (ev.recurrence ? (scope === "occurrence" ? " (one occurrence)" : " (whole series)") : ""), sourceType: "event", sourceId: id, category: "Calendar" });
  });
  toast("Event deleted");
}

/* ── people ──────────────────────────────────────────────────────── */
export function bookTraining(f: { credentialId: ID; course: string; provider: string; date: string; approveNow: boolean; coverId?: ID }) {
  let trId = "";
  update((d) => {
    const cred = d.credentials.find((c) => c.id === f.credentialId)!;
    trId = newId("TR");
    const apId = newId("APR");
    d.approvals.push({ id: apId, kind: "Training request", title: f.course + " for " + nameOf(d, cred.personId), sourceType: "training", sourceId: trId, amount: null,
      requestedById: ME, approverId: ME, requestedAt: nowIso(), status: f.approveNow ? "Approved" : "Pending", decidedAt: f.approveNow ? nowIso() : undefined,
      reason: cred.name + " due " + fmtDate(cred.dueAt), effect: "Books the course and blocks the calendar. The credential stays due until renewal evidence is uploaded.", evidenceDocIds: [], origin: "user" });
    let eventId: string | undefined;
    eventId = newId("EV");
    d.events.push({ id: eventId, title: f.course + ", " + nameOf(d, cred.personId), type: "Training", ownerId: cred.personId, attendeeIds: [cred.personId],
      start: f.date, end: new Date(Date.parse(f.date) + 7 * 3600000).toISOString(), location: f.provider, provisional: !f.approveNow, origin: "user",
      notes: "Training booked, credential still awaiting renewal evidence." + (f.coverId ? " Cover: " + nameOf(d, f.coverId) + "." : "") });
    d.training.push({ id: trId, personId: cred.personId, credentialId: cred.id, course: f.course, provider: f.provider, date: f.date,
      status: f.approveNow ? "Booked" : "Awaiting approval", approvalId: apId, eventId, coverId: f.coverId, createdAt: nowIso() });
    cred.bookingId = trId;
    log(d, { text: (f.approveNow ? "Booked " : "Requested ") + f.course + " for " + nameOf(d, cred.personId) + " on " + fmtDate(f.date) + ". Credential still awaits renewal evidence.", sourceType: "training", sourceId: trId, category: "People",
      audit: [{ field: "Booking", before: "None", after: f.approveNow ? "Booked" : "Awaiting approval" }, { field: "Credential status", before: "Due", after: "Due (unchanged)" }] });
  });
  toast(f.approveNow ? "Training booked. Credential stays due until evidence is uploaded." : "Training request sent for approval");
  return trId;
}
export function assignCover(taskIds: ID[], coverId: ID, reason: string) {
  update((d) => {
    const audit: { field: string; before: string; after: string }[] = [];
    taskIds.forEach((id) => { const t = d.tasks.find((x) => x.id === id); if (t) { audit.push({ field: t.title, before: nameOf(d, t.ownerId), after: nameOf(d, coverId) }); t.ownerId = coverId; touch(t); } });
    log(d, { text: "Assigned " + nameOf(d, coverId) + " as cover: " + reason, sourceType: "person", sourceId: coverId, category: "People", audit });
    if (coverId !== ME) notify(d, nameOf(d, coverId) + " notified of cover assignment", "plain", "person", coverId);
  });
  toast(nameOf(getDB(), coverId) + " assigned as cover");
}
export function sendMessage(withId: ID, text: string) {
  update((d) => {
    d.messages.push({ id: newId("MSG"), withId, fromId: ME, text, at: nowIso() });
    log(d, { text: "Sent internal message to " + nameOf(d, withId) + " (demo, not delivered externally)", sourceType: "person", sourceId: withId, category: "People" });
  });
  toast("Message saved to the demo thread");
}
export function setTimesheetHours(id: ID, hours: number) {
  update((d) => {
    const t = d.timesheets.find((x) => x.id === id);
    if (!t || t.status === "Approved") return;
    const before = t.hours;
    t.hours = hours; t.history.push({ at: nowIso(), text: "Hours " + before + " to " + hours });
    log(d, { text: "Edited timesheet for " + nameOf(d, t.personId) + " on " + t.date + ": " + before + "h to " + hours + "h", sourceType: "timesheet", sourceId: id, category: "People", audit: [{ field: "Hours", before: String(before), after: String(hours) }] });
  });
}
export function addTimesheet(personId: ID, projectId: ID | null, label: string, date: string, hours: number) {
  update((d) => {
    d.timesheets.push({ id: newId("TS"), personId, projectId, label, date, hours, status: "Draft", history: [{ at: nowIso(), text: "Added by " + nameOf(d, ME) }] });
    log(d, { text: "Added " + hours + "h for " + nameOf(d, personId) + " on " + date, sourceType: "timesheet", sourceId: personId, category: "People" });
  });
  toast("Timesheet entry added");
}
export function setTimesheetStatus(personId: ID, from: string, to: string, status: "Submitted" | "Approved" | "Draft") {
  let n = 0;
  update((d) => {
    d.timesheets.filter((t) => t.personId === personId && t.date >= from && t.date < to && t.status !== status).forEach((t) => {
      if (status === "Approved" && t.status !== "Submitted") return;
      t.status = status; t.history.push({ at: nowIso(), text: status + " by " + nameOf(d, ME) }); n++;
    });
    if (n) log(d, { text: status + " " + n + " timesheet entries for " + nameOf(d, personId), sourceType: "timesheet", sourceId: personId, category: "People" });
  });
  toast(n ? n + " entries " + status.toLowerCase() : "Nothing to " + status.toLowerCase().replace(/ed$/, ""), n ? "ok" : "plain");
}
export function reassignShift(eventId: ID, date: string, toPersonId: ID) {
  update((d) => {
    const ev = d.events.find((e) => e.id === eventId);
    if (!ev) return;
    const before = nameOf(d, ev.ownerId);
    if (ev.recurrence) {
      ev.exceptions = ev.exceptions || {};
      ev.exceptions[date] = { ...(ev.exceptions[date] || {}), attendeeIds: [toPersonId], title: ev.title + " (cover: " + nameOf(d, toPersonId) + ")" };
    } else { ev.attendeeIds = [toPersonId]; }
    touch(ev);
    log(d, { text: "Reassigned " + ev.title + " on " + date + " from " + before + " to " + nameOf(d, toPersonId), sourceType: "event", sourceId: eventId, category: "Calendar", audit: [{ field: "On-call", before, after: nameOf(d, toPersonId) }] });
  });
  toast("Shift reassigned and calendar updated");
}

/* ── projects ────────────────────────────────────────────────────── */
export function createProject(f: { name: string; clientId: ID; service: string; location: string; pmId: ID; model: Project["model"]; value: number | null; startAt: string; finishAt: string }): ID {
  const n = Math.max(...getDB().projects.map((p) => parseInt(p.id.slice(4), 10))) + 1;
  const id = "TRN-" + n;
  update((d) => {
    const short = f.name.split(/\s+/).slice(0, 2).join(" ");
    d.projects.push({ id, name: f.name, short, clientId: f.clientId, service: f.service, location: f.location, pmId: f.pmId, sponsorId: ME, team: [f.pmId],
      model: f.model, contractValue: f.model === "Works contract" ? f.value : null, budget: f.model === "Internal budget" ? f.value : null, cost: f.model === "Managed service" ? null : 0,
      progress: 0, progressLabel: "0% physical progress", health: "On track", startAt: f.startAt, baselineFinish: f.finishAt, forecastFinish: f.finishAt,
      siteIds: [], workAreaIds: [], update: { authorId: ME, at: nowIso(), text: "Project created in the demo workspace. Mobilisation tasks to follow." },
      safety: { lastLtiAt: d.projects[0].safety.lastLtiAt, toolboxTalks: 0, toolboxThisWeek: 0 }, origin: "user" });
    const s = Date.parse(f.startAt), e = Date.parse(f.finishAt), span = Math.max(1, e - s);
    const names = ["Mobilisation and design", "Procurement", "Main works", "Testing and commissioning", "Handover"];
    const cuts = [0, 0.15, 0.3, 0.8, 0.92, 1];
    names.forEach((nm, i) => {
      const ps = new Date(s + span * cuts[i]).toISOString(), pe = new Date(s + span * cuts[i + 1]).toISOString();
      d.phases.push({ id: id + "-PH" + (i + 1), projectId: id, name: nm, start: ps, end: pe, baselineEnd: pe, pct: 0 });
    });
    d.milestones.push({ id: "MS-" + n + "-1", projectId: id, name: "Handover", dueAt: f.finishAt, baselineAt: f.finishAt, ownerId: f.pmId, dependsOn: [], handover: true });
    log(d, { text: "Created project " + id + " " + f.name, sourceType: "project", sourceId: id, category: "Projects" });
  });
  toast("Project " + id + " created");
  return id;
}
export function postProjectUpdate(pid: ID, text: string) {
  update((d) => {
    const p = project(d, pid)!;
    p.update = { authorId: ME, at: nowIso(), text };
    log(d, { text: "Posted status update on " + p.short, sourceType: "project", sourceId: pid, category: "Projects" });
  });
  toast("Status update posted");
}

/* ── maintenance of settings and systems ─────────────────────────── */
export function saveSettings(patch: Partial<DB["settings"]>, label: string) {
  update((d) => {
    const before = JSON.stringify(d.settings.governance);
    d.settings = { ...d.settings, ...patch };
    log(d, { text: "Changed settings: " + label + " (local demo simulation)", sourceType: "settings", sourceId: "settings", category: "Settings",
      audit: patch.governance ? Object.keys(patch.governance).filter((k) => JSON.parse(before)[k] !== patch.governance![k]).map((k) => ({ field: k, before: String(JSON.parse(before)[k]), after: String(patch.governance![k]) })) : undefined });
  });
  toast("Settings saved");
}
export function simulateSync(intId: ID) {
  update((d) => {
    const i = d.settings.integrations.find((x) => x.id === intId)!;
    i.lastSync = nowIso();
    const n = d.events.length;
    log(d, { actorType: "system", actorId: intId, actor: i.name + " (demo sync)", text: i.status === "Demo connection" ? "Simulated sync: " + n + " events mapped, no external calls made" : "Sample mapping refreshed. Vendor not confirmed, no connection exists", sourceType: "integration", sourceId: intId, category: "Systems" });
  });
  toast("Simulated sync complete. No external connection was used.", "plain");
}
export function markNotificationsRead() { update((d) => { d.notifications.forEach((n) => { n.read = true; }); }); }

