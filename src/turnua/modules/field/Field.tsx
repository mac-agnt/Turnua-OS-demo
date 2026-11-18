/* Field App: the crew's phone view (clock in and out, today's jobs, report an
   issue) and the office side (issue log, assigning work, clock records). */
import { useState } from "react";
import type { FieldIssue, ID, IssueCategory, IssueSeverity, Task } from "../../types";
import { ISSUE_CATEGORIES } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate, openTask, openTicket, useFilter, usePrefs, setPrefs } from "../../ui";
import { updateTask } from "../../actions";
import { assignIssue, clockIn, clockOut, reportIssue, setIssueStatus, type RaiseAs } from "../../growthActions";
import { Avatar, Badge, Btn, Card, Empty, Field, Icon, Modal, Page, PersonLink, PriorityBadge, Search, Select, Stat } from "../../kit";
import { CREW, isOpen, isOverdue, nameOf } from "../../selectors";
import { ago, dueLabel, fmtClock, fmtDate, fmtDuration, hhmm, keyOf, todayKey, addDays, relDay } from "../../time";
import "../growth.css";

const SEV_TONE: Record<IssueSeverity, "bad" | "warn" | "" | "outline"> = { Critical: "bad", High: "warn", Medium: "", Low: "outline" };
const ST_TONE: Record<FieldIssue["status"], "warn" | "" | "accent" | "ok"> = { Reported: "warn", Assigned: "", "In progress": "accent", Closed: "ok" };
export const SevBadge = ({ s }: { s: IssueSeverity }) => <Badge tone={SEV_TONE[s]} icon={s === "Critical" ? "alert" : undefined}>{s}</Badge>;
const StBadge = ({ s }: { s: FieldIssue["status"] }) => <Badge tone={ST_TONE[s]}>{s}</Badge>;
const FIELD_CREW = [...CREW, "P10"];

export default function FieldModule({ tab }: { tab: string }) {
  if (tab === "report") return <ReportTab />;
  if (tab === "dispatch") return <DispatchTab />;
  if (tab === "clock") return <ClockTab />;
  return <TodayTab />;
}

