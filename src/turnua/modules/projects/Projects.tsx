/* Projects: Portfolio, Delivery Plan, Commercials, Risks & Compliance, project detail. */
import { useEffect, useMemo, useState } from "react";
import type { Project } from "../../types";
import { useDB } from "../../store";
import { navigate, openNew, openApproval, setPrefs, usePrefs, useFilter, useRoute } from "../../ui";
import { AvatarStack, Badge, Btn, Card, Empty, HealthBadge, Icon, Page, PersonLink, Ref, Search, Select, SortTh, Stat, openRef } from "../../kit";
import { addDays, daysBetween, eur, eurShort, fmtDate, keyOf, mondayOf, pct, todayKey, MON } from "../../time";
import { burn, earnedValue, isOpen, isOverdue, milestoneState, nameOf, portfolio, projectTasks, slipDays, labelOf } from "../../selectors";
import { BurnCell, ProgressCell, valueLabel } from "./common";
import ProjectDetail from "./ProjectDetail";

export default function ProjectsModule({ tab, id, sub }: { tab: string; id?: string; sub?: string }) {
  if (tab === "detail" && id) return <ProjectDetail id={id} sub={sub || "overview"} />;
  if (tab === "plan") return <DeliveryPlan />;
  if (tab === "commercials") return <Commercials />;
  if (tab === "risks") return <Risks />;
  return <Portfolio />;
}

