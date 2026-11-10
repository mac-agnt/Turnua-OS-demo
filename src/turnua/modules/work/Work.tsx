/* Work: My Work, Team Tasks, Approvals, Workflows. One task model, one editor. */
import { useEffect, useMemo, useState } from "react";
import type { Task, ID } from "../../types";
import { PRIORITIES } from "../../types";
import { useDB, update, newId, nowIso, getDB } from "../../store";
import { navigate, openApproval, openNew, setPrefs, usePrefs, useFilter, useRoute, toast } from "../../ui";
import { toggleDone, updateTask, log } from "../../actions";
import { Avatar, Badge, Btn, Card, Empty, Icon, Page, PersonLink, Ref, Search, Select, Stat, openRef } from "../../kit";
import { TaskLine } from "../../drawers/TaskDrawer";
import { ago, addDays, endOfDay, eur, fmtDate, keyOf, todayKey, weekdayOf } from "../../time";
import { isDue48, isOpen, isOverdue, nameOf, project, workGroups, utilisation, utilTone, credsDue, isUnresolved, team as teamOf } from "../../selectors";

export default function WorkModule({ tab }: { tab: string }) {
  if (tab === "team") return <TeamTasks />;
  if (tab === "approvals") return <Approvals />;
  if (tab === "workflows") return <Workflows />;
  return <MyWork />;
}

