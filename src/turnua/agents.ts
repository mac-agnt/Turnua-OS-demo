/* The eight agents. Each "Run now" reads the current store, writes a run with
   sources, and proposes actions only once per open issue. Nothing external. */
import type { DB, AgentRun, ID } from "./types";
import { getDB, update, newId, nowIso } from "./store";
import { log, notify } from "./actions";
import { toast } from "./ui";
import { addDays, daysBetween, eur, fmtDate, fmtKey, keyOf, monthTitle, pct } from "./time";
import {
  availabilityOn, burn, credState, credsDue, isOverdue, isUnresolved, nameOf, nextWeekday, person, portfolio, ppm, project, sla, slipDays, AQC_SITES,
} from "./selectors";

type Out = Omit<AgentRun, "id" | "agentId" | "at" | "trigger" | "signature">;
const src = (type: string, id: ID, label: string) => ({ type, id, label });

export function briefingLines(db: DB, now: number): Out {
  const h4 = project(db, "TRN-2052")!, rth = project(db, "TRN-2041")!, dlr = project(db, "TRN-2063")!;
  const recAp = db.approvals.find((a) => a.id === "APR-2052-02");
  const varAp = db.approvals.find((a) => a.id === "APR-2041-03");
  const po = db.purchaseOrders.find((p) => p.id === "PO-5521")!;
  const delay = po.revisedDueAt ? daysBetween(keyOf(Date.parse(po.dueAt)), keyOf(Date.parse(po.revisedDueAt))) : 0;
  const p1 = db.tickets.filter((t) => isUnresolved(t) && t.priority === "P1");
  const permit = db.permits.find((p) => p.id === "PER-DLR-017")!;
  const mine = db.tasks.filter((t) => t.ownerId === "P01" && t.status !== "Done");
  const pending = db.approvals.filter((a) => a.approverId === "P01" && a.status === "Pending");
  const lines: string[] = [];
  lines.push(recAp?.status === "Pending"
    ? "Hall 4: containment " + delay + " days late; €42,000 recovery proposal waits for you (targets " + fmtDate(h4.scenario?.finish) + " against baseline " + fmtDate(h4.baselineFinish) + "). Progress " + pct(h4.progress) + ", burn " + pct(burn(h4) || 0) + "."
    : "Hall 4: recovery " + (recAp?.status || "").toLowerCase() + "; forecast " + fmtDate(h4.forecastFinish) + " against baseline " + fmtDate(h4.baselineFinish) + ". Containment still due " + fmtDate(po.revisedDueAt) + ".");
  lines.push(varAp?.status === "Pending"
    ? "Rathdrum: variation CR-2041-03, €84,000, needs your decision. Original contract stays €4,800,000 until approved. Forecast " + fmtDate(rth.forecastFinish) + "."
    : "Rathdrum: CR-2041-03 " + (varAp?.status || "").toLowerCase() + ". Forecast " + fmtDate(rth.forecastFinish) + ".");
  if (p1.length) p1.forEach((t) => lines.push("Live P1 " + t.id + " " + t.title + " at " + db.sites.find((s) => s.id === t.siteId)?.name + ", " + nameOf(db, t.engineerId) + " assigned, " + sla(t, now).label + "."));
  else lines.push("No unresolved P1 incidents.");
  lines.push(permit.status === "Pending decision"
    ? "DLR: licence PER-DLR-017 decision due " + fmtDate(permit.decisionDueAt) + (permit.escalatedAt ? " (escalated)" : "; escalation awaiting your approval") + ". Main works cannot start before it."
    : "DLR: licence " + permit.status.toLowerCase() + "; project " + dlr.health.toLowerCase() + ".");
  lines.push("You have " + mine.length + " open tasks (" + mine.filter((t) => isOverdue(t, now)).length + " overdue) and " + pending.length + " approvals waiting.");
  return {
    headline: "Morning briefing: " + pending.length + " decisions, " + p1.length + " live P1",
    lines, confidence: "High", limitations: "Built from demo records in this workspace; no external sources.",
    sources: [src("project", "TRN-2052", "Hall 4"), src("approval", "APR-2041-03", "CR-2041-03"), ...p1.map((t) => src("ticket", t.id, t.id)), src("permit", "PER-DLR-017", "PER-DLR-017")],
    actions: pending.slice(0, 3).map((a) => ({ label: "Decide " + a.title, kind: "approval" as const, refId: a.id })),
  };
}