/* ── Portfolio ───────────────────────────────────────────────────── */
function Portfolio() {
  const db = useDB();
  const now = Date.now();
  const r = useRoute();
  const prefs = usePrefs();
  const [f, setF, clear] = useFilter("projects");
  useEffect(() => { if (r.query.health && f.health !== r.query.health) setF("health", r.query.health); }, [r.query.health]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = (f.q || "").toLowerCase();
  const list = db.projects.filter((p) =>
    (!f.health || p.health === f.health) && (!f.service || p.service === f.service) && (!f.pm || p.pmId === f.pm) && (!f.client || p.clientId === f.client) &&
    (!q || (p.id + " " + p.name + " " + labelOf(db, "client", p.clientId) + " " + p.location).toLowerCase().includes(q)));
  const pf = portfolio(db, now);
  const view = prefs.projectView;
  const anyFilter = Object.values(f).some(Boolean);
  return (
    <Page title="Portfolio" sub={pf.active + " active projects: " + pf.health["On track"] + " on track, " + pf.health["At risk"] + " at risk, " + pf.health["Off track"] + " off track. External works " + eur(pf.originalValue) + "; internal and managed service reported separately."}
      actions={<><Btn icon="plus" kind="primary" onClick={() => openNew("project")}>New project</Btn></>}>
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="On track" value={pct(pf.onTrackPct)} sub={pf.health["On track"] + " of " + pf.active + " projects"} onClick={() => setF("health", f.health === "On track" ? "" : "On track")} />
        <Stat label="External works contract value" value={eurShort(pf.originalValue)} sub={pf.approvedVariations ? "+" + eur(pf.approvedVariations) + " approved variations" : "Original contracts, excl. VAT"} onClick={() => navigate("/projects/commercials")} />
        <Stat label="Pending priced changes" value={eurShort(pf.pendingPriced)} sub={pf.pendingChanges.length + " awaiting approval"} tone={pf.pendingPriced ? "warn" : undefined} onClick={() => navigate("/projects/commercials")} />
        <Stat label="Open tasks" value={pf.tasks.open} sub={pf.tasks.overdue + " overdue, " + pf.tasks.due48 + " due in 48h"} tone={pf.tasks.overdue ? "bad" : undefined} onClick={() => navigate("/work/team")} />
      </div>
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search projects, clients, places" width={280} />
        <Select label="Health" value={f.health || ""} onChange={(v) => { setF("health", v); if (r.query.health) navigate("/projects/portfolio", { replace: true }); }} options={[["", "All health"], "On track", "At risk", "Off track"]} />
        <Select label="Service line" value={f.service || ""} onChange={(v) => setF("service", v)} options={[["", "All service lines"], ...Array.from(new Set(db.projects.map((p) => p.service))).map((s) => [s, s] as [string, string])]} />
        <Select label="Project manager" value={f.pm || ""} onChange={(v) => setF("pm", v)} options={[["", "All PMs"], ...Array.from(new Set(db.projects.map((p) => p.pmId))).map((id) => [id, nameOf(db, id)] as [string, string])]} />
        <Select label="Client" value={f.client || ""} onChange={(v) => setF("client", v)} options={[["", "All clients"], ...db.clients.map((c) => [c.id, c.name] as [string, string])]} />
        {anyFilter && <Btn kind="ghost" size="sm" onClick={() => { clear(); if (r.query.health) navigate("/projects/portfolio", { replace: true }); }}>Clear filters</Btn>}
        <span className="tu-grow" />
        <div className="tu-seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "cards"} className={view === "cards" ? "on" : ""} onClick={() => setPrefs({ projectView: "cards" })}><Icon name="grid" size={13} /> Cards</button>
          <button role="tab" aria-selected={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setPrefs({ projectView: "list" })}><Icon name="list" size={13} /> List</button>
        </div>
      </div>
      {!list.length ? <Card><Empty title="No projects match these filters" action={<Btn onClick={clear}>Clear filters</Btn>}>Try another health state or client.</Empty></Card>
        : view === "cards" ? (
          <div className="tu-grid tu-g3">
            {list.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        ) : (
          <Card pad={false}>
            <div className="tu-tablewrap">
              <table className="tu-table">
                <thead><tr><th>Project</th><th>Client</th><th>PM</th><th>Progress</th><th>Cost burn</th><th>Value</th><th>Forecast</th><th>Tasks</th><th>Health</th></tr></thead>
                <tbody>
                  {list.map((p) => {
                    const ts = projectTasks(db, p.id);
                    return (
                      <tr key={p.id} className="click" onClick={() => navigate("/projects/p/" + p.id + "/overview")}>
                        <td><div style={{ fontWeight: 600 }}>{p.id}</div><div className="tu-small tu-muted">{p.name}</div></td>
                        <td className="tu-small">{labelOf(db, "client", p.clientId)}</td>
                        <td><PersonLink id={p.pmId} /></td>
                        <td><ProgressCell p={p} /></td>
                        <td><BurnCell p={p} /></td>
                        <td className="tu-small">{valueLabel(db, p).main}</td>
                        <td className="tu-small">{fmtDate(p.forecastFinish)}{slipDays(p) > 0 && <div style={{ color: "var(--bad)" }}>+{slipDays(p)} days</div>}</td>
                        <td className="tu-small">{ts.filter(isOpen).length} / {ts.length}</td>
                        <td><HealthBadge health={p.health} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </Page>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const db = useDB();
  const ts = projectTasks(db, p.id);
  const open = ts.filter(isOpen).length;
  const od = ts.filter((t) => isOverdue(t, Date.now())).length;
  const v = valueLabel(db, p);
  return (
    <Card onClick={() => navigate("/projects/p/" + p.id + "/overview")} style={{ display: "flex", flexDirection: "column" }}>
      <div className="tu-row" style={{ alignItems: "flex-start" }}>
        <div className="tu-grow">
          <div className="tu-small tu-muted">{p.id} · {p.service}</div>
          <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-.2px", marginTop: 3, lineHeight: 1.3 }}>{p.name}</div>
        </div>
        <HealthBadge health={p.health} />
      </div>
      <div className="tu-small tu-muted" style={{ marginTop: 6 }}>{labelOf(db, "client", p.clientId)} · {p.location}</div>
      <div style={{ marginTop: 14 }}><ProgressCell p={p} /></div>
      {p.blocker && <div className="tu-small" style={{ marginTop: 10, color: p.health === "Off track" ? "var(--bad)" : "var(--warn)" }}><Icon name="alert" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{p.blocker}</div>}
      <div className="tu-grid tu-g2" style={{ gap: 8, marginTop: 14, fontSize: 12 }}>
        <div><div className="tu-faint">Value</div><div style={{ fontWeight: 600 }}>{v.main}</div></div>
        <div><div className="tu-faint">Tasks</div><div style={{ fontWeight: 600 }}>{open} open / {ts.length}{od ? <span style={{ color: "var(--bad)" }}> · {od} overdue</span> : null}</div></div>
        <div><div className="tu-faint">Start</div><div>{fmtDate(p.startAt)}</div></div>
        <div><div className="tu-faint">Forecast finish</div><div style={{ color: slipDays(p) > 0 ? "var(--bad)" : undefined }}>{fmtDate(p.forecastFinish)}{slipDays(p) > 0 ? " (+" + slipDays(p) + "d)" : ""}</div></div>
      </div>
      <div className="tu-row" style={{ marginTop: "auto", paddingTop: 14 }}>
        <AvatarStack ids={[p.pmId, ...p.team.filter((x) => x !== p.pmId)]} size={24} />
        <span className="tu-grow" />
        <span className="tu-small tu-muted">PM {nameOf(db, p.pmId)}</span>
      </div>
    </Card>
  );
}

/* ── Delivery Plan: cross-project milestones and dependencies ────── */
function DeliveryPlan() {
  const db = useDB();
  const now = Date.now();
  const [f, setF] = useFilter("plan");
  const today = todayKey();
  const start = addDays(mondayOf(today), -21);
  const weeks = 16;
  const px = 9;
  const W = weeks * 7 * px;
  const x = (iso: string) => daysBetween(start, keyOf(Date.parse(iso))) * px;
  const projs = db.projects.filter((p) => !f.project || p.id === f.project);
  const ms = db.milestones.filter((m) => projs.some((p) => p.id === m.projectId)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return (
    <Page title="Delivery Plan" sub="Milestones and dependencies across the portfolio, baseline against forecast. Permit-dependent work is shown as conditional.">
      <div className="tu-toolbar">
        <Select label="Project" value={f.project || ""} onChange={(v) => setF("project", v)} options={[["", "All projects"], ...db.projects.map((p) => [p.id, p.id + " " + p.short] as [string, string])]} />
        <span className="tu-small tu-muted"><span className="tu-dot" style={{ background: "var(--accent-fill)" }} /> Forecast · <span className="tu-dot" style={{ background: "var(--neutral)" }} /> Baseline · <span style={{ color: "#E5484D" }}>│</span> Today</span>
      </div>
      <Card pad={false}>
        <div className="tu-gantt" role="region" aria-label="Portfolio milestone timeline, scrolls horizontally" tabIndex={0}>
          <div className="tu-gantt-inner" style={{ width: 260 + W }}>
            <div className="tu-g-row" style={{ background: "var(--surface-faint)" }}>
              <div className="tu-g-label tu-small tu-muted">Project / milestone</div>
              <div className="tu-g-track" style={{ width: W }}>
                {Array.from({ length: weeks }).map((_, i) => {
                  const k = addDays(start, i * 7);
                  return <span key={i} className="tu-small tu-faint" style={{ position: "absolute", left: i * 7 * px + 4, top: 9 }}>{parseInt(k.slice(8), 10)} {MON[parseInt(k.slice(5, 7), 10) - 1]}</span>;
                })}
              </div>
            </div>
            {projs.map((p) => {
              const pms = ms.filter((m) => m.projectId === p.id);
              return (
                <div key={p.id}>
                  <div className="tu-g-row">
                    <div className="tu-g-label"><button className="tu-link" style={{ color: "var(--ink)", fontWeight: 600 }} onClick={() => navigate("/projects/p/" + p.id + "/timeline")}>{p.id} {p.short}</button><HealthBadge health={p.health} /></div>
                    <div className="tu-g-track" style={{ width: W }}>
                      <div className="tu-g-today" style={{ left: x(new Date(now).toISOString()) }} />
                      <div className="tu-g-base" style={{ left: Math.max(0, x(p.startAt)), width: Math.max(4, x(p.baselineFinish) - Math.max(0, x(p.startAt))) }} title={"Baseline finish " + fmtDate(p.baselineFinish)} />
                      <div className="tu-g-bar" style={{ left: Math.max(0, x(p.startAt)), width: Math.max(6, x(p.forecastFinish) - Math.max(0, x(p.startAt))), background: p.health === "Off track" ? "#F4A0A6" : p.health === "At risk" ? "#F6CF85" : "#D9EE7A", opacity: .55 }} title={"Forecast finish " + fmtDate(p.forecastFinish)} onClick={() => navigate("/projects/p/" + p.id + "/timeline")}>{slipDays(p) > 0 ? "+" + slipDays(p) + " days" : "on baseline"}</div>
                    </div>
                  </div>
                  {pms.map((m) => {
                    const st = milestoneState(m, now);
                    const slip = daysBetween(keyOf(Date.parse(m.baselineAt)), keyOf(Date.parse(m.dueAt)));
                    return (
                      <div key={m.id} className="tu-g-row">
                        <div className="tu-g-label" style={{ paddingLeft: 26 }}>
                          <button className="tu-link tu-ellipsis" style={{ color: "var(--body)" }} onClick={() => openRef("milestone", m.id)}>{m.name}</button>
                          {m.conditional && <Badge tone="warn">Conditional</Badge>}
                        </div>
                        <div className="tu-g-track" style={{ width: W }}>
                          {slip !== 0 && <span className="tu-g-diamond" style={{ left: x(m.baselineAt) - 7, background: "transparent", border: "1.5px solid var(--neutral)" }} title={"Baseline " + fmtDate(m.baselineAt)} />}
                          <button className="tu-g-diamond" aria-label={m.name + ", " + st + ", forecast " + fmtDate(m.dueAt)} title={m.name + ": forecast " + fmtDate(m.dueAt) + (slip ? " (" + (slip > 0 ? "+" : "") + slip + " days vs baseline)" : "")}
                            onClick={() => openRef("milestone", m.id)}
                            style={{ left: x(m.dueAt) - 7, background: st === "Complete" ? "var(--ok)" : st === "Late" ? "#E5484D" : m.conditional ? "repeating-linear-gradient(45deg,#F2B44B 0 3px,#fff 3px 6px)" : "var(--accent-fill)" }} />
                          <span className="tu-small tu-muted" style={{ position: "absolute", left: x(m.dueAt) + 12, top: 9, whiteSpace: "nowrap" }}>{fmtDate(m.dueAt)}{slip > 0 ? " · +" + slip + "d" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="Forecast movement" sub="Milestones whose forecast differs from baseline" pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Milestone</th><th>Project</th><th>Owner</th><th>Baseline</th><th>Forecast</th><th className="num">Movement</th><th>State</th></tr></thead>
              <tbody>
                {ms.filter((m) => m.dueAt !== m.baselineAt || milestoneState(m, now) === "Late").map((m) => {
                  const slip = daysBetween(keyOf(Date.parse(m.baselineAt)), keyOf(Date.parse(m.dueAt)));
                  return (
                    <tr key={m.id} className="click" onClick={() => openRef("milestone", m.id)}>
                      <td>{m.name}{m.conditional && <div className="tu-small" style={{ color: "var(--warn)" }}>{m.conditional}</div>}</td>
                      <td className="tu-small"><Ref type="project" id={m.projectId} /></td>
                      <td><PersonLink id={m.ownerId} /></td>
                      <td className="tu-small">{fmtDate(m.baselineAt)}</td><td className="tu-small">{fmtDate(m.dueAt)}</td>
                      <td className="num" style={{ color: slip > 0 ? "var(--bad)" : "var(--ok)", fontWeight: 600 }}>{slip > 0 ? "+" : ""}{slip}d</td>
                      <td><Badge tone={milestoneState(m, now) === "Late" ? "bad" : milestoneState(m, now) === "Complete" ? "ok" : ""}>{milestoneState(m, now)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Critical dependencies">
          <div className="tu-stack" style={{ gap: 12 }}>
            {(() => {
              const po = db.purchaseOrders.find((p) => p.id === "PO-5521")!;
              const permit = db.permits.find((p) => p.id === "PER-DLR-017")!;
              const rth = db.projects.find((p) => p.id === "TRN-2041")!;
              return (
                <>
                  <Dep icon="alert" tone="bad" title={"Hall 4: containment " + (po.revisedDueAt ? daysBetween(keyOf(Date.parse(po.dueAt)), keyOf(Date.parse(po.revisedDueAt))) : 0) + " days late"} body={"PO-5521 now due " + fmtDate(po.revisedDueAt) + ". Zones C and D wait."} onClick={() => openRef("po", "PO-5521")} />
                  <Dep icon="alert" tone="warn" title={"Rathdrum: forecast moved " + slipDays(rth) + " days"} body="Watermain diversion clash; variation CR-2041-03 pending." onClick={() => navigate("/projects/p/TRN-2041/timeline")} />
                  <Dep icon="shield" tone={permit.status === "Pending decision" ? "warn" : "ok"} title={"DLR: licence " + permit.id + " " + permit.status.toLowerCase()} body={permit.status === "Pending decision" ? "Decision due " + fmtDate(permit.decisionDueAt) + ". Main works conditional." : "Recorded " + (permit.decision?.reference || "") + "."} onClick={() => openRef("permit", permit.id)} />
                </>
              );
            })()}
          </div>
        </Card>
      </div>
    </Page>
  );
}
function Dep({ icon, tone, title, body, onClick }: { icon: string; tone: "bad" | "warn" | "ok"; title: string; body: string; onClick: () => void }) {
  return (
    <button className="tu-rowbtn" style={{ border: "1px solid var(--border)", borderRadius: 12, alignItems: "flex-start" }} onClick={onClick}>
      <span style={{ color: "var(--" + tone + ")", marginTop: 2 }}><Icon name={icon} size={16} /></span>
      <span className="tu-grow"><span style={{ display: "block", fontWeight: 600 }}>{title}</span><span className="tu-small tu-muted">{body}</span></span>
      <Icon name="chevR" size={14} />
    </button>
  );
}

/* ── Commercials: change register and valuations ─────────────────── */
function Commercials() {
  const db = useDB();
  const now = Date.now();
  const [f, setF] = useFilter("commercials");
  const pf = portfolio(db, now);
  const changes = db.changes.filter((c) => (!f.project || c.projectId === f.project) && (!f.status || c.status === f.status));
  const vals = db.valuations.filter((v) => !f.project || v.projectId === f.project).sort((a, b) => Date.parse(a.reviewAt) - Date.parse(b.reviewAt));
  return (
    <Page title="Commercials" sub="Change control and valuation preparation. Original contract values are kept; approved variations are shown separately. Not an accounting system.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="External works, original contracts" value={eur(pf.originalValue)} sub={"Current " + eur(pf.originalValue + pf.approvedVariations)} />
        <Stat label="Cost to date, external works" value={eur(pf.externalCost)} sub={"Earned value " + eur(pf.earned) + " (progress × contract, demo assumption)"} />
        <Stat label="Pending priced changes" value={eur(pf.pendingPriced)} sub={pf.pendingChanges.map((c) => c.id).join(", ") || "None"} tone={pf.pendingPriced ? "warn" : undefined} />
        <Stat label="Internal programme (CI Hub)" value={eur(pf.internalCost)} sub={"of " + eur(pf.internalBudget) + " internal budget, separate from revenue"} />
      </div>
      <div className="tu-toolbar">
        <Select label="Project" value={f.project || ""} onChange={(v) => setF("project", v)} options={[["", "All projects"], ...db.projects.map((p) => [p.id, p.id + " " + p.short] as [string, string])]} />
        <Select label="Status" value={f.status || ""} onChange={(v) => setF("status", v)} options={[["", "All statuses"], "Draft", "Awaiting approval", "Approved", "Rejected"]} />
      </div>
      <Card title="Change register" sub="Variations and recovery proposals with evidence and approvals" pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Change</th><th>Project</th><th>Kind</th><th>Owner</th><th className="num">Amount</th><th>Raised</th><th>Evidence</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="click" onClick={() => openRef("change", c.id)}>
                  <td><div style={{ fontWeight: 600 }}>{c.id}</div><div className="tu-small tu-muted">{c.title}</div></td>
                  <td className="tu-small"><Ref type="project" id={c.projectId} /></td>
                  <td className="tu-small">{c.kind}</td>
                  <td><PersonLink id={c.ownerId} /></td>
                  <td className="num">{c.amount ? eur(c.amount) : <span className="tu-muted">Being priced</span>}</td>
                  <td className="tu-small">{fmtDate(c.raisedAt)}</td>
                  <td className="tu-small">{c.evidenceDocIds.length ? c.evidenceDocIds.length + " documents" : "None"}</td>
                  <td><Badge tone={c.status === "Approved" ? "ok" : c.status === "Rejected" ? "bad" : c.status === "Draft" ? "" : "warn"}>{c.status}</Badge></td>
                  <td>{c.approvalId && c.status === "Awaiting approval" && <Btn size="xs" kind="navy" onClick={(e) => { e.stopPropagation(); openApproval(c.approvalId!); }}>Review</Btn>}</td>
                </tr>
              ))}
              {!changes.length && <tr><td colSpan={9}><Empty title="No changes match" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="Valuation workspace" sub="Drafts in preparation. A draft valuation is not an invoice." pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Valuation</th><th>Project</th><th className="num">Draft</th><th>Review</th><th>Evidence readiness</th><th>Status</th></tr></thead>
              <tbody>
                {vals.map((v) => (
                  <tr key={v.id} className="click" onClick={() => openRef("valuation", v.id)}>
                    <td style={{ fontWeight: 600 }}>{v.period}</td>
                    <td className="tu-small"><Ref type="project" id={v.projectId} /></td>
                    <td className="num">{eur(v.amount)}</td>
                    <td className="tu-small">{fmtDate(v.reviewAt)}</td>
                    <td style={{ minWidth: 150 }}><div className="tu-row"><div className="tu-grow"><div className="tu-prog"><i style={{ width: v.readiness * 100 + "%", background: v.readiness >= 0.8 ? "var(--ok)" : "var(--warn)" }} /></div></div><span className="tu-small">{pct(v.readiness)}</span></div></td>
                    <td><Badge>{v.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Cost against progress" sub="Burn is actual cost over the contract or budget baseline, not margin">
          <div className="tu-stack" style={{ gap: 12 }}>
            {db.projects.filter((p) => p.model !== "Managed service").map((p) => {
              const b = burn(p) || 0;
              const ev = earnedValue(p);
              return (
                <button key={p.id} className="tu-rowbtn" style={{ border: 0, padding: 0, flexDirection: "column", alignItems: "stretch", gap: 5 }} onClick={() => navigate("/projects/p/" + p.id + "/overview")}>
                  <div className="tu-row"><b className="tu-grow">{p.short}</b><span className="tu-small tu-muted">{ev !== null ? "EV less cost " + eur(ev - (p.cost || 0)) : "Internal budget"}</span></div>
                  <div className="tu-row tu-small"><span style={{ width: 62 }} className="tu-muted">Progress</span><div className="tu-grow tu-prog"><i style={{ width: p.progress * 100 + "%" }} /></div><span style={{ width: 36, textAlign: "right" }}>{pct(p.progress)}</span></div>
                  <div className="tu-row tu-small"><span style={{ width: 62 }} className="tu-muted">Burn</span><div className={"tu-grow tu-prog " + (b > p.progress ? "warn" : "ok")}><i style={{ width: b * 100 + "%" }} /></div><span style={{ width: 36, textAlign: "right", color: b > p.progress ? "var(--warn)" : undefined }}>{pct(b)}</span></div>
                </button>
              );
            })}
            <div className="tu-small tu-faint">AquaComms is a managed service with no contract value seeded, so it has no burn bar.</div>
          </div>
        </Card>
      </div>
    </Page>
  );
}

/* ── Risks & Compliance ──────────────────────────────────────────── */
function Risks() {
  const db = useDB();
  const [f, setF] = useFilter("risks");
  const [sort, setSort] = useState<{ k: "rating" | "review" | "project"; dir: 1 | -1 }>({ k: "rating", dir: -1 });
  const risks = useMemo(() => db.risks.filter((r) => !f.project || r.projectId === f.project).sort((a, b) => {
    const v = sort.k === "rating" ? a.probability * a.impact - b.probability * b.impact : sort.k === "review" ? Date.parse(a.reviewAt) - Date.parse(b.reviewAt) : a.projectId.localeCompare(b.projectId);
    return v * sort.dir;
  }), [db.risks, f.project, sort]);
  const permits = db.permits.filter((p) => !f.project || p.projectId === f.project);
  const rams = db.rams.filter((p) => !f.project || p.projectId === f.project);
  return (
    <Page title="Risks & Compliance" sub="Risk register, permits and RAMS with the work they unblock. The project filter stays set when you open a record and come back.">
      <div className="tu-toolbar">
        <Select label="Project" value={f.project || ""} onChange={(v) => setF("project", v)} options={[["", "All projects"], ...db.projects.map((p) => [p.id, p.id + " " + p.short] as [string, string])]} />
      </div>
      <Card title="Risk register" pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Risk</th><SortTh k="project" label="Project" sort={sort} setSort={setSort} /><th className="num">P</th><th className="num">I</th><SortTh k="rating" label="Rating" sort={sort} setSort={setSort} num /><th>Mitigation</th><th>Owner</th><SortTh k="review" label="Review" sort={sort} setSort={setSort} /></tr></thead>
            <tbody>
              {risks.map((r) => {
                const s = r.probability * r.impact;
                return (
                  <tr key={r.id} className="click" onClick={() => openRef("risk", r.id)}>
                    <td><div style={{ fontWeight: 500 }}>{r.title}</div><div className="tu-small tu-muted">{r.id} · {r.status}</div></td>
                    <td className="tu-small"><Ref type="project" id={r.projectId} /></td>
                    <td className="num">{r.probability}</td><td className="num">{r.impact}</td>
                    <td className="num"><Badge tone={s >= 15 ? "bad" : s >= 8 ? "warn" : ""}>{s}</Badge></td>
                    <td className="tu-small" style={{ maxWidth: 360 }}>{r.mitigation}</td>
                    <td><PersonLink id={r.ownerId} /></td>
                    <td className="tu-small">{fmtDate(r.reviewAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="tu-grid tu-g2" style={{ marginTop: 14 }}>
        <Card title="Permits" pad={false}>
          <div className="tu-tablewrap"><table className="tu-table">
            <thead><tr><th>Permit</th><th>Authority</th><th>Due / expiry</th><th>Blocked work</th><th>Status</th></tr></thead>
            <tbody>{permits.map((p) => (
              <tr key={p.id} className="click" onClick={() => openRef("permit", p.id)}>
                <td><div style={{ fontWeight: 600 }}>{p.id}</div><div className="tu-small tu-muted">{p.name}</div></td>
                <td className="tu-small">{p.authority}</td>
                <td className="tu-small">{p.status === "Pending decision" ? "Decision " + fmtDate(p.decisionDueAt) : "Expires " + fmtDate(p.expiresAt)}</td>
                <td className="tu-small">{p.blockedTaskIds.length ? p.blockedTaskIds.length + " tasks" : "None"}</td>
                <td><Badge tone={p.status === "Pending decision" ? "warn" : p.status === "Refused" ? "bad" : "ok"}>{p.status}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        </Card>
        <Card title="RAMS" pad={false}>
          <div className="tu-tablewrap"><table className="tu-table">
            <thead><tr><th>RAMS</th><th>Owner</th><th>Review</th><th>Linked work</th><th>Status</th></tr></thead>
            <tbody>{rams.map((r) => (
              <tr key={r.id} className="click" onClick={() => openRef("rams", r.id)}>
                <td><div style={{ fontWeight: 600 }}>{r.id}</div><div className="tu-small tu-muted">{r.title}</div></td>
                <td><PersonLink id={r.ownerId} /></td>
                <td className="tu-small">{fmtDate(r.reviewAt)}</td>
                <td className="tu-small">{r.taskIds.length} tasks · <Ref type="doc" id={r.docId}>document</Ref></td>
                <td><Badge tone={r.status === "Approved" ? "ok" : "warn"}>{r.status}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      </div>
    </Page>
  );
}
