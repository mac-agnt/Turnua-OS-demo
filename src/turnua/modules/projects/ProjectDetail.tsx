/* Project detail: Board, Timeline, List and Overview, all on the shared task records. */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Task, TaskStatus, Priority, ID } from "../../types";
import { TASK_STATUSES, PRIORITIES, TAGS } from "../../types";
import { useDB } from "../../store";
import { navigate, openNew, useFilter } from "../../ui";
import { moveTask, toggleDone, updateTask, createTask, postProjectUpdate } from "../../actions";
import { Avatar, AvatarStack, Badge, Btn, Card, Empty, HealthBadge, Icon, KV, Page, PersonLink, PriorityBadge, Ref, Seg, SortTh, Tag, TAG_COLOR, download, openRef } from "../../kit";
import { addDays, ago, daysBetween, dueLabel, eur, fmtDate, keyOf, mondayOf, pct, todayKey, MON, at } from "../../time";
import { approvedVariations, burn, earnedValue, isOpen, isOverdue, milestoneState, nameOf, projectTasks, slipDays, labelOf } from "../../selectors";
import { valueLabel } from "./common";

const SUBS = [{ id: "board", label: "Board" }, { id: "timeline", label: "Timeline" }, { id: "list", label: "List" }, { id: "overview", label: "Overview" }];

export default function ProjectDetail({ id, sub }: { id: ID; sub: string }) {
  const db = useDB();
  const p = db.projects.find((x) => x.id === id);
  if (!p) return <Page title="Project not found" crumbs={[{ label: "Projects", to: "/projects/portfolio" }, { label: id }]}><Card><Empty title={"No project " + id} action={<Btn onClick={() => navigate("/projects/portfolio")}>Back to portfolio</Btn>}>It may have been created in another browser or cleared by a demo reset.</Empty></Card></Page>;
  const ts = projectTasks(db, p.id);
  const open = ts.filter(isOpen);
  const v = valueLabel(db, p, false);
  const view = SUBS.find((s) => s.id === sub) ? sub : "overview";
  return (
    <Page crumbs={[{ label: "Projects", to: "/projects/portfolio" }, { label: "Portfolio", to: "/projects/portfolio" }, { label: p.id }]}
      eyebrow={p.id + " · " + p.service}
      title={<span className="tu-row" style={{ gap: 12, flexWrap: "wrap" }}>{p.name}<HealthBadge health={p.health} /></span>}
      sub={labelOf(db, "client", p.clientId) + " · " + p.location + " · PM " + nameOf(db, p.pmId) + (p.techLeadId ? " · Technical lead " + nameOf(db, p.techLeadId) : "")}
      actions={<><AvatarStack ids={[p.pmId, ...p.team.filter((x) => x !== p.pmId), p.sponsorId]} /><Btn icon="plus" onClick={() => openNew("task", { projectId: p.id })}>New task</Btn><Btn kind="navy" icon="cal" onClick={() => navigate("/calendar/week")}>Calendar</Btn></>}>
      <div className="tu-grid tu-g6" style={{ marginBottom: 14 }}>
        <MiniStat k={p.model === "Managed service" ? "PPM cycle complete" : "Physical progress"} v={pct(p.progress)} s={p.progressLabel} />
        <MiniStat k={p.model === "Internal budget" ? "Internal budget" : p.model === "Managed service" ? "Commercial model" : "Contract"} v={p.model === "Managed service" ? "Service" : v.main.replace(/ contract| internal budget/, "")} s={v.sub} />
        <MiniStat k="Cost to date" v={p.cost === null ? "Not applicable" : eur(p.cost)} s={burn(p) !== null ? pct(burn(p)!) + " burn" + (burn(p)! > p.progress ? ", ahead of progress" : "") : "Service agreement"} tone={burn(p) !== null && burn(p)! > p.progress ? "warn" : undefined} />
        <MiniStat k="Open tasks" v={String(open.length)} s={ts.filter((t) => isOverdue(t, Date.now())).length + " overdue of " + ts.length} tone={ts.some((t) => isOverdue(t, Date.now())) ? "bad" : undefined} />
        <MiniStat k="Forecast finish" v={fmtDate(p.forecastFinish)} s={slipDays(p) > 0 ? "+" + slipDays(p) + " days vs " + fmtDate(p.baselineFinish) : "On baseline"} tone={slipDays(p) > 0 ? "bad" : undefined} />
        <MiniStat k="Blocker" v={p.blocker ? "1 open" : "None"} s={p.blocker || "No blocking dependency"} tone={p.blocker ? "warn" : undefined} />
      </div>
      <div className="tu-row" style={{ marginBottom: 14 }}>
        <Seg label="Project views" options={SUBS} value={view} onChange={(s) => navigate("/projects/p/" + p.id + "/" + s)} />
      </div>
      {view === "board" && <Board pid={p.id} />}
      {view === "timeline" && <Timeline pid={p.id} />}
      {view === "list" && <List pid={p.id} />}
      {view === "overview" && <Overview pid={p.id} />}
    </Page>
  );
}
function MiniStat({ k, v, s, tone }: { k: string; v: string; s: string; tone?: "warn" | "bad" | "ok" }) {
  return <div className="tu-stat"><div className="k">{k}</div><div className="v" style={{ fontSize: 18, color: tone ? "var(--" + tone + ")" : undefined }}>{v}</div><div className="s tu-ellipsis" title={s}>{s}</div></div>;
}