/* ── Today: the phone view beside the live office picture ────────── */
function TodayTab() {
  const db = useDB();
  const now = useClock();
  const prefs = usePrefs();
  const who = (prefs.filters["field.as"] || {}).p || "P09";
  const setWho = (p: string) => setPrefs((x) => ({ filters: { ...x.filters, "field.as": { p } } }));
  const onSite = db.clockings.filter((c) => !c.outAt);
  const openIssues = db.fieldIssues.filter((i) => i.status !== "Closed");
  const unowned = openIssues.filter((i) => !i.assigneeId);
  const today = todayKey();
  const hoursToday = db.clockings.filter((c) => keyOf(Date.parse(c.inAt)) === today).reduce((n, c) => n + ((c.outAt ? Date.parse(c.outAt) : now) - Date.parse(c.inAt)) / 3600000, 0);
  return (
    <Page title="Field App" sub="What the crew sees on their phone, next to what the office sees. Pick a crew member to view the app as them.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="On site now" value={onSite.length} sub={"across " + new Set(onSite.map((c) => c.siteId)).size + " sites"} onClick={() => navigate("/field/clock")} />
        <Stat label="Crew hours today" value={hoursToday.toFixed(1) + "h"} sub="from clock records" onClick={() => navigate("/field/clock")} />
        <Stat label="Open field issues" value={openIssues.length} sub={openIssues.filter((i) => i.severity === "Critical").length + " critical"} tone={openIssues.some((i) => i.severity === "Critical") ? "bad" : undefined} onClick={() => navigate("/field/report")} />
        <Stat label="Need an owner" value={unowned.length} tone={unowned.length ? "warn" : "ok"} sub="assign from the office" onClick={() => navigate("/field/dispatch")} />
      </div>
      <div className="tu-split-r">
        <div className="tu-stack">
          <div className="tu-row" style={{ justifyContent: "center", gap: 8 }}>
            <Select label="View the app as" hideLabel={false} value={who} onChange={setWho} options={FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])} />
          </div>
          <Phone personId={who} />
        </div>
        <div className="tu-stack">
          <Card title="Crew on site now" sub="Live from Field App clock ins and site geofences" right={<span className="fa-live">LIVE</span>} pad={false}>
            <div className="tu-list">
              {onSite.length === 0 && <div className="tu-li tu-muted">Nobody is clocked in.</div>}
              {onSite.map((c) => (
                <div key={c.id} className="tu-li">
                  <Avatar person={db.people.find((p) => p.id === c.personId)} />
                  <div className="tu-grow"><div style={{ fontWeight: 550, color: "var(--ink)" }}>{nameOf(db, c.personId)}</div><div className="tu-small tu-muted">{db.sites.find((s) => s.id === c.siteId)?.name} · in at {hhmm(c.inAt)} · {c.method}</div></div>
                  <span className="tu-mono" style={{ fontSize: 12.5 }}>{fmtClock(now - Date.parse(c.inAt))}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Issues from site" sub="Newest first. Assigning creates a task on the person's Field App list." pad={false} right={<Btn size="sm" onClick={() => navigate("/field/report")}>Issue log</Btn>}>
            <div className="tu-list">
              {openIssues.slice(0, 6).map((i) => <IssueRow key={i.id} i={i} />)}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function IssueRow({ i }: { i: FieldIssue }) {
  const db = useDB();
  const now = useClock();
  return (
    <div className="tu-li">
      <Icon name={i.category === "Safety" ? "alert" : i.category === "Access" ? "shield" : "flag"} size={16} style={{ marginTop: 2, color: i.severity === "Critical" ? "var(--bad)" : "var(--dim)" }} />
      <div className="tu-grow" style={{ minWidth: 0 }}>
        <div className="tu-row tu-wrap" style={{ gap: 6 }}><span style={{ fontWeight: 550, color: "var(--ink)" }}>{i.title}</span></div>
        <div className="tu-small tu-muted">{i.id} · {db.sites.find((s) => s.id === i.siteId)?.name} · {i.category} · by {nameOf(db, i.reportedById).split(" ")[0]} {ago(i.reportedAt, now).toLowerCase()}{i.photos ? " · " + i.photos + " photo" + (i.photos > 1 ? "s" : "") : ""}</div>
        <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 6 }}>
          <SevBadge s={i.severity} /><StBadge s={i.status} />
          {i.taskId && <button className="tu-link tu-small" onClick={() => openTask(i.taskId!)}>Task</button>}
          {i.ticketId && <button className="tu-link tu-small" onClick={() => openTicket(i.ticketId!)}>{i.ticketId}</button>}
        </div>
      </div>
      <Select label={"Assign " + i.id} value={i.assigneeId || ""} onChange={(v) => v && assignIssue(i.id, v)}
        options={[["", "Assign to…"], ...FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])]} />
    </div>
  );
}