function watchdog(db: DB, now: number, d?: DB): Out {
  const overdue = db.tasks.filter((t) => isOverdue(t, now));
  const byProj = new Map<string, number>();
  overdue.forEach((t) => byProj.set(t.projectId, (byProj.get(t.projectId) || 0) + 1));
  const lines = ["" + overdue.length + " overdue tasks: " + Array.from(byProj.entries()).map(([p, n]) => project(db, p)?.short + " " + n).join(", ") + "."];
  const actions: AgentRun["actions"] = [];
  for (const pm of db.permits.filter((p) => p.status === "Pending decision")) {
    const daysLeft = daysBetween(keyOf(now), keyOf(Date.parse(pm.decisionDueAt)));
    lines.push(pm.id + " decision due in " + daysLeft + " days; " + pm.blockedTaskIds.length + " tasks blocked.");
    const existing = db.approvals.find((a) => a.sourceType === "permit" && a.sourceId === pm.id && a.kind === "Escalation");
    if (existing) actions.push({ label: "Escalation already " + (existing.status === "Pending" ? "awaiting decision" : existing.status.toLowerCase()) + ": " + existing.id, kind: "approval", refId: existing.id });
    else if (d) {
      const id = newId("APR");
      d.approvals.push({ id, kind: "Escalation", title: "Escalate " + pm.id + " to " + pm.authority, reason: "Decision due " + fmtDate(pm.decisionDueAt) + ".", effect: "Demo escalation note only; the licence stays pending until the authority decides.",
        sourceType: "permit", sourceId: pm.id, projectId: pm.projectId, amount: null, requestedById: "P09", approverId: "P01", requestedAt: nowIso(), status: "Pending", evidenceDocIds: [pm.docId], agentId: "watchdog", origin: "user" });
      actions.push({ label: "Escalation proposed: " + id, kind: "approval", refId: id });
    }
  }
  const hot = db.tickets.filter((t) => isUnresolved(t)).map((t) => ({ t, s: sla(t, now) })).filter((x) => x.s.state === "breached" || (x.s.state === "running" && x.s.share > 0.6));
  hot.forEach((x) => lines.push(x.t.id + " " + x.t.priority + " response: " + x.s.label + "."));
  const unowned = db.tasks.filter((t) => t.status !== "Done" && !t.ownerId);
  lines.push(unowned.length ? unowned.length + " open tasks have no owner." : "Every open task has an owner.");
  return { headline: (overdue.length + hot.length + unowned.length) + " exceptions across " + byProj.size + " projects", lines, confidence: "High", limitations: "Checks overdue, permits, SLA timers and owners only.",
    sources: [...db.permits.filter((p) => p.status === "Pending decision").map((p) => src("permit", p.id, p.id)), ...hot.map((x) => src("ticket", x.t.id, x.t.id))], actions };
}

function recovery(db: DB): Out {
  const p = project(db, "TRN-2052")!;
  const po = db.purchaseOrders.find((x) => x.id === "PO-5521")!;
  const delay = po.revisedDueAt ? daysBetween(keyOf(Date.parse(po.dueAt)), keyOf(Date.parse(po.revisedDueAt))) : 0;
  const ap = db.approvals.find((a) => a.id === "APR-2052-02");
  const target = p.scenario?.finish || p.forecastFinish;
  const recovered = daysBetween(keyOf(Date.parse(target)), keyOf(Date.parse(addDays(keyOf(Date.parse(p.baselineFinish)), 21) + "T12:00:00Z")));
  const remaining = daysBetween(keyOf(Date.parse(p.baselineFinish)), keyOf(Date.parse(target)));
  const conor = person(db, "P06")!, ciaran = person(db, "P03")!;
  return {
    headline: "Hall 4: " + delay + "-day containment delay, recovery " + (ap?.status === "Pending" ? "awaiting decision" : (ap?.status || "not proposed").toLowerCase()),
    lines: [
      "PO-5521 moved from " + fmtDate(po.dueAt) + " to " + fmtDate(po.revisedDueAt) + ": " + delay + " days. Delivery is still pending.",
      "Baseline handover " + fmtDate(p.baselineFinish) + ". Without recovery the forecast is " + fmtDate(addDays(keyOf(Date.parse(p.baselineFinish)), 21) + "T12:00:00Z") + ".",
      "Option A (CR-2052-02, €42,000): weekend second shift and Zone D resequence, target " + fmtDate(target) + ": " + recovered + " days recovered, " + remaining + " days of slip remain.",
      "Capacity check: " + conor.first + " and " + ciaran.first + " are above 90% planned load; the weekend shift needs subcontract operatives.",
      "Physical progress " + pct(p.progress) + " against cost burn " + pct(burn(p) || 0) + ": " + Math.round(((burn(p) || 0) - p.progress) * 100) + " percentage points apart.",
    ],
    confidence: "Medium", limitations: "Assumes the supplier holds the revised date. No guarantee of programme recovery.",
    sources: [src("po", "PO-5521", "PO-5521"), src("project", "TRN-2052", "Hall 4"), src("change", "CR-2052-02", "CR-2052-02")],
    actions: ap ? [{ label: (ap.status === "Pending" ? "Proposal awaiting decision: " : "Proposal " + ap.status.toLowerCase() + ": ") + ap.id, kind: "approval", refId: ap.id }] : [],
  };
}

