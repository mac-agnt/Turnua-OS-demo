/* Dashboard: Executive (Command Centre), Delivery, Commercials, Service Performance, Safety & Capacity.
   The Pulse KPI band renders above this content; everything here is derived from the shared records. */
import { useRef, useState } from "react";
import type { DB, Project } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate, openEvent } from "../../ui";
import { Page, Card, Stat, Btn, Badge, HealthBadge, Avatar, AvatarStack, Progress, Icon, Empty, openRef, Ref } from "../../kit";
import { TaskLine } from "../../drawers/TaskDrawer";
import { answer, SUGGESTIONS, type Answer } from "../../assistant";
import {
  portfolio, workforce, ppm, credsDue, credState, sla, isUnresolved, isOverdue, isDue48, burn, earnedValue, slipDays,
  milestoneState, occurrences, approvedVariations, nameOf, person, allocated, utilTone, CREW, AQC_SITES, labelOf, client,
} from "../../selectors";
import { addDays, ago, daysBetween, eur, eurShort, fmtDate, fmtKey, greetingFor, hhmm, keyOf, mondayOf, pct, todayKey, num, atMs } from "../../time";
import { SLA_TARGET } from "../../seed";
import "./dashboard.css";

const goTimeline = (id: string) => navigate("/projects/p/" + id + "/timeline");
const goOverview = (id: string) => navigate("/projects/p/" + id + "/overview");
const rowKeys = (fn: () => void) => ({ onClick: fn, tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });

export default function DashboardModule({ tab }: { tab: string }) {
  const db = useDB();
  switch (tab) {
    case "delivery": return <Delivery db={db} />;
    case "commercials": return <Commercials db={db} />;
    case "service": return <Service db={db} />;
    case "safety": return <Safety db={db} />;
    default: return <Executive db={db} />;
  }
}

/* ── shared bits ─────────────────────────────────────────────────── */
function ProgCell({ value, label, tone }: { value: number; label: string; tone?: "ok" | "warn" | "bad" }) {
  return <div className="db-cell-prog"><Progress value={value} tone={tone} label={label} /><span>{label}</span></div>;
}
function BurnCell({ db, p }: { db: DB; p: Project }) {
  if (p.model === "Managed service") return <span className="tu-small tu-muted">Service agreement</span>;
  const b = burn(p) || 0;
  const over = b > p.progress;
  const base = p.model === "Internal budget" ? p.budget || 0 : p.contractValue || 0;
  void db;
  return (
    <div style={{ minWidth: 170 }}>
      <ProgCell value={b} label={pct(b)} tone={over ? "warn" : "ok"} />
      <div className="tu-small tu-faint" style={{ marginTop: 2 }}>
        {over ? <><Icon name="alert" size={11} style={{ verticalAlign: -1, marginRight: 3, color: "var(--warn)" }} />{Math.round((b - p.progress) * 100)} pts above progress · </> : null}
        of {eurShort(base)}{p.model === "Internal budget" ? " internal budget" : ""}
      </div>
    </div>
  );
}
function progressOf(db: DB, p: Project): { value: number; label: string } {
  if (p.model === "Managed service") { const r = ppm(db, p.siteIds); return { value: r.ratio, label: pct(r.ratio) + " PPM cycle complete" }; }
  return { value: p.progress, label: pct(p.progress) };
}

/* ── Executive: Command Centre ───────────────────────────────────── */
function ExecHeader({ db }: { db: DB }) {
  const now = useClock();
  const w = workforce(db);
  const pf = portfolio(db, now);
  const p1 = db.tickets.filter((t) => isUnresolved(t) && t.priority === "P1").length;
  return (
    <header className="tu-head" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0 }}>
        <div className="tu-eyebrow" style={{ marginBottom: 6 }}>Command Centre · {fmtKey(keyOf(now), { long: true })}</div>
        <h1>{greetingFor(now)}, David</h1>
        <div className="db-hero" aria-label="Today at a glance">
          <button onClick={() => navigate("/people/directory")}><b>{w.status["On site"] || 0}</b><span>people on site</span></button>
          <button onClick={() => navigate("/work/team?due=48h")}><b>{pf.tasks.due48}</b><span>tasks due within 48 hours</span></button>
          <button onClick={() => navigate("/helpdesk/queue")}><b style={{ color: p1 ? "var(--bad)" : undefined }}>{p1}</b><span>active P1 incident{p1 === 1 ? "" : "s"}</span></button>
        </div>
      </div>
      <div className="tu-actions" style={{ flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className="db-live"><span className="tu-dot tu-pulse" aria-hidden="true" />Live across {db.sites.length} sites</span>
        <span className="tu-small tu-faint" title="Fictional demo records held in this browser. See Settings, Experience.">Demo workspace · local records</span>
      </div>
    </header>
  );
}