/* ── shared task filters ─────────────────────────────────────────── */
function useTaskFilter(pid: ID) {
  const db = useDB();
  const [f, setF, clear] = useFilter("ptasks-" + pid);
  const all = projectTasks(db, pid);
  const list = all.filter((t) => (!f.owner || (f.owner === "none" ? !t.ownerId : t.ownerId === f.owner)) && (!f.tag || t.tag === f.tag) && (!f.priority || t.priority === f.priority) && (!f.q || t.title.toLowerCase().includes(f.q.toLowerCase())));
  const owners = Array.from(new Set(all.map((t) => t.ownerId).filter(Boolean))) as string[];
  const bar = (
    <div className="tu-toolbar">
      <label className="tu-search" style={{ width: 220 }}><span className="tu-sr">Filter tasks</span><Icon name="search" size={14} /><input className="tu-input" value={f.q || ""} placeholder="Filter tasks" onChange={(e) => setF("q", e.target.value)} /></label>
      <select className="tu-select" aria-label="Owner" value={f.owner || ""} onChange={(e) => setF("owner", e.target.value)}><option value="">All owners</option>{owners.map((o) => <option key={o} value={o}>{nameOf(db, o)}</option>)}<option value="none">Unassigned</option></select>
      <select className="tu-select" aria-label="Tag" value={f.tag || ""} onChange={(e) => setF("tag", e.target.value)}><option value="">All tags</option>{TAGS.map((t) => <option key={t}>{t}</option>)}</select>
      <select className="tu-select" aria-label="Priority" value={f.priority || ""} onChange={(e) => setF("priority", e.target.value)}><option value="">All priorities</option>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select>
      {Object.values(f).some(Boolean) && <Btn kind="ghost" size="sm" onClick={clear}>Clear</Btn>}
      <span className="tu-grow" /><span className="tu-small tu-muted">{list.length} of {all.length} tasks</span>
    </div>
  );
  return { list, bar, all };
}

