/* Agents: Runs and Approvals tabs plus the agent detail drawer. Directory reuses the Pulse agent UI. */
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Agent, AgentRun, DB, ID } from "../../types";
import { useDB, update, getDB } from "../../store";
import { closeOverlay, openApproval, openOverlay, useRoute, navigate, toast } from "../../ui";
import { decideApproval, log } from "../../actions";
import { runAgent, clientReport } from "../../agents";
import { Badge, Btn, Card, Drawer, Empty, Field, Icon, Page, PersonLink, Ref, Select, Stat, download, openRef } from "../../kit";
import { ago, eur, fmtDate, fmtDateTime, hhmm, relDay } from "../../time";
import { isUnresolved } from "../../selectors";
import AgentFace from "../../../components/AgentFace";
import "./agents.css";

const SCHEDULES = ["Weekdays 07:00", "Daily 06:30", "Mondays 06:00", "Hourly", "On record change", "On new P1 or P2 ticket", "On slip over 7 days", "On request"];
const CONNECTED: Record<string, string[]> = {
  briefing: ["Projects", "Approvals", "Tickets", "Calendar events", "Change requests", "Tasks"],
  watchdog: ["Tasks", "Permits", "Dependencies", "SLA cycles", "Approvals"],
  recovery: ["Projects", "Purchase orders", "Phases", "Change requests", "Allocations"],
  workforce: ["People", "Credentials", "Calendar events", "Allocations", "Skills"],
  compliance: ["Credentials", "Training requests", "Permits", "RAMS", "Tasks"],
  triage: ["Tickets", "Sites", "Assets", "Runbooks", "On-call events"],
  commercial: ["Projects", "Change requests", "Valuations", "Purchase orders"],
  reporting: ["Clients", "Projects", "Milestones", "Risks", "SLA report", "Reports"],
};

/** Run an agent from this module, honouring Governance & AI: when agents may not
    draft tasks, any task a run drafted is withheld and the run says so. */
export function runGoverned(agentId: ID, arg?: string): string {
  const before = new Set(getDB().tasks.map((t) => t.id));
  const runId = runAgent(agentId, arg, "Manual");
  if (!getDB().settings.governance.agentsCanDraftTasks) {
    const created = getDB().tasks.filter((t) => !before.has(t.id)).map((t) => t.id);
    if (created.length) update((d) => {
      d.tasks = d.tasks.filter((t) => !created.includes(t.id));
      const r = d.runs.find((x) => x.id === runId);
      if (r) r.actions = r.actions.map((a) => (a.kind === "task" && a.refId && created.includes(a.refId) ? { label: "Draft task withheld: agents may not draft tasks (Governance & AI)", kind: "none" as const } : a));
      d.activity = d.activity.filter((x) => !(x.sourceType === "task" && created.includes(x.sourceId)));
      log(d, { actorType: "system", actorId: "governance", actor: "Governance policy", text: "Withheld " + created.length + " draft task(s) from " + (d.agents.find((x) => x.id === agentId)?.name || agentId) + ": agents may not draft tasks", sourceType: "run", sourceId: runId, category: "Agents" });
    });
  }
  return runId;
}

export function agentStatus(db: DB, a: Agent): { state: string; label: string; tone: "ok" | "warn" | "bad" | "accent" | "" } {
  if (!a.enabled) return { state: "idle", label: "Paused", tone: "" };
  const pending = db.approvals.some((x) => x.agentId === a.id && x.status === "Pending");
  if (a.id === "triage" && db.tickets.some((t) => isUnresolved(t) && t.priority === "P1")) return { state: "working", label: "Live P1 open", tone: "bad" };
  if (pending) return { state: "waiting", label: "Waiting on approval", tone: "warn" };
  const last = db.runs.find((r) => r.agentId === a.id);
  if (!last) return { state: "idle", label: "No runs yet", tone: "" };
  return { state: "complete", label: "Up to date", tone: "ok" };
}

