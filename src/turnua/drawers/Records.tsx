/* Generic record drawers: documents, permits, changes, credentials, suppliers and
   the rest of the typed register, plus ontology chains and small dialogs. */
import { useState, type ReactNode } from "react";
import type { ID, Project } from "../types";
import { useDB } from "../store";
import { closeOverlay, navigate, openOverlay, type Overlay } from "../ui";
import { recordPermitDecision, createProject } from "../actions";
import { Badge, Btn, Drawer, Field, HealthBadge, Icon, KV, Modal, PersonLink, Progress, Ref, download, openRef } from "../kit";
import { at, ago, eur, fmtDate, fmtDateTime, pct, addDays, todayKey } from "../time";
import { credState, isOpen, milestoneState, nameOf, project, approvedVariations, labelOf } from "../selectors";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="tu-section"><div className="tu-eyebrow">{title}</div>{children}</div>
);
const Links = ({ items }: { items: { type: string; id: ID; label?: string }[] }) => (
  <div className="tu-row tu-wrap" style={{ gap: 8 }}>{items.map((x, i) => <Btn key={i} size="sm" icon="link" onClick={() => openRef(x.type, x.id)}>{x.label || x.id}</Btn>)}</div>
);

export function DocDrawer({ ok, id }: { ok: string; id: ID }) {
  const db = useDB();
  const d = db.docs.find((x) => x.id === id);
  if (!d) return <Drawer ok={ok} title="Document not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">This document is not in the demo records.</p></Drawer>;
  const exp = () => download(d.id + "-" + d.version.replace(/\s+/g, "") + ".txt",
    [d.title, d.type + " · " + d.version + " · " + d.status, "Owner: " + nameOf(db, d.ownerId) + " · Updated " + fmtDate(d.updatedAt), "", ...d.body, "", "Turnua OS demo workspace: mock document export."].join("\n"));
  return (
    <Drawer ok={ok} wide onClose={() => closeOverlay(ok)} eyebrow={d.id + " · " + d.type} badges={<Badge tone={d.status === "Approved" || d.status === "Issued" ? "ok" : d.status === "In review" ? "warn" : ""}>{d.status}</Badge>} title={d.title}
      footer={<><span className="tu-grow tu-small tu-muted">Preview of a seeded demo document. Download gives a mock text copy.</span><Btn icon="dl" onClick={exp}>Download</Btn>{d.projectId && <Btn kind="navy" onClick={() => openRef("project", d.projectId!)}>Open project</Btn>}</>}>
      <KV items={[["Version", d.version], ["Owner", <PersonLink id={d.ownerId} />], ["Updated", fmtDate(d.updatedAt)], ["Review", d.reviewAt ? fmtDate(d.reviewAt) : "Not set"]]} />
      <Section title="Preview">
        <article style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 26px", lineHeight: 1.65, boxShadow: "0 8px 30px rgba(8,19,42,.06)" }}>
          <div className="tu-row" style={{ marginBottom: 14 }}>
            <img src="/turnua-mark.svg" alt="" width={12} height={15} style={{ filter: "brightness(.25)" }} />
            <span className="tu-eyebrow">Turnua · {d.type}</span><span className="tu-grow" /><span className="tu-small tu-faint">{d.version}</span>
          </div>
          <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>{d.title}</h3>
          {d.body.map((line, i) => <p key={i} style={{ margin: "0 0 8px", fontSize: 13.5 }}>{line}</p>)}
        </article>
      </Section>
      {(d.links.length > 0 || d.siteId || d.projectId) && (
        <Section title="Linked records">
          <Links items={[...(d.projectId ? [{ type: "project", id: d.projectId, label: labelOf(db, "project", d.projectId) }] : []), ...(d.siteId ? [{ type: "site", id: d.siteId, label: labelOf(db, "site", d.siteId) }] : []), ...d.links.map((l) => ({ type: l.type, id: l.id, label: labelOf(db, l.type, l.id) }))]} />
        </Section>
      )}
    </Drawer>
  );
}