function workforce(db: DB, now: number, request?: string): Out {
  const day = nextWeekday(3, now);
  const av = availabilityOn(db, day);
  const free = av.filter((a) => a.state === "Available");
  const part = av.filter((a) => a.state === "Partly booked");
  const out = av.filter((a) => a.state === "Unavailable");
  return {
    headline: "Availability for " + fmtKey(day, { long: true, year: false }) + (request ? " (" + request + ")" : ""),
    lines: [
      "Available: " + (free.map((a) => a.person.name + (a.reasons.length ? " (" + a.reasons[0] + ")" : "")).join("; ") || "nobody fully free"),
      "Partly booked: " + (part.map((a) => a.person.name + " (" + a.reasons.join("; ") + ")").join("; ") || "none"),
      "Unavailable: " + (out.map((a) => a.person.name + " (" + a.reasons[0] + ")").join("; ") || "none"),
      "Electrical or MEWP work also needs the right credential: check IPAF before assigning Conor after " + fmtDate(db.credentials.find((c) => c.id === "CERT-06-IPAF")?.dueAt) + ".",
    ],
    confidence: "High", limitations: "Uses calendar events, leave, on-call rest and recorded skills. An empty calendar alone is not proof someone can do a role.",
    sources: av.slice(0, 4).map((a) => src("person", a.person.id, a.person.name)), actions: [{ label: "Open capacity view", kind: "none" }],
  };
}

function compliance(db: DB, now: number, d?: DB): Out {
  const due = credsDue(db, now, 45);
  const lines = due.map((c) => nameOf(db, c.personId) + ", " + c.name + ", " + fmtDate(c.dueAt) + " (" + credState(c, now).label + ")" + (c.bookingId ? ", training booked" : ""));
  const permits = db.permits.filter((p) => p.status === "Pending decision");
  const rams = db.rams.filter((r) => r.status !== "Approved");
  lines.push("Permits pending: " + (permits.map((p) => p.id).join(", ") || "none") + ". RAMS in review: " + rams.length + ".");
  const actions: AgentRun["actions"] = [];
  const unbooked = due.filter((c) => !c.bookingId);
  if (unbooked.length) {
    const sig = "compliance-plan-" + unbooked.map((c) => c.id).join("+");
    const exists = db.tasks.find((t) => t.description === sig && t.status !== "Done");
    if (exists) actions.push({ label: "Renewal plan task already open: " + exists.id, kind: "task", refId: exists.id });
    else if (d) {
      const id = newId("T");
      d.tasks.push({ id, title: "Renewal plan: " + unbooked.length + " credential reviews due within 45 days", projectId: "TRN-2059", ownerId: "P08", dept: "HSEQ", status: "To Do", priority: "Normal", tag: "Safety",
        dueAt: new Date(now + 5 * 86400000).toISOString(), order: 99, description: sig, origin: "user", docIds: [], dependsOn: [], comments: [],
        checklist: unbooked.map((c) => ({ id: newId("CK"), text: "Book " + c.name + " for " + nameOf(db, c.personId), done: false })), startAt: nowIso() });
      actions.push({ label: "Renewal plan task drafted for Niamh Byrne: " + id, kind: "task", refId: id });
    }
  }
  return { headline: due.length + " credential reviews due within 45 days", lines, confidence: "High", limitations: "Due dates are demo assumptions, not compliance advice. Never certifies compliance.",
    sources: due.map((c) => src("credential", c.id, c.id)), actions };
}