/** Approval state for actions a run prepared. */
function approvalStates(db: DB, r: AgentRun): string {
  const ids = r.actions.filter((x) => x.kind === "approval" && x.refId).map((x) => x.refId!);
  if (!ids.length) return "None";
  return ids.map((id) => { const a = db.approvals.find((x) => x.id === id); return id + " " + (a ? a.status.toLowerCase() : "unknown"); }).join(", ");
}

function RunActions({ r }: { r: AgentRun }) {
  const db = useDB();
  if (!r.actions.length) return <span className="tu-small tu-muted">No actions prepared.</span>;
  return (
    <div className="tu-row tu-wrap" style={{ gap: 8 }}>
      {r.actions.map((x, i) => {
        if (x.kind === "approval" && x.refId) {
          const a = db.approvals.find((y) => y.id === x.refId);
          return <Btn key={i} size="sm" icon="check" onClick={() => openApproval(x.refId!)}>{x.label}{a ? " · " + a.status : ""}</Btn>;
        }
        if (x.kind === "task" && x.refId) return <Btn key={i} size="sm" icon="list" onClick={() => openRef("task", x.refId!)}>{x.label}</Btn>;
        if (x.kind === "report" && x.refId) return <Btn key={i} size="sm" icon="doc" onClick={() => openRef("report", x.refId!)}>{x.label}</Btn>;
        if (/capacity/i.test(x.label)) return <Btn key={i} size="sm" icon="user" onClick={() => navigate("/people/capacity")}>{x.label}</Btn>;
        if (/approvals/i.test(x.label)) return <Btn key={i} size="sm" icon="check" onClick={() => navigate("/work/approvals")}>{x.label}</Btn>;
        return <Badge key={i} tone="outline">{x.label}</Badge>;
      })}
    </div>
  );
}