/* ── the phone ────────────────────────────────────────────────────── */
function Phone({ personId }: { personId: ID }) {
  const db = useDB();
  const now = useClock();
  const me = db.people.find((p) => p.id === personId)!;
  const open = db.clockings.find((c) => c.personId === personId && !c.outAt);
  const lastSite = db.clockings.find((c) => c.personId === personId)?.siteId || db.sites[0].id;
  const [site, setSite] = useState<string>(lastSite);
  const [screen, setScreen] = useState<"home" | "jobs" | "report">("home");
  const [reporting, setReporting] = useState(false);
  const jobs = db.tasks.filter((t) => t.ownerId === personId && isOpen(t)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const mine = db.fieldIssues.filter((i) => i.reportedById === personId).slice(0, 3);
  const weekHours = db.clockings.filter((c) => c.personId === personId && Date.parse(c.inAt) > now - 7 * 86400000)
    .reduce((n, c) => n + ((c.outAt ? Date.parse(c.outAt) : now) - Date.parse(c.inAt)) / 3600000, 0);
  return (
    <div className="fa-phone" aria-label={"Field App as " + me.name}>
      <div className="fa-screen tu">
        <div className="fa-notch"><span>{hhmm(new Date(now).toISOString())}</span><i /><span>5G</span></div>
        <div className="fa-body">
          <div className="fa-hello">
            <Avatar person={me} size={36} />
            <div className="tu-grow"><div className="tu-small tu-muted">{me.role}</div><h3>Hi {me.first}</h3></div>
            <img src="/turnua-mark.svg" alt="" width={14} height={17} />
          </div>
          {screen === "home" && (
            <>
              <div className={"fa-clock" + (open ? " on" : "")}>
                {open ? (
                  <>
                    <div className="tu-row" style={{ justifyContent: "space-between" }}><span className="fa-live">ON SITE</span><span className="tu-small tu-muted">since {hhmm(open.inAt)}</span></div>
                    <div className="fa-timer">{fmtClock(now - Date.parse(open.inAt))}</div>
                    <div className="tu-small" style={{ color: "var(--body)" }}>{db.sites.find((s) => s.id === open.siteId)?.name}</div>
                    <button className="fa-big out" onClick={() => clockOut(open.id)}><Icon name="clock" size={17} />Clock out</button>
                  </>
                ) : (
                  <>
                    <div className="tu-small tu-muted">Not clocked in · {weekHours.toFixed(1)}h this week</div>
                    <select className="tu-select" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
                      {db.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="fa-big in" onClick={() => clockIn(personId, site)}><Icon name="clock" size={17} />Clock in</button>
                  </>
                )}
              </div>
              <button className="fa-big ghost" onClick={() => setReporting(true)}><Icon name="alert" size={17} />Report an issue</button>
              <div className="fa-h">Today's jobs · {jobs.length}</div>
              {jobs.slice(0, 3).map((t) => <PhoneJob key={t.id} t={t} />)}
              {jobs.length > 3 && <button className="tu-link tu-small" onClick={() => setScreen("jobs")}>See all {jobs.length} jobs</button>}
              {!jobs.length && <div className="tu-small tu-muted">No open jobs. The office can assign work from Assign Tasks.</div>}
            </>
          )}
          {screen === "jobs" && (
            <>
              <div className="fa-h">My jobs · {jobs.length}</div>
              {jobs.map((t) => <PhoneJob key={t.id} t={t} />)}
              {!jobs.length && <div className="tu-small tu-muted">Nothing assigned.</div>}
            </>
          )}
          {screen === "report" && (
            <>
              <div className="fa-h">Issues I reported</div>
              {mine.map((i) => (
                <div key={i.id} className="fa-job"><div className="t">{i.title}</div><div className="m">{i.id} · {relDay(i.reportedAt, now)} · {nameOf(db, i.assigneeId)}</div><div className="fa-actions"><SevBadge s={i.severity} /><StBadge s={i.status} /></div></div>
              ))}
              {!mine.length && <div className="tu-small tu-muted">Nothing reported yet.</div>}
              <button className="fa-big in" onClick={() => setReporting(true)}><Icon name="plus" size={17} />New issue</button>
            </>
          )}
        </div>
        <nav className="fa-tabbar" aria-label="Field App">
          {([["home", "Home", "clock"], ["jobs", "Jobs", "list"], ["report", "Issues", "alert"]] as const).map(([k, l, ic]) => (
            <button key={k} className={screen === k ? "on" : ""} onClick={() => setScreen(k)}><Icon name={ic} size={18} />{l}</button>
          ))}
          <button onClick={() => navigate("/people/timesheets")}><Icon name="cal" size={18} />Hours</button>
        </nav>
      </div>
      {reporting && <ReportModal reporterId={personId} siteId={open?.siteId || site} onClose={() => setReporting(false)} />}
    </div>
  );
}
function PhoneJob({ t }: { t: Task }) {
  const db = useDB();
  const now = useClock();
  const dl = dueLabel(t.dueAt, false, now);
  return (
    <div className="fa-job">
      <div className="tu-row" style={{ gap: 6 }}><PriorityBadge p={t.priority} /><span className="m">{db.projects.find((p) => p.id === t.projectId)?.short}</span></div>
      <div className="t">{t.title}</div>
      <div className="m" style={{ color: dl.tone === "bad" ? "var(--bad)" : undefined }}>{dl.text}</div>
      <div className="fa-actions">
        {t.status !== "In Progress" && <Btn size="xs" onClick={() => updateTask(t.id, { status: "In Progress" })}>Start</Btn>}
        <Btn size="xs" kind="primary" icon="check" onClick={() => updateTask(t.id, { status: "Done" })}>Done</Btn>
        <Btn size="xs" kind="ghost" onClick={() => openTask(t.id)}>Details</Btn>
      </div>
    </div>
  );
}

/* ── report form (phone and office) ──────────────────────────────── */
function ReportForm({ reporterId, siteId, onDone, compact }: { reporterId: ID; siteId: ID; onDone?: () => void; compact?: boolean }) {
  const db = useDB();
  const [f, setF] = useState({ title: "", description: "", siteId, category: "Safety" as IssueCategory, severity: "High" as IssueSeverity, location: "", photos: 0, raiseAs: "task" as RaiseAs, assigneeId: "", reporterId });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (f.title.trim().length < 4) { setErr("Say what the issue is in a few words"); return; }
    reportIssue({ title: f.title.trim(), description: f.description.trim() || f.title.trim(), siteId: f.siteId, category: f.category, severity: f.severity, reportedById: f.reporterId,
      photos: f.photos, location: f.location || undefined, raiseAs: f.raiseAs, assigneeId: f.assigneeId || null });
    setF((p) => ({ ...p, title: "", description: "", location: "", photos: 0 }));
    setErr("");
    onDone?.();
  };
  const monitored = ["S-LS1", "S-LS2", "S-H4", "S-KLD"].includes(f.siteId);
  return (
    <div className="tu-stack" style={{ gap: 10 }}>
      {!compact && <Field label="Reported by"><select className="tu-select" value={f.reporterId} onChange={(e) => set("reporterId", e.target.value)}>{FIELD_CREW.map((p) => <option key={p} value={p}>{nameOf(db, p)}</option>)}</select></Field>}
      <Field label="What's the issue?" error={err}><input className="tu-input" autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Edge protection missing at the trench" /></Field>
      <div className="tu-grid tu-g2">
        <Field label="Site"><select className="tu-select" value={f.siteId} onChange={(e) => set("siteId", e.target.value)}>{db.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Where on site"><input className="tu-input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Zone, chainage, rack" /></Field>
      </div>
      <div className="tu-grid tu-g2">
        <Field label="Category"><select className="tu-select" value={f.category} onChange={(e) => set("category", e.target.value)}>{ISSUE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Severity"><select className="tu-select" value={f.severity} onChange={(e) => set("severity", e.target.value)}>{["Critical", "High", "Medium", "Low"].map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Details"><textarea className="tu-textarea" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What you saw, what you did to make it safe" /></Field>
      <div className="tu-row" style={{ gap: 10, alignItems: "center" }}>
        <div className="fa-photo">{Array.from({ length: f.photos }).map((_, i) => <span key={i} />)}</div>
        <Btn size="sm" icon="plus" onClick={() => set("photos", Math.min(4, f.photos + 1))}>Photo</Btn>
        <span className="tu-small tu-muted">Demo: adds a photo placeholder</span>
      </div>
      <div className="tu-grid tu-g2">
        <Field label="Raise as" help={f.raiseAs === "ticket" ? "Opens a " + ({ Critical: "P1", High: "P2", Medium: "P3", Low: "P4" })[f.severity] + " helpdesk ticket with a response timer" : f.raiseAs === "task" ? "Creates a task on the project board" : "Logged for the office to triage"}>
          <select className="tu-select" value={f.raiseAs} onChange={(e) => set("raiseAs", e.target.value)}>
            <option value="issue">Issue only</option><option value="task">Issue and task</option>{monitored && <option value="ticket">Issue and helpdesk ticket</option>}
          </select>
        </Field>
        <Field label="Assign to"><select className="tu-select" value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}><option value="">Office to assign</option>{FIELD_CREW.map((p) => <option key={p} value={p}>{nameOf(db, p)}</option>)}</select></Field>
      </div>
      <Btn kind="primary" icon="check" onClick={submit}>Submit issue</Btn>
    </div>
  );
}
function ReportModal({ reporterId, siteId, onClose }: { reporterId: ID; siteId: ID; onClose: () => void }) {
  return <Modal ok="fa-report" title="Report an issue" sub="Goes straight to the office and, if you choose, the project board or helpdesk." onClose={onClose}><ReportForm reporterId={reporterId} siteId={siteId} compact onDone={onClose} /></Modal>;
}

/* ── Report Issue: form and log ──────────────────────────────────── */
function ReportTab() {
  const db = useDB();
  const [f, setF, reset] = useFilter("field.issues");
  const q = (f.q || "").toLowerCase();
  const rows = db.fieldIssues.filter((i) => (f.status ? i.status === f.status : i.status !== "Closed" || f.closed === "1")
    && (!f.site || i.siteId === f.site) && (!f.sev || i.severity === f.sev)
    && (!q || (i.id + " " + i.title + " " + i.description + " " + nameOf(db, i.reportedById)).toLowerCase().includes(q)));
  return (
    <Page title="Report Issue" sub="Safety, defects, access, materials and plant issues raised from site. Every issue can become a task or a helpdesk ticket.">
      <div className="tu-split-r">
        <Card title="New issue" sub="Same form the crew use on the phone"><ReportForm reporterId="P09" siteId="S-RTH" /></Card>
        <div className="tu-stack">
          <div className="tu-toolbar">
            <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search issues" width={220} />
            <Select label="Status" value={f.status || ""} onChange={(v) => setF("status", v)} options={[["", "Open issues"], "Reported", "Assigned", "In progress", "Closed"]} />
            <Select label="Site" value={f.site || ""} onChange={(v) => setF("site", v)} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />
            <Select label="Severity" value={f.sev || ""} onChange={(v) => setF("sev", v)} options={[["", "Any severity"], "Critical", "High", "Medium", "Low"]} />
            {(f.q || f.status || f.site || f.sev) && <Btn kind="ghost" size="sm" onClick={reset}>Clear</Btn>}
          </div>
          <Card pad={false}>
            <div className="tu-tablewrap">
              <table className="tu-table">
                <thead><tr><th>Issue</th><th>Site</th><th>Severity</th><th>Owner</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td><div style={{ fontWeight: 550, color: "var(--ink)" }}>{i.title}</div><div className="tu-small tu-muted">{i.id} · {i.category} · {nameOf(db, i.reportedById)}, {fmtDate(i.reportedAt)} {hhmm(i.reportedAt)}
                        {i.taskId && <> · <button className="tu-link" onClick={() => openTask(i.taskId!)}>task</button></>}{i.ticketId && <> · <button className="tu-link" onClick={() => openTicket(i.ticketId!)}>{i.ticketId}</button></>}</div></td>
                      <td>{db.sites.find((s) => s.id === i.siteId)?.name}{i.location && <div className="tu-small tu-muted">{i.location}</div>}</td>
                      <td><SevBadge s={i.severity} /></td>
                      <td><Select label="Owner" value={i.assigneeId || ""} onChange={(v) => v && assignIssue(i.id, v)} options={[["", "Unassigned"], ...FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])]} /></td>
                      <td><Select label="Status" value={i.status} onChange={(v) => setIssueStatus(i.id, v as FieldIssue["status"])} options={["Reported", "Assigned", "In progress", "Closed"]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <Empty title="No issues match">Change the filters or report a new issue.</Empty>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── Assign Tasks: drag work onto a crew member ──────────────────── */
function DispatchTab() {
  const db = useDB();
  const now = useClock();
  const [over, setOver] = useState<string | null>(null);
  const [site, setSite] = useState("");
  const week = now + 7 * 86400000;
  const unownedTasks = db.tasks.filter((t) => isOpen(t) && !t.ownerId);
  const issues = db.fieldIssues.filter((i) => i.status !== "Closed" && !i.assigneeId);
  const upcoming = db.tasks.filter((t) => isOpen(t) && t.ownerId && Date.parse(t.dueAt) < week && (!site || t.siteId === site || db.sites.find((s) => s.id === site)?.projectId === t.projectId))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const drop = (personId: string, data: string) => {
    const [kind, id] = data.split(":");
    if (kind === "issue") assignIssue(id, personId);
    if (kind === "task") updateTask(id, { ownerId: personId });
  };
  const drag = (data: string) => (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", data); e.dataTransfer.effectAllowed = "move"; };
  return (
    <Page title="Assign Tasks" sub="Drag an issue or task onto a crew member, or use the menu. They see it straight away on their Field App job list.">
      <div className="tu-split-r">
        <Card title="Needs an owner" sub={issues.length + unownedTasks.length + " items"} pad={false}>
          <div className="tu-list">
            {issues.map((i) => (
              <div key={i.id} className="tu-li fa-drag" draggable onDragStart={drag("issue:" + i.id)}>
                <Icon name="grip" size={14} style={{ marginTop: 3, color: "var(--faint)" }} />
                <div className="tu-grow"><div style={{ fontWeight: 550, color: "var(--ink)" }}>{i.title}</div><div className="tu-small tu-muted">Field issue {i.id} · {db.sites.find((s) => s.id === i.siteId)?.name}</div><div style={{ marginTop: 5 }}><SevBadge s={i.severity} /></div></div>
                <Select label={"Assign " + i.id} value="" onChange={(v) => v && assignIssue(i.id, v)} options={[["", "Assign…"], ...FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])]} />
              </div>
            ))}
            {unownedTasks.map((t) => (
              <div key={t.id} className="tu-li fa-drag" draggable onDragStart={drag("task:" + t.id)}>
                <Icon name="grip" size={14} style={{ marginTop: 3, color: "var(--faint)" }} />
                <div className="tu-grow"><button className="tu-link" style={{ fontWeight: 550 }} onClick={() => openTask(t.id)}>{t.title}</button><div className="tu-small tu-muted">Task · {db.projects.find((p) => p.id === t.projectId)?.short} · due {fmtDate(t.dueAt)}</div></div>
                <Select label={"Assign " + t.title} value="" onChange={(v) => v && updateTask(t.id, { ownerId: v })} options={[["", "Assign…"], ...FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])]} />
              </div>
            ))}
            {!issues.length && !unownedTasks.length && <div className="tu-li tu-muted">Everything has an owner.</div>}
          </div>
        </Card>
        <div className="tu-grid tu-g3">
          {FIELD_CREW.map((pid) => {
            const p = db.people.find((x) => x.id === pid)!;
            const open = db.tasks.filter((t) => t.ownerId === pid && isOpen(t));
            const od = open.filter((t) => isOverdue(t, now)).length;
            const clk = db.clockings.find((c) => c.personId === pid && !c.outAt);
            const load = Math.min(1, open.length / 12);
            return (
              <div key={pid} className={"fa-crew" + (over === pid ? " drop" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(pid); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); drop(pid, e.dataTransfer.getData("text/plain")); }}>
                <div className="tu-row" style={{ gap: 9 }}><Avatar person={p} size={30} /><div className="tu-grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{p.name}</div><div className="tu-small tu-muted tu-ellipsis">{p.role}</div></div></div>
                <div className="tu-small">{clk ? <span className="fa-live">{db.sites.find((s) => s.id === clk.siteId)?.name}</span> : <span className="tu-muted">{p.status}</span>}</div>
                <div className="fa-load"><i style={{ width: load * 100 + "%", background: load > 0.8 ? "var(--bad)" : load > 0.55 ? "var(--warn)" : "var(--ok)" }} /></div>
                <div className="tu-small tu-muted">{open.length} open · {od ? <span style={{ color: "var(--bad)" }}>{od} overdue</span> : "none overdue"}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="tu-section">
        <Card title="Field work due in the next 7 days" sub="Reassign from here; the change is audited and the new owner is notified" pad={false}
          right={<Select label="Site" value={site} onChange={setSite} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Task</th><th>Project</th><th>Due</th><th>Priority</th><th>Owner</th></tr></thead>
              <tbody>
                {upcoming.slice(0, 14).map((t) => {
                  const dl = dueLabel(t.dueAt, false, now);
                  return (
                    <tr key={t.id} draggable onDragStart={drag("task:" + t.id)} className="fa-drag">
                      <td><button className="tu-link" onClick={() => openTask(t.id)}>{t.title}</button></td>
                      <td>{db.projects.find((p) => p.id === t.projectId)?.short}</td>
                      <td style={{ color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : undefined }}>{dl.text}</td>
                      <td><PriorityBadge p={t.priority} /></td>
                      <td><Select label="Owner" value={t.ownerId || ""} onChange={(v) => updateTask(t.id, { ownerId: v })} options={FIELD_CREW.concat(t.ownerId && !FIELD_CREW.includes(t.ownerId) ? [t.ownerId] : []).map((p) => [p, nameOf(db, p)] as [string, string])} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Page>
  );
}

/* ── Clock In / Out ──────────────────────────────────────────────── */
function ClockTab() {
  const db = useDB();
  const now = useClock();
  const [who, setWho] = useState(FIELD_CREW.find((p) => !db.clockings.some((c) => c.personId === p && !c.outAt)) || "P05");
  const [site, setSite] = useState("S-LS1");
  const [person, setPerson] = useState("");
  const open = db.clockings.filter((c) => !c.outAt);
  const since = addDays(todayKey(), -6);
  const hist = db.clockings.filter((c) => c.outAt && keyOf(Date.parse(c.inAt)) >= since && (!person || c.personId === person))
    .sort((a, b) => Date.parse(b.inAt) - Date.parse(a.inAt));
  const mins = (c: { inAt: string; outAt?: string }) => ((c.outAt ? Date.parse(c.outAt) : now) - Date.parse(c.inAt)) / 60000;
  const byPerson = FIELD_CREW.map((p) => ({ p, h: db.clockings.filter((c) => c.personId === p && keyOf(Date.parse(c.inAt)) >= since).reduce((n, c) => n + mins(c), 0) / 60 })).filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
  const lateStarts = db.clockings.filter((c) => keyOf(Date.parse(c.inAt)) === todayKey() && Number(hhmm(c.inAt).slice(0, 2)) >= 8).length;
  return (
    <Page title="Clock In / Out" sub="Clock records from the Field App, site geofences and supervisors. Clocking out writes a draft timesheet line for approval in People.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="On site now" value={open.length} />
        <Stat label="Hours, last 7 days" value={Math.round(byPerson.reduce((n, x) => n + x.h, 0)) + "h"} sub={byPerson.length + " people"} />
        <Stat label="Starts after 08:00 today" value={lateStarts} tone={lateStarts ? "warn" : "ok"} />
        <Stat label="Draft timesheets" value={db.timesheets.filter((t) => t.status === "Draft").length} sub="awaiting submission" onClick={() => navigate("/people/timesheets")} />
      </div>
      <div className="tu-split">
        <Card title="On site now" pad={false} right={<span className="fa-live">LIVE</span>}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Person</th><th>Site</th><th>In</th><th>Method</th><th>On site</th><th /></tr></thead>
              <tbody>
                {open.map((c) => (
                  <tr key={c.id}>
                    <td><PersonLink id={c.personId} /></td>
                    <td>{db.sites.find((s) => s.id === c.siteId)?.name}</td>
                    <td className="tu-mono">{hhmm(c.inAt)}</td>
                    <td><Badge tone={c.method === "Geofence" ? "accent" : ""}>{c.method}</Badge></td>
                    <td className="tu-mono">{fmtClock(now - Date.parse(c.inAt))}</td>
                    <td><Btn size="xs" onClick={() => clockOut(c.id, "Clocked out by office")}>Clock out</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!open.length && <Empty title="Nobody on site">Crew clock in from the Field App or a supervisor can do it here.</Empty>}
          </div>
        </Card>
        <Card title="Supervisor clock in" sub="For crew without signal or a phone">
          <div className="tu-stack" style={{ gap: 10 }}>
            <Field label="Person"><select className="tu-select" value={who} onChange={(e) => setWho(e.target.value)}>{FIELD_CREW.map((p) => <option key={p} value={p} disabled={open.some((c) => c.personId === p)}>{nameOf(db, p)}{open.some((c) => c.personId === p) ? " (on site)" : ""}</option>)}</select></Field>
            <Field label="Site"><select className="tu-select" value={site} onChange={(e) => setSite(e.target.value)}>{db.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Btn kind="primary" icon="clock" onClick={() => clockIn(who, site, "Supervisor")}>Clock in now</Btn>
            <div className="fa-h">Hours, last 7 days</div>
            {byPerson.map((x) => (
              <div key={x.p} className="gr-bar" style={{ gridTemplateColumns: "120px 1fr 52px" }}>
                <span className="lab">{nameOf(db, x.p)}</span><span className="trk"><i style={{ width: Math.min(100, x.h / 50 * 100) + "%", background: "var(--accent-fill,var(--accent))" }} /></span><span className="val">{x.h.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="tu-section">
        <Card title="Clock history, last 7 days" pad={false} right={<Select label="Person" value={person} onChange={setPerson} options={[["", "Everyone"], ...FIELD_CREW.map((p) => [p, nameOf(db, p)] as [string, string])]} />}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Day</th><th>Person</th><th>Site</th><th>In</th><th>Out</th><th>Hours</th><th>Timesheet</th></tr></thead>
              <tbody>
                {hist.map((c) => (
                  <tr key={c.id}>
                    <td>{relDay(c.inAt, now)}</td><td>{nameOf(db, c.personId)}</td><td>{db.sites.find((s) => s.id === c.siteId)?.name}</td>
                    <td className="tu-mono">{hhmm(c.inAt)}</td><td className="tu-mono">{hhmm(c.outAt!)}</td><td className="tu-mono">{fmtDuration(mins(c))}</td>
                    <td>{c.timesheetId ? <button className="tu-link" onClick={() => navigate("/people/timesheets")}>Draft line</button> : <span className="tu-muted">Seeded</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Page>
  );
}
