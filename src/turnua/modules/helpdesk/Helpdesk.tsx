/* 24/7 Helpdesk: Live Queue, On-call, SLA Reports, Knowledge, ticket drawer and form. */
import { useMemo, useState } from "react";
import type { ID, Ticket, TicketPriority } from "../../types";
import { useDB, useClock, update } from "../../store";
import { closeOverlay, navigate, openNew, openTicket, useFilter, useRoute, toast } from "../../ui";
import {
  acknowledgeTicket, assignTicket, changeTicketPriority, escalateTicket, resolveTicket, reopenTicket, addTicketNote, createTicket, reassignShift, createEvent, log,
} from "../../actions";
import {
  Avatar, Badge, Btn, Card, Drawer, Empty, Field, Icon, KV, Modal, Page, PersonLink, Ref, Search, Select, SortTh, Stat, download, toCsv, openRef,
} from "../../kit";
import { sla, isUnresolved, nameOf, AQC_SITES, occurrences, involves, availabilityOn, labelOf } from "../../selectors";
import { SLA_TARGET } from "../../seed";
import { addDays, ago, at, dublinParts, fmtDate, fmtDateTime, fmtKey, hhmm, keyOf, num, todayKey, fmtDuration } from "../../time";
import { InPortal, P_ORDER, PRIORITIES, SlaCell, TicketPriorityBadge, TicketStatusBadge } from "./common";

export default function HelpdeskModule({ tab }: { tab: string }) {
  if (tab === "oncall") return <OnCall />;
  if (tab === "sla") return <SlaReports />;
  if (tab === "knowledge") return <Knowledge />;
  return <LiveQueue />;
}

/* ── Live Queue ──────────────────────────────────────────────────── */
type SortK = "id" | "priority" | "status" | "deadline" | "site";
function LiveQueue() {
  const db = useDB();
  const now = useClock();
  const [f, setF, resetF] = useFilter("helpdesk.queue");
  const [sort, setSort] = useState<{ k: SortK; dir: 1 | -1 }>({ k: "deadline", dir: 1 });
  const showResolved = f.resolved === "1";
  const q = (f.q || "").toLowerCase();
  const unresolved = db.tickets.filter(isUnresolved);
  const p1 = unresolved.filter((t) => t.priority === "P1").length;
  const p2 = unresolved.filter((t) => t.priority === "P2").length;
  const breached = unresolved.filter((t) => sla(t, now).state === "breached").length;
  const engineers = Array.from(new Set(db.tickets.map((t) => t.engineerId).filter(Boolean))) as ID[];
  const rows = db.tickets.filter((t) => (showResolved || isUnresolved(t))
    && (!f.priority || t.priority === f.priority) && (!f.status || t.status === f.status) && (!f.site || t.siteId === f.site)
    && (!f.engineer || t.engineerId === f.engineer)
    && (!q || (t.id + " " + t.title + " " + labelOf(db, "site", t.siteId) + " " + labelOf(db, "client", t.clientId) + " " + nameOf(db, t.engineerId)).toLowerCase().includes(q)));
  const key = (t: Ticket): number | string => {
    switch (sort.k) {
      case "id": return t.id;
      case "priority": return P_ORDER[t.priority];
      case "status": return t.status;
      case "site": return labelOf(db, "site", t.siteId);
      default: { const s = sla(t, now); return t.status === "Resolved" ? 1e15 : s.state === "acknowledged" ? 1e14 + s.remaining : s.remaining; }
    }
  };
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  const filtered = !!(f.priority || f.status || f.site || f.engineer || f.q);
  return (
    <Page title="Live Queue" eyebrow="24/7 Helpdesk"
      sub="Incidents across monitored sites with live response timers. Assigned is not acknowledged: the timer runs until someone records first response."
      actions={<Btn kind="primary" icon="plus" onClick={() => openNew("ticket")}>New ticket</Btn>}>
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        <Stat label="Unresolved tickets" value={unresolved.length} sub={breached ? breached + " past response target" : "All within response target"} tone={breached ? "bad" : undefined} onClick={() => { resetF(); }} />
        <Stat label="P1 open" value={p1} tone={p1 ? "bad" : "ok"} sub="Response target 60 min" onClick={() => setF("priority", f.priority === "P1" ? "" : "P1")} />
        <Stat label="P2 open" value={p2} tone={p2 ? "warn" : "ok"} sub="Response target 240 min" onClick={() => setF("priority", f.priority === "P2" ? "" : "P2")} />
        <Stat label="Mean response" value={db.sla.meanResponseMins + " min"} sub="90-day historical, managed-service SLA" onClick={() => navigate("/helpdesk/sla")} />
        <Stat label="SLA compliance" value={(db.sla.met / db.sla.eligible * 100).toFixed(1) + "%"} sub="Managed-service SLA, 90 days" tone="ok" onClick={() => navigate("/helpdesk/sla")} />
      </div>
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search ID, issue, site, client" width={260} />
        <Select label="Priority" value={f.priority || ""} onChange={(v) => setF("priority", v)} options={[["", "All priorities"], ...PRIORITIES.map((p) => [p, p] as [string, string])]} />
        <Select label="Status" value={f.status || ""} onChange={(v) => setF("status", v)} options={[["", "All statuses"], "Open", "Assigned", "In progress", "Resolved"]} />
        <Select label="Site" value={f.site || ""} onChange={(v) => setF("site", v)} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />
        <Select label="Engineer" value={f.engineer || ""} onChange={(v) => setF("engineer", v)} options={[["", "All engineers"], ...engineers.map((e) => [e, nameOf(db, e)] as [string, string])]} />
        <label className="tu-check" style={{ marginLeft: 4 }}><input type="checkbox" checked={showResolved} onChange={(e) => setF("resolved", e.target.checked ? "1" : "")} />Show resolved history</label>
        {filtered && <Btn kind="ghost" size="sm" onClick={resetF}>Clear filters</Btn>}
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <caption className="tu-sr">Helpdesk tickets</caption>
            <thead><tr>
              <SortTh k="id" label="ID" sort={sort} setSort={setSort} />
              <th>Issue</th><th>Client</th>
              <SortTh k="site" label="Site" sort={sort} setSort={setSort} />
              <SortTh k="priority" label="Priority" sort={sort} setSort={setSort} />
              <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
              <th>Engineer</th>
              <SortTh k="deadline" label="Response deadline" sort={sort} setSort={setSort} />
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="click" tabIndex={0} onClick={() => openTicket(t.id)} onKeyDown={(e) => { if (e.key === "Enter") openTicket(t.id); }}>
                  <td className="tu-mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{t.id}</td>
                  <td style={{ minWidth: 200 }}>{t.title}</td>
                  <td className="tu-muted" style={{ minWidth: 140 }}>{labelOf(db, "client", t.clientId)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{labelOf(db, "site", t.siteId)}</td>
                  <td><TicketPriorityBadge p={t.priority} /></td>
                  <td><TicketStatusBadge t={t} /></td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="tu-row" style={{ gap: 7 }}><Avatar person={db.people.find((p) => p.id === t.engineerId)} size={22} />{nameOf(db, t.engineerId)}</span></td>
                  <td>
                    <div className="tu-small tu-faint" style={{ marginBottom: 3 }}>{t.status === "Resolved" ? "Resolved " + ago(t.resolvedAt || t.createdAt, now) : "Due " + hhmm(t.cycles[t.cycles.length - 1].dueAt) + (keyOf(Date.parse(t.cycles[t.cycles.length - 1].dueAt)) !== keyOf(now) ? ", " + fmtDate(t.cycles[t.cycles.length - 1].dueAt) : "")}</div>
                    <SlaCell t={t} now={now} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty title="No tickets match these filters" action={<Btn onClick={resetF}>Clear filters</Btn>}>Try another priority or site, or include resolved history.</Empty>}
        <div className="tu-card-f"><Icon name="clock" size={13} />Timers update every second from ticket timestamps. Targets: P1 60 min, P2 240, P3 1,440, P4 2,880 (demo policy).</div>
      </Card>
    </Page>
  );
}