function triage(db: DB, now: number): Out {
  const open = db.tickets.filter((t) => isUnresolved(t) && (t.priority === "P1" || t.priority === "P2"));
  const lines: string[] = [];
  open.forEach((t) => {
    const s = sla(t, now);
    const site = db.sites.find((x) => x.id === t.siteId);
    const asset = db.assets.find((a) => a.id === t.assetId);
    lines.push(t.id + " " + t.priority + " " + t.title + " at " + site?.name + ": " + nameOf(db, t.engineerId) + ", " + s.label + (asset?.reading ? ". " + asset.name + " " + asset.reading.value : "") + ".");
  });
  if (!open.length) lines.push("No unresolved P1 or P2 tickets.");
  lines.push("Suggested checklist: acknowledge, confirm redundancy, readings every 15 minutes, client update, handover note.");
  return { headline: open.length ? open.length + " P1/P2 incidents open" : "Queue clear of P1 and P2",
    lines, confidence: "High", limitations: "Demo readings only. Humans acknowledge and resolve.",
    sources: open.map((t) => src("ticket", t.id, t.id)), actions: open.filter((t) => t.taskId).map((t) => ({ label: "Response task " + t.taskId, kind: "task" as const, refId: t.taskId })) };
}

function commercial(db: DB, now: number, d?: DB): Out {
  const pf = portfolio(db, now);
  const lines: string[] = [];
  const actions: AgentRun["actions"] = [];
  for (const p of db.projects.filter((x) => x.model === "Works contract")) {
    const b = burn(p) || 0;
    const gap = Math.round((b - p.progress) * 100);
    lines.push(p.short + ": burn " + pct(b) + " against " + pct(p.progress) + " progress" + (gap > 0 ? " (" + gap + " points ahead of progress)" : "") + ".");
    if (gap >= 10) {
      const sig = "commercial-review-" + p.id;
      const ex = db.tasks.find((t) => t.description === sig && t.status !== "Done");
      if (ex) actions.push({ label: "Review task already open: " + ex.id, kind: "task", refId: ex.id });
      else if (d) {
        const id = newId("T");
        d.tasks.push({ id, title: "Commercial review: " + p.short + " burn " + gap + " points above progress", projectId: p.id, ownerId: "P12", dept: "Commercial", status: "To Do", priority: "High", tag: "Commercial",
          dueAt: new Date(now + 4 * 86400000).toISOString(), order: 99, description: sig, origin: "user", docIds: [], dependsOn: [], comments: [], checklist: [], startAt: nowIso() });
        actions.push({ label: "Review task drafted for Róisín Nolan: " + id, kind: "task", refId: id });
      }
    }
  }
  lines.push("Pending priced changes " + eur(pf.pendingPriced) + ". Approved variations " + eur(pf.approvedVariations) + ".");
  const vals = db.valuations.filter((v) => Date.parse(v.reviewAt) - now < 15 * 86400000);
  lines.push("Valuation drafts in the next 14 days: " + eur(vals.reduce((n, v) => n + v.amount, 0)) + " across " + vals.length + " projects.");
  return { headline: "Commercial control: " + eur(pf.pendingPriced) + " pending decisions", lines, confidence: "High", limitations: "Burn is cost divided by the contract baseline, not margin. No financial approvals.",
    sources: [src("project", "TRN-2052", "Hall 4"), src("project", "TRN-2041", "Rathdrum")], actions };
}