/* ── My Work ─────────────────────────────────────────────────────── */
function MyWork() {
  const db = useDB();
  const now = Date.now();
  const prefs = usePrefs();
  const who = prefs.myWorkPerson;
  const [showDone, setShowDone] = useState(false);
  const mine = db.tasks.filter((t) => t.ownerId === who);
  const g = workGroups(mine, now);
  const person = db.people.find((p) => p.id === who);
  const groups: [string, Task[], string][] = [["Overdue", g.overdue, "Past their due time"], ["Today", g.today, "Due before midnight"], ["This week", g.week, "Due by Sunday"], ["Later", g.later, "Due after this week"]];
  return (
    <Page title="My Work" sub={(who === "P01" ? "Your" : (person?.first || "") + "’s") + " open tasks across every project, grouped by when they are due."}
      actions={<><Select label="Person" hideLabel={false} value={who} onChange={(v) => setPrefs({ myWorkPerson: v })} options={db.people.map((p) => [p.id, p.id === "P01" ? p.name + " (me)" : p.name] as [string, string])} /><Btn icon="plus" kind="primary" onClick={() => openNew("task", { ownerId: who })}>New task</Btn></>}>
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Open" value={mine.filter(isOpen).length} sub={"assigned to " + (person?.first || "")} />
        <Stat label="Overdue" value={g.overdue.length} tone={g.overdue.length ? "bad" : undefined} sub="past due" />
        <Stat label="Due today" value={g.today.length} tone={g.today.length ? "warn" : undefined} sub="before 23:59" />
        <Stat label="Approvals waiting" value={db.approvals.filter((a) => a.approverId === who && a.status === "Pending").length} sub="decisions" onClick={() => navigate("/work/approvals")} />
      </div>
      <div className="tu-stack">
        {groups.map(([label, list, hint]) => (
          <Card key={label} title={<div className="tu-row"><h2>{label}</h2><Badge tone={label === "Overdue" && list.length ? "bad" : label === "Today" && list.length ? "warn" : ""}>{list.length}</Badge><span className="tu-small tu-muted">{hint}</span></div>} pad={false}>
            {list.length ? <div className="tu-list">{list.map((t) => <TaskLine key={t.id} t={t} onToggle={() => toggleDone(t.id)} />)}</div>
              : <div className="tu-small tu-muted" style={{ padding: "12px 18px" }}>Nothing {label === "Overdue" ? "overdue" : "due " + label.toLowerCase()}.</div>}
          </Card>
        ))}
        <Card pad={false} title={<button className="tu-link tu-row" style={{ color: "var(--ink)" }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><Icon name={showDone ? "chevD" : "chevR"} size={14} /><h2>Completed</h2><Badge>{g.done.length}</Badge></button>}>
          {showDone && (g.done.length ? <div className="tu-list">{g.done.map((t) => <TaskLine key={t.id} t={t} onToggle={() => toggleDone(t.id)} />)}</div> : <div className="tu-small tu-muted" style={{ padding: "12px 18px" }}>Nothing completed yet.</div>)}
        </Card>
      </div>
    </Page>
  );
}

/* ── Team Tasks ──────────────────────────────────────────────────── */
function TeamTasks() {
  const db = useDB();
  const now = Date.now();
  const r = useRoute();
  const [f, setF, clear] = useFilter("team");
  useEffect(() => { if (r.query.due && f.due !== r.query.due) setF("due", r.query.due); }, [r.query.due]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekEnd = endOfDay(addDays(todayKey(), 6 - weekdayOf(todayKey())));
  const list = useMemo(() => db.tasks.filter((t) => {
    if (!f.showDone && !isOpen(t)) return false;
    if (f.person && (f.person === "none" ? t.ownerId : t.ownerId !== f.person)) return false;
    if (f.team && db.people.find((p) => p.id === t.ownerId)?.teamId !== f.team) return false;
    if (f.project && t.projectId !== f.project) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.due === "overdue" && !isOverdue(t, now)) return false;
    if (f.due === "48h" && !isDue48(t, now)) return false;
    if (f.due === "week" && !(isOpen(t) && Date.parse(t.dueAt) <= Date.parse(weekEnd))) return false;
    if (f.q && !(t.title + " " + (project(db, t.projectId)?.short || "")).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)), [db, f, now, weekEnd]);
  const load = db.people.map((p) => {
    const open = db.tasks.filter((t) => t.ownerId === p.id && isOpen(t));
    return { p, open: open.length, hours: open.reduce((n, t) => n + (t.estimate || 0), 0), overdue: open.filter((t) => isOverdue(t, now)).length, util: utilisation(db, p) };
  });
  const unassigned = db.tasks.filter((t) => isOpen(t) && !t.ownerId);
  return (
    <Page title="Team Tasks" sub="Every task across the portfolio. Filters stay set when you open a task and come back."
      actions={<Btn icon="plus" kind="primary" onClick={() => openNew("task")}>New task</Btn>}>
      <div className="tu-split">
        <div className="tu-stack">
          <div className="tu-toolbar" style={{ marginBottom: 0 }}>
            <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search tasks" width={220} />
            <Select label="Person" value={f.person || ""} onChange={(v) => setF("person", v)} options={[["", "Everyone"], ...db.people.map((p) => [p.id, p.name] as [string, string]), ["none", "Unassigned"]]} />
            <Select label="Team" value={f.team || ""} onChange={(v) => setF("team", v)} options={[["", "All teams"], ...db.teams.map((t) => [t.id, t.name] as [string, string])]} />
            <Select label="Project" value={f.project || ""} onChange={(v) => setF("project", v)} options={[["", "All projects"], ...db.projects.map((p) => [p.id, p.id + " " + p.short] as [string, string])]} />
            <Select label="Priority" value={f.priority || ""} onChange={(v) => setF("priority", v)} options={[["", "Any priority"], ...PRIORITIES]} />
            <Select label="Due" value={f.due || ""} onChange={(v) => { setF("due", v); if (r.query.due) navigate("/work/team", { replace: true }); }} options={[["", "Any due date"], ["overdue", "Overdue"], ["48h", "Due within 48 hours"], ["week", "Due this week"]]} />
            <label className="tu-check"><input type="checkbox" checked={!!f.showDone} onChange={(e) => setF("showDone", e.target.checked ? "1" : "")} /> Show done</label>
            {Object.values(f).some(Boolean) && <Btn kind="ghost" size="sm" onClick={() => { clear(); if (r.query.due) navigate("/work/team", { replace: true }); }}>Clear</Btn>}
          </div>
          <Card pad={false} title={<div className="tu-row"><h2>{f.due === "overdue" ? "Overdue tasks" : f.due === "48h" ? "Due within 48 hours" : "Tasks"}</h2><Badge>{list.length}</Badge></div>}>
            {list.length ? <div className="tu-list">{list.map((t) => <TaskLine key={t.id} t={t} onToggle={() => toggleDone(t.id)} />)}</div>
              : <Empty title="No tasks match these filters" action={<Btn onClick={clear}>Clear filters</Btn>} />}
          </Card>
        </div>
        <div className="tu-stack">
          <Card title="Workload" sub="Open tasks and estimated hours by owner; planned utilisation from allocations" pad={false}>
            <div className="tu-list">
              {load.sort((a, b) => b.open - a.open).map((x) => (
                <button key={x.p.id} className="tu-rowbtn" onClick={() => setF("person", x.p.id)} aria-pressed={f.person === x.p.id}>
                  <Avatar person={x.p} size={26} />
                  <span className="tu-grow"><span style={{ display: "block", fontWeight: 500 }}>{x.p.name}</span><span className="tu-small tu-muted">{x.open} open · ~{x.hours}h est.{x.overdue ? " · " : ""}{x.overdue ? <span style={{ color: "var(--bad)" }}>{x.overdue} overdue</span> : null}</span></span>
                  <Badge tone={utilTone(x.util) as "ok" | "warn" | "bad"}>{Math.round(x.util * 100)}%</Badge>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Unassigned" pad={false}>
            {unassigned.length ? <div className="tu-list">{unassigned.map((t) => (
              <div key={t.id} className="tu-li" style={{ alignItems: "center" }}>
                <button className="tu-link tu-grow tu-ellipsis" style={{ color: "var(--ink)" }} onClick={() => openRef("task", t.id)}>{t.title}</button>
                <select className="tu-select" style={{ width: 150, height: 28 }} aria-label={"Assign " + t.title} value="" onChange={(e) => e.target.value && updateTask(t.id, { ownerId: e.target.value })}>
                  <option value="">Assign to…</option>{db.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>))}</div> : <div className="tu-small tu-muted" style={{ padding: "12px 18px" }}>Every open task has an owner. New tasks created without one appear here.</div>}
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── Approvals ───────────────────────────────────────────────────── */
function Approvals() {
  const db = useDB();
  const [f, setF] = useFilter("approvals");
  const view = f.view || "mine";
  const list = db.approvals.filter((a) => (view === "mine" ? a.approverId === "P01" && a.status === "Pending" : view === "decided" ? a.status !== "Pending" : true) && (!f.kind || a.kind === f.kind))
    .sort((a, b) => (a.status === "Pending" ? 0 : 1) - (b.status === "Pending" ? 0 : 1) || Date.parse(a.dueAt || a.requestedAt) - Date.parse(b.dueAt || b.requestedAt));
  const pending = db.approvals.filter((a) => a.status === "Pending");
  return (
    <Page title="Approvals" sub="Decisions that change records: commercial changes, recovery plans, gates, training and escalations. Each opens with its evidence and downstream effect.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Waiting for David" value={pending.filter((a) => a.approverId === "P01").length} onClick={() => setF("view", "mine")} />
        <Stat label="Money awaiting decision" value={eur(pending.reduce((n, a) => n + (a.amount && a.amount > 1000 ? a.amount : 0), 0))} sub="priced changes" />
        <Stat label="Raised by agents" value={pending.filter((a) => a.agentId).length} sub="proposals, human decides" onClick={() => navigate("/agents/approvals")} />
        <Stat label="Decided" value={db.approvals.filter((a) => a.status !== "Pending").length} onClick={() => setF("view", "decided")} />
      </div>
      <div className="tu-toolbar">
        <div className="tu-seg" role="tablist" aria-label="Approval view">
          {[["mine", "Awaiting me"], ["all", "All"], ["decided", "Decided"]].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setF("view", id)}>{label}</button>)}
        </div>
        <Select label="Kind" value={f.kind || ""} onChange={(v) => setF("kind", v)} options={[["", "All kinds"], ...Array.from(new Set(db.approvals.map((a) => a.kind))).map((k) => [k, k] as [string, string])]} />
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Approval</th><th>Kind</th><th>Requested by</th><th className="num">Amount</th><th>Due</th><th>Downstream effect</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="click" onClick={() => openApproval(a.id)}>
                  <td><div style={{ fontWeight: 600 }}>{a.title}</div><div className="tu-small tu-muted">{a.id}{a.projectId ? " · " + (project(db, a.projectId)?.short || "") : ""}{a.agentId ? " · via " + (db.agents.find((x) => x.id === a.agentId)?.name || "") + " agent" : ""}</div></td>
                  <td className="tu-small">{a.kind}</td>
                  <td><PersonLink id={a.requestedById} /></td>
                  <td className="num">{a.amount ? eur(a.amount) : <span className="tu-muted">None</span>}</td>
                  <td className="tu-small">{fmtDate(a.dueAt)}</td>
                  <td className="tu-small" style={{ maxWidth: 340 }}>{a.effect}</td>
                  <td><Badge tone={a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "warn"}>{a.status}</Badge>{a.decidedAt && <div className="tu-small tu-faint">{ago(a.decidedAt)}</div>}</td>
                  <td>{a.status === "Pending" && <Btn size="xs" kind="navy" onClick={(e) => { e.stopPropagation(); openApproval(a.id); }}>Review</Btn>}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8}><Empty title={view === "mine" ? "Nothing is waiting for you" : "No approvals here"}>Decided items move to the Decided view with their audit history.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="tu-small tu-faint" style={{ marginTop: 10 }}>A licence such as PER-DLR-017 is decided by the council, not here. You can approve an escalation, then record the council’s decision on the permit with its reference.</p>
    </Page>
  );
}

/* ── Workflows ───────────────────────────────────────────────────── */
type Starter = { label: string; plan: () => { create: { title: string; projectId: ID; ownerId: ID; tag: Task["tag"]; priority: Task["priority"]; days: number; desc: string }[]; context: string } };
function starters(): Record<string, Starter> {
  const db = getDB();
  const latestUser = db.projects.filter((p) => p.origin === "user").slice(-1)[0];
  const mobProject = latestUser || db.projects.find((p) => p.id === "TRN-2059")!;
  const p1 = db.tickets.find((t) => isUnresolved(t) && t.priority === "P1") || db.tickets.find((t) => t.priority === "P1")!;
  const due = credsDue(db, Date.now(), 45).filter((c) => !c.bookingId);
  return {
    "WF-MOB": { label: "for " + mobProject.id + " " + mobProject.short, plan: () => ({ context: mobProject.id, create: [
      ["Kick-off meeting and team confirmation", 2, "Client"], ["RAMS and permit applications", 5, "Safety"], ["Procure long-lead items", 7, "Procurement"], ["Site set-up and welfare", 9, "Civils"], ["Set first valuation date", 10, "Commercial"],
    ].map(([title, days, tag]) => ({ title: "Mobilisation: " + title, projectId: mobProject.id, ownerId: mobProject.pmId, tag: tag as Task["tag"], priority: "Normal" as const, days: days as number, desc: "WF-MOB:" + mobProject.id })) }) },
    "WF-CHG": { label: "for CR-2063-01 (draft, being priced)", plan: () => ({ context: "CR-2063-01", create: [
      { title: "Price CR-2063-01 night-works traffic management uplift", projectId: "TRN-2063", ownerId: "P12", tag: "Commercial", priority: "High", days: 3, desc: "WF-CHG:CR-2063-01" },
      { title: "Attach evidence to CR-2063-01 (council off-peak requirement)", projectId: "TRN-2063", ownerId: "P09", tag: "Commercial", priority: "Normal", days: 3, desc: "WF-CHG:CR-2063-01" },
    ] }) },
    "WF-P1": { label: "for " + p1.id + " " + p1.title, plan: () => ({ context: p1.id, create: [
      { title: p1.id + ": client update and next update time", projectId: db.sites.find((s) => s.id === p1.siteId)?.projectId || "TRN-2035", ownerId: p1.engineerId || "P05", tag: "Client", priority: "Urgent", days: 0, desc: "WF-P1:" + p1.id },
      { title: p1.id + ": evidence and SLA review", projectId: db.sites.find((s) => s.id === p1.siteId)?.projectId || "TRN-2035", ownerId: "P05", tag: "QA", priority: "Normal", days: 2, desc: "WF-P1:" + p1.id },
    ] }) },
    "WF-CRED": { label: due.length ? "for " + due.length + " credentials due within 45 days without a booking" : "(no unbooked credentials due)", plan: () => ({ context: due.map((c) => c.id).join(","), create: due.map((c) => (
      { title: "Book " + c.name + " for " + nameOf(db, c.personId), projectId: "TRN-2059", ownerId: "P08", tag: "Safety" as const, priority: "Normal" as const, days: 3, desc: "WF-CRED:" + c.id }
    )) }) },
    "WF-HND": { label: "for TRN-2048 Kildare FTTH", plan: () => ({ context: "TRN-2048", create: [
      { title: "Book NBI handover meeting", projectId: "TRN-2048", ownerId: "P04", tag: "Client", priority: "Normal", days: 14, desc: "WF-HND:TRN-2048" },
      { title: "Prepare final valuation evidence, Phase 3", projectId: "TRN-2048", ownerId: "P12", tag: "Commercial", priority: "Normal", days: 20, desc: "WF-HND:TRN-2048" },
    ] }) },
  };
}
function startWorkflow(id: ID) {
  const s = starters()[id];
  if (!s) return;
  const plan = s.plan();
  const db = getDB();
  const fresh = plan.create.filter((c) => !db.tasks.some((t) => t.description === c.desc && t.title === c.title));
  if (!fresh.length) { toast("Already started: these tasks exist for " + plan.context, "plain"); return; }
  update((d) => {
    const ids: string[] = [];
    fresh.forEach((c) => {
      const tid = newId("T");
      ids.push(tid);
      d.tasks.push({ id: tid, title: c.title, projectId: c.projectId, ownerId: c.ownerId, dept: teamOf(d, d.people.find((p) => p.id === c.ownerId)?.teamId)?.name || "", status: "To Do", priority: c.priority, tag: c.tag,
        dueAt: c.days === 0 ? new Date(Date.now() + 2 * 3600000).toISOString() : endOfDay(addDays(todayKey(), c.days)), order: 99, checklist: [], comments: [], docIds: [], dependsOn: [], origin: "user", description: c.desc, startAt: nowIso(), estimate: 4 });
    });
    const wf = d.workflows.find((w) => w.id === id)!;
    wf.runs.unshift({ at: nowIso(), by: "David Cox", result: fresh.length + " tasks created " + s.label });
    log(d, { actorType: "workflow", actorId: id, actor: wf.name + " workflow", text: "Started " + wf.name + " " + s.label + ": " + fresh.length + " tasks created", sourceType: "task", sourceId: ids[0], category: "Workflows" });
  });
  toast(fresh.length + " tasks created by the " + db.workflows.find((w) => w.id === id)?.name + " workflow");
}
function Workflows() {
  const db = useDB();
  const st = starters();
  return (
    <Page title="Workflows" sub="Repeatable sequences with an accountable owner. Starting one creates local tasks from existing records; starting it again does not create duplicates.">
      <div className="tu-grid tu-g2">
        {db.workflows.map((w) => {
          const made = db.tasks.filter((t) => (t.description || "").startsWith(w.id + ":"));
          return (
            <Card key={w.id} title={w.name} sub={"Trigger: " + w.trigger} right={<Btn kind="primary" size="sm" icon="play" onClick={() => startWorkflow(w.id)}>Start demo workflow</Btn>}>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {w.stages.map((s, i) => <li key={i} className="tu-badge outline" style={{ height: 26 }}><b style={{ color: "var(--accent)" }}>{i + 1}</b> {s}</li>)}
              </ol>
              <div className="tu-grid tu-g2" style={{ gap: 10, marginTop: 14 }}>
                <div><div className="tu-small tu-muted">Accountable owner</div><PersonLink id={w.ownerId} /></div>
                <div><div className="tu-small tu-muted">Current example</div><Ref type={w.example.type} id={w.example.id}>{w.example.label}</Ref></div>
              </div>
              <div className="tu-small tu-muted" style={{ marginTop: 12 }}>Next start: {st[w.id]?.label}</div>
              {made.length > 0 && <div style={{ marginTop: 10 }}><div className="tu-small tu-muted" style={{ marginBottom: 4 }}>Tasks from this workflow</div>{made.map((t) => <div key={t.id} className="tu-row tu-small" style={{ padding: "3px 0" }}><Icon name="check" size={12} /><Ref type="task" id={t.id} /><Badge>{t.status}</Badge></div>)}</div>}
              <div style={{ marginTop: 12 }}>
                <div className="tu-small tu-muted" style={{ marginBottom: 4 }}>Run history</div>
                {w.runs.map((r, i) => <div key={i} className="tu-small" style={{ padding: "3px 0" }}><span className="tu-faint">{ago(r.at)}</span> · {r.by}: {r.result}</div>)}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="tu-small tu-faint" style={{ marginTop: 10 }}>Workflows run inside this demo workspace only. They never send email or contact a client.</p>
    </Page>
  );
}
export { keyOf };