/* ── ticket drawer ───────────────────────────────────────────────── */
type Mode = "" | "assign" | "priority" | "escalate" | "resolve" | "reopen";
export function TicketDrawer({ ok, id }: { ok: string; id: string }) {
  const db = useDB();
  const now = useClock();
  const t = db.tickets.find((x) => x.id === id);
  const [mode, setMode] = useState<Mode>("");
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [pri, setPri] = useState<TicketPriority>("P2");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [showRunbook, setShowRunbook] = useState(false);
  if (!t) return <Drawer ok={ok} title="Ticket not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">This ticket is not in the demo records.</p></Drawer>;
  const s = sla(t, now);
  const c = t.cycles[t.cycles.length - 1];
  const site = db.sites.find((x) => x.id === t.siteId);
  const asset = db.assets.find((x) => x.id === t.assetId);
  const rb = db.runbooks.find((x) => x.id === t.runbookId);
  const open = isUnresolved(t);
  const go = (m: Mode) => { setErr(""); setText(""); setMode(mode === m ? "" : m); if (m === "assign") setWho(t.engineerId || ""); if (m === "priority") setPri(t.priority); };
  const submit = () => {
    if (mode === "assign") { if (!who) return setErr("Choose an engineer."); assignTicket(t.id, who); }
    if (mode === "priority") { if (pri === t.priority) return setErr("Choose a different priority."); if (text.trim().length < 4) return setErr("Give a short reason for the audit log."); changeTicketPriority(t.id, pri, text.trim()); }
    if (mode === "escalate") { if (text.trim().length < 4) return setErr("Add a short escalation note."); escalateTicket(t.id, text.trim()); }
    if (mode === "resolve") { if (text.trim().length < 6) return setErr("A short resolution note is required."); resolveTicket(t.id, text.trim()); }
    if (mode === "reopen") { if (text.trim().length < 4) return setErr("Give a reason for reopening."); reopenTicket(t.id, text.trim()); }
    setMode(""); setText(""); setErr("");
  };
  const target = SLA_TARGET[t.priority];
  const cfTeam = db.people.filter((p) => p.teamId === "TM-CF" || ["P07", "P04"].includes(p.id));
  return (
    <Drawer ok={ok} wide onClose={() => closeOverlay(ok)} eyebrow={t.id + " · " + (site?.name || "")}
      badges={<><TicketPriorityBadge p={t.priority} /><TicketStatusBadge t={t} /></>}
      title={t.title}
      footer={open ? (
        <>
          {!c.acknowledgedAt && <Btn kind="primary" icon="check" onClick={() => acknowledgeTicket(t.id)}>Acknowledge</Btn>}
          <Btn onClick={() => go("assign")} aria-pressed={mode === "assign"}>Assign</Btn>
          <Btn onClick={() => go("priority")} aria-pressed={mode === "priority"}>Change priority</Btn>
          <Btn onClick={() => go("escalate")} aria-pressed={mode === "escalate"}>Escalate</Btn>
          <span className="tu-grow" />
          <Btn kind="navy" onClick={() => go("resolve")} aria-pressed={mode === "resolve"}>Resolve</Btn>
        </>
      ) : (
        <>
          <span className="tu-grow tu-small tu-muted">Resolved {fmtDateTime(t.resolvedAt)}. Reopening starts a new response cycle and keeps this one.</span>
          <Btn onClick={() => go("reopen")}>Reopen</Btn>
        </>
      )}>
      {mode && (
        <div className="hd-form" style={{ marginTop: 0, marginBottom: 16 }}>
          {mode === "assign" && (
            <Field label="Assign to" error={err}>
              <select className="tu-select" autoFocus value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Choose an engineer</option>
                {cfTeam.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role} · {p.status}</option>)}
              </select>
            </Field>
          )}
          {mode === "priority" && (
            <div className="tu-stack" style={{ gap: 10 }}>
              <div className="tu-grid tu-g2" style={{ gap: 10 }}>
                <Field label="New priority"><select className="tu-select" autoFocus value={pri} onChange={(e) => setPri(e.target.value as TicketPriority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p} · {SLA_TARGET[p]} min response</option>)}</select></Field>
                <Field label="Reason" error={err}><input className="tu-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Recorded in the audit log" /></Field>
              </div>
              <div className="tu-small tu-muted">Policy: {c.acknowledgedAt ? "this cycle is already acknowledged, so its recorded response result is kept; the new priority applies to handling and any reopened cycle." : "the response target re-bases from the original open time (" + hhmm(c.startedAt) + "), so a downgrade cannot hide a breach and an upgrade can bring the deadline forward."}</div>
            </div>
          )}
          {mode === "escalate" && <Field label="Escalation note" error={err} help="Creates an urgent escalation task for the on-call lead and an internal notification. Nothing is sent externally."><textarea className="tu-textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} /></Field>}
          {mode === "resolve" && <Field label="Resolution note" error={err} help={c.acknowledgedAt ? "Resolution is tracked separately from the response target." : "Resolving records first response now if nobody acknowledged it."}><textarea className="tu-textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What was done and how it was verified" /></Field>}
          {mode === "reopen" && <Field label="Reason for reopening" error={err} help="Starts a new response cycle. The previous cycle and its result stay on record."><textarea className="tu-textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} /></Field>}
          <div className="tu-row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <Btn onClick={() => setMode("")}>Cancel</Btn>
            <Btn kind="primary" onClick={submit}>{mode === "assign" ? "Assign" : mode === "priority" ? "Change priority" : mode === "escalate" ? "Escalate" : mode === "resolve" ? "Resolve ticket" : "Reopen ticket"}</Btn>
          </div>
        </div>
      )}
      <Card pad style={{ borderRadius: 14 }}>
        <div className="tu-row tu-wrap" style={{ gap: 18, alignItems: "flex-start" }}>
          <div>
            <div className="tu-small tu-muted">{t.status === "Resolved" ? "Response" : c.acknowledgedAt ? "First response" : s.state === "breached" ? "Response target" : "Time left to respond"}</div>
            <div className="hd-clock" style={{ color: s.state === "breached" || (s.state === "acknowledged" && s.tone === "bad") ? "var(--bad)" : s.state === "running" && s.tone !== "ok" ? "var(--warn)" : undefined }}>
              {c.acknowledgedAt ? Math.max(1, Math.round((Date.parse(c.acknowledgedAt) - Date.parse(c.startedAt)) / 60000)) + " min" : s.state === "breached" ? "Breached" : s.label.replace(" left", "")}
            </div>
            <div className="tu-small tu-faint">{c.acknowledgedAt ? (c.result === "Met" ? "Within" : "Outside") + " the " + target + " min " + t.priority + " target, timer frozen" : "Target " + target + " min, deadline " + hhmm(c.dueAt)}</div>
          </div>
          <div className="tu-grow" style={{ minWidth: 220 }}><SlaCell t={t} now={now} /></div>
        </div>
        {t.cycles.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <div className="tu-small tu-muted" style={{ marginBottom: 4 }}>Response cycles (history kept)</div>
            {t.cycles.map((cy, i) => {
              const breachedOpen = !cy.acknowledgedAt && Date.parse(cy.dueAt) < now;
              return (
                <div key={i} className="tu-row tu-small" style={{ padding: "3px 0" }}>
                  <b>Cycle {i + 1}</b><span className="tu-muted">opened {fmtDateTime(cy.startedAt)}</span>
                  <Badge tone={cy.result === "Met" ? "ok" : cy.result === "Missed" || breachedOpen ? "bad" : ""}>{cy.result || (breachedOpen ? "Breached" : "Running")}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="tu-section">
        <KV items={[
          ["Site", site ? <Ref type="site" id={site.id} /> : "Not set"],
          ["Asset", asset ? <Ref type="asset" id={asset.id} /> : "Not linked"],
          ["Client", <Ref type="client" id={t.clientId} />],
          ["Engineer", <PersonLink id={t.engineerId} />],
          ["Opened", fmtDateTime(t.createdAt)],
          ["Status", t.status + (t.resolvedAt ? ", " + fmtDateTime(t.resolvedAt) : "")],
        ]} />
      </div>
      <div className="tu-section"><div className="tu-eyebrow">Description</div><div className="tu-note">{t.description}</div></div>
      {asset?.reading && (
        <div className="tu-section"><div className="tu-eyebrow">Asset reading</div>
          <div className="tu-note">{asset.reading.label}: <b>{asset.reading.value}</b> <span className="tu-faint">({ago(asset.reading.at, now)}, demo reading, not live telemetry)</span></div></div>
      )}
      {t.resolutionNote && <div className="tu-section"><div className="tu-eyebrow">Resolution</div><div className="tu-note accent">{t.resolutionNote}</div></div>}
      <div className="tu-section">
        <div className="tu-eyebrow">Linked work</div>
        <div className="tu-row tu-wrap" style={{ gap: 8 }}>
          {t.taskId && <Btn size="sm" icon="check" onClick={() => openRef("task", t.taskId!)}>Response task: {labelOf(db, "task", t.taskId)}</Btn>}
          {db.tasks.filter((x) => x.ticketId === t.id && x.id !== t.taskId).map((x) => <Btn key={x.id} size="sm" icon="check" onClick={() => openRef("task", x.id)}>{x.title} ({x.status})</Btn>)}
          {rb && <Btn size="sm" icon="doc" onClick={() => setShowRunbook(!showRunbook)} aria-expanded={showRunbook}>Runbook {rb.id}: {rb.title}</Btn>}
          {!t.taskId && !rb && <span className="tu-small tu-muted">No linked task or runbook.</span>}
        </div>
        {rb && showRunbook && (
          <div className="hd-form">
            <div className="tu-row"><b className="tu-grow">{rb.title}</b><span className="tu-small tu-faint">{rb.version} · owner {nameOf(db, rb.ownerId)}</span></div>
            <ol className="hd-steps" style={{ marginTop: 8 }}>{rb.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            <Btn size="sm" kind="ghost" onClick={() => { closeOverlay(ok, true); navigate("/helpdesk/knowledge?kb=" + rb.id); }}>Open in Knowledge</Btn>
          </div>
        )}
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Incident timeline</div>
        <div className="tu-tl">
          {t.timeline.slice().reverse().map((e, i) => (
            <div key={i}><div className="tu-small tu-faint">{fmtDateTime(e.at)} · {e.actor}</div><div>{e.text}</div></div>
          ))}
        </div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Internal notes · {t.notes.length}</div>
        {t.notes.map((n, i) => <div key={i} className="tu-row" style={{ alignItems: "flex-start", padding: "6px 0" }}><Avatar person={db.people.find((p) => p.id === n.authorId)} size={22} /><div className="tu-grow"><div className="tu-small"><b>{nameOf(db, n.authorId)}</b> <span className="tu-faint">{ago(n.at, now)}</span></div>{n.text}</div></div>)}
        <div className="tu-row" style={{ marginTop: 6 }}>
          <input className="tu-input" aria-label="Add an internal note" placeholder="Add an internal note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { addTicketNote(t.id, note.trim()); setNote(""); } }} />
          <Btn onClick={() => { if (note.trim()) { addTicketNote(t.id, note.trim()); setNote(""); } }} disabled={!note.trim()}>Add note</Btn>
        </div>
      </div>
    </Drawer>
  );
}

/* ── new ticket form ─────────────────────────────────────────────── */
export function TicketForm({ ok, prefill }: { ok: string; prefill?: Record<string, unknown> }) {
  const db = useDB();
  const pf = prefill || {};
  const [f, setF] = useState({
    title: (pf.title as string) || "", description: (pf.description as string) || "", siteId: (pf.siteId as string) || "",
    assetId: (pf.assetId as string) || "", priority: ((pf.priority as string) || "P3") as TicketPriority, engineerId: (pf.engineerId as string) || "",
  });
  const [tried, setTried] = useState(false);
  const site = db.sites.find((s) => s.id === f.siteId);
  const assets = f.siteId ? db.assets.filter((a) => a.siteId === f.siteId) : [];
  const errs = {
    title: f.title.trim().length < 4 ? "Describe the issue in a few words." : "",
    siteId: !f.siteId ? "Choose a site." : "",
    description: f.description.trim().length < 8 ? "Add a short description." : "",
  };
  const submit = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const id = createTicket({ title: f.title.trim(), description: f.description.trim(), siteId: f.siteId, assetId: f.assetId || undefined, priority: f.priority, engineerId: f.engineerId || null });
    closeOverlay(ok, true);
    openTicket(id);
  };
  return (
    <Modal ok={ok} title="New helpdesk ticket" sub={"Starts a response timer from now: " + f.priority + " target " + SLA_TARGET[f.priority] + " minutes."} onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)}>Cancel</Btn><Btn kind="primary" onClick={submit}>Open ticket</Btn></>}>
      <div className="tu-stack" style={{ gap: 12 }}>
        <Field label="Issue" error={tried ? errs.title : ""}><input className="tu-input" data-autofocus value={f.title} aria-invalid={tried && !!errs.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="tu-grid tu-g2" style={{ gap: 12 }}>
          <Field label="Site" error={tried ? errs.siteId : ""}>
            <select className="tu-select" value={f.siteId} aria-invalid={tried && !!errs.siteId} onChange={(e) => { const s = db.sites.find((x) => x.id === e.target.value); setF({ ...f, siteId: e.target.value, assetId: "", engineerId: f.engineerId || s?.leadId || "" }); }}>
              <option value="">Choose a site</option>{db.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Asset" help={site ? assets.length + " assets at " + site.name : "Choose a site first"}>
            <select className="tu-select" value={f.assetId} disabled={!f.siteId} onChange={(e) => setF({ ...f, assetId: e.target.value })}>
              <option value="">No specific asset</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Priority"><select className="tu-select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TicketPriority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p} · respond within {SLA_TARGET[p]} min</option>)}</select></Field>
          <Field label="Engineer" help="Assigned is not acknowledged">
            <select className="tu-select" value={f.engineerId} onChange={(e) => setF({ ...f, engineerId: e.target.value })}>
              <option value="">Unassigned</option>{db.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description" error={tried ? errs.description : ""}><textarea className="tu-textarea" value={f.description} aria-invalid={tried && !!errs.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ── On-call ─────────────────────────────────────────────────────── */
const CF_POOL = ["P05", "P06", "P11"];
function shiftWarnings(db: ReturnType<typeof useDB>, personId: ID, date: string, kind: "day" | "night"): string[] {
  const w: string[] = [];
  const occ = occurrences(db, addDays(date, -1), addDays(date, 2)).filter((o) => involves(o, personId));
  const startOf = (k: string, h: number) => Date.parse(at(k, h));
  const leave = occ.find((o) => o.type === "Leave" && Date.parse(o.start) < startOf(addDays(date, 1), 0) && Date.parse(o.end) > startOf(date, 0));
  if (leave) w.push("On leave that day.");
  if (!CF_POOL.includes(personId)) w.push("Not in the Critical Facilities & IT on-call pool.");
  if (kind === "day") {
    const night = occ.find((o) => o.type === "On call" && keyOf(Date.parse(o.start)) === addDays(date, -1) && dublinParts(Date.parse(o.start)).h >= 18);
    if (night) w.push("Covers night on-call the evening before; rest is protected until 15:00.");
  } else {
    const dayCall = occ.find((o) => o.type === "On call" && keyOf(Date.parse(o.start)) === date && dublinParts(Date.parse(o.start)).h < 12);
    if (dayCall) w.push("Already on day on-call: this would be a back-to-back 24 hour shift.");
    const nextDay = occ.filter((o) => o.type !== "On call" && o.type !== "Leave" && !o.allDay && keyOf(Date.parse(o.start)) === addDays(date, 1) && Date.parse(o.start) < startOf(addDays(date, 1), 15));
    if (nextDay.length) w.push("Has " + nextDay.length + " booking" + (nextDay.length > 1 ? "s" : "") + " before 15:00 the next day, inside the rest window.");
  }
  const a = availabilityOn(db, date).find((x) => x.person.id === personId);
  if (a && a.load > 0.95) w.push("Planned load " + Math.round(a.load * 100) + "% this week.");
  return w;
}

function OnCall() {
  const db = useDB();
  const now = useClock();
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const occ = occurrences(db, today, addDays(today, 8)).filter((o) => o.type === "On call");
  const slot = (date: string, kind: "day" | "night") => occ.find((o) => keyOf(Date.parse(o.start)) === date && (kind === "day" ? dublinParts(Date.parse(o.start)).h < 12 : dublinParts(Date.parse(o.start)).h >= 18));
  const current = occurrences(db, addDays(today, -1), addDays(today, 1)).filter((o) => o.type === "On call" && Date.parse(o.start) <= now && Date.parse(o.end) > now);
  const tonight = slot(today, "night");
  const todayDay = slot(today, "day");
  const [edit, setEdit] = useState<{ date: string; kind: "day" | "night"; eventId?: string; current: ID[] } | null>(null);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const handovers = db.activity.filter((a) => a.text.startsWith("Handover note")).slice(0, 5);
  const openTickets = db.tickets.filter(isUnresolved);
  const team = db.people.filter((p) => p.teamId === "TM-CF");
  const avail = availabilityOn(db, today).filter((a) => a.person.teamId === "TM-CF");
  const warnings = edit && pick ? shiftWarnings(db, pick, edit.date, edit.kind) : [];
  const save = () => {
    if (!edit || !pick) return;
    if (edit.eventId) reassignShift(edit.eventId, edit.date, pick);
    else createEvent({ title: edit.kind === "day" ? "Primary on-call, cover" : "Night on-call, cover", type: "On call", ownerId: pick, attendeeIds: [pick],
      start: at(edit.date, edit.kind === "day" ? 7 : 19), end: edit.kind === "day" ? at(edit.date, 19) : at(addDays(edit.date, 1), 7), location: "On call", notes: "Cover added from the On-call roster." });
    setEdit(null); setPick("");
  };
  const addHandover = () => {
    const text = note.trim();
    if (!text) return;
    update((d) => log(d, { text: "Handover note: " + text, sourceType: "event", sourceId: tonight?.eventId || "EV-LIAM-NIGHT", category: "Helpdesk" }));
    setNote("");
    toast("Handover note saved");
  };
  const names = (ids: ID[]) => ids.map((x) => nameOf(db, x)).join(", ");
  return (
    <Page title="On-call" eyebrow="24/7 Helpdesk" sub="Coverage comes from the shared calendar. On-call windows are availability, not booked working hours.">
      <div className="tu-grid tu-g3" style={{ marginBottom: 14 }}>
        <Card title="On call now" sub={fmtDateTime(new Date(now).toISOString())}>
          {current.length ? current.map((o) => (
            <div key={o.key} className="tu-row" style={{ padding: "4px 0" }}>
              <Avatar person={db.people.find((p) => p.id === o.attendeeIds[0])} size={30} />
              <div className="tu-grow"><div style={{ fontWeight: 600 }}>{names(o.attendeeIds)}</div><div className="tu-small tu-muted">{o.title} · until {hhmm(o.end)}</div></div>
            </div>
          )) : <div className="tu-note warn"><Icon name="alert" size={13} /> No on-call cover rostered right now. Escalation goes to the Critical Facilities lead by phone (After-hours escalation runbook).</div>}
        </Card>
        <Card title="Today and tonight">
          <div className="tu-stack" style={{ gap: 8 }}>
            <div className="tu-row"><Badge tone="accent">Day</Badge><span className="tu-grow">{todayDay ? names(todayDay.attendeeIds) + " · " + hhmm(todayDay.start) + " to " + hhmm(todayDay.end) : "No day cover rostered"}</span></div>
            <div className="tu-row"><Badge tone="navy">Night</Badge><span className="tu-grow">{tonight ? names(tonight.attendeeIds) + " · " + hhmm(tonight.start) + " to " + hhmm(tonight.end) : "No night cover rostered"}</span></div>
            <div className="tu-small tu-muted">Lead: {nameOf(db, "P05")} (Critical Facilities Lead). Backup: next available engineer in the pool below.</div>
          </div>
        </Card>
        <Card title="Contacts" sub={"Office " + db.org.phone}>
          {team.map((p) => (
            <div key={p.id} className="tu-row" style={{ padding: "4px 0" }}>
              <PersonLink id={p.id} /><span className="tu-grow" /><span className="tu-small tu-muted">{p.ext}</span><Badge tone={p.status === "On call" ? "accent" : ""}>{p.status}</Badge>
            </div>
          ))}
          <div className="tu-small tu-faint" style={{ marginTop: 6 }}>Demo contact data. Office extensions only.</div>
        </Card>
      </div>
      <div className="tu-split">
        <Card title="Seven-day rota" sub="Day cover 07:00 to 19:00, night cover 19:00 to 07:00. Changes write to the calendar." pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table hd-rota">
              <thead><tr><th>Date</th><th>Day cover</th><th>Night cover</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d}>
                    <td style={{ whiteSpace: "nowrap", fontWeight: d === today ? 600 : 400 }}>{fmtKey(d)}{d === today ? " (today)" : ""}</td>
                    {(["day", "night"] as const).map((kind) => {
                      const o = slot(d, kind);
                      return (
                        <td key={kind}>
                          <div className="hd-cell">
                            {o ? <span className="tu-row" style={{ gap: 7 }}><Avatar person={db.people.find((p) => p.id === o.attendeeIds[0])} size={22} />{names(o.attendeeIds)}</span>
                              : <Badge tone="warn" icon="alert">No cover rostered</Badge>}
                            <Btn size="xs" onClick={() => { setEdit({ date: d, kind, eventId: o?.eventId, current: o?.attendeeIds || [] }); setPick(""); }}>{o ? "Reassign" : "Add cover"}</Btn>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="tu-stack">
          <Card title="Shift handover" sub={"Next handover " + (dublinParts(now).h < 7 ? "07:00 today" : dublinParts(now).h < 19 ? "19:00 today" : "07:00 tomorrow")}>
            <div className="tu-small tu-muted" style={{ marginBottom: 6 }}>Open tickets to hand over</div>
            {openTickets.map((t) => <div key={t.id} className="tu-row" style={{ padding: "3px 0" }}><TicketPriorityBadge p={t.priority} /><Ref type="ticket" id={t.id} /><span className="tu-small tu-muted tu-grow tu-ellipsis">{t.status}</span></div>)}
            <div className="tu-row" style={{ marginTop: 10 }}>
              <input className="tu-input" aria-label="Handover note" placeholder="Add a handover note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addHandover(); }} />
              <Btn onClick={addHandover} disabled={!note.trim()}>Save</Btn>
            </div>
            {handovers.map((h) => <div key={h.id} className="tu-small" style={{ marginTop: 8 }}><span className="tu-faint">{ago(h.at, now)} · {h.actor}</span><div>{h.text.replace(/^Handover note: /, "")}</div></div>)}
          </Card>
          <Card title="Availability today" sub="From calendar, leave and rest windows">
            {avail.map((a) => (
              <div key={a.person.id} className="tu-row" style={{ padding: "5px 0", alignItems: "flex-start" }}>
                <Avatar person={a.person} size={24} />
                <div className="tu-grow"><div style={{ fontWeight: 500 }}>{a.person.name}</div><div className="tu-small tu-muted">{a.reasons.join("; ") || "No bookings in the working window"}</div></div>
                <Badge tone={a.state === "Available" ? "ok" : a.state === "Partly booked" ? "warn" : "bad"}>{a.state}</Badge>
              </div>
            ))}
          </Card>
        </div>
      </div>
      {edit && (
        <InPortal onEscape={() => setEdit(null)}>
        <Modal ok="hd-shift" size="sm" title={(edit.eventId ? "Reassign " : "Add ") + (edit.kind === "day" ? "day" : "night") + " cover, " + fmtKey(edit.date)}
          sub={edit.current.length ? "Currently " + names(edit.current) : "No cover rostered"} onClose={() => setEdit(null)}
          footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind={warnings.length ? "danger" : "primary"} onClick={save} disabled={!pick}>{warnings.length ? "Save despite warnings" : "Save to calendar"}</Btn></>}>
          <Field label="Engineer">
            <select className="tu-select" data-autofocus value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a person</option>
              {db.people.filter((p) => !edit.current.includes(p.id)).sort((a, b) => Number(!CF_POOL.includes(a.id)) - Number(!CF_POOL.includes(b.id))).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
          </Field>
          {pick && (warnings.length ? (
            <div className="tu-note bad" style={{ marginTop: 12 }}><b>Check before saving</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          ) : <div className="tu-note accent" style={{ marginTop: 12 }}>No leave, rest-window or load conflicts found for {nameOf(db, pick)}.</div>)}
        </Modal>
        </InPortal>
      )}
    </Page>
  );
}

/* ── SLA Reports ─────────────────────────────────────────────────── */
function SlaReports() {
  const db = useDB();
  const r = db.sla;
  const compliance = (r.met / r.eligible * 100).toFixed(1);
  const since = db.tickets.filter((t) => AQC_SITES.includes(t.siteId)).flatMap((t) => t.cycles.filter((c) => c.acknowledgedAt && Date.parse(c.acknowledgedAt) > Date.parse(r.cutoffAt)).map((c) => ({ t, c })));
  const sinceMet = since.filter((x) => x.c.result === "Met").length;
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Report", r.scope], ["Period", fmtDate(r.from) + " to " + fmtDate(r.to)], ["Reporting cutoff", fmtDateTime(r.cutoffAt)],
      ["Eligible tickets", r.eligible], ["Met response target", r.met], ["Missed", r.missed], ["Compliance %", compliance], ["Mean response (min)", r.meanResponseMins], [],
      ["Priority", "Target (min)", "Eligible", "Met", "Missed", "Compliance %", "Mean response (min)"],
      ...r.byPriority.map((p) => [p.priority, SLA_TARGET[p.priority], p.eligible, p.met, p.eligible - p.met, (p.met / p.eligible * 100).toFixed(1), p.mean]), [],
      ["Site", "Eligible", "Met", "Compliance %"], ...r.bySite.map((s) => [labelOf(db, "site", s.siteId), s.eligible, s.met, (s.met / s.eligible * 100).toFixed(1)]), [],
      ["Week", "Eligible", "Met", "Mean response (min)"], ...r.weekly.map((w) => [w.week, w.eligible, w.met, w.mean]), [],
      ["Missed ticket", "Date", "Site", "Priority", "Issue", "Response (min)", "Target (min)"],
      ...r.missedRows.map((m) => [m.id, fmtDate(m.at), labelOf(db, "site", m.siteId), m.priority, m.title, m.responseMins, m.targetMins]),
    ];
    download("turnua-managed-service-sla.csv", toCsv(rows), "text/csv");
    toast("SLA report exported as CSV");
  };
  const maxComp = 100, minComp = 97;
  return (
    <Page title="SLA Reports" eyebrow="24/7 Helpdesk" sub={r.scope + ". " + fmtDate(r.from, { year: true }) + " to " + fmtDate(r.to, { year: true }) + ". Reporting cutoff " + fmtDateTime(r.cutoffAt) + "."}
      actions={<Btn icon="dl" onClick={exportCsv}>Export CSV</Btn>}>
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        <Stat label="Eligible tickets" value={num(r.eligible)} sub="Managed-service SLA, 90 days" />
        <Stat label="Met response target" value={num(r.met)} tone="ok" />
        <Stat label="Missed" value={r.missed} tone="bad" sub="Listed below" />
        <Stat label="Compliance" value={compliance + "%"} sub={num(r.met) + " of " + num(r.eligible)} tone="ok" />
        <Stat label="Mean response" value={r.meanResponseMins + " min"} sub="Open to acknowledgement" />
      </div>
      <div className="tu-note" style={{ marginBottom: 14 }}>
        <b>What is measured:</b> response, from ticket open to first acknowledgement, against the demo priority targets. Resolution time is tracked separately on each ticket and is not part of this SLA.
        {" "}<b>Since cutoff:</b> {since.length} AquaComms response{since.length === 1 ? "" : "s"} recorded ({sinceMet} met). These join the next report and are not in this denominator.
      </div>
      <div className="tu-split" style={{ marginBottom: 14 }}>
        <Card title="Weekly compliance, 13 weeks" sub="Bar height shows compliance between 97% and 100%">
          <div className="hd-trend" role="img" aria-label={"Weekly compliance: " + r.weekly.map((w) => (w.met / w.eligible * 100).toFixed(1) + "%").join(", ")}>
            {r.weekly.map((w) => {
              const c = w.met / w.eligible * 100;
              const h = Math.max(6, ((c - minComp) / (maxComp - minComp)) * 100);
              return (
                <div key={w.week} className="col" title={w.week + ": " + w.met + " of " + w.eligible + " met, mean " + w.mean + " min"}>
                  <span className="v">{c.toFixed(1)}</span>
                  <div className={"bar" + (w.met < w.eligible ? " warn" : "")} style={{ height: h + "%" }} />
                  <span className="x">{fmtKey(w.week.slice(8)).split(" ").slice(1).join(" ")}</span>
                </div>
              );
            })}
          </div>
          <div className="tu-small tu-faint" style={{ marginTop: 8 }}>Amber bars are weeks with at least one missed target. Week labels show the Monday.</div>
        </Card>
        <Card title="By site" pad={false}>
          <table className="tu-table">
            <thead><tr><th>Site</th><th className="num">Eligible</th><th className="num">Met</th><th className="num">Compliance</th></tr></thead>
            <tbody>{r.bySite.map((s) => <tr key={s.siteId}><td><Ref type="site" id={s.siteId} /></td><td className="num">{num(s.eligible)}</td><td className="num">{num(s.met)}</td><td className="num">{(s.met / s.eligible * 100).toFixed(1)}%</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
      <div className="tu-split">
        <Card title="Missed targets" sub="The 10 tickets that missed their response target in the period" pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Ticket</th><th>Date</th><th>Site</th><th>Priority</th><th>Issue</th><th className="num">Response</th><th className="num">Target</th></tr></thead>
              <tbody>{r.missedRows.map((m) => (
                <tr key={m.id}><td className="tu-mono" style={{ whiteSpace: "nowrap" }}>{m.id}</td><td style={{ whiteSpace: "nowrap" }}>{fmtDate(m.at)}</td><td style={{ whiteSpace: "nowrap" }}>{labelOf(db, "site", m.siteId)}</td>
                  <td><TicketPriorityBadge p={m.priority} /></td><td>{m.title}</td><td className="num" style={{ color: "var(--bad)" }}>{fmtDuration(m.responseMins)}</td><td className="num">{fmtDuration(m.targetMins)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <Card title="By priority" pad={false}>
          <table className="tu-table">
            <thead><tr><th>Priority</th><th className="num">Target</th><th className="num">Eligible</th><th className="num">Missed</th><th className="num">Mean</th></tr></thead>
            <tbody>{r.byPriority.map((p) => (
              <tr key={p.priority}><td><TicketPriorityBadge p={p.priority} /></td><td className="num">{fmtDuration(SLA_TARGET[p.priority])}</td><td className="num">{num(p.eligible)}</td><td className="num">{p.eligible - p.met}</td><td className="num">{p.mean} min</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </Page>
  );
}

/* ── Knowledge ───────────────────────────────────────────────────── */
function Knowledge() {
  const db = useDB();
  const r = useRoute();
  const [q, setQ] = useState("");
  const list = db.runbooks.filter((k) => !q || (k.title + " " + k.summary + " " + k.assetTypes.join(" ") + " " + k.steps.join(" ")).toLowerCase().includes(q.toLowerCase()));
  const selId = r.query.kb || (list[0] && list[0].id);
  const k = db.runbooks.find((x) => x.id === selId);
  const relatedAssets = useMemo(() => k ? db.assets.filter((a) => k.assetTypes.includes(a.type) && (AQC_SITES.includes(a.siteId) || a.siteId === "S-CIH" || (a.type === "Fibre cabinet" || a.type === "Monitoring gateway"))) : [], [db, k]);
  const relatedTickets = k ? db.tickets.filter((t) => t.runbookId === k.id) : [];
  return (
    <Page title="Knowledge" eyebrow="24/7 Helpdesk" sub="Internal runbooks for coordinating a response. They describe who does what and when, not technical procedures, which stay in controlled documents.">
      <div className="tu-split-r">
        <Card pad={false} title={<Search value={q} onChange={setQ} placeholder="Search runbooks" />}>
          <div className="tu-list" role="listbox" aria-label="Runbooks">
            {list.map((x) => (
              <button key={x.id} role="option" aria-selected={x.id === selId} className="tu-rowbtn" style={{ alignItems: "flex-start", background: x.id === selId ? "var(--accent-faint)" : undefined }}
                onClick={() => navigate("/helpdesk/knowledge?kb=" + x.id, { replace: true })}>
                <Icon name="doc" size={15} style={{ marginTop: 2 }} />
                <span className="tu-grow"><span style={{ fontWeight: 600, display: "block" }}>{x.title}</span><span className="tu-small tu-muted">{x.summary}</span></span>
                <span className="tu-small tu-faint">{x.version}</span>
              </button>
            ))}
            {!list.length && <Empty title="No runbooks match">Try “cooling”, “UPS” or “escalation”.</Empty>}
          </div>
        </Card>
        {k ? (
          <Card title={k.title} sub={k.id + " · " + k.version + " · owner " + nameOf(db, k.ownerId) + " · review " + fmtDate(k.reviewAt)}>
            <p style={{ marginTop: 0 }}>{k.summary}</p>
            <div className="tu-eyebrow" style={{ marginBottom: 8 }}>Coordination checklist</div>
            <ol className="hd-steps">{k.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <div className="tu-section">
              <div className="tu-eyebrow">Related tickets · {relatedTickets.length}</div>
              {relatedTickets.length ? relatedTickets.map((t) => <div key={t.id} className="tu-row" style={{ padding: "4px 0" }}><TicketPriorityBadge p={t.priority} /><Ref type="ticket" id={t.id} /><TicketStatusBadge t={t} /></div>) : <div className="tu-small tu-muted">No tickets currently reference this runbook.</div>}
            </div>
            <div className="tu-section">
              <div className="tu-eyebrow">Related assets · {relatedAssets.length}{k.assetTypes.length ? " (" + k.assetTypes.join(", ") + ")" : ""}</div>
              {relatedAssets.length ? (
                <div className="tu-row tu-wrap" style={{ gap: 6 }}>
                  {relatedAssets.slice(0, 12).map((a) => <Btn key={a.id} size="xs" onClick={() => openRef("asset", a.id)}>{a.name.split(" ")[0]} · {labelOf(db, "site", a.siteId)}</Btn>)}
                  {relatedAssets.length > 12 && <Btn size="xs" kind="ghost" onClick={() => navigate("/sites/assets")}>+{relatedAssets.length - 12} in Asset Register</Btn>}
                </div>
              ) : <div className="tu-small tu-muted">Applies to any site.</div>}
            </div>
          </Card>
        ) : <Card><Empty title="Choose a runbook" /></Card>}
      </div>
    </Page>
  );
}