function RunBody({ r }: { r: AgentRun }) {
  const db = useDB();
  const unchanged = /No change since the previous run/.test(r.limitations);
  return (
    <div className="tu-stack" style={{ gap: 12 }}>
      {unchanged && <div className="tu-note accent">No change since the previous run. No new proposals were created.</div>}
      <ul className="ag-lines">{r.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div>
        <div className="tu-eyebrow" style={{ marginBottom: 6 }}>Sources</div>
        {!db.settings.governance.agentsShowSources ? <span className="tu-small tu-muted">Source display is switched off in Governance &amp; AI.</span> : r.sources.length ? (
          <div className="tu-row tu-wrap" style={{ gap: 8 }}>{r.sources.map((s, i) => <Btn key={i} size="xs" icon="link" onClick={() => openRef(s.type, s.id)}>{s.label}</Btn>)}</div>
        ) : <span className="tu-small tu-muted">Computed across all current records.</span>}
      </div>
      <div><div className="tu-eyebrow" style={{ marginBottom: 6 }}>Actions prepared</div><RunActions r={r} /></div>
      <div className="tu-small tu-muted">Confidence {r.confidence.toLowerCase()}. {r.limitations.replace(" No change since the previous run.", "")}</div>
    </div>
  );
}

/* ── agent detail drawer ─────────────────────────────────────────── */
export function AgentDetailDrawer({ ok, id }: { ok: string; id: ID }) {
  const db = useDB();
  const a = db.agents.find((x) => x.id === id);
  const [request, setRequest] = useState("");
  const [clientId, setClientId] = useState("CL-NBI");
  const [freshId, setFreshId] = useState<string | null>(null);
  if (!a) return <Drawer ok={ok} title="Agent not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">This agent is not installed in the demo workspace.</p></Drawer>;
  const runs = db.runs.filter((r) => r.agentId === a.id);
  const fresh = freshId ? db.runs.find((r) => r.id === freshId) : undefined;
  const st = agentStatus(db, a);
  const setAgent = (patch: Partial<Agent>, text: string) => update((d) => {
    const x = d.agents.find((y) => y.id === a.id);
    if (!x) return;
    const audit = Object.keys(patch).map((k) => ({ field: k === "enabled" ? "Enabled" : "Schedule", before: String((x as unknown as Record<string, unknown>)[k]), after: String((patch as Record<string, unknown>)[k]) }));
    Object.assign(x, patch);
    log(d, { text, sourceType: "agent", sourceId: a.id, category: "Agents", audit });
  });
  const run = () => {
    if (!a.enabled) { toast(a.name + " is paused. Enable it to run.", "warn"); return; }
    const arg = a.id === "reporting" ? clientId : a.id === "workforce" ? (request.trim() || undefined) : undefined;
    setFreshId(runGoverned(a.id, arg));
  };
  const report = fresh && a.id === "reporting" ? db.reports.find((r) => fresh.actions.some((x) => x.refId === r.id)) : undefined;
  const reportText = (() => {
    if (a.id !== "reporting") return "";
    const r = report || clientReport(db, clientId, Date.now());
    return [r.title, "", ...r.lines, "", "Draft prepared in the Turnua OS demo workspace. Not sent to the client."].join("\n");
  })();
  return (
    <Drawer ok={ok} wide onClose={() => closeOverlay(ok)} eyebrow="Agent"
      badges={<Badge tone={st.tone}>{st.label}</Badge>}
      title={<span className="tu-row" style={{ gap: 12 }}><AgentFace shape={a.shape} state={st.state} tint={a.tint} size="38" /><span>{a.name}</span></span>}
      footer={<>
        <span className="tu-grow tu-small tu-muted">Runs read local records only. Proposals wait for a human decision.</span>
        <Btn onClick={() => { closeOverlay(ok); navigate("/agents/runs?agent=" + a.id); }}>All runs</Btn>
        <Btn kind="primary" icon="play" onClick={run} disabled={!a.enabled}>Run now</Btn>
      </>}>
      <div className="tu-note">{a.purpose}</div>
      <div className="tu-section tu-grid tu-g2" style={{ gap: 12 }}>
        <Field label="Schedule (demo)">
          <select className="tu-select" value={a.schedule} onChange={(e) => setAgent({ schedule: e.target.value }, "Changed " + a.name + " schedule to " + e.target.value)}>
            {Array.from(new Set([a.schedule, ...SCHEDULES])).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <div className="tu-field">
          <span>Status</span>
          <button className="ag-switch" role="switch" aria-checked={a.enabled} onClick={() => setAgent({ enabled: !a.enabled }, (a.enabled ? "Paused " : "Enabled ") + a.name)}>
            <span className="ag-track" data-on={a.enabled ? "1" : "0"}><span className="ag-knob" /></span>
            {a.enabled ? "Enabled" : "Paused"}
          </button>
        </div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Trigger</div>
        <div>{a.trigger}</div>
      </div>
      {a.id === "workforce" && (
        <div className="tu-section">
          <Field label="Request (optional)" help="The planner checks the next Thursday by default and notes your request on the run.">
            <input className="tu-input" value={request} placeholder="e.g. qualified cover for Hall 4 MEWP work" onChange={(e) => setRequest(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
          </Field>
        </div>
      )}
      {a.id === "reporting" && (
        <div className="tu-section">
          <div className="tu-row tu-wrap" style={{ gap: 10, alignItems: "flex-end" }}>
            <Field label="Client">
              <select className="tu-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {db.clients.filter((c) => db.projects.some((p) => p.clientId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Btn icon="copy" onClick={() => { navigator.clipboard?.writeText(reportText).then(() => toast("Report copied"), () => toast("Copy blocked by the browser", "warn")); }}>Copy</Btn>
            <Btn icon="dl" onClick={() => { download("client-report-" + clientId + ".txt", reportText); toast("Report downloaded"); }}>Download</Btn>
          </div>
          <p className="tu-small tu-muted" style={{ marginBottom: 0 }}>Run now saves a local draft. Nothing is emailed to the client.</p>
        </div>
      )}
      {fresh && (
        <div className="tu-section">
          <div className="tu-eyebrow">Fresh output · {hhmm(fresh.at)}</div>
          <Card title={fresh.headline}><RunBody r={fresh} /></Card>
        </div>
      )}
      <div className="tu-section tu-grid tu-g2" style={{ gap: 12 }}>
        <div><div className="tu-eyebrow">Inputs</div><ul className="ag-lines">{a.inputs.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><div className="tu-eyebrow">Boundaries</div><ul className="ag-lines">{a.boundaries.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Connected record types</div>
        <div className="tu-row tu-wrap" style={{ gap: 6 }}>{(CONNECTED[a.id] || []).map((x) => <Badge key={x} tone="outline">{x}</Badge>)}</div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Recent runs · {runs.length}</div>
        {runs.length ? (
          <div className="tu-card" style={{ borderRadius: 12 }}>
            {runs.slice(0, 5).map((r) => (
              <div key={r.id} className="tu-li" style={{ display: "block" }}>
                <div className="tu-row">
                  <b className="tu-grow tu-ellipsis">{r.headline}</b>
                  <span className="tu-small tu-faint">{relDay(r.at)} {hhmm(r.at)} · {r.trigger}</span>
                </div>
                <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 6 }}>
                  {r.sources.map((s, i) => <Ref key={i} type={s.type} id={s.id} className="tu-small">{s.label}</Ref>)}
                  <button className="tu-link tu-small" onClick={() => { closeOverlay(ok); navigate("/agents/runs?run=" + r.id); }}>Open run</button>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title="No runs yet">Run the agent to produce its first output.</Empty>}
      </div>
    </Drawer>
  );
}

/* ── runs tab ────────────────────────────────────────────────────── */
function AgentStrip() {
  const db = useDB();
  return (
    <div className="ag-strip" role="list" aria-label="All eight agents">
      {db.agents.map((a) => {
        const st = agentStatus(db, a);
        const last = db.runs.find((r) => r.agentId === a.id);
        return (
          <div key={a.id} role="listitem" className="tu-card tu-click ag-card" tabIndex={0}
            onClick={() => openOverlay({ kind: "agent", id: a.id })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openOverlay({ kind: "agent", id: a.id }); } }}>
            <div className="tu-row" style={{ alignItems: "flex-start" }}>
              <AgentFace shape={a.shape} state={st.state} tint={a.tint} size="34" />
              <div className="tu-grow">
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div className="tu-small tu-muted">{last ? "Last run " + ago(last.at) : "No runs yet"}</div>
              </div>
            </div>
            <div className="tu-small ag-purpose">{a.purpose}</div>
            <div className="tu-small ag-preview">{last ? last.headline : "Run to see output"}</div>
            <div className="tu-row" style={{ marginTop: "auto" }}>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span className="tu-grow" />
              <Btn size="xs" icon="play" disabled={!a.enabled} onClick={(e) => { e.stopPropagation(); runGoverned(a.id, a.id === "reporting" ? "CL-NBI" : undefined); }} aria-label={"Run " + a.name + " now"}>Run now</Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunsTab() {
  const db = useDB();
  const r = useRoute();
  const [agentF, setAgentF] = useState(r.query.agent || "all");
  const [trigF, setTrigF] = useState("all");
  const [open, setOpen] = useState<string | null>(r.query.run || null);
  const [runWhich, setRunWhich] = useState("briefing");
  useEffect(() => { if (r.query.run) setOpen(r.query.run); if (r.query.agent) setAgentF(r.query.agent); }, [r.query.run, r.query.agent]);
  useEffect(() => {
    if (!r.query.run) return;
    const t = setTimeout(() => document.getElementById("run-" + r.query.run)?.scrollIntoView({ block: "center" }), 80);
    return () => clearTimeout(t);
  }, [r.query.run]);
  const rows = db.runs.filter((x) => (agentF === "all" || x.agentId === agentF) && (trigF === "all" || x.trigger === trigF));
  const today = db.runs.filter((x) => relDay(x.at) === "Today").length;
  const proposals = db.approvals.filter((a) => a.agentId);
  return (
    <Page title="Agent runs" sub="Every run reads the current records, cites its sources and prepares actions for a person to decide."
      actions={<>
        <Select label="Agent to run" value={runWhich} onChange={setRunWhich} options={db.agents.map((a) => [a.id, a.name] as [string, string])} />
        <Btn kind="primary" icon="play" onClick={() => { const id = runGoverned(runWhich, runWhich === "reporting" ? "CL-NBI" : undefined); setAgentF("all"); setOpen(id); }}>Run now</Btn>
      </>}>
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Agents installed" value={db.agents.length} sub={db.agents.filter((a) => a.enabled).length + " enabled"} />
        <Stat label="Runs recorded" value={db.runs.length} sub={today + " today"} />
        <Stat label="Proposals from agents" value={proposals.length} sub={proposals.filter((a) => a.status === "Pending").length + " waiting for a decision"} onClick={() => navigate("/agents/approvals")} />
        <Stat label="External actions" value="0" sub="Demo-only execution, nothing sent" />
      </div>
      <AgentStrip />
      <Card pad={false} style={{ marginTop: 14 }}
        title="Run history" sub={rows.length + " runs"}
        right={<div className="tu-row tu-wrap" style={{ gap: 8 }}>
          <Select label="Filter by agent" value={agentF} onChange={setAgentF} options={[["all", "All agents"] as [string, string], ...db.agents.map((a) => [a.id, a.name] as [string, string])]} />
          <Select label="Filter by trigger" value={trigF} onChange={setTrigF} options={[["all", "All triggers"], ["Schedule", "Schedule"], ["Manual", "Manual"], ["Record change", "Record change"]]} />
        </div>}>
        {rows.length ? (
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>When</th><th>Agent</th><th>Trigger</th><th>Result</th><th className="num">Sources</th><th>Confidence</th><th>Actions prepared</th><th>Approval state</th><th aria-label="Expand" /></tr></thead>
              <tbody>
                {rows.map((x) => {
                  const a = db.agents.find((y) => y.id === x.agentId);
                  const isOpen = open === x.id;
                  return (
                    <Fragment key={x.id}>
                      <tr id={"run-" + x.id} className={"click" + (isOpen ? " ag-open" : "")} onClick={() => setOpen(isOpen ? null : x.id)}
                        tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : x.id); } }} aria-expanded={isOpen}>
                        <td style={{ whiteSpace: "nowrap" }}>{relDay(x.at)} {hhmm(x.at)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{a ? <span className="tu-row" style={{ gap: 8 }}><AgentFace shape={a.shape} state={agentStatus(db, a).state} tint={a.tint} size="22" />{a.name}</span> : x.agentId}</td>
                        <td>{x.trigger}</td>
                        <td style={{ minWidth: 240 }}>{x.headline}{/No change since/.test(x.limitations) && <span className="tu-small tu-muted"> · no change</span>}</td>
                        <td className="num">{x.sources.length}</td>
                        <td><Badge tone={x.confidence === "High" ? "ok" : x.confidence === "Medium" ? "warn" : "bad"}>{x.confidence}</Badge></td>
                        <td>{x.actions.length}</td>
                        <td className="tu-small" style={{ minWidth: 150 }}>{approvalStates(db, x)}</td>
                        <td><Icon name={isOpen ? "chevU" : "chevD"} size={13} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="ag-detail"><td colSpan={9}><RunBody r={x} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No runs match these filters" action={<Btn onClick={() => { setAgentF("all"); setTrigF("all"); }}>Clear filters</Btn>} />}
      </Card>
    </Page>
  );
}

/* ── approvals tab ───────────────────────────────────────────────── */
function ApprovalsTab() {
  const db = useDB();
  const [confirm, setConfirm] = useState<{ id: string; d: "Approved" | "Rejected" } | null>(null);
  const [note, setNote] = useState("");
  const list = useMemo(() => db.approvals.filter((a) => a.agentId)
    .sort((a, b) => Number(a.status !== "Pending") - Number(b.status !== "Pending") || Date.parse(b.requestedAt) - Date.parse(a.requestedAt)), [db.approvals]);
  const pending = list.filter((a) => a.status === "Pending");
  return (
    <Page title="Agent approvals" sub="Proposals raised by agents. The same records appear in Work, Approvals; deciding here updates the source record and the audit log.">
      <div className="tu-grid tu-g3" style={{ marginBottom: 14 }}>
        <Stat label="Waiting for a decision" value={pending.length} tone={pending.length ? "warn" : undefined} />
        <Stat label="Decided" value={list.length - pending.length} />
        <Stat label="All approvals (any source)" value={db.approvals.length} sub="Open Work, Approvals" onClick={() => navigate("/work/approvals")} />
      </div>
      {list.length ? (
        <div className="tu-stack">
          {list.map((a) => {
            const ag = db.agents.find((x) => x.id === a.agentId);
            const isConf = confirm?.id === a.id;
            return (
              <Card key={a.id}
                title={<button className="tu-link" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 14 }} onClick={() => openApproval(a.id)}>{a.title}</button>}
                sub={a.id + " · " + a.kind + " · proposed via " + (ag?.name || "agent") + " · requested " + ago(a.requestedAt)}
                right={<Badge tone={a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "warn"} icon={a.status === "Pending" ? "clock" : a.status === "Approved" ? "ok" : "x"}>{a.status}</Badge>}>
                <div className="tu-grid tu-g2" style={{ gap: 12 }}>
                  <div><div className="tu-eyebrow" style={{ marginBottom: 4 }}>Why</div><div>{a.reason}</div></div>
                  <div><div className="tu-eyebrow" style={{ marginBottom: 4 }}>Effect</div><div>{a.effect}</div></div>
                </div>
                <div className="tu-row tu-wrap" style={{ marginTop: 12, gap: 8 }}>
                  <span className="tu-small tu-muted">Requested by <PersonLink id={a.requestedById} showAvatar={false} /> · {a.amount ? eur(a.amount) : "No amount"} · due {fmtDate(a.dueAt)}</span>
                  <span className="tu-grow" />
                  <Btn size="sm" icon="link" onClick={() => openRef(a.sourceType, a.sourceId)}>Source {a.sourceId}</Btn>
                  {a.status === "Pending" ? (
                    isConf ? null : <>
                      <Btn size="sm" kind="danger" onClick={() => { setConfirm({ id: a.id, d: "Rejected" }); setNote(""); }}>Reject</Btn>
                      <Btn size="sm" kind="primary" icon="check" onClick={() => { setConfirm({ id: a.id, d: "Approved" }); setNote(""); }}>Approve</Btn>
                    </>
                  ) : <span className="tu-small tu-muted">Decided {fmtDateTime(a.decidedAt)}{a.note ? ": “" + a.note + "”" : ""}</span>}
                </div>
                {isConf && confirm && (
                  <div className="tu-note warn" style={{ marginTop: 12 }}>
                    <div style={{ marginBottom: 8 }}>{confirm.d === "Approved" ? "Approve" : "Reject"} <b>{a.title}</b>? This updates the source record and writes to the audit log.{a.sourceType === "permit" ? " Approving an escalation does not grant the licence; the authority decides." : ""}</div>
                    <input className="tu-input" aria-label="Decision note (optional)" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="tu-row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                      <Btn size="sm" onClick={() => setConfirm(null)}>Back</Btn>
                      <Btn size="sm" kind={confirm.d === "Approved" ? "primary" : "danger"} onClick={() => { if (decideApproval(a.id, confirm.d, note.trim())) setConfirm(null); }}>Confirm {confirm.d === "Approved" ? "approval" : "rejection"}</Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : <Empty title="No agent proposals yet">Run Ops Watchdog or Programme Recovery to prepare proposals.</Empty>}
    </Page>
  );
}

export default function AgentsModule({ tab }: { tab: string }) {
  if (tab === "approvals") return <ApprovalsTab />;
  return <RunsTab />;
}