function PermitDecision({ id }: { id: ID }) {
  const [f, setF] = useState({ outcome: "Approved" as "Approved" | "Refused" | "Granted with conditions", reference: "", provenance: "Council email to Eoin Kelly, forwarded to David Cox (demo simulation)" });
  const [err, setErr] = useState("");
  return (
    <div className="tu-card" style={{ padding: 14, borderRadius: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Record the authority’s decision (simulated)</div>
      <p className="tu-small tu-muted" style={{ marginTop: 0 }}>Turnua cannot approve a licence. Record what the authority decided, with its reference and where it came from.</p>
      <div className="tu-grid tu-g2" style={{ gap: 10 }}>
        <Field label="Outcome"><select className="tu-select" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value as typeof f.outcome })}><option>Approved</option><option>Granted with conditions</option><option>Refused</option></select></Field>
        <Field label="Authority reference" error={err}><input className="tu-input" value={f.reference} placeholder="e.g. DLR-ROL-4471" aria-invalid={!!err} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 10 }}><Field label="Provenance"><input className="tu-input" value={f.provenance} onChange={(e) => setF({ ...f, provenance: e.target.value })} /></Field></div>
      <div className="tu-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
        <Btn kind="navy" onClick={() => { if (!f.reference.trim()) { setErr("Enter the authority’s reference."); return; } setErr(""); recordPermitDecision(id, f.outcome, f.reference.trim(), f.provenance.trim() || "Not stated"); }}>Record decision</Btn>
      </div>
    </div>
  );
}