/* ── Board ───────────────────────────────────────────────────────── */
function Board({ pid }: { pid: ID }) {
  const { list, bar } = useTaskFilter(pid);
  const [drag, setDrag] = useState<ID | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; before: ID | null } | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const onDragOverCol = (e: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")).filter((c) => c.dataset.card !== drag);
    let before: ID | null = null;
    for (const c of cards) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = c.dataset.card || null; break; } }
    if (!over || over.status !== status || over.before !== before) setOver({ status, before });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || drag;
    if (id) moveTask(id, status, over?.status === status ? over.before : null);
    setDrag(null); setOver(null);
  };
  return (
    <>
      {bar}
      <div className="tu-board" role="list" aria-label="Task board">
        {TASK_STATUSES.map((status) => {
          const col = list.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
          return (
            <div key={status} role="listitem" aria-label={status + ", " + col.length + " tasks"} className={"tu-col" + (over?.status === status ? " drop" : "")}
              onDragOver={(e) => onDragOverCol(e, status)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }} onDrop={(e) => onDrop(e, status)}>
              <div className="tu-col-h"><span className="tu-grow">{status}</span><Badge>{col.length}</Badge></div>
              <div className="tu-col-b">
                {col.map((t) => (
                  <div key={t.id}>
                    {over?.status === status && over.before === t.id && drag !== t.id && <div className="tu-drop-line" />}
                    <KCard t={t} dragging={drag === t.id} onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDrag(t.id); }} onDragEnd={() => { setDrag(null); setOver(null); }} />
                  </div>
                ))}
                {over?.status === status && over.before === null && drag && <div className="tu-drop-line" />}
                {!col.length && <div className="tu-small tu-faint" style={{ padding: "10px 4px" }}>No tasks{status === "Done" ? " done yet" : ""}</div>}
                <form onSubmit={(e) => { e.preventDefault(); const title = (adding[status] || "").trim(); if (!title) return; createTask({ title, projectId: pid, status }); setAdding({ ...adding, [status]: "" }); }}>
                  <label className="tu-sr" htmlFor={"qa-" + status}>Add a task to {status}</label>
                  <input id={"qa-" + status} className="tu-input" style={{ height: 32, fontSize: 12.5, background: "transparent", borderStyle: "dashed" }} placeholder="+ Add task" value={adding[status] || ""} onChange={(e) => setAdding({ ...adding, [status]: e.target.value })} />
                </form>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tu-small tu-faint" style={{ marginTop: 8 }}>Drag cards between columns, or use each card’s status menu (keyboard and touch). Moves notify the owner inside the demo only.</p>
    </>
  );
}
function KCard({ t, dragging, onDragStart, onDragEnd }: { t: Task; dragging: boolean; onDragStart: (e: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void }) {
  const db = useDB();
  const dl = dueLabel(t.dueAt, t.status === "Done");
  const ck = t.checklist.filter((c) => c.done).length;
  return (
    <div data-card={t.id} className={"tu-kcard" + (dragging ? " dragging" : "")} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      role="button" tabIndex={0} aria-label={t.title + ", " + t.priority + ", " + dl.text} onClick={() => openRef("task", t.id)}
      onKeyDown={(e) => { if (e.key === "Enter") openRef("task", t.id); }}>
      <div className="tu-row" style={{ gap: 6 }}><Tag tag={t.tag} /><span className="tu-grow" />{t.priority !== "Normal" && <PriorityBadge p={t.priority} />}</div>
      <div className="t">{t.title}</div>
      <div className="tu-row tu-small" style={{ gap: 10, color: "var(--dim)" }}>
        <span style={{ color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : undefined, fontWeight: dl.tone === "bad" ? 600 : 400 }}>
          {dl.tone === "bad" ? <Icon name="alert" size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> : <Icon name="clock" size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}{dl.text}
        </span>
        {t.checklist.length > 0 && <span title="Checklist"><Icon name="check" size={11} style={{ verticalAlign: -1 }} /> {ck}/{t.checklist.length}</span>}
        {t.comments.length > 0 && <span title="Comments"><Icon name="msg" size={11} style={{ verticalAlign: -1 }} /> {t.comments.length}</span>}
        {t.permitId && db.permits.find((p) => p.id === t.permitId)?.status === "Pending decision" && <span style={{ color: "var(--warn)" }} title="Conditional on a permit">Permit</span>}
        <span className="tu-grow" />
        <Avatar person={db.people.find((p) => p.id === t.ownerId)} size={22} />
      </div>
      <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
        <label className="tu-sr" htmlFor={"mv-" + t.id}>Move {t.title}</label>
        <select id={"mv-" + t.id} className="tu-select" style={{ height: 26, fontSize: 11.5, padding: "0 8px" }} value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{s === t.status ? "Status: " + s : "Move to " + s}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ── Timeline (Gantt) ────────────────────────────────────────────── */
function Timeline({ pid }: { pid: ID }) {
  const db = useDB();
  const p = db.projects.find((x) => x.id === pid)!;
  const [zoom, setZoom] = useState<"week" | "month">(daysBetween(keyOf(Date.parse(p.startAt)), keyOf(Date.parse(p.forecastFinish))) > 200 ? "month" : "week");
  const px = zoom === "week" ? 16 : 5;
  const phases = db.phases.filter((x) => x.projectId === pid);
  const tasks = projectTasks(db, pid).filter((t) => t.startAt);
  const ms = db.milestones.filter((m) => m.projectId === pid);
  const startKey = mondayOf(addDays(keyOf(Date.parse(p.startAt)), -7));
  const endKey = addDays(keyOf(Date.parse(p.forecastFinish)), 21);
  const days = daysBetween(startKey, endKey);
  const W = days * px;
  const x = (iso: string) => daysBetween(startKey, keyOf(Date.parse(iso))) * px;
  const scroller = useRef<HTMLDivElement>(null);
  const todayX = daysBetween(startKey, todayKey()) * px;
  const goToday = () => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, todayX - 360); };
  useEffect(() => { goToday(); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: { kind: "phase" | "task" | "ms"; id: string }[] = [];
  phases.forEach((ph, i) => {
    rows.push({ kind: "phase", id: ph.id });
    const phEnd = Date.parse(ph.end), phStart = Date.parse(ph.start);
    tasks.filter((t) => { const d = Date.parse(t.dueAt); return i === phases.length - 1 ? d >= phStart : d >= phStart && d <= phEnd && !rows.some((r) => r.id === t.id); })
      .forEach((t) => { if (!rows.some((r) => r.id === t.id)) rows.push({ kind: "task", id: t.id }); });
  });
  tasks.forEach((t) => { if (!rows.some((r) => r.id === t.id)) rows.push({ kind: "task", id: t.id }); });
  ms.forEach((m) => rows.push({ kind: "ms", id: m.id }));
  const rowY = (id: string) => rows.findIndex((r) => r.id === id) * 35 + 35 + 17;
  const ticks: { x: number; label: string }[] = [];
  for (let k = startKey; k < endKey; k = addDays(k, zoom === "week" ? 7 : 1)) {
    if (zoom === "month" && k.slice(8) !== "01") continue;
    ticks.push({ x: daysBetween(startKey, k) * px, label: zoom === "week" ? parseInt(k.slice(8), 10) + " " + MON[parseInt(k.slice(5, 7), 10) - 1] : MON[parseInt(k.slice(5, 7), 10) - 1] + " " + k.slice(2, 4) });
  }
  const deps = tasks.flatMap((t) => t.dependsOn.filter((d) => tasks.some((y) => y.id === d)).map((d) => ({ from: d, to: t.id })));
  const scenario = p.scenario;
  return (
    <Card pad={false} title={<div><h2>Programme</h2><div className="tu-sub">Baseline handover {fmtDate(p.baselineFinish)} · forecast {fmtDate(p.forecastFinish)}{slipDays(p) > 0 ? " (+" + slipDays(p) + " days)" : ""}{scenario ? " · " + scenario.label + ": " + fmtDate(scenario.finish) + " (" + scenario.state.toLowerCase() + ")" : ""}</div></div>}
      right={<div className="tu-row"><Btn size="sm" onClick={goToday}>Today</Btn><Seg label="Zoom" options={[{ id: "week", label: "Weeks" }, { id: "month", label: "Months" }]} value={zoom} onChange={setZoom} /></div>}>
      {p.id === "TRN-2052" && (
        <div className="tu-note warn" style={{ margin: "12px 18px 0" }}>
          <b>Why the forecast moved:</b> containment package PO-5521 was due {fmtDate(db.purchaseOrders.find((x) => x.id === "PO-5521")?.dueAt)} and is now due {fmtDate(db.purchaseOrders.find((x) => x.id === "PO-5521")?.revisedDueAt)}. Procurement overruns its baseline by 21 days and pushes main works, testing and handover to {fmtDate(addDays(keyOf(Date.parse(p.baselineFinish)), 21) + "T12:00:00Z")}. {scenario?.state === "Approved" ? "The approved recovery plan targets " + fmtDate(scenario.finish) + "; the work itself is still to be done." : "Recovery proposal CR-2052-02 would target " + fmtDate(scenario?.finish) + " if approved; until then it is a scenario."}
        </div>
      )}
      <div ref={scroller} className="tu-gantt" style={{ marginTop: 12 }} role="region" aria-label="Project timeline, scrolls horizontally" tabIndex={0}>
        <div className="tu-gantt-inner" style={{ width: 260 + W }}>
          <div className="tu-g-row" style={{ background: "var(--surface-faint)", minHeight: 35 }}>
            <div className="tu-g-label tu-small tu-muted">Phase / task</div>
            <div className="tu-g-track" style={{ width: W, height: 35 }}>
              {ticks.map((t, i) => <span key={i} className="tu-small tu-faint" style={{ position: "absolute", left: t.x + 3, top: 10, whiteSpace: "nowrap" }}>{t.label}</span>)}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <svg width={260 + W} height={rows.length * 35} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2 }} aria-hidden="true">
              {deps.map((d, i) => {
                const a = tasks.find((t) => t.id === d.from)!, b = tasks.find((t) => t.id === d.to)!;
                const x1 = 260 + x(a.dueAt), y1 = rowY(a.id) - 35, x2 = 260 + x(b.startAt!), y2 = rowY(b.id) - 35;
                return <path key={i} d={"M" + x1 + " " + y1 + " h8 V" + y2 + " H" + Math.max(x1 + 8, x2)} fill="none" stroke="var(--dim)" strokeWidth="1.3" strokeDasharray="3 2" markerEnd="" />;
              })}
            </svg>
            <div className="tu-g-today" style={{ left: 260 + todayX, zIndex: 3 }} title="Today" />
            {scenario && <div style={{ position: "absolute", top: 0, bottom: 0, left: 260 + x(scenario.finish), borderLeft: "2px dashed " + (scenario.state === "Approved" ? "var(--ok)" : "var(--warn)"), zIndex: 1 }} title={scenario.label + " " + fmtDate(scenario.finish)} />}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 260 + x(p.baselineFinish), borderLeft: "2px solid var(--neutral)", zIndex: 1 }} title={"Baseline handover " + fmtDate(p.baselineFinish)} />
            {rows.map((r) => {
              if (r.kind === "phase") {
                const ph = phases.find((x) => x.id === r.id)!;
                const late = Date.parse(ph.end) > Date.parse(ph.baselineEnd);
                return (
                  <div key={r.id} className="tu-g-row" style={{ background: "var(--surface-faint)" }}>
                    <div className="tu-g-label" style={{ fontWeight: 600 }}><span className="tu-grow tu-ellipsis">{ph.name}</span>{ph.note && <Icon name="alert" size={12} style={{ color: late ? "var(--bad)" : "var(--warn)" }} />}</div>
                    <div className="tu-g-track" style={{ width: W }}>
                      <div className="tu-g-base" style={{ left: x(ph.start), width: Math.max(4, x(ph.baselineEnd) - x(ph.start)) }} title={"Baseline end " + fmtDate(ph.baselineEnd)} />
                      <div className="tu-g-bar" role="img" aria-label={ph.name + " " + pct(ph.pct) + " complete" + (ph.note ? ". " + ph.note : "")} title={ph.name + ": " + fmtDate(ph.start) + " to " + fmtDate(ph.end) + (ph.note ? " · " + ph.note : "")}
                        style={{ left: x(ph.start), width: Math.max(8, x(ph.end) - x(ph.start)), background: late ? "linear-gradient(90deg,#E3F18E " + ph.pct * 100 + "%,#F6C3C7 " + ph.pct * 100 + "%)" : "linear-gradient(90deg,#DBFF00 " + ph.pct * 100 + "%,#EEF5C8 " + ph.pct * 100 + "%)", cursor: "default" }}>
                        {pct(ph.pct)}{ph.note ? " · " + ph.note : ""}
                      </div>
                    </div>
                  </div>
                );
              }
              if (r.kind === "task") {
                const t = tasks.find((x) => x.id === r.id)!;
                const owner = db.people.find((x) => x.id === t.ownerId);
                const od = isOverdue(t, Date.now());
                return (
                  <div key={r.id} className="tu-g-row">
                    <div className="tu-g-label" style={{ paddingLeft: 24 }}><Avatar person={owner} size={18} /><button className="tu-link tu-ellipsis" style={{ color: "var(--body)" }} onClick={() => openRef("task", t.id)}>{t.title}</button></div>
                    <div className="tu-g-track" style={{ width: W }}>
                      <button className="tu-g-bar" onClick={() => openRef("task", t.id)} aria-label={t.title + ", " + t.status + ", due " + fmtDate(t.dueAt)} title={t.title + " · " + nameOf(db, t.ownerId) + " · " + t.status + " · due " + fmtDate(t.dueAt)}
                        style={{ left: x(t.startAt!), width: Math.max(10, x(t.dueAt) - x(t.startAt!) + px), background: owner ? owner.color : "#C9CCC7", opacity: t.status === "Done" ? .45 : 1, outline: od ? "2px solid #E5484D" : undefined }}>
                        {t.status === "Done" ? "Done" : od ? "Overdue" : ""}
                      </button>
                    </div>
                  </div>
                );
              }
              const m = ms.find((x) => x.id === r.id)!;
              const st = milestoneState(m, Date.now());
              return (
                <div key={r.id} className="tu-g-row">
                  <div className="tu-g-label" style={{ paddingLeft: 24 }}><Icon name="flag" size={13} /><button className="tu-link tu-ellipsis" style={{ color: "var(--ink)" }} onClick={() => openRef("milestone", m.id)}>{m.name}</button><Badge tone={st === "Complete" ? "ok" : st === "Late" ? "bad" : ""}>{st}</Badge></div>
                  <div className="tu-g-track" style={{ width: W }}>
                    {m.baselineAt !== m.dueAt && <span className="tu-g-diamond" style={{ left: x(m.baselineAt) - 7, border: "1.5px solid var(--neutral)", background: "transparent" }} title={"Baseline " + fmtDate(m.baselineAt)} />}
                    <button className="tu-g-diamond" onClick={() => openRef("milestone", m.id)} aria-label={m.name + " " + fmtDate(m.dueAt)} title={m.name + " " + fmtDate(m.dueAt)}
                      style={{ left: x(m.dueAt) - 7, background: m.handover ? "#16181C" : st === "Complete" ? "var(--ok)" : st === "Late" ? "#E5484D" : "var(--accent-fill)", boxShadow: m.handover ? "0 0 0 2px #DBFF00" : undefined }} />
                    <span className="tu-small tu-muted" style={{ position: "absolute", left: x(m.dueAt) + 12, top: 9, whiteSpace: "nowrap" }}>{fmtDate(m.dueAt)}{m.handover ? " · handover" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="tu-card-f tu-wrap">
        <span><span className="tu-dot" style={{ background: "#DBFF00" }} /> Phase complete share</span>
        <span><span className="tu-dot" style={{ background: "var(--neutral)" }} /> Baseline</span>
        <span style={{ color: "#E5484D" }}>│ Today</span>
        <span>◆ Milestone · navy ◆ handover</span>
        <span>Task bars coloured by owner; dashed lines show dependencies</span>
      </div>
    </Card>
  );
}

/* ── List ────────────────────────────────────────────────────────── */
function List({ pid }: { pid: ID }) {
  const db = useDB();
  const { list, bar } = useTaskFilter(pid);
  const p = db.projects.find((x) => x.id === pid)!;
  const [sort, setSort] = useState<{ k: "title" | "owner" | "status" | "priority" | "due" | "tag"; dir: 1 | -1 }>({ k: "due", dir: 1 });
  const [sel, setSel] = useState<string[]>([]);
  const rows = useMemo(() => list.slice().sort((a, b) => {
    const pri = (t: Task) => PRIORITIES.indexOf(t.priority);
    const v = sort.k === "title" ? a.title.localeCompare(b.title) : sort.k === "owner" ? nameOf(db, a.ownerId).localeCompare(nameOf(db, b.ownerId)) : sort.k === "status" ? TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status)
      : sort.k === "priority" ? pri(a) - pri(b) : sort.k === "tag" ? a.tag.localeCompare(b.tag) : Date.parse(a.dueAt) - Date.parse(b.dueAt);
    return v * sort.dir;
  }), [list, sort, db]);
  const team = db.people.filter((x) => p.team.includes(x.id) || x.id === p.sponsorId);
  const bulk = (patch: Partial<Task>) => { sel.forEach((id) => { if (patch.status) moveTask(id, patch.status); else updateTask(id, patch); }); setSel([]); };
  return (
    <>
      {bar}
      {sel.length > 0 && (
        <div className="tu-note accent tu-row tu-wrap" style={{ marginBottom: 10 }}>
          <b>{sel.length} selected</b>
          <select className="tu-select" style={{ width: "auto", height: 30 }} aria-label="Set status for selected" value="" onChange={(e) => e.target.value && bulk({ status: e.target.value as TaskStatus })}><option value="">Set status…</option>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="tu-select" style={{ width: "auto", height: 30 }} aria-label="Set owner for selected" value="" onChange={(e) => e.target.value && bulk({ ownerId: e.target.value })}><option value="">Set owner…</option>{team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select className="tu-select" style={{ width: "auto", height: 30 }} aria-label="Set priority for selected" value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value as Priority })}><option value="">Set priority…</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
          <Btn size="sm" kind="ghost" onClick={() => setSel([])}>Clear selection</Btn>
        </div>
      )}
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all" checked={sel.length > 0 && sel.length === rows.length} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} /></th>
              <th style={{ width: 36 }}><span className="tu-sr">Complete</span></th>
              <SortTh k="title" label="Task" sort={sort} setSort={setSort} /><SortTh k="owner" label="Owner" sort={sort} setSort={setSort} /><SortTh k="status" label="Status" sort={sort} setSort={setSort} />
              <SortTh k="priority" label="Priority" sort={sort} setSort={setSort} /><SortTh k="tag" label="Tag" sort={sort} setSort={setSort} /><SortTh k="due" label="Due" sort={sort} setSort={setSort} />
            </tr></thead>
            <tbody>
              {rows.map((t) => {
                const dl = dueLabel(t.dueAt, t.status === "Done");
                return (
                  <tr key={t.id}>
                    <td><input type="checkbox" aria-label={"Select " + t.title} checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? sel.concat([t.id]) : sel.filter((x) => x !== t.id))} /></td>
                    <td><input type="checkbox" aria-label={(t.status === "Done" ? "Reopen " : "Complete ") + t.title} checked={t.status === "Done"} onChange={() => toggleDone(t.id)} style={{ accentColor: "var(--accent-fill)", width: 16, height: 16 }} /></td>
                    <td><button className="tu-link" style={{ color: "var(--ink)", fontWeight: 500, textDecoration: t.status === "Done" ? "line-through" : "none" }} onClick={() => openRef("task", t.id)}>{t.title}</button></td>
                    <td><select className="tu-select" aria-label={"Owner of " + t.title} style={{ height: 28, minWidth: 140 }} value={t.ownerId || ""} onChange={(e) => updateTask(t.id, { ownerId: e.target.value || null })}><option value="">Unassigned</option>{team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                    <td><select className="tu-select" aria-label={"Status of " + t.title} style={{ height: 28, minWidth: 130 }} value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td><select className="tu-select" aria-label={"Priority of " + t.title} style={{ height: 28, minWidth: 96 }} value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Priority })}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td><Tag tag={t.tag} /></td>
                    <td className="tu-small" style={{ color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : undefined, whiteSpace: "nowrap" }}>{dl.tone === "bad" && <Icon name="alert" size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}{fmtDate(t.dueAt)} · {dl.text}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8}><Empty title="No tasks match" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ── Overview ────────────────────────────────────────────────────── */
function Overview({ pid }: { pid: ID }) {
  const db = useDB();
  const now = Date.now();
  const p = db.projects.find((x) => x.id === pid)!;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.update.text);
  const ms = db.milestones.filter((m) => m.projectId === pid).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const risks = db.risks.filter((r) => r.projectId === pid).sort((a, b) => b.probability * b.impact - a.probability * a.impact);
  const changes = db.changes.filter((c) => c.projectId === pid);
  const val = db.valuations.find((v) => v.projectId === pid);
  const rams = db.rams.filter((r) => r.projectId === pid);
  const permits = db.permits.filter((r) => r.projectId === pid);
  const docs = db.docs.filter((d) => d.projectId === pid).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const ev = earnedValue(p);
  const av = approvedVariations(db, pid);
  const lti = daysBetween(keyOf(Date.parse(p.safety.lastLtiAt)), todayKey());
  return (
    <div className="tu-split">
      <div className="tu-stack">
        <Card title="Status update" sub={"By " + nameOf(db, p.update.authorId) + ", " + ago(p.update.at)} right={!editing && <Btn size="sm" icon="edit" onClick={() => { setText(p.update.text); setEditing(true); }}>Edit update</Btn>}>
          {editing ? (
            <>
              <label className="tu-sr" htmlFor="pu">Status update</label>
              <textarea id="pu" className="tu-textarea" style={{ minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="tu-row" style={{ marginTop: 10, justifyContent: "flex-end" }}><Btn onClick={() => setEditing(false)}>Cancel</Btn><Btn kind="primary" disabled={!text.trim()} onClick={() => { postProjectUpdate(pid, text.trim()); setEditing(false); }}>Post update</Btn></div>
            </>
          ) : <p style={{ margin: 0, lineHeight: 1.65 }}>{p.update.text}</p>}
        </Card>
        <Card title="Milestones" pad={false}>
          {ms.map((m) => {
            const st = milestoneState(m, now);
            return (
              <button key={m.id} className="tu-rowbtn" onClick={() => openRef("milestone", m.id)}>
                <span style={{ color: st === "Complete" ? "var(--ok)" : st === "Late" ? "var(--bad)" : "var(--dim)" }}><Icon name={st === "Complete" ? "ok" : st === "Late" ? "alert" : "clock"} size={16} /></span>
                <span className="tu-grow"><span style={{ display: "block", fontWeight: 500 }}>{m.name}{m.handover ? " (handover)" : ""}</span>
                  <span className="tu-small tu-muted">{nameOf(db, m.ownerId)} · {m.dependsOn.length ? "after " + m.dependsOn.map((d) => db.milestones.find((x) => x.id === d)?.name).join(", ") : "no dependency"}{m.conditional ? " · " + m.conditional : ""}</span></span>
                <span className="tu-small" style={{ textAlign: "right" }}>{fmtDate(m.dueAt)}{m.baselineAt !== m.dueAt && <div className="tu-faint">baseline {fmtDate(m.baselineAt)}</div>}</span>
                <Badge tone={st === "Complete" ? "ok" : st === "Late" ? "bad" : ""}>{st}</Badge>
              </button>
            );
          })}
        </Card>
        <Card title="Risk register" pad={false} right={<Btn size="sm" kind="ghost" onClick={() => navigate("/projects/risks")}>All risks</Btn>}>
          <div className="tu-tablewrap"><table className="tu-table">
            <thead><tr><th>Risk</th><th className="num">Rating</th><th>Mitigation</th><th>Owner</th><th>Review</th></tr></thead>
            <tbody>{risks.map((r) => (
              <tr key={r.id} className="click" onClick={() => openRef("risk", r.id)}>
                <td>{r.title}</td><td className="num"><Badge tone={r.probability * r.impact >= 15 ? "bad" : r.probability * r.impact >= 8 ? "warn" : ""}>{r.probability * r.impact}</Badge></td>
                <td className="tu-small">{r.mitigation}</td><td><PersonLink id={r.ownerId} /></td><td className="tu-small">{fmtDate(r.reviewAt)}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>
        <Card title="Documents" pad={false}>
          <div className="tu-tablewrap"><table className="tu-table">
            <thead><tr><th>Document</th><th>Type</th><th>Version</th><th>Owner</th><th>Updated</th><th></th></tr></thead>
            <tbody>{docs.map((d) => (
              <tr key={d.id}>
                <td><button className="tu-link" style={{ color: "var(--ink)" }} onClick={() => openRef("doc", d.id)}>{d.title}</button><div className="tu-small tu-muted">{d.status}</div></td>
                <td className="tu-small">{d.type}</td><td className="tu-small">{d.version}</td><td><PersonLink id={d.ownerId} /></td><td className="tu-small">{fmtDate(d.updatedAt)}</td>
                <td><div className="tu-row" style={{ gap: 4 }}><Btn size="xs" onClick={() => openRef("doc", d.id)}>View</Btn><Btn size="xs" kind="ghost" icon="dl" aria-label={"Download " + d.title} onClick={() => download(d.id + ".txt", [d.title, d.type + " " + d.version, "", ...d.body, "", "Turnua OS demo: mock document export."].join("\n"))} /></div></td>
              </tr>))}
              {!docs.length && <tr><td colSpan={6}><Empty title="No documents yet" /></td></tr>}</tbody>
          </table></div>
        </Card>
      </div>
      <div className="tu-stack">
        <Card title="Commercials">
          {p.model === "Managed service" ? (
            <KV items={[["Commercial model", "Managed service"], ["Contract amount", "Not seeded (not verified)"], ["PPM cycle", p.progressLabel], ["Service term", fmtDate(p.startAt) + " to " + fmtDate(p.baselineFinish)]]} />
          ) : p.model === "Internal budget" ? (
            <KV items={[["Internal budget", eur(p.budget || 0)], ["Spend to date", eur(p.cost || 0)], ["Burn", pct(burn(p) || 0)], ["Reported", "Separately from client revenue"]]} />
          ) : (
            <KV items={[["Original contract", eur(p.contractValue || 0)], ["Approved variations", eur(av)], ["Current contract", eur((p.contractValue || 0) + av)], ["Cost to date", eur(p.cost || 0) + " (" + pct(burn(p) || 0) + " burn)"],
              ["Earned value", ev !== null ? eur(ev) : ""], ["EV less cost", ev !== null ? <span style={{ color: ev - (p.cost || 0) < 0 ? "var(--bad)" : "var(--ok)" }}>{eur(ev - (p.cost || 0))}</span> : ""]]} />
          )}
          {p.model === "Works contract" && <p className="tu-small tu-faint" style={{ margin: "8px 0 0" }}>Earned value is a simplified demo calculation: physical progress × original contract. Burn is cost over the contract baseline, not margin.</p>}
          {changes.length > 0 && <div style={{ marginTop: 14 }}><div className="tu-eyebrow" style={{ marginBottom: 6 }}>Change requests</div>
            {changes.map((c) => <button key={c.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openRef("change", c.id)}><b>{c.id}</b><span className="tu-grow tu-ellipsis tu-small">{c.title}</span><span className="tu-small">{c.amount ? eur(c.amount) : "Pricing"}</span><Badge tone={c.status === "Approved" ? "ok" : c.status === "Rejected" ? "bad" : c.status === "Draft" ? "" : "warn"}>{c.status}</Badge></button>)}</div>}
          {val && <div style={{ marginTop: 12 }} className="tu-note"><b>Next valuation draft:</b> {eur(val.amount)}, review {fmtDate(val.reviewAt)}. Evidence {pct(val.readiness)} ready. <Ref type="valuation" id={val.id}>Open</Ref></div>}
        </Card>
        <Card title="Safety and compliance">
          <KV items={[["Days since lost-time incident", lti + " (portfolio, illustrative)"], ["Toolbox talks", p.safety.toolboxTalks + " total, " + p.safety.toolboxThisWeek + " this week"],
            ["RAMS approved", rams.filter((r) => r.status === "Approved").length + " of " + rams.length], ["Open permits", String(permits.filter((x) => x.status === "Pending decision").length)]]} />
          <div style={{ marginTop: 12 }} className="tu-stack">
            {rams.map((r) => <button key={r.id} className="tu-rowbtn" style={{ padding: "6px 0", borderTop: 0 }} onClick={() => openRef("rams", r.id)}><Icon name="doc" size={14} /><span className="tu-grow tu-ellipsis tu-small">{r.title}</span><Badge tone={r.status === "Approved" ? "ok" : "warn"}>{r.status}</Badge></button>)}
            {permits.map((r) => <button key={r.id} className="tu-rowbtn" style={{ padding: "6px 0", borderTop: 0 }} onClick={() => openRef("permit", r.id)}><Icon name="shield" size={14} /><span className="tu-grow tu-ellipsis tu-small">{r.id} {r.name}</span><Badge tone={r.status === "Pending decision" ? "warn" : r.status === "Refused" ? "bad" : "ok"}>{r.status}</Badge></button>)}
          </div>
        </Card>
        <Card title="Team">
          <div className="tu-stack" style={{ gap: 8 }}>
            {[p.sponsorId, ...p.team].filter((x, i, a) => a.indexOf(x) === i).map((id) => (
              <div key={id} className="tu-row"><PersonLink id={id} /><span className="tu-grow" /><span className="tu-small tu-muted">{id === p.sponsorId ? "Executive sponsor" : id === p.pmId ? "Project manager" : id === p.techLeadId ? "Technical lead" : db.people.find((x) => x.id === id)?.role}</span></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
export { at, TAG_COLOR };
