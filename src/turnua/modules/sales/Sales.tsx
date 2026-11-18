/* Sales: top end pipeline, key accounts, bids and tenders, weighted forecast. */
import { useState } from "react";
import type { Bid, Deal, DealStage, ID } from "../../types";
import { DEAL_STAGES, STAGE_PROB } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate, useRoute, withQuery, useFilter } from "../../ui";
import { createDeal, moveDeal, setBidStatus, updateDeal } from "../../growthActions";
import { Avatar, Badge, Btn, Card, Drawer, Empty, Field, KV, Modal, Page, PersonLink, Search, Select, Stat, download, toCsv } from "../../kit";
import { nameOf } from "../../selectors";
import { ago, dueLabel, eur, eurShort, fmtDate, fmtDateTime, addDays, todayKey, endOfDay, pct, relDay } from "../../time";
import "../growth.css";

const OPEN = (d: Deal) => d.stage !== "Won" && d.stage !== "Lost";
const STAGE_TONE: Record<DealStage, "outline" | "" | "accent" | "warn" | "ok" | "bad"> = { Lead: "outline", Qualified: "", Proposal: "accent", Negotiation: "warn", Won: "ok", Lost: "bad" };
const SELLERS = ["P01", "P02", "P03", "P04", "P05"];
const SERVICES = ["Fibre & Low-Voltage Cabling", "Critical Facilities Management", "Critical IT Infrastructure", "Fibre & Telecoms", "Construction & Building Fabric"];

export default function SalesModule({ tab }: { tab: string }) {
  if (tab === "accounts") return <Accounts />;
  if (tab === "bids") return <Bids />;
  if (tab === "forecast") return <Forecast />;
  return <Pipeline />;
}

function Headline() {
  const db = useDB();
  const now = useClock();
  const open = db.deals.filter(OPEN);
  const total = open.reduce((n, d) => n + d.value, 0);
  const weighted = open.reduce((n, d) => n + d.value * STAGE_PROB[d.stage], 0);
  const closed = db.deals.filter((d) => !OPEN(d));
  const won = closed.filter((d) => d.stage === "Won");
  const avg = open.length ? total / open.length : 0;
  const stale = open.filter((d) => Date.parse(d.nextStepAt) < now).length;
  return (
    <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
      <Stat label="Open pipeline" value={eurShort(total)} sub={open.length + " opportunities"} onClick={() => navigate("/sales/pipeline")} />
      <Stat label="Weighted forecast" value={eurShort(Math.round(weighted))} sub="by stage probability" onClick={() => navigate("/sales/forecast")} />
      <Stat label="Average deal" value={eurShort(Math.round(avg))} sub="top end: €1M and above" />
      <Stat label="Win rate" value={closed.length ? pct(won.length / closed.length) : "n/a"} sub={won.length + " won, " + (closed.length - won.length) + " lost"} tone="ok" />
      <Stat label="Next step overdue" value={stale} tone={stale ? "bad" : "ok"} sub={stale ? "needs an owner's update" : "every deal is current"} />
    </div>
  );
}