export function clientReport(db: DB, clientId: ID, now: number): { title: string; lines: string[]; sources: AgentRun["sources"] } {
  const c = db.clients.find((x) => x.id === clientId)!;
  const projs = db.projects.filter((p) => p.clientId === clientId);
  const lines: string[] = [];
  const sources: AgentRun["sources"] = [];
  for (const p of projs) {
    sources.push(src("project", p.id, p.short));
    const ms = db.milestones.filter((m) => m.projectId === p.id && !m.completedAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
    if (p.model === "Managed service") {
      const r = ppm(db, AQC_SITES);
      const live = db.tickets.filter((t) => AQC_SITES.includes(t.siteId) && isUnresolved(t));
      lines.push(p.name + ": current PPM cycle " + r.done + " of " + r.total + " jobs (" + pct(r.ratio) + ").");
      lines.push("Managed-service SLA, " + fmtDate(db.sla.from) + " to " + fmtDate(db.sla.to) + ": " + db.sla.met + " of " + db.sla.eligible + " met (" + (db.sla.met / db.sla.eligible * 100).toFixed(1) + "%), mean response " + db.sla.meanResponseMins + " minutes.");
      lines.push("Open incidents: " + (live.map((t) => t.id + " " + t.title + " (" + t.status.toLowerCase() + ")").join("; ") || "none") + ".");
    } else {
      lines.push(p.name + ": " + p.progressLabel + ". Forecast handover " + fmtDate(p.forecastFinish) + (slipDays(p) > 0 ? " (" + slipDays(p) + " days after baseline)" : " (on baseline)") + ".");
      if (ms) lines.push("Next milestone: " + ms.name + ", " + fmtDate(ms.dueAt) + ".");
      if (p.id === "TRN-2048") lines.push("Splice QA: " + (db.tasks.find((t) => t.id === "T-2048-01")?.status === "Done" ? "complete, 96 of 96 records" : "96 records in final QA") + ". Premises passed 1,248 of 1,680.");
      const risks = db.risks.filter((r) => r.projectId === p.id && r.status !== "Closed").sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, 1);
      risks.forEach((r) => lines.push("Main risk: " + r.title + ". Mitigation: " + r.mitigation));
    }
  }
  return { title: "Progress report: " + c.name + " (" + monthTitle(keyOf(now)) + ")", lines, sources };
}

function reporting(db: DB, now: number, d?: DB, clientId = "CL-NBI"): Out {
  const r = clientReport(db, clientId, now);
  const actions: AgentRun["actions"] = [];
  if (d) {
    const id = newId("REP");
    d.reports.unshift({ id, at: nowIso(), clientId, title: r.title, lines: r.lines, sources: r.sources });
    actions.push({ label: "Report draft saved: " + r.title, kind: "report", refId: id });
  }
  return { headline: r.title, lines: r.lines, confidence: "High", limitations: "Local draft only. Nothing is sent to the client.", sources: r.sources, actions };
}

const RUNNERS: Record<string, (db: DB, now: number, d?: DB, arg?: string) => Out> = {
  briefing: (db, now) => briefingLines(db, now),
  watchdog, recovery: (db) => recovery(db), workforce: (db, now, _d, arg) => workforce(db, now, arg), compliance, triage, commercial,
  reporting: (db, now, d, arg) => reporting(db, now, d, arg),
};

/** Run an agent now against the current records. Returns the new run id. */
export function runAgent(agentId: ID, arg?: string, trigger: AgentRun["trigger"] = "Manual"): ID {
  const now = Date.now();
  const id = newId("RUN");
  let headline = "";
  update((d) => {
    const out = RUNNERS[agentId](d, now, d, arg);
    headline = out.headline;
    const signature = agentId + ":" + out.lines.join("|");
    const prev = d.runs.find((r) => r.agentId === agentId);
    const unchanged = prev && prev.signature === signature;
    d.runs.unshift({ id, agentId, at: nowIso(), trigger, signature, ...out, limitations: out.limitations + (unchanged ? " No change since the previous run." : "") });
    if (agentId === "briefing") d.briefings.unshift({ id: newId("BRF"), at: nowIso(), lines: out.lines, sources: out.sources });
    const a = d.agents.find((x) => x.id === agentId)!;
    log(d, { actorType: "agent", actorId: agentId, actor: a.name, text: out.headline, sourceType: "run", sourceId: id, category: "Agents" });
    if (out.actions.some((x) => x.kind === "approval" && x.label.startsWith("Escalation proposed"))) notify(d, a.name + " proposed an escalation for your approval", "warn", "run", id);
  });
  toast(getDB().agents.find((a) => a.id === agentId)?.name + " ran: " + headline);
  return id;
}
export function previewAgent(agentId: ID, arg?: string): Out { return RUNNERS[agentId](getDB(), Date.now(), undefined, arg); }