function PortfolioTable({ db }: { db: DB }) {
  return (
    <Card title="Portfolio" sub={db.projects.length + " active projects · burn is cost divided by the contract or budget baseline"} pad={false}
      right={<Btn size="sm" onClick={() => navigate("/projects/portfolio")}>Open portfolio</Btn>}>
      <div className="tu-tablewrap">
        <table className="tu-table">
          <thead><tr><th>Project</th><th>Client</th><th>PM</th><th>Progress</th><th>Cost burn</th><th>Health</th></tr></thead>
          <tbody>
            {db.projects.map((p) => {
              const pr = progressOf(db, p);
              const pm = person(db, p.pmId);
              return (
                <tr key={p.id} className="click" {...rowKeys(() => goOverview(p.id))} aria-label={"Open " + p.name}>
                  <td style={{ minWidth: 220 }}><div style={{ fontWeight: 600 }}>{p.short}</div><div className="tu-small tu-muted">{p.id} · {p.name}</div></td>
                  <td className="tu-small" style={{ minWidth: 140 }}>{client(db, p.clientId)?.name}</td>
                  <td><span className="tu-row" style={{ gap: 6 }}><Avatar person={pm} size={22} /><span className="tu-small">{pm?.first}</span></span></td>
                  <td><ProgCell value={pr.value} label={pr.label} /></td>
                  <td><BurnCell db={db} p={p} /></td>
                  <td><HealthBadge health={p.health} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AskPanel({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; a: Answer } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = (text: string) => { const t = text.trim(); if (!t) return; setRes({ q: t, a: answer(t) }); setQ(""); };
  const follow = (l: Answer["links"][number]) => {
    if (l.type === "nav") navigate(l.id);
    else if (l.type === "project-timeline") navigate("/projects/p/" + l.id + "/timeline");
    else if (l.type === "project-board") navigate("/projects/p/" + l.id + "/board");
    else if (l.type === "palette") input.current?.focus();
    else openRef(l.type, l.id);
  };
  return (
    <Card title="Ask Turnua OS" sub="Answers come from the records in this workspace">
      <form className="tu-row" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <label className="tu-grow">
          <span className="tu-sr">Ask Turnua OS</span>
          <input ref={input} className="tu-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about projects, people, approvals" />
        </label>
        <Btn kind="primary" type="submit" icon="arrowR" aria-label="Ask" disabled={!q.trim()} />
      </form>
      <div className="db-chips" style={{ marginTop: 10 }}>
        {SUGGESTIONS.map((s) => <button key={s} className="tu-chip" onClick={() => run(s)}>{s}</button>)}
      </div>
      {res && (
        <div className="db-answer" aria-live="polite">
          <div className="q">{res.q}</div>
          <div className="tool">{res.a.tool}</div>
          <div>{res.a.text}</div>
          {res.a.cols && res.a.rows && res.a.rows.length > 0 && (
            <div className="tu-tablewrap">
              <table className="db-mini-table">
                <thead><tr>{res.a.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{res.a.rows.slice(0, compact ? 4 : 6).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
              </table>
              {res.a.rows.length > (compact ? 4 : 6) && <div className="tu-small tu-faint" style={{ marginTop: 4 }}>{res.a.rows.length - (compact ? 4 : 6)} more rows in the source view</div>}
            </div>
          )}
          <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 10 }}>
            {res.a.links.map((l, i) => <Btn key={i} size="xs" kind={l.primary ? "navy" : ""} onClick={() => follow(l)}>{l.label}</Btn>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function Agenda({ db }: { db: DB }) {
  const now = Date.now();
  const today = todayKey();
  const occ = occurrences(db, today, addDays(today, 1));
  const allDay = occ.filter((o) => o.allDay);
  const timed = occ.filter((o) => !o.allDay).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const startOfToday = atMs(today, 0);
  const shown = timed.slice(0, 9);
  return (
    <Card title="Today’s team agenda" sub={fmtKey(today, { long: true, year: false }) + " · " + timed.length + " timed, " + allDay.length + " all day"} pad={false}
      right={<Btn size="sm" onClick={() => navigate("/calendar/day?d=" + today)}>Calendar</Btn>}>
      <div className="tu-list">
        {allDay.map((o) => (
          <div key={o.key} className="tu-li click" {...rowKeys(() => openEvent(o.eventId, o.date))} style={{ alignItems: "center" }}>
            <span className="db-time">All day</span>
            <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{o.title}</div><div className="tu-small tu-muted">{o.type}{o.provisional ? " · provisional" : ""}</div></div>
            <AvatarStack ids={o.attendeeIds} size={20} max={3} />
          </div>
        ))}
        {shown.map((o) => {
          const past = Date.parse(o.end) < now;
          const carried = Date.parse(o.start) < startOfToday;
          return (
            <div key={o.key} className="tu-li click" {...rowKeys(() => openEvent(o.eventId, o.date))} style={{ alignItems: "center", opacity: past ? 0.6 : 1 }}>
              <span className="db-time">{carried ? "until " + hhmm(o.end) : hhmm(o.start) + " to " + hhmm(o.end)}</span>
              <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{o.title}</div><div className="tu-small tu-muted tu-ellipsis">{o.type}{o.location ? " · " + o.location : ""}{past ? " · done" : ""}</div></div>
              <AvatarStack ids={o.attendeeIds} size={20} max={3} />
            </div>
          );
        })}
        {!occ.length && <Empty title="Nothing on the team calendar today" />}
      </div>
      {timed.length > shown.length && <div className="tu-card-f"><button className="tu-link" onClick={() => navigate("/calendar/day?d=" + today)}>{timed.length - shown.length} more in the calendar</button></div>}
    </Card>
  );
}

function PriorityTasks({ db }: { db: DB }) {
  const now = Date.now();
  const all = db.tasks.filter((t) => isOverdue(t, now) || isDue48(t, now)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const od = all.filter((t) => isOverdue(t, now)).length;
  return (
    <Card title="Priority tasks" sub={od + " overdue · " + (all.length - od) + " due within 48 hours"} pad={false}
      right={<Btn size="sm" onClick={() => navigate("/work/team?due=overdue")}>Team tasks</Btn>}>
      <div className="tu-list">
        {all.slice(0, 6).map((t) => <TaskLine key={t.id} t={t} />)}
        {!all.length && <Empty title="No overdue or near-due work" />}
      </div>
      {all.length > 6 && <div className="tu-card-f"><button className="tu-link" onClick={() => navigate("/work/team?due=48h")}>{all.length - 6} more</button></div>}
    </Card>
  );
}

function CredsDue({ db, days = 45 }: { db: DB; days?: number }) {
  const now = Date.now();
  const list = credsDue(db, now, days);
  return (
    <Card title={"Credentials due within " + days + " days"} sub="Demo due dates, not compliance advice" pad={false}
      right={<Btn size="sm" onClick={() => navigate("/people/certifications")}>Certifications</Btn>}>
      <div className="tu-list">
        {list.map((c) => {
          const s = credState(c, now);
          const p = person(db, c.personId);
          return (
            <div key={c.id} className="tu-li click" {...rowKeys(() => openRef("credential", c.id))} style={{ alignItems: "center" }}>
              <Avatar person={p} size={26} />
              <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{p?.name}</div><div className="tu-small tu-muted tu-ellipsis">{c.name}</div></div>
              <div style={{ textAlign: "right" }}>
                <div className="tu-small">{fmtDate(c.dueAt)}</div>
                <Badge tone={s.tone === "plain" ? "" : s.tone} icon={c.bookingId ? "cal" : "clock"}>{c.bookingId ? "Booked" : (s.days ?? 0) + " days"}</Badge>
              </div>
            </div>
          );
        })}
        {!list.length && <Empty title={"Nothing due within " + days + " days"} />}
      </div>
    </Card>
  );
}

function ActivityFeed({ db, limit = 8 }: { db: DB; limit?: number }) {
  const now = useClock();
  return (
    <Card title="Live activity" sub="Every action in this workspace, newest first" pad={false} right={<Btn size="sm" onClick={() => navigate("/activity/all")}>All activity</Btn>}>
      <div className="tu-list">
        {db.activity.slice(0, limit).map((a) => (
          <div key={a.id} className="tu-li click" {...rowKeys(() => openRef(a.sourceType, a.sourceId))}>
            <span className="tu-dot" style={{ marginTop: 6, background: a.actorType === "agent" ? "var(--accent-fill)" : a.actorType === "system" ? "var(--neutral)" : "var(--ok)" }} aria-hidden="true" />
            <div className="tu-grow">
              <div style={{ lineHeight: 1.45 }}><b style={{ fontWeight: 600 }}>{a.actor}</b> <span className="tu-muted">{a.text}</span></div>
              <div className="tu-small tu-faint">{a.category} · {a.actorType === "agent" ? "Agent" : a.actorType === "system" ? "System" : "Person"} · {ago(a.at, now)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Executive({ db }: { db: DB }) {
  return (
    <div className="tu tu-page">
      <ExecHeader db={db} />
      <PortfolioTable db={db} />
      <div className="tu-grid tu-g3" style={{ marginTop: 14, alignItems: "start" }}>
        <AskPanel compact />
        <Agenda db={db} />
        <PriorityTasks db={db} />
      </div>
      <div className="tu-split-r" style={{ marginTop: 14 }}>
        <CredsDue db={db} />
        <ActivityFeed db={db} />
      </div>
    </div>
  );
}

/* ── Delivery ────────────────────────────────────────────────────── */
function Delivery({ db }: { db: DB }) {
  const now = Date.now();
  const today = todayKey();
  const mon = mondayOf(today);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mon, i * 7));
  const open = db.milestones.filter((m) => !m.completedAt);
  const po = db.purchaseOrders.find((x) => x.id === "PO-5521");
  const poDelay = po && po.revisedDueAt ? daysBetween(keyOf(Date.parse(po.dueAt)), keyOf(Date.parse(po.revisedDueAt))) : 0;
  const h4 = db.projects.find((p) => p.id === "TRN-2052");
  const rth = db.projects.find((p) => p.id === "TRN-2041");
  const dlr = db.projects.find((p) => p.id === "TRN-2063");
  const permit = db.permits.find((p) => p.id === "PER-DLR-017");
  const rec = db.approvals.find((a) => a.id === "APR-2052-02");
  const overdueBy = db.projects.map((p) => {
    const t = db.tasks.filter((x) => x.projectId === p.id);
    return { p, overdue: t.filter((x) => isOverdue(x, now)).length, open: t.filter((x) => x.status !== "Done").length };
  });
  const maxOpen = Math.max(1, ...overdueBy.map((x) => x.open));
  const totalOverdue = overdueBy.reduce((n, x) => n + x.overdue, 0);
  return (
    <Page title="Delivery" sub="Programme health, the next eight weeks of milestones and the dependencies that move them. Rows open the project timeline.">
      <Card title="Programme health" sub="Baseline against forecast handover" pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Project</th><th>Health</th><th>Baseline finish</th><th>Forecast finish</th><th className="num">Slip</th><th>What moves it</th></tr></thead>
            <tbody>
              {db.projects.map((p) => {
                const slip = slipDays(p);
                return (
                  <tr key={p.id} className="click" {...rowKeys(() => goTimeline(p.id))} aria-label={"Open " + p.short + " timeline"}>
                    <td style={{ minWidth: 200 }}><div style={{ fontWeight: 600 }}>{p.short}</div><div className="tu-small tu-muted">{p.id}</div></td>
                    <td><HealthBadge health={p.health} /></td>
                    <td className="tu-small">{fmtDate(p.baselineFinish)}</td>
                    <td className="tu-small">{fmtDate(p.forecastFinish)}{p.scenario && p.scenario.state === "Proposed" && <div className="tu-faint">Recovery target {fmtDate(p.scenario.finish)} (proposed)</div>}{p.scenario && p.scenario.state === "Approved" && <div className="tu-faint">Approved recovery target</div>}</td>
                    <td className="num">{slip > 0 ? <Badge tone={slip > 14 ? "bad" : "warn"} icon="alert">+{slip} days</Badge> : <Badge tone="ok" icon="ok">On baseline</Badge>}</td>
                    <td className="tu-small" style={{ minWidth: 220 }}>{p.blocker || (p.model === "Managed service" ? "Service term, PPM cycle and incidents" : "No blocking dependency")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: 14 }}>
        <Card title="Milestone calendar" sub={"Eight weeks from " + fmtKey(mon) + ". Late and conditional milestones are marked."}
          right={<div className="db-legend"><span><i style={{ background: "var(--bad)" }} />Late</span><span><i style={{ background: "var(--warn)" }} />Conditional</span><span><i style={{ background: "var(--accent-fill)" }} />Upcoming</span><span><i style={{ background: "#16181C" }} />Handover</span></div>}>
          <div className="db-weeks">
            {weeks.map((w, i) => {
              const end = addDays(w, 7);
              const items = open.filter((m) => { const k = keyOf(Date.parse(m.dueAt)); return k >= w && k < end; }).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
              return (
                <div key={w} className={"db-week" + (i === 0 ? " now" : "")}>
                  <div className="h">{i === 0 ? "This week" : "w/c " + fmtKey(w)}</div>
                  {items.map((m) => {
                    const st = milestoneState(m, now);
                    const cls = m.conditional ? "cond" : st === "Late" ? "late" : m.handover ? "hand" : "ok";
                    return (
                      <button key={m.id} className={"db-ms " + cls} onClick={() => openRef("milestone", m.id)} title={m.name + ", " + fmtDate(m.dueAt)}>
                        {m.name}
                        <small>{db.projects.find((p) => p.id === m.projectId)?.short} · {fmtKey(keyOf(Date.parse(m.dueAt)))}{st === "Late" ? " · late" : ""}{m.conditional ? " · conditional" : ""}</small>
                      </button>
                    );
                  })}
                  {!items.length && <span className="tu-small tu-faint">No milestones</span>}
                </div>
              );
            })}
          </div>
          {open.filter((m) => keyOf(Date.parse(m.dueAt)) >= addDays(mon, 56)).length > 0 && (
            <div className="tu-small tu-faint" style={{ marginTop: 10 }}>{open.filter((m) => keyOf(Date.parse(m.dueAt)) >= addDays(mon, 56)).length} later milestones, including handovers, sit beyond this window.</div>
          )}
        </Card>
      </div>

      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="Critical dependencies" sub="External and supplier dependencies on the critical path" pad={false}>
          {h4 && po && (
            <div className="db-dep">
              <span className="ic bad"><Icon name="alert" size={16} /></span>
              <div className="tu-grow">
                <div style={{ fontWeight: 600 }}>Hall 4: containment package {poDelay} days late</div>
                <div className="tu-small tu-muted" style={{ marginTop: 3 }}>PO-5521 was due {fmtDate(po.dueAt)}, now {fmtDate(po.revisedDueAt)}. Zones C and D wait for it. Forecast handover {fmtDate(h4.forecastFinish)} against baseline {fmtDate(h4.baselineFinish)}. Recovery proposal {rec ? rec.status.toLowerCase() : "not raised"}{h4.scenario ? ", target " + fmtDate(h4.scenario.finish) : ""}. The delivery itself is still pending.</div>
                <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 8 }}>
                  <Btn size="xs" kind="navy" onClick={() => goTimeline(h4.id)}>Timeline</Btn>
                  <Btn size="xs" onClick={() => openRef("po", "PO-5521")}>PO-5521</Btn>
                  <Btn size="xs" onClick={() => openRef("task", "T-2052-10")}>Blocked task</Btn>
                  {rec && <Btn size="xs" onClick={() => openRef("approval", rec.id)}>{rec.id}</Btn>}
                </div>
              </div>
            </div>
          )}
          {rth && (
            <div className="db-dep">
              <span className={"ic " + (slipDays(rth) > 0 ? "warn" : "ok")}><Icon name={slipDays(rth) > 0 ? "clock" : "ok"} size={16} /></span>
              <div className="tu-grow">
                <div style={{ fontWeight: 600 }}>Rathdrum: forecast moved {slipDays(rth)} days</div>
                <div className="tu-small tu-muted" style={{ marginTop: 3 }}>{rth.blocker || "No open blocker"}. Baseline {fmtDate(rth.baselineFinish)}, forecast {fmtDate(rth.forecastFinish)}. Variation CR-2041-03 is {(db.changes.find((c) => c.id === "CR-2041-03")?.status || "").toLowerCase()}.</div>
                <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 8 }}>
                  <Btn size="xs" kind="navy" onClick={() => goTimeline(rth.id)}>Timeline</Btn>
                  <Btn size="xs" onClick={() => openRef("change", "CR-2041-03")}>CR-2041-03</Btn>
                  <Btn size="xs" onClick={() => openRef("task", "T-2041-01")}>Diversion clash task</Btn>
                </div>
              </div>
            </div>
          )}
          {dlr && permit && (
            <div className="db-dep">
              <span className={"ic " + (permit.status === "Pending decision" ? "warn" : permit.status === "Refused" ? "bad" : "ok")}><Icon name="shield" size={16} /></span>
              <div className="tu-grow">
                <div style={{ fontWeight: 600 }}>DLR: licence {permit.id} {permit.status === "Pending decision" ? "pending" : permit.status.toLowerCase()}</div>
                <div className="tu-small tu-muted" style={{ marginTop: 3 }}>
                  {permit.status === "Pending decision"
                    ? "Council decision due " + fmtDate(permit.decisionDueAt) + ". " + permit.blockedTaskIds.length + " main-works tasks are conditional on it. The provisional crew window does not satisfy the licence."
                    : "Decision recorded " + (permit.decision ? fmtDate(permit.decision.at) + ", reference " + permit.decision.reference : "") + ". Main works dependency cleared."}
                  {permit.escalatedAt ? " Escalated " + ago(permit.escalatedAt) + "." : ""}
                </div>
                <div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 8 }}>
                  <Btn size="xs" kind="navy" onClick={() => goTimeline(dlr.id)}>Timeline</Btn>
                  <Btn size="xs" onClick={() => openRef("permit", permit.id)}>{permit.id}</Btn>
                </div>
              </div>
            </div>
          )}
        </Card>
        <Card title="Overdue tasks by project" sub={totalOverdue + " overdue across " + overdueBy.filter((x) => x.overdue).length + " projects"}>
          <div className="db-bars">
            {overdueBy.map(({ p, overdue, open: o }) => (
              <button key={p.id} className="db-bar-row" onClick={() => goTimeline(p.id)} aria-label={p.short + ": " + overdue + " overdue of " + o + " open"}>
                <span className="db-bar-label">{p.short}</span>
                <span className="db-bar-track">
                  <i style={{ width: (o / maxOpen) * 100 + "%", background: "var(--neutral)" }} />
                  <i style={{ width: (overdue / maxOpen) * 100 + "%", background: "var(--bad)" }} />
                </span>
                <span className="tu-small" style={{ minWidth: 92, textAlign: "right" }}><b style={{ color: overdue ? "var(--bad)" : "var(--ink)" }}>{overdue}</b> of {o} open</span>
              </button>
            ))}
          </div>
          <div className="db-legend" style={{ marginTop: 12 }}><span><i style={{ background: "var(--bad)" }} />Overdue</span><span><i style={{ background: "var(--neutral)" }} />Open</span></div>
        </Card>
      </div>
    </Page>
  );
}

/* ── Commercials ─────────────────────────────────────────────────── */
function Commercials({ db }: { db: DB }) {
  const now = Date.now();
  const pf = portfolio(db, now);
  const works = db.projects.filter((p) => p.model === "Works contract");
  const internal = db.projects.filter((p) => p.model === "Internal budget");
  const services = db.projects.filter((p) => p.model === "Managed service");
  const pending = db.changes.filter((c) => c.status === "Awaiting approval");
  const other = db.changes.filter((c) => c.status !== "Awaiting approval");
  const vals = db.valuations.slice().sort((a, b) => Date.parse(a.reviewAt) - Date.parse(b.reviewAt));
  const current = pf.originalValue + pf.approvedVariations;
  return (
    <Page title="Commercials" sub="External works contracts only in the portfolio totals. The internal CI Hub programme and the managed service are reported separately. Figures exclude VAT.">
      <div className="tu-grid tu-g5">
        <Stat label="Works contract portfolio (original)" value={eurShort(pf.originalValue)} sub={works.length + " works contracts"} onClick={() => navigate("/projects/commercials")} />
        <Stat label="Approved variations" value={eur(pf.approvedVariations)} sub={"Current contract " + eur(current)} />
        <Stat label="Cost to date, works" value={eur(pf.externalCost)} sub={pct(pf.externalCost / Math.max(1, pf.originalValue)) + " of original value"} />
        <Stat label="Earned value (simplified)" value={eurShort(pf.earned)} sub={"EV less cost " + (pf.earned - pf.externalCost < 0 ? "−" : "") + eur(Math.abs(pf.earned - pf.externalCost))} tone={pf.earned < pf.externalCost ? "warn" : undefined} />
        <Stat label="Pending priced changes" value={eur(pf.pendingPriced)} sub={pf.pendingChanges.length + " awaiting approval"} tone={pf.pendingPriced ? "warn" : undefined} onClick={() => navigate("/work/approvals")} />
      </div>
      <p className="tu-small tu-faint" style={{ margin: "8px 2px 0" }}>Earned value is a demo assumption: physical progress × original contract value. It is not an accounting figure.</p>

      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="Cost against progress" sub="Works contracts. Burn is cost divided by the contract baseline, not a margin."
          right={<div className="db-legend"><span><i style={{ background: "var(--bar)" }} />Physical progress</span><span><i style={{ background: "var(--warn)" }} />Cost burn</span></div>}>
          <div className="db-bars">
            {works.map((p) => {
              const b = burn(p) || 0;
              const ev = earnedValue(p) || 0;
              const gap = Math.round((b - p.progress) * 100);
              return (
                <button key={p.id} className="db-bar-row" style={{ alignItems: "start" }} onClick={() => goOverview(p.id)} aria-label={p.short + ": progress " + pct(p.progress) + ", burn " + pct(b)}>
                  <span><span className="db-bar-label" style={{ display: "block" }}>{p.short}</span><span className="tu-small tu-faint">{eurShort(p.contractValue || 0)}{approvedVariations(db, p.id) ? " + " + eurShort(approvedVariations(db, p.id)) + " approved" : ""}</span></span>
                  <span className="db-pair">
                    <span className="db-bar-track"><i style={{ width: p.progress * 100 + "%", background: "var(--bar)" }} /></span>
                    <span className="db-bar-track"><i style={{ width: b * 100 + "%", background: "var(--warn)" }} /></span>
                    <span className="tu-small tu-muted">{pct(p.progress)} progress · {pct(b)} burn · EV {eurShort(ev)} · EV less cost {ev - (p.cost || 0) < 0 ? "−" : ""}{eurShort(Math.abs(ev - (p.cost || 0)))}</span>
                  </span>
                  <span style={{ minWidth: 110, textAlign: "right" }}>{gap > 0 ? <Badge tone={gap >= 10 ? "bad" : "warn"} icon="alert">{gap} pts over</Badge> : <Badge tone="ok" icon="ok">Within progress</Badge>}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <Card title="Pending decisions" sub={eur(pf.pendingPriced) + " across priced changes awaiting approval"} pad={false}>
          <div className="tu-list">
            {pending.map((c) => (
              <div key={c.id} className="tu-li click" {...rowKeys(() => openRef(c.approvalId ? "approval" : "change", c.approvalId || c.id))}>
                <span className="tu-dot" style={{ marginTop: 6, background: "var(--warn)" }} aria-hidden="true" />
                <div className="tu-grow"><div style={{ fontWeight: 600 }}>{c.id} · {c.amount ? eur(c.amount) : "Unpriced"}</div><div className="tu-small tu-muted">{c.title}</div><div className="tu-small tu-faint">{c.kind} · {labelOf(db, "project", c.projectId)}</div></div>
                <Badge tone="warn" icon="clock">Awaiting</Badge>
              </div>
            ))}
            {!pending.length && <Empty title="No changes awaiting approval" />}
          </div>
          <div className="tu-card-f" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <span className="tu-eyebrow">Other changes</span>
            {other.map((c) => (
              <button key={c.id} className="tu-link tu-row" style={{ color: "var(--body)", justifyContent: "space-between", width: "100%" }} onClick={() => openRef("change", c.id)}>
                <span className="tu-ellipsis">{c.id} · {c.title}</span>
                <Badge tone={c.status === "Approved" ? "ok" : c.status === "Rejected" ? "bad" : ""}>{c.status}{c.amount ? " · " + eurShort(c.amount) : ""}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="tu-grid tu-g3" style={{ marginTop: 14, alignItems: "start" }}>
        <Card title="Valuation calendar" sub="Drafts, not invoices. Never shown as overdue." pad={false}>
          <div className="tu-list">
            {vals.map((v) => (
              <div key={v.id} className="tu-li click" {...rowKeys(() => openRef("valuation", v.id))} style={{ alignItems: "center" }}>
                <div style={{ minWidth: 70 }}><div className="tu-small" style={{ fontWeight: 600 }}>{fmtKey(keyOf(Date.parse(v.reviewAt)))}</div><div className="tu-small tu-faint">review</div></div>
                <div className="tu-grow"><div style={{ fontWeight: 500 }}>{labelOf(db, "project", v.projectId)}</div><div className="tu-small tu-muted">{v.period} · {eur(v.amount)} draft</div>
                  <div style={{ marginTop: 5 }}><Progress value={v.readiness} tone={v.readiness >= 0.8 ? "ok" : "warn"} label={"Evidence readiness " + pct(v.readiness)} /></div></div>
                <span className="tu-small tu-muted" style={{ minWidth: 40, textAlign: "right" }}>{pct(v.readiness)}</span>
              </div>
            ))}
          </div>
          <div className="tu-card-f">{eur(vals.reduce((n, v) => n + v.amount, 0))} in draft valuations</div>
        </Card>
        {internal.map((p) => {
          const gate = db.approvals.find((a) => a.projectId === p.id && a.kind === "Readiness gate");
          const b = burn(p) || 0;
          return (
            <Card key={p.id} title="Internal programme" sub="Cost programme, not external revenue" onClick={() => goOverview(p.id)}>
              <div style={{ fontWeight: 600 }}>{p.id} {p.name}</div>
              <div className="rc-mini"><span><b>{eur(p.budget || 0)}</b>approved budget</span><span><b>{eur(p.cost || 0)}</b>spent</span><span><b>{pct(p.progress)}</b>physical progress</span></div>
              <ProgCell value={b} label={pct(b) + " burn"} tone={b > p.progress ? "warn" : "ok"} />
              {gate && <div className="tu-small tu-muted" style={{ marginTop: 10 }}>Readiness gate {gate.status.toLowerCase()}{gate.dueAt ? ", due " + fmtDate(gate.dueAt) : ""}. Not included in the €{(pf.originalValue / 1e6).toFixed(2)}m works portfolio.</div>}
            </Card>
          );
        })}
        {services.map((p) => {
          const r = ppm(db, AQC_SITES);
          const open = db.tickets.filter((t) => AQC_SITES.includes(t.siteId) && isUnresolved(t)).length;
          return (
            <Card key={p.id} title="Managed service" sub="No contract value seeded; reported by service measures" onClick={() => navigate("/dashboard/service")}>
              <div style={{ fontWeight: 600 }}>{p.id} {p.name}</div>
              <div className="rc-mini"><span><b>{pct(r.ratio)}</b>PPM cycle ({r.done}/{r.total})</span><span><b>{(db.sla.met / db.sla.eligible * 100).toFixed(1)}%</b>SLA, 90 days</span><span><b>{open}</b>open tickets</span></div>
              <div className="tu-small tu-muted">Not added to the works contract portfolio. Service term to {fmtDate(p.forecastFinish)}.</div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

/* ── Service Performance ─────────────────────────────────────────── */
function LiveQueue({ db }: { db: DB }) {
  const now = useClock();
  const open = db.tickets.filter(isUnresolved).sort((a, b) => a.priority.localeCompare(b.priority));
  return (
    <Card title="Live queue" sub="All sites, not part of the 90-day report" pad={false} right={<Btn size="sm" onClick={() => navigate("/helpdesk/queue")}>Open queue</Btn>}>
      <div className="tu-list">
        {open.map((t) => {
          const s = sla(t, now);
          return (
            <div key={t.id} className="tu-li click" {...rowKeys(() => openRef("ticket", t.id))} style={{ alignItems: "center" }}>
              <Badge tone={t.priority === "P1" ? "bad" : t.priority === "P2" ? "warn" : ""}>{t.priority}</Badge>
              <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{t.id} {t.title}</div><div className="tu-small tu-muted">{labelOf(db, "site", t.siteId)} · {nameOf(db, t.engineerId)} · {t.status}</div></div>
              <Badge tone={s.tone === "plain" ? "" : s.tone} icon={s.state === "acknowledged" ? "ok" : "clock"}>{s.label}</Badge>
            </div>
          );
        })}
        {!open.length && <Empty title="No unresolved tickets" />}
      </div>
    </Card>
  );
}

function Service({ db }: { db: DB }) {
  const r = db.sla;
  const aqc = ppm(db, AQC_SITES);
  const unresolved = db.tickets.filter(isUnresolved);
  const maxE = Math.max(...r.weekly.map((w) => w.eligible));
  const compliance = (r.met / r.eligible * 100).toFixed(1);
  return (
    <Page title="Service Performance" sub={"Managed-service SLA, " + fmtDate(r.from) + " to " + fmtDate(r.to) + ". Reporting cutoff " + fmtDate(r.cutoffAt) + " 23:59."}>
      <div className="tu-grid tu-g4">
        <Stat label="Response compliance, 90 days" value={compliance + "%"} sub={num(r.met) + " of " + num(r.eligible) + " eligible tickets met target"} tone="ok" onClick={() => navigate("/helpdesk/sla")} />
        <Stat label="Mean response" value={r.meanResponseMins + " min"} sub="Acknowledgement time, same period" />
        <Stat label="Unresolved tickets now" value={String(unresolved.length)} sub={unresolved.filter((t) => t.priority === "P1").length + " P1 · " + unresolved.filter((t) => t.priority === "P2").length + " P2 · all sites"} tone={unresolved.some((t) => t.priority === "P1") ? "bad" : undefined} onClick={() => navigate("/helpdesk/queue")} />
        <Stat label="AquaComms PPM cycle" value={pct(aqc.ratio)} sub={aqc.done + " of " + aqc.total + " jobs, both landing stations"} onClick={() => navigate("/sites/maintenance")} />
      </div>
      <div className="tu-note" style={{ marginTop: 12 }}><b>Scope.</b> {r.scope}. The live queue mixes all sites and is not the denominator of this report. Tickets acknowledged after the cutoff join the next report.</div>

      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="13-week trend" sub="Eligible tickets per week; amber cap marks weeks with a missed target"
          right={<Btn size="sm" onClick={() => navigate("/helpdesk/sla")}>SLA Reports</Btn>}>
          <div className="db-trend" role="img" aria-label="Weekly ticket volume and missed targets">
            {r.weekly.map((w) => {
              const miss = w.eligible - w.met;
              return (
                <div key={w.week} title={w.week + ": " + w.met + " of " + w.eligible + " met, mean " + w.mean + " min"}>
                  <span className="val">{miss ? miss + " missed" : "all met"}</span>
                  <span className={"col" + (miss ? " miss" : "")} style={{ height: Math.max(8, (w.eligible / maxE) * 100) + "px" }} />
                  <span className="lbl">{fmtKey(w.week.slice(8)).slice(4)}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="By site" sub="Managed-service sites only">
          <div className="db-bars">
            {r.bySite.map((s) => (
              <button key={s.siteId} className="db-bar-row" onClick={() => navigate("/sites/s/" + s.siteId)}>
                <span className="db-bar-label">{labelOf(db, "site", s.siteId)}</span>
                <span className="db-bar-track"><i style={{ width: (s.met / s.eligible) * 100 + "%", background: "var(--ok)" }} /></span>
                <span className="tu-small" style={{ minWidth: 120, textAlign: "right" }}><b>{(s.met / s.eligible * 100).toFixed(1)}%</b> · {s.met}/{s.eligible}</span>
              </button>
            ))}
          </div>
          <div className="tu-small tu-faint" style={{ marginTop: 10 }}>Bars start at zero; compliance is high at both sites.</div>
        </Card>
      </div>

      <div className="tu-grid tu-g2" style={{ marginTop: 14, alignItems: "start" }}>
        <div className="tu-stack">
        <Card title="By priority" sub="Response targets: P1 60 min, P2 240, P3 1,440, P4 2,880" pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Priority</th><th className="num">Target</th><th className="num">Eligible</th><th className="num">Met</th><th className="num">Missed</th><th className="num">Compliance</th><th className="num">Mean</th></tr></thead>
              <tbody>
                {r.byPriority.map((p) => (
                  <tr key={p.priority}>
                    <td><Badge tone={p.priority === "P1" ? "bad" : p.priority === "P2" ? "warn" : ""}>{p.priority}</Badge></td>
                    <td className="num">{num(SLA_TARGET[p.priority])} min</td><td className="num">{num(p.eligible)}</td><td className="num">{num(p.met)}</td>
                    <td className="num">{p.eligible - p.met}</td><td className="num">{(p.met / p.eligible * 100).toFixed(1)}%</td><td className="num">{p.mean} min</td>
                  </tr>
                ))}
                <tr><td><b>Total</b></td><td /><td className="num"><b>{num(r.eligible)}</b></td><td className="num"><b>{num(r.met)}</b></td><td className="num"><b>{r.missed}</b></td><td className="num"><b>{compliance}%</b></td><td className="num"><b>{r.meanResponseMins} min</b></td></tr>
              </tbody>
            </table>
          </div>
        </Card>
        <LiveQueue db={db} />
        </div>
        <Card title="Missed targets" sub={r.missed + " tickets in the period"} pad={false} right={<Btn size="sm" onClick={() => navigate("/helpdesk/sla")}>Drill through</Btn>}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Ticket</th><th>Date</th><th>Site</th><th>Priority</th><th className="num">Response</th></tr></thead>
              <tbody>
                {r.missedRows.map((m) => (
                  <tr key={m.id} className="click" {...rowKeys(() => navigate("/helpdesk/sla"))}>
                    <td><div style={{ fontWeight: 500 }}>{m.id}</div><div className="tu-small tu-muted">{m.title}</div></td>
                    <td className="tu-small">{fmtDate(m.at)}</td><td className="tu-small">{labelOf(db, "site", m.siteId)}</td>
                    <td><Badge tone={m.priority === "P1" ? "bad" : m.priority === "P2" ? "warn" : ""}>{m.priority}</Badge></td>
                    <td className="num tu-small">{num(m.responseMins)} of {num(m.targetMins)} min</td>
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

/* ── Safety & Capacity ───────────────────────────────────────────── */
const CAPABILITIES: { kind: string; label: string; minimum: number }[] = [
  { kind: "Safe Pass", label: "Safe Pass (site access)", minimum: 6 },
  { kind: "IPAF", label: "IPAF, working at height (MEWP)", minimum: 2 },
  { kind: "Chapter 8", label: "Chapter 8 traffic management", minimum: 3 },
  { kind: "Confined Space", label: "Confined space entry", minimum: 3 },
  { kind: "First Aid", label: "First Aid", minimum: 2 },
  { kind: "Safe Electric-related training", label: "Electrical compliance training", minimum: 3 },
  { kind: "F-Gas", label: "F-Gas handling", minimum: 2 },
  { kind: "BICSI", label: "BICSI cabling", minimum: 3 },
  { kind: "NEBOSH", label: "NEBOSH", minimum: 1 },
  { kind: "CSCS", label: "CSCS excavation", minimum: 1 },
];

function Safety({ db }: { db: DB }) {
  const now = Date.now();
  const today = todayKey();
  const lti = db.projects[0]?.safety.lastLtiAt;
  const ltiDays = lti ? daysBetween(keyOf(Date.parse(lti)), today) : 0;
  const due45 = credsDue(db, now, 45);
  const due90 = credsDue(db, now, 90);
  const pendingPermits = db.permits.filter((p) => p.status === "Pending decision");
  const ramsOpen = db.rams.filter((r) => r.status !== "Approved");
  const openFindings = db.findings.filter((f) => f.status === "Open");
  const openItems = due45.filter((c) => !c.renewedAt).length + pendingPermits.length + ramsOpen.length + openFindings.length;
  const w = workforce(db);
  const talks = db.projects.reduce((n, p) => n + p.safety.toolboxTalks, 0);
  const talksWeek = db.projects.reduce((n, p) => n + p.safety.toolboxThisWeek, 0);
  const crew = db.people.filter((p) => CREW.includes(p.id));
  return (
    <Page title="Safety & Capacity" sub="Skills cover, renewals, crew load, permits and RAMS. Credentials and due dates are fictional demo records, not compliance advice.">
      <div className="tu-grid tu-g4">
        <div className="tu-stat">
          <div className="k">Days since a lost-time incident</div>
          <div className="v">{num(ltiDays)}</div>
          <div className="s">Illustrative demo counter, portfolio-wide, since {fmtDate(lti, { year: true })}</div>
        </div>
        <Stat label="Open safety and compliance items" value={String(openItems)} tone={openItems ? "warn" : "ok"}
          sub={due45.length + " credentials ≤45 days · " + pendingPermits.length + " permit pending · " + ramsOpen.length + " RAMS in review · " + openFindings.length + " findings"} />
        <Stat label="Toolbox talks" value={String(talks)} sub={talksWeek + " this week across " + db.projects.length + " projects"} />
        <Stat label="Planned crew utilisation" value={pct(w.crewUtil)} sub={w.crewAlloc + " of " + w.crewAvail + " hours, delivery crews"} onClick={() => navigate("/people/capacity")} />
      </div>

      <div className="tu-split" style={{ marginTop: 14 }}>
        <Card title="Skills coverage" sub="Current credentials held, against a demo minimum cover level" pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table db-matrix">
              <thead><tr><th>Capability</th><th>Holders</th><th className="num">Held</th><th className="num">Due ≤90 days</th><th>Cover</th></tr></thead>
              <tbody>
                {CAPABILITIES.map((c) => {
                  const creds = db.credentials.filter((x) => x.kind === c.kind && !(x.dueAt && Date.parse(x.dueAt) < now && !x.renewedAt));
                  const holders = Array.from(new Set(creds.map((x) => x.personId)));
                  const dueSoon = creds.filter((x) => x.dueAt && !x.renewedAt && daysBetween(today, keyOf(Date.parse(x.dueAt))) <= 90).length;
                  const tone = holders.length >= c.minimum ? (dueSoon ? "warn" : "ok") : "bad";
                  return (
                    <tr key={c.kind}>
                      <td style={{ minWidth: 200 }}>{c.label}</td>
                      <td><AvatarStack ids={holders} size={22} max={6} /></td>
                      <td className="num">{holders.length}</td>
                      <td className="num">{dueSoon || "None"}</td>
                      <td><Badge tone={tone} icon={tone === "ok" ? "ok" : "alert"}>{tone === "ok" ? "Covered" : tone === "warn" ? "Covered, renewal due" : "Below " + c.minimum}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Upcoming renewals" sub={due90.length + " within 90 days · " + due45.length + " within 45"} pad={false} right={<Btn size="sm" onClick={() => navigate("/people/certifications")}>Certifications</Btn>}>
          <div className="tu-list">
            {due90.map((c) => {
              const s = credState(c, now);
              return (
                <div key={c.id} className="tu-li click" {...rowKeys(() => openRef("credential", c.id))} style={{ alignItems: "center" }}>
                  <Avatar person={person(db, c.personId)} size={24} />
                  <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{nameOf(db, c.personId)}</div><div className="tu-small tu-muted tu-ellipsis">{c.name} · {fmtDate(c.dueAt)}</div></div>
                  <Badge tone={c.bookingId ? "accent" : s.tone === "plain" ? "" : s.tone}>{c.bookingId ? "Booked, awaiting evidence" : s.days + " days"}</Badge>
                </div>
              );
            })}
            {!due90.length && <Empty title="No renewals within 90 days" />}
          </div>
        </Card>
      </div>

      <div className="tu-grid tu-g3" style={{ marginTop: 14, alignItems: "start" }}>
        <Card title="Planned crew utilisation" sub="Allocated against available hours this week. Amber above 85%, red above 95%.">
          <div className="db-bars">
            {crew.map((p) => {
              const u = allocated(db, p.id) / p.available;
              const tone = utilTone(u) as "ok" | "warn" | "bad";
              return (
                <button key={p.id} className="db-bar-row" onClick={() => navigate("/people/p/" + p.id)} style={{ gridTemplateColumns: "minmax(110px,140px) minmax(0,1fr) auto" }}>
                  <span className="db-bar-label">{p.name}</span>
                  <span className="db-bar-track"><i style={{ width: Math.min(1, u) * 100 + "%", background: "var(--" + tone + ")" }} /></span>
                  <span className="tu-small" style={{ minWidth: 72, textAlign: "right", color: tone === "ok" ? "var(--dim)" : "var(--" + tone + ")" }}>{tone !== "ok" && <Icon name="alert" size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}{pct(u)} · {allocated(db, p.id)}h</span>
                </button>
              );
            })}
          </div>
        </Card>
        <Card title="Permit readiness" sub={pendingPermits.length + " pending · " + db.permits.length + " on record"} pad={false}>
          <div className="tu-list">
            {db.permits.map((p) => (
              <div key={p.id} className="tu-li click" {...rowKeys(() => openRef("permit", p.id))} style={{ alignItems: "center" }}>
                <Icon name="shield" size={15} style={{ color: p.status === "Pending decision" ? "var(--warn)" : p.status === "Refused" ? "var(--bad)" : "var(--ok)" }} />
                <div className="tu-grow"><div style={{ fontWeight: 500 }}>{p.id}</div><div className="tu-small tu-muted tu-ellipsis">{p.name}</div>
                  <div className="tu-small tu-faint">{p.status === "Pending decision" ? "Decision due " + fmtDate(p.decisionDueAt) + " · " + p.blockedTaskIds.length + " tasks waiting" : p.expiresAt ? "Expires " + fmtDate(p.expiresAt) : ""}</div></div>
                <Badge tone={p.status === "Pending decision" ? "warn" : p.status === "Refused" ? "bad" : "ok"}>{p.status === "Pending decision" ? "Pending" : p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card title="RAMS approvals" sub={ramsOpen.length + " in review · " + (db.rams.length - ramsOpen.length) + " approved"} pad={false}>
          <div className="tu-list">
            {db.rams.slice().sort((a, b) => (a.status === "Approved" ? 1 : 0) - (b.status === "Approved" ? 1 : 0)).map((r) => (
              <div key={r.id} className="tu-li click" {...rowKeys(() => openRef("rams", r.id))} style={{ alignItems: "center" }}>
                <div className="tu-grow"><div className="tu-ellipsis" style={{ fontWeight: 500 }}>{r.title}</div><div className="tu-small tu-muted">{r.id} · {labelOf(db, "project", r.projectId)} · review {fmtDate(r.reviewAt)}</div></div>
                <Badge tone={r.status === "Approved" ? "ok" : "warn"} icon={r.status === "Approved" ? "ok" : "clock"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Toolbox talks by project" sub="Recorded talks to date and this week" pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table">
              <thead><tr><th>Project</th><th className="num">Talks to date</th><th className="num">This week</th><th>Open findings at linked sites</th><th>RAMS in review</th></tr></thead>
              <tbody>
                {db.projects.map((p) => {
                  const ins = db.inspections.filter((i) => p.siteIds.includes(i.siteId)).map((i) => i.id);
                  const f = db.findings.filter((x) => ins.includes(x.inspectionId) && x.status === "Open");
                  return (
                    <tr key={p.id} className="click" {...rowKeys(() => goOverview(p.id))}>
                      <td><b>{p.short}</b> <span className="tu-small tu-muted">{p.id}</span></td>
                      <td className="num">{p.safety.toolboxTalks}</td><td className="num">{p.safety.toolboxThisWeek}</td>
                      <td>{f.length ? f.map((x) => <span key={x.id} style={{ marginRight: 6 }}><Ref type="finding" id={x.id}>{x.id}</Ref></span>) : <span className="tu-small tu-muted">None</span>}</td>
                      <td className="tu-small">{db.rams.filter((r) => r.projectId === p.id && r.status !== "Approved").length || "None"}</td>
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