/* ── Pipeline board ──────────────────────────────────────────────── */
function Pipeline() {
  const db = useDB();
  const now = useClock();
  const r = useRoute();
  const [f, setF] = useFilter("sales.pipe");
  const [over, setOver] = useState<DealStage | null>(null);
  const [adding, setAdding] = useState(false);
  const [lostFor, setLostFor] = useState<ID | null>(null);
  const q = (f.q || "").toLowerCase();
  const deals = db.deals.filter((d) => (!f.owner || d.ownerId === f.owner) && (!f.min || d.value >= Number(f.min))
    && (!q || (d.id + " " + d.name + " " + (db.accounts.find((a) => a.id === d.accountId)?.name || "")).toLowerCase().includes(q)));
  const openId = r.query.deal;
  const drop = (stage: DealStage, id: string) => { if (stage === "Lost") setLostFor(id); else moveDeal(id, stage); };
  return (
    <Page title="Pipeline" sub="Top end opportunities from qualification to signature. Drag a card to move it; every move is audited."
      actions={<><Btn icon="dl" onClick={() => download("turnua-pipeline.csv", toCsv([["ID", "Opportunity", "Account", "Stage", "Value", "Weighted", "Owner", "Close"], ...db.deals.map((d) => [d.id, d.name, db.accounts.find((a) => a.id === d.accountId)?.name || "", d.stage, d.value, Math.round(d.value * STAGE_PROB[d.stage]), nameOf(db, d.ownerId), fmtDate(d.closeAt)])]), "text/csv")}>Export</Btn>
        <Btn kind="primary" icon="plus" onClick={() => setAdding(true)}>New opportunity</Btn></>}>
      <Headline />
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search deals or accounts" width={240} />
        <Select label="Owner" value={f.owner || ""} onChange={(v) => setF("owner", v)} options={[["", "All owners"], ...SELLERS.map((p) => [p, nameOf(db, p)] as [string, string])]} />
        <Select label="Size" value={f.min || ""} onChange={(v) => setF("min", v)} options={[["", "Any size"], ["1000000", "€1M and above"], ["5000000", "€5M and above"]]} />
      </div>
      <div className="tu-board sa-board" role="list" aria-label="Pipeline board">
        {DEAL_STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage).sort((a, b) => b.value - a.value);
          const sum = col.reduce((n, d) => n + d.value, 0);
          return (
            <div key={stage} role="listitem" className={"tu-col" + (over === stage ? " drop" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); drop(stage, e.dataTransfer.getData("text/plain")); }}>
              <div className="tu-col-h"><span className="tu-grow">{stage} <span className="tu-muted" style={{ fontWeight: 400 }}>· {pct(STAGE_PROB[stage])}</span></span><span className="sa-val">{eurShort(sum)}</span></div>
              <div className="tu-col-b">
                {col.map((d) => {
                  const acc = db.accounts.find((a) => a.id === d.accountId);
                  const dl = dueLabel(d.nextStepAt, !OPEN(d), now);
                  return (
                    <button key={d.id} className="tu-kcard" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.id); }}
                      onClick={() => navigate(withQuery("/sales/pipeline", { deal: d.id }))}>
                      <div className="tu-row" style={{ justifyContent: "space-between" }}><span className="tu-small tu-muted">{d.id}</span><span className="sa-val">{eurShort(d.value)}</span></div>
                      <div className="t">{d.name}</div>
                      <div className="tu-small tu-muted tu-ellipsis">{acc?.name}</div>
                      <div className="tu-row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                        <Avatar person={db.people.find((p) => p.id === d.ownerId)} size={22} />
                        {OPEN(d) ? <span className="tu-small" style={{ color: dl.tone === "bad" ? "var(--bad)" : "var(--dim)" }}>Next: {relDay(d.nextStepAt, now)}</span> : <span className="tu-small tu-muted">{fmtDate(d.closeAt)}</span>}
                      </div>
                    </button>
                  );
                })}
                {!col.length && <div className="tu-small tu-faint" style={{ padding: 8 }}>Drop here</div>}
              </div>
            </div>
          );
        })}
      </div>
      {openId && <DealDrawer id={openId} onClose={() => navigate("/sales/pipeline")} onLost={() => setLostFor(openId)} />}
      {adding && <NewDeal onClose={() => setAdding(false)} />}
      {lostFor && <LostModal id={lostFor} onClose={() => setLostFor(null)} />}
    </Page>
  );
}

function DealDrawer({ id, onClose, onLost }: { id: ID; onClose: () => void; onLost: () => void }) {
  const db = useDB();
  const d = db.deals.find((x) => x.id === id);
  const [step, setStep] = useState(d?.nextStep || "");
  const [when, setWhen] = useState(d ? d.nextStepAt.slice(0, 10) : todayKey());
  if (!d) return null;
  const acc = db.accounts.find((a) => a.id === d.accountId)!;
  const idx = DEAL_STAGES.indexOf(d.stage);
  return (
    <Drawer ok="deal" eyebrow={d.id + " · " + d.service} title={d.name} badges={<Badge tone={STAGE_TONE[d.stage]}>{d.stage}</Badge>} onClose={onClose}
      footer={OPEN(d) ? <>
        <Btn kind="danger" onClick={onLost}>Mark lost</Btn>
        <span className="tu-grow" />
        {idx < 3 && <Btn onClick={() => moveDeal(d.id, DEAL_STAGES[idx + 1])}>Move to {DEAL_STAGES[idx + 1]}</Btn>}
        <Btn kind="primary" icon="check" onClick={() => moveDeal(d.id, "Won")}>Mark won</Btn>
      </> : undefined}>
      <KV items={[["Account", <button className="tu-link" onClick={() => navigate(withQuery("/sales/accounts", { account: acc.id }))}>{acc.name}</button>], ["Value", eur(d.value)],
        ["Weighted", eur(Math.round(d.value * STAGE_PROB[d.stage]))], ["Owner", <PersonLink id={d.ownerId} />], ["Expected close", fmtDate(d.closeAt, { year: true })],
        ["Buyer contact", d.contact], ["Source", d.source], ...(d.lostReason ? [["Lost reason", d.lostReason] as [string, string]] : [])]} />
      {OPEN(d) && (
        <div className="tu-section">
          <div className="tu-eyebrow">Next step</div>
          <div className="tu-stack" style={{ gap: 8 }}>
            <input className="tu-input" value={step} onChange={(e) => setStep(e.target.value)} aria-label="Next step" />
            <div className="tu-row" style={{ gap: 8 }}>
              <input className="tu-input" type="date" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Next step date" style={{ width: 170 }} />
              <Btn onClick={() => updateDeal(d.id, { nextStep: step, nextStepAt: endOfDay(when), touched: true }, "Next step updated")}>Save next step</Btn>
            </div>
          </div>
        </div>
      )}
      <div className="tu-section">
        <div className="tu-eyebrow">History</div>
        <div className="tu-list">{d.history.map((h, i) => <div key={i} className="tu-li" style={{ padding: "8px 0" }}><span className="tu-small tu-muted" style={{ width: 120, flex: "none" }}>{fmtDateTime(h.at)}</span><span className="tu-small">{h.text}</span></div>)}</div>
      </div>
    </Drawer>
  );
}