export function RecordDrawer({ ok, type, id }: { ok: string; type: string; id: ID }) {
  const db = useDB();
  const close = () => closeOverlay(ok);
  const notFound = <Drawer ok={ok} title="Record not found" onClose={close}><p className="tu-muted">{type} {id} is not in the demo records.</p></Drawer>;
  const now = Date.now();

  if (type === "permit") {
    const pm = db.permits.find((x) => x.id === id); if (!pm) return notFound;
    const blocked = pm.blockedTaskIds.map((t) => db.tasks.find((x) => x.id === t)).filter(Boolean);
    const esc = db.approvals.find((a) => a.sourceType === "permit" && a.sourceId === pm.id);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={pm.id + " · Permit"} badges={<Badge tone={pm.status === "Pending decision" ? "warn" : pm.status === "Refused" ? "bad" : "ok"}>{pm.status}</Badge>} title={pm.name}>
        <KV items={[["Authority", pm.authority], ["Project", <Ref type="project" id={pm.projectId} />], ["Applied", fmtDate(pm.appliedAt)], ["Decision due", fmtDate(pm.decisionDueAt)], ["Expires", pm.expiresAt ? fmtDate(pm.expiresAt) : "On decision"], ["Escalation", pm.escalatedAt ? "Approved " + ago(pm.escalatedAt) : esc ? <Ref type="approval" id={esc.id}>{esc.status}</Ref> : "None"]]} />
        {pm.decision && <Section title="Recorded decision"><div className="tu-note">{pm.decision.outcome}, reference {pm.decision.reference}, recorded {fmtDateTime(pm.decision.at)} by {nameOf(db, pm.decision.recordedBy)}. Source: {pm.decision.provenance}.</div></Section>}
        <Section title={"Blocked work · " + blocked.length}>
          {blocked.length ? <div className="tu-card" style={{ borderRadius: 12 }}>{blocked.map((t) => <button key={t!.id} className="tu-rowbtn" onClick={() => openRef("task", t!.id)}><Icon name="link" size={13} /><span className="tu-grow">{t!.title}</span><Badge>{t!.status}</Badge></button>)}</div> : <div className="tu-small tu-muted">No work is waiting on this permit.</div>}
          {pm.status === "Pending decision" && <p className="tu-small tu-muted">A provisional crew reservation or an internal escalation does not clear this dependency.</p>}
        </Section>
        {pm.status === "Pending decision" && <Section title="Decision"><PermitDecision id={pm.id} /></Section>}
        <Section title="Documents"><Links items={[{ type: "doc", id: pm.docId, label: labelOf(db, "doc", pm.docId) }]} /></Section>
      </Drawer>
    );
  }
  if (type === "change") {
    const c = db.changes.find((x) => x.id === id); if (!c) return notFound;
    const p = project(db, c.projectId)!;
    const av = approvedVariations(db, p.id);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={c.id + " · " + c.kind} badges={<Badge tone={c.status === "Approved" ? "ok" : c.status === "Rejected" ? "bad" : c.status === "Draft" ? "" : "warn"}>{c.status}</Badge>} title={c.title}
        footer={c.approvalId ? <Btn kind="navy" onClick={() => openRef("approval", c.approvalId!)}>Open approval {c.approvalId}</Btn> : undefined}>
        <KV items={[["Project", <Ref type="project" id={p.id} />], ["Amount", c.amount ? eur(c.amount) : "Being priced"], ["Owner", <PersonLink id={c.ownerId} />], ["Raised", fmtDate(c.raisedAt)],
          ...(p.contractValue ? [["Original contract", eur(p.contractValue)], ["Current contract", eur(p.contractValue + av) + (av ? " (incl. " + eur(av) + " approved)" : "")]] as [ReactNode, ReactNode][] : [])]} />
        <Section title="Reason"><div className="tu-note">{c.reason}</div></Section>
        <Section title="Effect"><div className="tu-note accent">{c.effect}</div></Section>
        {c.evidenceDocIds.length > 0 && <Section title="Evidence"><Links items={c.evidenceDocIds.map((d) => ({ type: "doc", id: d, label: labelOf(db, "doc", d) }))} /></Section>}
      </Drawer>
    );
  }
  if (type === "credential") {
    const c = db.credentials.find((x) => x.id === id); if (!c) return notFound;
    const s = credState(c, now);
    const booking = db.training.find((x) => x.id === c.bookingId);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={c.id + " · " + c.kind} badges={<Badge tone={s.tone === "plain" ? "" : s.tone}>{s.label}</Badge>} title={nameOf(db, c.personId) + ", " + c.name}
        footer={<><Btn onClick={() => openOverlay({ kind: "cover", personId: c.personId, credentialId: c.id })}>Find cover</Btn><Btn kind="primary" icon="cal" onClick={() => openOverlay({ kind: "booking", credentialId: c.id })} disabled={!!booking && booking.status !== "Rejected"}>{booking ? "Training " + booking.status.toLowerCase() : "Book refresher"}</Btn></>}>
        <KV items={[["Person", <PersonLink id={c.personId} />], ["Issued", fmtDate(c.issuedAt)], [c.dueKind === "No expiry" ? "Expiry" : c.dueKind, c.dueAt ? fmtDate(c.dueAt) : "No expiry"], ["Required for", c.requiredFor?.join(", ") || "General"]]} />
        {booking && <Section title="Booking"><div className="tu-note">{booking.course} with {booking.provider}, {fmtDateTime(booking.date)} ({booking.status}). The credential stays due until renewal evidence is uploaded.</div></Section>}
        <Section title="Evidence"><Links items={c.evidenceDocId ? [{ type: "doc", id: c.evidenceDocId, label: "Training evidence on file" }] : []} /></Section>
        <p className="tu-small tu-faint" style={{ marginTop: 14 }}>Due dates are demo assumptions, not compliance advice. Credentials are fictional demo records, not verified qualifications.</p>
      </Drawer>
    );
  }
  if (type === "po") {
    const po = db.purchaseOrders.find((x) => x.id === id); if (!po) return notFound;
    return (
      <Drawer ok={ok} onClose={close} eyebrow={po.id + " · Purchase order"} badges={<Badge tone={po.status === "Late" ? "bad" : po.status === "Delivered" ? "ok" : ""}>{po.status}</Badge>} title={po.description}>
        <KV items={[["Supplier", <Ref type="supplier" id={po.supplierId} />], ["Project", <Ref type="project" id={po.projectId} />], ["Value", eur(po.value)], ["Ordered", fmtDate(po.orderedAt)], ["Due", fmtDate(po.dueAt)], ["Revised", po.revisedDueAt ? fmtDate(po.revisedDueAt) : po.deliveredAt ? "Delivered " + fmtDate(po.deliveredAt) : "No change"]]} />
        <Section title="History"><div className="tu-tl">{po.history.map((h, i) => <div key={i}><div className="tu-small tu-faint">{fmtDate(h.at)}</div><div>{h.note}</div></div>)}</div></Section>
      </Drawer>
    );
  }
  if (type === "supplier") {
    const s = db.suppliers.find((x) => x.id === id); if (!s) return notFound;
    const c = db.contacts.find((x) => x.id === s.contactId);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={s.id + " · Supplier (fictional demo)"} title={s.name}>
        <KV items={[["Category", s.category], ["Rating", s.rating], ["Contact", c ? c.name + ", " + c.role : "None"], ["Email", c?.email || ""]]} />
        <Section title="Summary"><div className="tu-note">{s.summary}</div></Section>
        <Section title="Orders">
          <div className="tu-card" style={{ borderRadius: 12 }}>{db.purchaseOrders.filter((p) => p.supplierId === s.id).map((p) => <button key={p.id} className="tu-rowbtn" onClick={() => openRef("po", p.id)}><b>{p.id}</b><span className="tu-grow tu-ellipsis">{p.description}</span><Badge tone={p.status === "Late" ? "bad" : p.status === "Delivered" ? "ok" : ""}>{p.status}</Badge></button>)}</div>
        </Section>
      </Drawer>
    );
  }
  if (type === "client") {
    const c = db.clients.find((x) => x.id === id); if (!c) return notFound;
    const projs = db.projects.filter((p) => p.clientId === c.id);
    const sites = db.sites.filter((s) => s.clientId === c.id);
    const tickets = db.tickets.filter((t) => t.clientId === c.id);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={c.kind + " · " + c.sector} title={c.name}>
        <div className="tu-note">{c.summary}</div>
        <Section title="Projects"><Links items={projs.map((p) => ({ type: "project", id: p.id, label: p.id + " " + p.short }))} /></Section>
        {sites.length > 0 && <Section title="Sites"><Links items={sites.map((s) => ({ type: "site", id: s.id, label: s.name }))} /></Section>}
        <Section title="Contacts (demo)">{db.contacts.filter((x) => x.clientId === c.id).map((x) => <div key={x.id} className="tu-row" style={{ padding: "5px 0" }}><Icon name="user" size={13} /><Ref type="contact" id={x.id} /><span className="tu-small tu-muted">{x.role}</span></div>)}</Section>
        {tickets.length > 0 && <Section title="Service history"><Links items={tickets.map((t) => ({ type: "ticket", id: t.id, label: t.id + " " + t.status }))} /></Section>}
        <Section title="Documents"><Links items={db.docs.filter((d) => projs.some((p) => p.id === d.projectId)).slice(0, 6).map((d) => ({ type: "doc", id: d.id, label: d.title }))} /></Section>
      </Drawer>
    );
  }
  if (type === "contact") {
    const c = db.contacts.find((x) => x.id === id); if (!c) return notFound;
    return (
      <Drawer ok={ok} onClose={close} eyebrow="Contact · demo record" title={c.name}>
        <KV items={[["Role", c.role], ["Organisation", c.clientId ? <Ref type="client" id={c.clientId} /> : c.supplierId ? <Ref type="supplier" id={c.supplierId} /> : ""], ["Email", c.email], ["Phone", c.phone]]} />
        <p className="tu-small tu-faint" style={{ marginTop: 12 }}>Fictional demo contact. Not a real customer contact detail.</p>
      </Drawer>
    );
  }
  if (type === "milestone") {
    const m = db.milestones.find((x) => x.id === id); if (!m) return notFound;
    const st = milestoneState(m, now);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={m.id + " · Milestone"} badges={<Badge tone={st === "Complete" ? "ok" : st === "Late" ? "bad" : ""}>{st}</Badge>} title={m.name}>
        <KV items={[["Project", <Ref type="project" id={m.projectId} />], ["Owner", <PersonLink id={m.ownerId} />], ["Baseline", fmtDate(m.baselineAt)], ["Forecast", fmtDate(m.dueAt)], ["Completed", m.completedAt ? fmtDate(m.completedAt) : "Not yet"], ["Type", m.handover ? "Handover" : "Milestone"]]} />
        {m.conditional && <div className="tu-note warn" style={{ marginTop: 12 }}>{m.conditional}</div>}
        {m.dependsOn.length > 0 && <Section title="Depends on"><Links items={m.dependsOn.map((x) => ({ type: "milestone", id: x, label: db.milestones.find((y) => y.id === x)?.name || x }))} /></Section>}
      </Drawer>
    );
  }
  if (type === "valuation") {
    const v = db.valuations.find((x) => x.id === id); if (!v) return notFound;
    return (
      <Drawer ok={ok} onClose={close} eyebrow={v.id + " · Valuation (draft)"} badges={<Badge>{v.status}</Badge>} title={(project(db, v.projectId)?.short || "") + " " + v.period}>
        <KV items={[["Draft amount", eur(v.amount)], ["Review", fmtDate(v.reviewAt)], ["Evidence readiness", pct(v.readiness)], ["Project", <Ref type="project" id={v.projectId} />]]} />
        <div style={{ marginTop: 12 }}><Progress value={v.readiness} tone={v.readiness >= 0.8 ? "ok" : "warn"} label="Evidence readiness" /></div>
        <Section title="Evidence">{v.evidence.map((e, i) => <div key={i} className="tu-row" style={{ padding: "4px 0" }}><Icon name={/pending/i.test(e) ? "clock" : "ok"} size={13} />{e}</div>)}</Section>
        <p className="tu-small tu-faint">A draft valuation is not an invoice and is never shown as overdue.</p>
      </Drawer>
    );
  }
  if (type === "rams") {
    const r = db.rams.find((x) => x.id === id); if (!r) return notFound;
    return (
      <Drawer ok={ok} onClose={close} eyebrow={r.id + " · RAMS"} badges={<Badge tone={r.status === "Approved" ? "ok" : "warn"}>{r.status}</Badge>} title={r.title}>
        <KV items={[["Project", <Ref type="project" id={r.projectId} />], ["Owner", <PersonLink id={r.ownerId} />], ["Review", fmtDate(r.reviewAt)], ["Work area", r.workAreaId ? labelOf(db, "workArea", r.workAreaId) : "Project-wide"]]} />
        <Section title="Linked work"><Links items={[{ type: "doc", id: r.docId, label: labelOf(db, "doc", r.docId) }, ...r.taskIds.map((t) => ({ type: "task", id: t, label: labelOf(db, "task", t) }))]} /></Section>
      </Drawer>
    );
  }
  if (type === "risk") {
    const r = db.risks.find((x) => x.id === id); if (!r) return notFound;
    const score = r.probability * r.impact;
    return (
      <Drawer ok={ok} onClose={close} eyebrow={r.id + " · Risk"} badges={<Badge tone={score >= 15 ? "bad" : score >= 8 ? "warn" : ""}>Rating {score}</Badge>} title={r.title}>
        <KV items={[["Project", <Ref type="project" id={r.projectId} />], ["Owner", <PersonLink id={r.ownerId} />], ["Probability", r.probability + " of 5"], ["Impact", r.impact + " of 5"], ["Status", r.status], ["Review", fmtDate(r.reviewAt)]]} />
        <Section title="Mitigation"><div className="tu-note">{r.mitigation}</div></Section>
      </Drawer>
    );
  }
  if (type === "workArea") {
    const w = db.workAreas.find((x) => x.id === id); if (!w) return notFound;
    const tasks = db.tasks.filter((t) => t.workAreaId === w.id);
    return (
      <Drawer ok={ok} onClose={close} eyebrow={w.id + " · Work area"} title={w.name}>
        <KV items={[["Project", <Ref type="project" id={w.projectId} />], ["Location", w.location], ["Open tasks", String(tasks.filter(isOpen).length)], ["Permits", db.permits.filter((p) => p.workAreaId === w.id).map((p) => p.id + " " + p.status).join(", ") || "None"]]} />
        <Section title="Tasks"><Links items={tasks.map((t) => ({ type: "task", id: t.id, label: t.title }))} /></Section>
      </Drawer>
    );
  }
  if (type === "training") {
    const t = db.training.find((x) => x.id === id); if (!t) return notFound;
    return (
      <Drawer ok={ok} onClose={close} eyebrow={t.id + " · Training request"} badges={<Badge tone={t.status === "Booked" ? "ok" : t.status === "Rejected" ? "bad" : "warn"}>{t.status}</Badge>} title={t.course + ", " + nameOf(db, t.personId)}>
        <KV items={[["Provider", t.provider], ["Date", fmtDateTime(t.date)], ["Credential", <Ref type="credential" id={t.credentialId} />], ["Approval", <Ref type="approval" id={t.approvalId} />]]} />
      </Drawer>
    );
  }
  if (type === "report") {
    const r = db.reports.find((x) => x.id === id); if (!r) return notFound;
    const text = [r.title, "", ...r.lines, "", "Draft prepared in the Turnua OS demo workspace. Not sent to the client."].join("\n");
    return (
      <Drawer ok={ok} onClose={close} eyebrow="Client report draft" title={r.title}
        footer={<><Btn icon="copy" onClick={() => { navigator.clipboard?.writeText(text); }}>Copy</Btn><Btn icon="dl" kind="navy" onClick={() => download(r.id + ".txt", text)}>Download</Btn></>}>
        <article className="tu-note" style={{ background: "var(--surface)" }}>{r.lines.map((l, i) => <p key={i} style={{ margin: "0 0 8px" }}>{l}</p>)}</article>
        <Section title="Sources"><Links items={r.sources.map((s) => ({ type: s.type, id: s.id, label: s.label }))} /></Section>
      </Drawer>
    );
  }
  return (
    <Drawer ok={ok} onClose={close} eyebrow={type} title={labelOf(db, type, id)}>
      <p className="tu-muted">This record type opens from its own module.</p>
    </Drawer>
  );
}

