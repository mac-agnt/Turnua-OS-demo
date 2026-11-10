/* Approval detail: reason, evidence, downstream effect and a deliberate decision. */
import { useState } from "react";
import type { ID } from "../types";
import { useDB } from "../store";
import { closeOverlay } from "../ui";
import { decideApproval } from "../actions";
import { Badge, Btn, Drawer, Field, Icon, KV, PersonLink, Ref, openRef } from "../kit";
import { eur, fmtDate, fmtDateTime, ago } from "../time";
import { project, approvedVariations } from "../selectors";

export function ApprovalDrawer({ ok, id }: { ok: string; id: ID }) {
  const db = useDB();
  const a = db.approvals.find((x) => x.id === id);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"" | "Approved" | "Rejected">("");
  if (!a) return <Drawer ok={ok} title="Approval not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">It may have been cleared by a demo reset.</p></Drawer>;
  const p = project(db, a.projectId);
  const change = a.sourceType === "change" ? db.changes.find((c) => c.id === a.sourceId) : undefined;
  const permit = a.sourceType === "permit" ? db.permits.find((x) => x.id === a.sourceId) : undefined;
  const training = a.sourceType === "training" ? db.training.find((x) => x.id === a.sourceId) : undefined;
  const tasks = db.tasks.filter((t) => t.approvalId === a.id);
  const agent = db.agents.find((x) => x.id === a.agentId);
  const tone = a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "warn";
  const decide = (d: "Approved" | "Rejected") => { if (decideApproval(a.id, d, note.trim())) setConfirm(""); };
  const original = p?.contractValue || 0;
  const approvedVar = p ? approvedVariations(db, p.id) : 0;

  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow={a.id + " · " + a.kind}
      badges={<Badge tone={tone} icon={a.status === "Approved" ? "ok" : a.status === "Rejected" ? "x" : "clock"}>{a.status}</Badge>}
      title={a.title}
      footer={a.status !== "Pending" ? (
        <span className="tu-small tu-muted">Decided {fmtDateTime(a.decidedAt)}{a.note ? ": “" + a.note + "”" : ""}. Decisions are final in this demo; the audit trail keeps the history.</span>
      ) : confirm ? (
        <>
          <span className="tu-grow" style={{ fontSize: 13 }}>{confirm === "Approved" ? "Approve" : "Reject"} <b>{a.title}</b>? This updates the source record and writes to the audit log.</span>
          <Btn onClick={() => setConfirm("")}>Back</Btn>
          <Btn kind={confirm === "Approved" ? "primary" : "danger"} data-autofocus onClick={() => decide(confirm)}>Confirm {confirm === "Approved" ? "approval" : "rejection"}</Btn>
        </>
      ) : (
        <>
          <span className="tu-grow tu-small tu-muted">Approver: David Cox</span>
          <Btn kind="danger" onClick={() => setConfirm("Rejected")}>Reject</Btn>
          <Btn kind="primary" icon="check" onClick={() => setConfirm("Approved")}>Approve</Btn>
        </>
      )}>
      <KV items={[
        ["Requested by", <PersonLink id={a.requestedById} />],
        ["Requested", ago(a.requestedAt)],
        ["Amount", a.amount ? eur(a.amount) + " excl. VAT" : "No amount"],
        ["Decision due", fmtDate(a.dueAt)],
        ["Project", p ? <Ref type="project" id={p.id} /> : "Not project-specific"],
        ["Raised via", agent ? <Ref type="agent" id={agent.id}>{agent.name} agent</Ref> : "Person"],
      ]} />
      <div className="tu-section">
        <div className="tu-eyebrow">Why</div>
        <div className="tu-note">{a.reason}</div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Downstream effect</div>
        <div className="tu-note accent">{a.effect}</div>
      </div>
      {change && change.kind === "Variation" && p && (
        <div className="tu-section">
          <div className="tu-eyebrow">Contract values</div>
          <KV items={[
            ["Original contract", eur(original)],
            ["Approved variations", eur(approvedVar)],
            ["Current contract", eur(original + approvedVar)],
            ["If approved", eur(original + approvedVar + (a.status === "Pending" ? change.amount || 0 : 0))],
          ]} />
        </div>
      )}
      {change && change.kind === "Recovery proposal" && p && (
        <div className="tu-section">
          <div className="tu-eyebrow">Programme</div>
          <KV items={[["Baseline handover", fmtDate(p.baselineFinish)], ["Forecast now", fmtDate(p.forecastFinish)], ["Recovery target", fmtDate(p.scenario?.finish)], ["Scenario state", p.scenario?.state || "None"]]} />
          <p className="tu-small tu-muted" style={{ marginTop: 8 }}>Approval authorises the plan and its cost. It does not deliver the containment package or complete any work.</p>
        </div>
      )}
      {permit && (
        <div className="tu-section">
          <div className="tu-note warn">
            <b>This approves the escalation only.</b> {permit.authority} decides licence {permit.id} (due {fmtDate(permit.decisionDueAt)}). When a decision arrives, record it on the permit with its reference and source.
            <div style={{ marginTop: 8 }}><Btn size="sm" icon="shield" onClick={() => openRef("permit", permit.id)}>Open {permit.id} ({permit.status})</Btn></div>
          </div>
        </div>
      )}
      {training && (
        <div className="tu-section">
          <div className="tu-note">{training.course} with {training.provider} on {fmtDateTime(training.date)}. Booking does not renew the credential; renewal evidence is still needed afterwards.</div>
        </div>
      )}
      <div className="tu-section">
        <div className="tu-eyebrow">Source and evidence</div>
        <div className="tu-row tu-wrap" style={{ gap: 8 }}>
          <Btn size="sm" icon="link" onClick={() => openRef(a.sourceType, a.sourceId)}>Source: {a.sourceId}</Btn>
          {a.evidenceDocIds.map((d) => <Btn key={d} size="sm" icon="doc" onClick={() => openRef("doc", d)}>{db.docs.find((x) => x.id === d)?.title || d}</Btn>)}
          {tasks.map((t) => <Btn key={t.id} size="sm" icon="check" onClick={() => openRef("task", t.id)}>Task: {t.title} ({t.status})</Btn>)}
        </div>
      </div>
      {a.status === "Pending" && (
        <div className="tu-section">
          <Field label="Decision note (optional)"><textarea className="tu-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded with the decision in the audit log" /></Field>
        </div>
      )}
      <div className="tu-section tu-small tu-faint"><Icon name="shield" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Human approval is required for commercial changes, recovery plans, shift changes, training bookings and external communication (Settings, Governance &amp; AI).</div>
    </Drawer>
  );
}