function NewDeal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState({ name: "", accountId: db.accounts[0].id, service: SERVICES[0], value: "1000000", ownerId: "P01", close: addDays(todayKey(), 90), nextStep: "", contact: "", source: "Account plan" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (f.name.trim().length < 3) { setErr("Name the opportunity"); return; }
    const id = createDeal({ name: f.name.trim(), accountId: f.accountId, service: f.service, value: Math.max(0, Number(f.value) || 0), ownerId: f.ownerId, closeAt: endOfDay(f.close), nextStep: f.nextStep || "Qualification call", source: f.source, contact: f.contact || "To confirm" });
    onClose();
    navigate(withQuery("/sales/pipeline", { deal: id }));
  };
  return (
    <Modal ok="new-deal" title="New opportunity" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Create</Btn></>}>
      <div className="tu-stack" style={{ gap: 10 }}>
        <Field label="Opportunity" error={err}><input className="tu-input" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Campus 3 white space fit out" /></Field>
        <div className="tu-grid tu-g2">
          <Field label="Account"><select className="tu-select" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Service line"><select className="tu-select" value={f.service} onChange={(e) => set("service", e.target.value)}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <div className="tu-grid tu-g3">
          <Field label="Value (€)"><input className="tu-input" inputMode="numeric" value={f.value} onChange={(e) => set("value", e.target.value.replace(/[^\d]/g, ""))} /></Field>
          <Field label="Owner"><select className="tu-select" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>{SELLERS.map((p) => <option key={p} value={p}>{nameOf(db, p)}</option>)}</select></Field>
          <Field label="Expected close"><input className="tu-input" type="date" value={f.close} onChange={(e) => set("close", e.target.value)} /></Field>
        </div>
        <div className="tu-grid tu-g2">
          <Field label="Buyer contact"><input className="tu-input" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
          <Field label="Next step"><input className="tu-input" value={f.nextStep} onChange={(e) => set("nextStep", e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
function LostModal({ id, onClose }: { id: ID; onClose: () => void }) {
  const [why, setWhy] = useState("Price");
  const [note, setNote] = useState("");
  return (
    <Modal ok="lost" size="sm" title="Why was it lost?" sub="Recorded for win/loss reporting" onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="danger" onClick={() => { moveDeal(id, "Lost", why + (note ? ": " + note : "")); onClose(); }}>Mark lost</Btn></>}>
      <div className="tu-stack" style={{ gap: 10 }}>
        <Field label="Reason"><select className="tu-select" value={why} onChange={(e) => setWhy(e.target.value)}>{["Price", "Timing", "Incumbent", "Scope", "No decision", "Capacity"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Note"><input className="tu-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ── Key accounts ────────────────────────────────────────────────── */
function Accounts() {
  const db = useDB();
  const now = useClock();
  const r = useRoute();
  const focus = r.query.account;
  const tiers = ["Strategic", "Growth", "Target"] as const;
  return (
    <Page title="Key Accounts" sub="The handful of relationships that decide the year. Who owns them, who sponsors them, where the white space is and when we last spoke.">
      <Headline />
      {tiers.map((tier) => (
        <div key={tier} className="tu-section">
          <div className="tu-eyebrow">{tier} accounts</div>
          <div className="sa-acc">
            {db.accounts.filter((a) => a.tier === tier).map((a) => {
              const deals = db.deals.filter((d) => d.accountId === a.id && OPEN(d));
              const pipe = deals.reduce((n, d) => n + d.value, 0);
              const days = Math.floor((now - Date.parse(a.lastTouchAt)) / 86400000);
              return (
                <Card key={a.id} style={focus === a.id ? { borderColor: "var(--accent-fill)" } : undefined}
                  title={<div className="tu-row" style={{ gap: 8 }}><h2 style={{ margin: 0 }}>{a.name}</h2></div>} sub={a.sector}
                  right={<span className={"sa-tier " + a.tier}>{a.tier}</span>}
                  footer={<div className="tu-row" style={{ justifyContent: "space-between", width: "100%" }}>
                    <span className="tu-small" style={{ color: days > 21 ? "var(--bad)" : "var(--dim)" }}>Last touch {ago(a.lastTouchAt, now).toLowerCase()}</span>
                    {a.nextMeeting ? <Badge tone="accent" icon="cal">{relDay(a.nextMeeting, now)} meeting</Badge> : <Badge tone="warn">No meeting booked</Badge>}
                  </div>}>
                  <div className="tu-grid tu-g3" style={{ gap: 10 }}>
                    <div><div className="tu-small tu-muted">Revenue, 12m</div><div className="sa-val" style={{ fontSize: 15 }}>{a.revenueTTM ? eurShort(a.revenueTTM) : "€0"}</div></div>
                    <div><div className="tu-small tu-muted">Open pipeline</div><div className="sa-val" style={{ fontSize: 15 }}>{eurShort(pipe)}</div></div>
                    <div><div className="tu-small tu-muted">Potential</div><div className="sa-val" style={{ fontSize: 15 }}>{eurShort(a.potential)}</div></div>
                  </div>
                  <div className="fa-load" style={{ margin: "10px 0" }} title="Share of potential won or in pipeline"><i style={{ width: Math.min(100, (a.revenueTTM + pipe) / a.potential * 100) + "%", background: "var(--accent-fill,var(--accent))" }} /></div>
                  <div className="tu-small" style={{ lineHeight: 1.55 }}>
                    <div><span className="tu-muted">Owner</span> {nameOf(db, a.ownerId)} · <span className="tu-muted">Sponsor</span> {nameOf(db, a.sponsorId)} · <span className="tu-muted">Relationship</span> <span style={{ color: a.relationship === "Strong" ? "var(--ok)" : a.relationship === "Cold" ? "var(--bad)" : "var(--warn)" }}>{a.relationship}</span></div>
                    <div style={{ marginTop: 6 }}><span className="tu-muted">Decision makers:</span> {a.decisionMakers.join(", ")}</div>
                    <div style={{ marginTop: 6 }}><span className="tu-muted">White space:</span> {a.whitespace.join(" · ")}</div>
                    <div className="tu-note" style={{ marginTop: 8 }}>{a.notes}</div>
                  </div>
                  {deals.length > 0 && <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 10 }}>{deals.map((d) => <button key={d.id} className="tu-chip" onClick={() => navigate(withQuery("/sales/pipeline", { deal: d.id }))}>{d.id} · {eurShort(d.value)}</button>)}</div>}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </Page>
  );
}

/* ── Bids and tenders ────────────────────────────────────────────── */
function Bids() {
  const db = useDB();
  const now = useClock();
  const rows = db.bids.slice().sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const live = rows.filter((b) => ["Qualifying", "Go", "Writing"].includes(b.status));
  return (
    <Page title="Bids & Tenders" sub="Public and private tenders from qualification to submission. Go or no-go is scored on fit, capacity, margin and relationship.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Live bids" value={live.length} sub={eurShort(live.reduce((n, b) => n + b.value, 0)) + " total value"} />
        <Stat label="Due in 14 days" value={live.filter((b) => Date.parse(b.dueAt) < now + 14 * 86400000).length} tone="warn" />
        <Stat label="Submitted" value={rows.filter((b) => b.status === "Submitted").length} sub="awaiting award" />
        <Stat label="Average bid score" value={Math.round(rows.reduce((n, b) => n + b.score, 0) / rows.length)} sub="go threshold 60" />
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Tender</th><th>Buyer</th><th className="num">Value</th><th>Deadline</th><th>Score</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((b) => {
                const dl = dueLabel(b.dueAt, !["Qualifying", "Go", "Writing"].includes(b.status), now);
                return (
                  <tr key={b.id}>
                    <td><div style={{ fontWeight: 550, color: "var(--ink)" }}>{b.title}</div><div className="tu-small tu-muted">{b.id} · {b.portal}{b.dealId && <> · <button className="tu-link" onClick={() => navigate(withQuery("/sales/pipeline", { deal: b.dealId! }))}>{b.dealId}</button></>}</div></td>
                    <td>{b.buyer}</td>
                    <td className="num tu-mono">{eurShort(b.value)}</td>
                    <td style={{ color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : undefined }}>{fmtDate(b.dueAt)}<div className="tu-small tu-muted">{dl.text}</div></td>
                    <td><div className="tu-row" style={{ gap: 8 }}><div className="fa-load" style={{ width: 60 }}><i style={{ width: b.score + "%", background: b.score >= 70 ? "var(--ok)" : b.score >= 60 ? "var(--warn)" : "var(--bad)" }} /></div><span className="tu-mono tu-small">{b.score}</span></div></td>
                    <td>{nameOf(db, b.ownerId)}</td>
                    <td><Select label="Status" value={b.status} onChange={(v) => setBidStatus(b.id, v as Bid["status"])} options={["Qualifying", "Go", "No-go", "Writing", "Submitted", "Won", "Lost"]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <Empty title="No bids" />}
        </div>
      </Card>
    </Page>
  );
}

/* ── Forecast ────────────────────────────────────────────────────── */
function Forecast() {
  const db = useDB();
  const open = db.deals.filter(OPEN);
  const q = (iso: string) => { const d = new Date(iso); return "Q" + (Math.floor(d.getUTCMonth() / 3) + 1) + " " + d.getUTCFullYear(); };
  const quarters = Array.from(new Set(open.map((d) => q(d.closeAt)))).sort((a, b) => a.slice(3).localeCompare(b.slice(3)) || a.localeCompare(b));
  const byQ = quarters.map((k) => {
    const ds = open.filter((d) => q(d.closeAt) === k);
    return { k, total: ds.reduce((n, d) => n + d.value, 0), weighted: ds.reduce((n, d) => n + d.value * STAGE_PROB[d.stage], 0), commit: ds.filter((d) => d.stage === "Negotiation").reduce((n, d) => n + d.value, 0) };
  });
  const maxQ = Math.max(1, ...byQ.map((x) => x.total));
  const bySvc = SERVICES.map((s) => ({ s, v: open.filter((d) => d.service === s).reduce((n, d) => n + d.value, 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const maxS = Math.max(1, ...bySvc.map((x) => x.v));
  const byOwner = SELLERS.map((p) => ({ p, v: open.filter((d) => d.ownerId === p).reduce((n, d) => n + d.value * STAGE_PROB[d.stage], 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const maxO = Math.max(1, ...byOwner.map((x) => x.v));
  return (
    <Page title="Forecast" sub="Weighted by stage probability. Commit is everything in Negotiation.">
      <Headline />
      <div className="tu-split">
        <Card title="By expected close quarter" sub={<><span className="gr-sw" style={{ background: "var(--accent-fill,var(--accent))" }} />Commit <span className="gr-sw" style={{ background: "color-mix(in oklab,var(--accent) 45%,transparent)", marginLeft: 10 }} />Weighted <span className="gr-sw" style={{ background: "var(--track)", marginLeft: 10 }} />Total</>}>
          <div className="gr-bars">
            {byQ.map((x) => (
              <div key={x.k} className="gr-bar">
                <span className="lab">{x.k}</span>
                <span className="trk" style={{ position: "relative" }}>
                  <i style={{ width: x.commit / maxQ * 100 + "%", background: "var(--accent-fill,var(--accent))" }} />
                  <i style={{ width: Math.max(0, x.weighted - x.commit) / maxQ * 100 + "%", background: "color-mix(in oklab,var(--accent) 45%,transparent)" }} />
                </span>
                <span className="val">{eurShort(Math.round(x.weighted))} / {eurShort(x.total)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Weighted, by owner">
          <div className="gr-bars">
            {byOwner.map((x) => (
              <div key={x.p} className="gr-bar" style={{ gridTemplateColumns: "120px 1fr 70px" }}>
                <span className="lab">{nameOf(db, x.p)}</span><span className="trk"><i style={{ width: x.v / maxO * 100 + "%", background: "var(--accent-fill,var(--accent))" }} /></span><span className="val">{eurShort(Math.round(x.v))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="tu-section">
        <Card title="Open pipeline by service line">
          <div className="gr-bars">
            {bySvc.map((x) => (
              <div key={x.s} className="gr-bar" style={{ gridTemplateColumns: "240px 1fr 80px" }}>
                <span className="lab">{x.s}</span><span className="trk"><i style={{ width: x.v / maxS * 100 + "%", background: "var(--ink)" }} /></span><span className="val">{eurShort(x.v)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