/* ── ontology chains ─────────────────────────────────────────────── */
export const CHAINS: Record<string, { title: string; blurb: string; hops: { type: string; id: ID; rel: string }[] }> = {
  aquacomms: { title: "AquaComms incident chain", blurb: "From the client to the person and task responding to a live P1.",
    hops: [{ type: "client", id: "CL-AQC", rel: "client" }, { type: "site", id: "S-LS1", rel: "has site" }, { type: "asset", id: "AST-LS1-CRAC-03", rel: "has asset" },
      { type: "ticket", id: "HD-4821", rel: "raised ticket" }, { type: "person", id: "P05", rel: "assigned engineer" }, { type: "task", id: "T-2035-01", rel: "response task" }] },
  hall4: { title: "Hall 4 recovery chain", blurb: "From the late supplier package to the decision that sits with David.",
    hops: [{ type: "project", id: "TRN-2052", rel: "project" }, { type: "po", id: "PO-5521", rel: "containment package" }, { type: "task", id: "T-2052-10", rel: "blocked task" },
      { type: "change", id: "CR-2052-02", rel: "recovery proposal" }, { type: "approval", id: "APR-2052-02", rel: "approval" }, { type: "person", id: "P01", rel: "approver" }] },
  dlr: { title: "DLR permit gate", blurb: "An external licence decision holding back scheduled work.",
    hops: [{ type: "project", id: "TRN-2063", rel: "project" }, { type: "workArea", id: "WA-2063-1", rel: "work area" }, { type: "permit", id: "PER-DLR-017", rel: "licence" },
      { type: "task", id: "T-2063-09", rel: "blocked task" }, { type: "event", id: "EV-DLR-CREW", rel: "provisional crew window" }] },
};
export function ChainDrawer({ ok, id }: { ok: string; id: ID }) {
  const db = useDB();
  const c = CHAINS[id];
  if (!c) return null;
  const state = (type: string, rid: ID): string => {
    if (type === "ticket") return db.tickets.find((t) => t.id === rid)?.status || "";
    if (type === "task") return db.tasks.find((t) => t.id === rid)?.status || "";
    if (type === "approval" || type === "change") return (type === "approval" ? db.approvals.find((a) => a.id === rid)?.status : db.changes.find((a) => a.id === rid)?.status) || "";
    if (type === "permit") return db.permits.find((p) => p.id === rid)?.status || "";
    if (type === "po") return db.purchaseOrders.find((p) => p.id === rid)?.status || "";
    if (type === "project") return db.projects.find((p) => p.id === rid)?.health || "";
    if (type === "asset") return db.assets.find((p) => p.id === rid)?.state || "";
    return "";
  };
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow="Ontology · relationship path" title={c.title}>
      <p className="tu-muted" style={{ marginTop: 0 }}>{c.blurb} Each step is a stored relationship by ID; open any record.</p>
      <div className="tu-tl">
        {c.hops.map((h, i) => (
          <div key={i}>
            <div className="tu-small tu-faint">{i === 0 ? h.rel : "→ " + h.rel}</div>
            <div className="tu-row"><Ref type={h.type} id={h.id}>{labelOf(db, h.type, h.id)}</Ref>{state(h.type, h.id) && <Badge>{state(h.type, h.id)}</Badge>}</div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

export function ConfirmModal({ ok, o }: { ok: string; o: Overlay }) {
  return (
    <Modal ok={ok} size="sm" title={o.title as string} onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)} data-autofocus>Cancel</Btn><Btn kind={o.danger ? "danger" : "primary"} onClick={() => { (o.onConfirm as () => void)(); closeOverlay(ok, true); }}>{(o.confirmLabel as string) || "Confirm"}</Btn></>}>
      <p style={{ margin: 0, lineHeight: 1.6 }}>{o.body as string}</p>
    </Modal>
  );
}

export function ProjectForm({ ok }: { ok: string }) {
  const db = useDB();
  const [f, setF] = useState({ name: "", clientId: "", service: db.org.serviceLines[0], location: "", pmId: "P03", model: "Works contract" as Project["model"], value: "", start: todayKey(), finish: addDays(todayKey(), 90) });
  const [tried, setTried] = useState(false);
  const errs = {
    name: !f.name.trim() ? "Give the project a name." : "",
    clientId: !f.clientId ? "Choose a client." : "",
    value: f.model !== "Managed service" && !(Number(f.value) > 0) ? "Enter a value in euro." : "",
    finish: f.finish <= f.start ? "Finish must be after start." : "",
  };
  const submit = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const id = createProject({ name: f.name.trim(), clientId: f.clientId, service: f.service, location: f.location || "To be confirmed", pmId: f.pmId, model: f.model,
      value: f.model === "Managed service" ? null : Number(f.value), startAt: at(f.start, 8), finishAt: at(f.finish, 23, 59) });
    closeOverlay(ok, true);
    navigate("/projects/p/" + id + "/overview");
  };
  return (
    <Modal ok={ok} title="New project" sub="Creates a local project with phases and a handover milestone. It appears in Portfolio, search and Records." onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)}>Cancel</Btn><Btn kind="primary" onClick={submit}>Create project</Btn></>}>
      <div className="tu-stack" style={{ gap: 12 }}>
        <Field label="Project name" error={tried ? errs.name : ""}><input className="tu-input" data-autofocus value={f.name} aria-invalid={tried && !!errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="tu-grid tu-g2" style={{ gap: 12 }}>
          <Field label="Client" error={tried ? errs.clientId : ""}><select className="tu-select" value={f.clientId} aria-invalid={tried && !!errs.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, model: e.target.value === "CL-TRN" ? "Internal budget" : f.model })}><option value="">Choose a client</option>{db.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Service line"><select className="tu-select" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>{db.org.serviceLines.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Project manager"><select className="tu-select" value={f.pmId} onChange={(e) => setF({ ...f, pmId: e.target.value })}>{db.people.filter((p) => ["PM", "Strategy", "Engineer"].includes(p.roleKey)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Location"><input className="tu-input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Commercial model"><select className="tu-select" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value as Project["model"] })}><option>Works contract</option><option>Managed service</option><option>Internal budget</option></select></Field>
          <Field label={f.model === "Internal budget" ? "Internal budget (€)" : "Contract value (€, excl. VAT)"} error={tried ? errs.value : ""}><input className="tu-input" inputMode="numeric" value={f.value} disabled={f.model === "Managed service"} placeholder={f.model === "Managed service" ? "Not applicable" : "e.g. 450000"} onChange={(e) => setF({ ...f, value: e.target.value.replace(/[^\d]/g, "") })} /></Field>
          <Field label="Start"><input className="tu-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Baseline finish" error={tried ? errs.finish : ""}><input className="tu-input" type="date" value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}
export { HealthBadge };
