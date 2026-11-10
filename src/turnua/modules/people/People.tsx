/* People module: Directory, Capacity, Certifications, Timesheets and profiles.
   Every count comes from the shared people, allocation, event and credential records. */
import { useMemo, useState, type ReactNode } from "react";
import "./people.css";
import type { Credential, ID, Person, PersonStatus, Timesheet } from "../../types";
import { useDB } from "../../store";
import { navigate, openOverlay, setPrefs, toast, useFilter } from "../../ui";
import { addTimesheet, setTimesheetHours, setTimesheetStatus } from "../../actions";
import { Avatar, Badge, Btn, Card, Empty, HealthBadge, Icon, Page, PersonLink, Progress, Ref, Search, Select, SortTh, Stat, openRef } from "../../kit";
import { TaskLine } from "../../drawers/TaskDrawer";
import { addDays, atMs, DOW, fmtDate, fmtKey, hhmm, keyOf, mondayOf, parseKey, MON, todayKey, daysBetween } from "../../time";
import { allocated, availabilityOn, credState, credsDue, CREW, involves, isOpen, nameOf, occurrences, project, team, utilisation, utilTone, workforce } from "../../selectors";
import { workday, bookingFor } from "./PeopleOverlays";

export { BookingForm, MessageDrawer, CoverDrawer } from "./PeopleOverlays";

const STATUS_ICON: Record<PersonStatus, string> = { "On site": "site", "In office": "doc", "In a meeting": "user", "On leave": "cal", "On call": "clock" };
const STATUS_TONE: Record<PersonStatus, "ok" | "accent" | "warn" | "outline" | "navy"> = { "On site": "ok", "In office": "accent", "In a meeting": "warn", "On leave": "outline", "On call": "navy" };
const pctTxt = (u: number) => Math.round(u * 100) + "%";
const weekLabel = (mon: string) => { const a = parseKey(mon), b = parseKey(addDays(mon, 6)); return a.d + (a.m !== b.m ? " " + MON[a.m - 1] : "") + " to " + b.d + " " + MON[b.m - 1] + " " + b.y; };

const dublinH = (iso: string) => parseInt(hhmm(iso).slice(0, 2), 10);
const shortKind = (c: Credential) => (/electric/i.test(c.kind) ? "Electrical review" : c.kind);
export function StatusBadge({ s }: { s: PersonStatus }) { return <Badge tone={STATUS_TONE[s]} icon={STATUS_ICON[s]}>{s}</Badge>; }

/** Leave covering a working day, from the calendar. */
function onLeave(db: ReturnType<typeof useDB>, pid: ID, day: string): boolean {
  return occurrences(db, day, addDays(day, 1)).some((o) => o.type === "Leave" && involves(o, pid) && Date.parse(o.start) <= atMs(day, 8) && Date.parse(o.end) >= atMs(day, 17));
}
/** Planned allocation spread over the person's working days that week. */
function weekPlan(db: ReturnType<typeof useDB>, p: Person, mon: string) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(mon, i));
  const leave = days.map((d) => onLeave(db, p.id, d));
  const working = leave.filter((x) => !x).length;
  const alloc = allocated(db, p.id);
  const perDay = working ? alloc / working : 0;
  return { days, leave, avail: days.map((_, i) => (leave[i] ? 0 : 8)), plan: days.map((_, i) => (leave[i] ? 0 : perDay)), total: working * 8, alloc };
}

export default function PeopleModule({ tab, id }: { tab: string; id?: string }) {
  if (tab === "detail" && id) return <Profile id={id} />;
  if (tab === "capacity") return <Capacity />;
  if (tab === "certifications") return <Certifications />;
  if (tab === "timesheets") return <Timesheets />;
  return <Directory />;
}

/* ── Directory ───────────────────────────────────────────────────── */
function Directory() {
  const db = useDB();
  const now = Date.now();
  const [f, setF, clear] = useFilter("people.directory");
  const w = workforce(db);
  const locations = Array.from(new Set(db.people.map((p) => p.location))).sort();
  const q = (f.q || "").toLowerCase();
  const list = db.people.filter((p) => (!q || (p.name + " " + p.role + " " + p.location + " " + p.skills.join(" ")).toLowerCase().includes(q))
    && (!f.team || p.teamId === f.team) && (!f.status || p.status === f.status) && (!f.loc || p.location === f.loc));
  const statuses: PersonStatus[] = ["On site", "In office", "In a meeting", "On leave", "On call"];
  return (
    <Page title="People" sub="Twelve people in this demo team. Live status is explicit demo state, not location tracking, and this is not Turnua’s total headcount.">
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        {statuses.map((s) => (
          <Stat key={s} label={<span className="tu-row" style={{ gap: 6 }}><Icon name={STATUS_ICON[s]} size={13} />{s}</span>} value={w.status[s] || 0}
            sub={f.status === s ? "Filtered, click to clear" : "Show " + s.toLowerCase()} onClick={() => setF("status", f.status === s ? "" : s)} />
        ))}
      </div>
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search name, role, skill" label="Search people" width={260} />
        <Select label="Team" value={f.team || ""} onChange={(v) => setF("team", v)} options={[["", "All teams"], ...db.teams.map((t) => [t.id, t.name] as [string, string])]} />
        <Select label="Status" value={f.status || ""} onChange={(v) => setF("status", v)} options={[["", "Any status"], ...statuses.map((s) => [s, s] as [string, string])]} />
        <Select label="Location" value={f.loc || ""} onChange={(v) => setF("loc", v)} options={[["", "Any location"], ...locations.map((l) => [l, l] as [string, string])]} />
        {(f.q || f.team || f.status || f.loc) && <Btn size="sm" kind="ghost" onClick={clear}>Clear filters</Btn>}
        <span className="tu-grow" />
        <span className="tu-small tu-muted">{list.length} of {db.people.length}</span>
      </div>
      {list.length ? (
        <div className="tu-grid tu-g4">
          {list.map((p) => {
            const u = utilisation(db, p);
            const open = db.tasks.filter((t) => t.ownerId === p.id && isOpen(t)).length;
            const creds = db.credentials.filter((c) => c.personId === p.id);
            const due = credsDue(db, now, 45).filter((c) => c.personId === p.id);
            return (
              <Card key={p.id} onClick={() => navigate("/people/p/" + p.id)} className="pp-card">
                <div className="tu-row" style={{ alignItems: "flex-start" }}>
                  <Avatar person={p} size={42} />
                  <div className="tu-grow">
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                    <div className="tu-small tu-muted tu-ellipsis">{p.role}</div>
                  </div>
                </div>
                <div className="tu-row tu-wrap" style={{ marginTop: 10, gap: 6 }}>
                  <StatusBadge s={p.status} />
                  <span className="tu-small tu-muted tu-ellipsis"><Icon name="site" size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{p.location}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="tu-row tu-small"><span className="tu-grow tu-muted">Planned utilisation</span><b style={{ color: "var(--" + utilTone(u) + ")" }}>{pctTxt(u)}</b></div>
                  <Progress value={u} tone={utilTone(u) as "ok" | "warn" | "bad"} label={p.name + " utilisation"} />
                </div>
                <div className="pp-mini">
                  <span><b>{open}</b> open tasks</span>
                  <span><b>{creds.length}</b> credentials</span>
                </div>
                {due.length > 0 && <div style={{ marginTop: 8, maxWidth: "100%", overflow: "hidden" }}><Badge tone="warn" icon="alert" title={due[0].name + ", due " + fmtDate(due[0].dueAt)}>{shortKind(due[0])} due {fmtDate(due[0].dueAt)}</Badge></div>}
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty title="Nobody matches these filters" action={<Btn onClick={clear}>Clear filters</Btn>}>Try a different team, status or search term.</Empty></Card>}
    </Page>
  );
}

/* ── Capacity ────────────────────────────────────────────────────── */
function Capacity() {
  const db = useDB();
  const today = todayKey();
  const [f, setF] = useFilter("people.capacity");
  const mon = f.week || mondayOf(today);
  const thisWeek = mon === mondayOf(today);
  const w = workforce(db);
  const skills = Array.from(new Set(db.people.flatMap((p) => p.skills))).sort();
  const q = (f.q || "").toLowerCase();
  const list = db.people.filter((p) => (!f.team || p.teamId === f.team) && (!f.skill || p.skills.includes(f.skill)) && (!q || p.name.toLowerCase().includes(q)));
  const days = Array.from({ length: 5 }, (_, i) => addDays(mon, i));
  const avByDay = useMemo(() => days.map((d) => availabilityOn(db, d)), [db, mon]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekOcc = useMemo(() => occurrences(db, mon, addDays(mon, 5)), [db, mon]);
  const over = db.people.filter((p) => utilisation(db, p) > 0.85);
  const leaveDays = db.people.map((p) => ({ p, n: days.filter((d) => onLeave(db, p.id, d)).length })).filter((x) => x.n);
  const crew = db.events.find((e) => e.id === "EV-DLR-CREW");
  const permit = db.permits.find((x) => x.id === "PER-DLR-017");
  const byProject = db.projects.map((pr) => {
    const al = db.allocations.filter((a) => a.projectId === pr.id);
    return { pr, hours: al.reduce((n, a) => n + a.hours, 0), people: al.map((a) => ({ id: a.personId, h: a.hours, label: a.label })) };
  }).filter((x) => x.hours);
  const internal = db.allocations.filter((a) => !a.projectId);
  return (
    <Page title="Capacity" sub="Planned allocation against available hours, by person and day. Leave reduces availability; on-call windows are context, not worked hours. Use Find cover on any row for an evidence-based shortlist.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Planned utilisation, all 12 people" value={pctTxt(w.util)} sub={w.alloc + " of " + w.avail + " available hours this week"} />
        <Stat label="Crew utilisation, delivery crews" value={pctTxt(w.crewUtil)} sub={w.crewAlloc + " of " + w.crewAvail + " h · " + CREW.length + " people on site work"} />
        <Stat label="Above 85% planned load" value={over.length} tone={over.length ? "warn" : undefined} sub={over.map((p) => p.first).join(", ") || "Nobody"} />
        <Stat label="Leave this week" value={leaveDays.reduce((n, x) => n + x.n, 0) + " days"} sub={leaveDays.map((x) => x.p.first + " " + x.n + "d").join(", ") || "No leave booked"} />
      </div>
      <div className="tu-toolbar">
        <Btn size="sm" icon="chevL" aria-label="Previous week" onClick={() => setF("week", addDays(mon, -7))} />
        <Btn size="sm" onClick={() => setF("week", mondayOf(today))} disabled={thisWeek}>This week</Btn>
        <Btn size="sm" icon="chevR" aria-label="Next week" onClick={() => setF("week", addDays(mon, 7))} />
        <b style={{ marginLeft: 4 }}>Week of {weekLabel(mon)}</b>
        <span className="tu-grow" />
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Find a person" label="Find a person" width={200} />
        <Select label="Team" value={f.team || ""} onChange={(v) => setF("team", v)} options={[["", "All teams"], ...db.teams.map((t) => [t.id, t.name] as [string, string])]} />
        <Select label="Skill" value={f.skill || ""} onChange={(v) => setF("skill", v)} options={[["", "Any skill"], ...skills.map((s) => [s, s] as [string, string])]} />
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap" role="region" aria-label="Capacity by person and day" tabIndex={0}>
          <table className="tu-table pp-cap">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Person</th>
                {days.map((d) => <th key={d} style={{ minWidth: 112 }}>{fmtKey(d)}{d === today ? " · today" : ""}</th>)}
                <th className="num">Planned / available</th>
                <th>Load</th>
                <th><span className="tu-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const plan = weekPlan(db, p, mon);
                const u = plan.total ? plan.alloc / plan.total : 0;
                const commits = db.allocations.filter((a) => a.personId === p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="tu-row" style={{ alignItems: "flex-start" }}>
                        <Avatar person={p} size={26} />
                        <div style={{ minWidth: 0 }}>
                          <button className="tu-link" style={{ color: "var(--ink)", fontWeight: 600 }} onClick={() => navigate("/people/p/" + p.id)}>{p.name}</button>
                          <div className="tu-small tu-muted" title={commits.map((a) => a.label + " " + a.hours + "h").join(", ")} style={{ maxWidth: 240 }}>
                            {commits.map((a) => (a.projectId ? project(db, a.projectId)?.short : a.label) + " " + a.hours + "h").join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    {plan.days.map((d, i) => {
                      const av = avByDay[i].find((a) => a.person.id === p.id);
                      const ctx = weekOcc.filter((o) => involves(o, p.id) && Date.parse(o.start) < atMs(addDays(d, 1), 0) && Date.parse(o.end) > atMs(d, 0) && (o.type === "On call" || o.type === "Permit window" || o.type === "Training"));
                      const rest = av?.reasons.find((r) => /rest/i.test(r));
                      if (plan.leave[i]) return <td key={d}><Badge tone="outline" icon="cal">Leave</Badge></td>;
                      const ratio = plan.plan[i] / 8;
                      return (
                        <td key={d}>
                          <div className="tu-small"><b>{(Math.round(plan.plan[i] * 10) / 10).toString()}</b> / 8h</div>
                          <div className="pp-daybar"><i style={{ width: Math.min(100, ratio * 100) + "%", background: "var(--" + utilTone(ratio) + ")" }} /></div>
                          <div className="pp-ctx">
                            {rest && <span title={rest} className="pp-chip bad">Rest to 15:00</span>}
                            {ctx.map((o) => (
                              <button key={o.key} className={"pp-chip" + (o.provisional ? " prov" : "")} onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })}
                                title={o.title + (o.provisional ? " (provisional)" : "") + ", " + (o.allDay ? "all day" : hhmm(o.start) + " to " + hhmm(o.end))}>
                                {o.type === "On call" ? (Date.parse(o.start) < atMs(d, 6) && keyOf(Date.parse(o.start)) !== d ? "Night call ends " + hhmm(o.end) : dublinH(o.start) >= 18 ? "Night call " + hhmm(o.start) : "On call (day)") : o.type === "Training" ? "Training" : o.provisional ? "Provisional crew window" : "Permit checkpoint " + hhmm(o.start)}
                              </button>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                    <td className="num"><b>{plan.alloc}</b> / {plan.total}h</td>
                    <td><Badge tone={utilTone(u) === "ok" ? "ok" : utilTone(u) as "warn" | "bad"}>{pctTxt(u)}</Badge></td>
                    <td><Btn size="xs" onClick={() => openOverlay({ kind: "cover", personId: p.id })}>Find cover</Btn></td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={9}><Empty title="Nobody matches">Clear the team or skill filter.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tu-card-f">Planned allocation comes from project commitments, spread across available working days. Logged hours are on the Timesheets tab.{!thisWeek && " Allocations are this week’s commitments, projected onto the selected week."}</div>
      </Card>
      <div className="tu-grid tu-g2" style={{ marginTop: 14 }}>
        <Card title="Commitments by project" sub="Planned hours per week" pad={false}>
          {byProject.map(({ pr, hours, people }) => (
            <button key={pr.id} className="tu-rowbtn" onClick={() => openRef("project", pr.id)}>
              <span className="tu-grow" style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 500 }}>{pr.id} {pr.short}</span>
                <span className="tu-small tu-muted tu-ellipsis" style={{ display: "block" }}>{people.map((x) => nameOf(db, x.id).split(" ")[0] + " " + x.h + "h").join(" · ")}</span>
              </span>
              <HealthBadge health={pr.health} />
              <b style={{ minWidth: 44, textAlign: "right" }}>{hours}h</b>
            </button>
          ))}
          <div className="tu-rowbtn" style={{ cursor: "default" }}>
            <span className="tu-grow"><span style={{ display: "block", fontWeight: 500 }}>Internal: leadership and strategy</span><span className="tu-small tu-muted">{internal.map((a) => nameOf(db, a.personId).split(" ")[0] + " " + a.hours + "h").join(" · ")}</span></span>
            <b>{internal.reduce((n, a) => n + a.hours, 0)}h</b>
          </div>
        </Card>
        <Card title="Planning: DLR crew window" sub="Sarah Doyle’s provisional reservation" right={permit && <Badge tone={permit.status === "Pending decision" ? "warn" : permit.status === "Refused" ? "bad" : "ok"}>{permit.id}: {permit.status}</Badge>}>
          {crew ? (
            <>
              <div className="tu-row" style={{ gap: 12, alignItems: "flex-start" }}>
                <div className="pp-prov" aria-hidden="true" />
                <div className="tu-grow">
                  <div style={{ fontWeight: 600 }}>{crew.title}</div>
                  <div className="tu-small tu-muted">{fmtKey(keyOf(Date.parse(crew.start)))} to {fmtKey(addDays(keyOf(Date.parse(crew.end)), -1))} · {crew.location}</div>
                  <div className="tu-row tu-wrap" style={{ marginTop: 8, gap: 6 }}>{crew.attendeeIds.map((a) => <PersonLink key={a} id={a} />)}<Badge tone="outline">+ 2 operatives</Badge></div>
                </div>
                {crew.provisional ? <Badge tone="warn" icon="alert">Provisional</Badge> : <Badge tone="ok" icon="ok">Confirmed</Badge>}
              </div>
              <div className={"tu-note " + (crew.provisional ? "warn" : "")} style={{ marginTop: 12 }}>
                {crew.provisional ? "Held until the council decides " + (permit?.id || "the licence") + " (due " + fmtDate(permit?.decisionDueAt) + "). The reservation does not satisfy the licence dependency; main works stay blocked until a decision is recorded." : "Confirmed after the licence decision was recorded."}
              </div>
              <div className="tu-row" style={{ marginTop: 10, gap: 8 }}>
                <Btn size="sm" icon="cal" onClick={() => openOverlay({ kind: "event", id: crew.id, date: keyOf(Date.parse(crew.start)) })}>Open reservation</Btn>
                {permit && <Btn size="sm" icon="shield" onClick={() => openRef("permit", permit.id)}>Open {permit.id}</Btn>}
              </div>
            </>
          ) : <Empty title="No crew window reserved" />}
        </Card>
      </div>
    </Page>
  );
}

/* ── Certifications ──────────────────────────────────────────────── */
function credBucket(c: Credential, now: number): "Valid" | "Review due" | "Expired" {
  const s = credState(c, now);
  if (s.tone === "bad" && s.days !== null && s.days < 0) return "Expired";
  if (s.days !== null && s.days <= 90) return "Review due";
  return "Valid";
}
function Certifications() {
  const db = useDB();
  const now = Date.now();
  const [f, setF, clear] = useFilter("people.certs");
  const [sort, setSort] = useState<{ k: "due" | "person" | "name"; dir: 1 | -1 }>({ k: "due", dir: 1 });
  const today = todayKey();
  const days = (c: Credential) => (c.dueAt ? daysBetween(today, keyOf(Date.parse(c.dueAt))) : 99999);
  const q = (f.q || "").toLowerCase();
  const kinds = Array.from(new Set(db.credentials.map((c) => c.kind))).sort();
  const list = db.credentials.filter((c) => {
    const d = days(c);
    if (f.win && !(c.dueAt && !c.renewedAt && d >= 0 && d <= Number(f.win))) return false;
    if (f.state && credBucket(c, now) !== f.state) return false;
    if (f.kind && c.kind !== f.kind) return false;
    return !q || (c.name + " " + c.kind + " " + nameOf(db, c.personId)).toLowerCase().includes(q);
  }).sort((a, b) => sort.dir * (sort.k === "due" ? days(a) - days(b) : sort.k === "person" ? nameOf(db, a.personId).localeCompare(nameOf(db, b.personId)) : a.name.localeCompare(b.name)));
  const n = (win: number) => credsDue(db, now, win).length;
  const booked = db.credentials.filter((c) => !!bookingFor(db, c)).length;
  const expired = db.credentials.filter((c) => credBucket(c, now) === "Expired").length;
  return (
    <Page title="Certifications" sub="Credentials and reviews for the demo team. Due dates are demo assumptions, not compliance advice, and are not verified employee qualifications.">
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        <Stat label="Due within 30 days" value={n(30)} tone={n(30) ? "bad" : undefined} onClick={() => setF("win", f.win === "30" ? "" : "30")} sub="Renewals and reviews" />
        <Stat label="Due within 45 days" value={n(45)} tone={n(45) ? "warn" : undefined} onClick={() => setF("win", f.win === "45" ? "" : "45")} sub="Flagged on the Command Centre" />
        <Stat label="Due within 90 days" value={n(90)} onClick={() => setF("win", f.win === "90" ? "" : "90")} sub="Plan refreshers now" />
        <Stat label="Lapsed or overdue" value={expired} tone={expired ? "bad" : "ok"} onClick={() => setF("state", f.state === "Expired" ? "" : "Expired")} sub={expired ? "Needs action" : "None"} />
        <Stat label="Training booked" value={booked} sub="Booked is not renewed" />
      </div>
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search person or credential" label="Search credentials" width={260} />
        <Select label="Due window" value={f.win || ""} onChange={(v) => setF("win", v)} options={[["", "Any due date"], ["30", "Due in 30 days"], ["45", "Due in 45 days"], ["90", "Due in 90 days"]]} />
        <Select label="State" value={f.state || ""} onChange={(v) => setF("state", v)} options={[["", "Any state"], ["Valid", "Valid"], ["Review due", "Review due"], ["Expired", "Expired"]]} />
        <Select label="Type" value={f.kind || ""} onChange={(v) => setF("kind", v)} options={[["", "Any type"], ...kinds.map((k) => [k, k] as [string, string])]} />
        {(f.q || f.win || f.state || f.kind) && <Btn size="sm" kind="ghost" onClick={clear}>Clear filters</Btn>}
        <span className="tu-grow" /><span className="tu-small tu-muted">{list.length} of {db.credentials.length}</span>
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap" role="region" aria-label="Credential register" tabIndex={0}>
          <table className="tu-table">
            <thead>
              <tr>
                <SortTh k="person" label="Person" sort={sort} setSort={setSort} />
                <SortTh k="name" label="Credential" sort={sort} setSort={setSort} />
                <th>Type</th>
                <SortTh k="due" label="Due" sort={sort} setSort={setSort} />
                <th>Status</th>
                <th>Evidence</th>
                <th>Booking</th>
                <th><span className="tu-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const s = credState(c, now);
                const b = bookingFor(db, c);
                return (
                  <tr key={c.id}>
                    <td><PersonLink id={c.personId} /></td>
                    <td><button className="tu-link" style={{ color: "var(--ink)", fontWeight: 500 }} onClick={() => openRef("credential", c.id)}>{c.name}</button></td>
                    <td className="tu-muted">{c.kind}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{c.dueAt ? fmtDate(c.dueAt) : "No expiry"}{c.dueAt && <div className="tu-small tu-muted">{c.dueKind}</div>}</td>
                    <td><Badge tone={s.tone === "plain" ? "" : s.tone} icon={s.tone === "ok" ? "ok" : s.tone === "plain" ? undefined : "alert"}>{s.label}</Badge></td>
                    <td>{c.evidenceDocId ? <Ref type="doc" id={c.evidenceDocId}>On file</Ref> : <span className="tu-faint">None</span>}</td>
                    <td>{b ? <Ref type="training" id={b.id}>{b.status}, {fmtKey(keyOf(Date.parse(b.date)))}</Ref> : <span className="tu-faint">Not booked</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {c.dueAt && !b && <Btn size="xs" kind="navy" onClick={() => openOverlay({ kind: "booking", credentialId: c.id })}>Book refresher</Btn>}
                      {b && <Btn size="xs" onClick={() => openOverlay({ kind: "cover", personId: c.personId, credentialId: c.id })}>Find cover</Btn>}
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={8}><Empty title="No credentials match" action={<Btn onClick={clear}>Clear filters</Btn>} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tu-card-f">Booking a refresher adds a calendar block and an approval record. The credential stays due until renewal evidence is uploaded.</div>
      </Card>
    </Page>
  );
}

/* ── Timesheets ──────────────────────────────────────────────────── */
function HoursInput({ ts, personId, projectId, label, date, disabled }: { ts?: Timesheet; personId: ID; projectId: ID | null; label: string; date: string; disabled: boolean }) {
  const [v, setV] = useState<string | null>(null);
  const shown = v ?? (ts ? String(ts.hours) : "");
  const commit = () => {
    if (v === null) return;
    const n = v.trim() === "" ? 0 : Number(v);
    setV(null);
    if (isNaN(n) || n < 0 || n > 16) { toast("Enter hours between 0 and 16", "warn"); return; }
    if (ts) { if (n !== ts.hours) { setTimesheetHours(ts.id, n); toast("Timesheet updated"); } }
    else if (n > 0) addTimesheet(personId, projectId, label, date, n);
  };
  if (disabled) return <span className="tu-faint" title={ts?.status === "Approved" ? "Approved entries are locked" : "Future days cannot be logged"}>{ts ? ts.hours : "·"}</span>;
  return <input className="pp-hours" inputMode="decimal" aria-label={"Hours for " + label + " on " + fmtKey(date)} value={shown}
    onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(null); (e.target as HTMLInputElement).blur(); } }} />;
}
function Timesheets() {
  const db = useDB();
  const today = todayKey();
  const [f, setF] = useFilter("people.timesheets");
  const [hist, setHist] = useState<ID | null>(null);
  const mon = f.week || mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const end = addDays(mon, 7);
  const people = db.people.filter((p) => !f.person || p.id === f.person);
  let gPlan = 0, gLog = 0;
  const groups = people.map((p) => {
    const ts = db.timesheets.filter((t) => t.personId === p.id && t.date >= mon && t.date < end);
    const allocs = db.allocations.filter((a) => a.personId === p.id);
    const extraLabels = Array.from(new Set(ts.filter((t) => !allocs.some((a) => a.label === t.label)).map((t) => t.label)));
    const rows = allocs.map((a) => ({ projectId: a.projectId, label: a.label, plan: a.hours })).concat(extraLabels.map((l) => ({ projectId: ts.find((t) => t.label === l)!.projectId, label: l, plan: 0 })));
    const logged = ts.reduce((n, t) => n + t.hours, 0);
    const plan = allocs.reduce((n, a) => n + a.hours, 0);
    gPlan += plan; gLog += logged;
    const st = { Draft: ts.filter((t) => t.status === "Draft").length, Submitted: ts.filter((t) => t.status === "Submitted").length, Approved: ts.filter((t) => t.status === "Approved").length };
    return { p, ts, rows, logged, plan, st };
  });
  return (
    <Page title="Timesheets" sub="Planned allocation against logged hours, by person and project. Logged hours exist only for days that have happened. No payroll integration in this demo.">
      <div className="tu-toolbar">
        <Btn size="sm" icon="chevL" aria-label="Previous week" onClick={() => setF("week", addDays(mon, -7))} />
        <Btn size="sm" onClick={() => setF("week", mondayOf(today))} disabled={mon === mondayOf(today)}>This week</Btn>
        <Btn size="sm" icon="chevR" aria-label="Next week" onClick={() => setF("week", addDays(mon, 7))} />
        <b style={{ marginLeft: 4 }}>Week of {weekLabel(mon)}</b>
        <span className="tu-grow" />
        <Select label="Person" value={f.person || ""} onChange={(v) => setF("person", v)} options={[["", "Everyone"], ...db.people.map((p) => [p.id, p.name] as [string, string])]} />
      </div>
      <div className="tu-grid tu-g3" style={{ marginBottom: 14 }}>
        <Stat label="Planned this week" value={gPlan + "h"} sub="From project commitments" />
        <Stat label="Logged so far" value={(Math.round(gLog * 10) / 10) + "h"} sub={mon > today ? "Week has not started" : "Past days and today only"} />
        <Stat label="Awaiting approval" value={groups.reduce((n, g) => n + g.st.Submitted, 0)} sub="Submitted entries" />
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap" role="region" aria-label="Weekly timesheets" tabIndex={0}>
          <table className="tu-table pp-ts">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Person and project</th>
                <th className="num">Planned</th>
                {days.map((d, i) => <th key={d} className="num" style={{ minWidth: 58 }}>{DOW[i]} {parseKey(d).d}</th>)}
                <th className="num">Logged</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.p.id} g={g} days={days} today={today} mon={mon} end={end} hist={hist === g.p.id} toggleHist={() => setHist(hist === g.p.id ? null : g.p.id)} />
              ))}
              <tr className="pp-total">
                <td><b>Total</b></td>
                <td className="num"><b>{gPlan}h</b></td>
                {days.map((d) => <td key={d} className="num">{(Math.round(groups.reduce((n, g) => n + g.ts.filter((t) => t.date === d).reduce((m, t) => m + t.hours, 0), 0) * 10) / 10) || "·"}</td>)}
                <td className="num"><b>{Math.round(gLog * 10) / 10}h</b></td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="tu-card-f">Edit hours inline on Draft or Submitted entries. Approved entries are locked. Every change is kept in the entry history and the activity log.</div>
      </Card>
    </Page>
  );
}
type Group = { p: Person; ts: Timesheet[]; rows: { projectId: ID | null; label: string; plan: number }[]; logged: number; plan: number; st: { Draft: number; Submitted: number; Approved: number } };
function GroupRows({ g, days, today, mon, end, hist, toggleHist }: { g: Group; days: string[]; today: string; mon: string; end: string; hist: boolean; toggleHist: () => void }) {
  const db = useDB();
  const status = g.st.Submitted ? "Submitted" : g.st.Draft ? "Draft" : g.st.Approved ? "Approved" : "Nothing logged";
  const history = g.ts.flatMap((t) => t.history.map((h) => ({ ...h, label: t.label, date: t.date }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <>
      <tr className="pp-group">
        <td colSpan={2}>
          <div className="tu-row">
            <Avatar person={g.p} size={24} />
            <button className="tu-link" style={{ color: "var(--ink)", fontWeight: 600 }} onClick={() => navigate("/people/p/" + g.p.id)}>{g.p.name}</button>
            <span className="tu-small tu-muted">{g.plan}h planned</span>
          </div>
        </td>
        <td colSpan={7}>
          <div className="tu-row tu-wrap" style={{ gap: 6 }}>
            <Btn size="xs" disabled={!g.st.Draft} onClick={() => setTimesheetStatus(g.p.id, mon, end, "Submitted")}>Submit week</Btn>
            <Btn size="xs" kind="navy" disabled={!g.st.Submitted} onClick={() => setTimesheetStatus(g.p.id, mon, end, "Approved")}>Approve week</Btn>
            <Btn size="xs" kind="ghost" aria-expanded={hist} onClick={toggleHist}>{hist ? "Hide history" : "History (" + history.length + ")"}</Btn>
          </div>
        </td>
        <td className="num"><b>{Math.round(g.logged * 10) / 10}h</b></td>
        <td><Badge tone={status === "Approved" ? "ok" : status === "Submitted" ? "warn" : status === "Draft" ? "" : "outline"}>{status}</Badge></td>
      </tr>
      {g.rows.map((r) => {
        const cells = days.map((d) => g.ts.find((t) => t.date === d && t.label === r.label));
        const logged = cells.reduce((n, t) => n + (t ? t.hours : 0), 0);
        return (
          <tr key={r.label}>
            <td style={{ paddingLeft: 52 }}>{r.projectId ? <Ref type="project" id={r.projectId}>{project(db, r.projectId)?.short || r.projectId}</Ref> : <span className="tu-muted">Internal</span>} <span className="tu-small tu-muted">· {r.label}</span></td>
            <td className="num tu-muted">{r.plan}h</td>
            {days.map((d, i) => {
              const t = cells[i];
              const weekend = i > 4;
              const future = d > today;
              return <td key={d} className={"num" + (weekend ? " pp-wkend" : "")}><HoursInput ts={t} personId={g.p.id} projectId={r.projectId} label={r.label} date={d} disabled={future || t?.status === "Approved" || (weekend && !t)} /></td>;
            })}
            <td className="num">{Math.round(logged * 10) / 10}h</td>
            <td />
          </tr>
        );
      })}
      {hist && (
        <tr><td colSpan={11} style={{ background: "var(--surface-faint)" }}>
          {history.length ? <div className="tu-stack" style={{ gap: 3, maxHeight: 180, overflowY: "auto" }}>
            {history.slice(0, 40).map((h, i) => <div key={i} className="tu-small"><span className="tu-faint">{fmtDate(h.at)} {hhmm(h.at)}</span> · {h.label}, {fmtKey(h.date)}: {h.text}</div>)}
          </div> : <span className="tu-small tu-muted">No entries this week.</span>}
        </td></tr>
      )}
    </>
  );
}

/* ── Profile ─────────────────────────────────────────────────────── */
function Profile({ id }: { id: ID }) {
  const db = useDB();
  const now = Date.now();
  const today = todayKey();
  const [showDone, setShowDone] = useState(false);
  const p = db.people.find((x) => x.id === id);
  if (!p) return <Page title="Person not found" crumbs={[{ label: "People", to: "/people/directory" }, { label: id }]}><Card><Empty title="No such person" action={<Btn onClick={() => navigate("/people/directory")}>Back to directory</Btn>}>This record is not in the demo team.</Empty></Card></Page>;
  const u = utilisation(db, p);
  const tm = team(db, p.teamId);
  const mgr = db.people.find((x) => x.id === p.reportsTo);
  const reports = db.people.filter((x) => x.reportsTo === p.id);
  const creds = db.credentials.filter((c) => c.personId === p.id).sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : 9e15) - (b.dueAt ? Date.parse(b.dueAt) : 9e15));
  const tasks = db.tasks.filter((t) => t.ownerId === p.id).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const open = tasks.filter(isOpen);
  const done = tasks.filter((t) => !isOpen(t));
  const mon = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const occ = occurrences(db, mon, addDays(mon, 7)).filter((o) => involves(o, p.id));
  const ts = db.timesheets.filter((t) => t.personId === p.id && t.date >= mon && t.date < addDays(mon, 7));
  const loggedWeek = ts.reduce((n, t) => n + t.hours, 0);
  const plan = weekPlan(db, p, mon);
  const projs = db.projects.filter((pr) => pr.team.includes(p.id) || pr.pmId === p.id || pr.sponsorId === p.id || pr.techLeadId === p.id || db.allocations.some((a) => a.personId === p.id && a.projectId === pr.id));
  const roleOn = (prId: ID) => {
    const pr = project(db, prId)!;
    const r: string[] = [];
    if (pr.pmId === p.id) r.push(pr.model === "Internal budget" ? "Programme owner" : pr.model === "Managed service" ? "Service lead" : "Project manager");
    if (pr.techLeadId === p.id) r.push("Technical lead");
    if (pr.sponsorId === p.id) r.push("Executive sponsor");
    const al = db.allocations.find((a) => a.personId === p.id && a.projectId === prId);
    if (!r.length) r.push(al ? al.label : "Team member");
    return { roles: r.join(", "), hours: al?.hours || 0 };
  };
  const maxBar = Math.max(8, ...week.map((d, i) => Math.max(i < 5 ? plan.plan[i] : 0, ts.filter((t) => t.date === d).reduce((n, t) => n + t.hours, 0))));
  return (
    <Page crumbs={[{ label: "People", to: "/people/directory" }, { label: p.name }]} title={p.name} sub={p.role + " · " + (tm?.name || "")}
      actions={<>
        <Btn icon="cal" onClick={() => { setPrefs({ calPeople: [p.id] }); navigate("/calendar/week"); }}>View calendar</Btn>
        <Btn kind="navy" icon="msg" onClick={() => openOverlay({ kind: "message", personId: p.id })}>Message</Btn>
      </>}>
      <div className="tu-split-r">
        <div className="tu-stack">
          <Card>
            <div className="tu-row" style={{ alignItems: "center", gap: 14 }}>
              <Avatar person={p} size={72} />
              <div className="tu-grow">
                <div style={{ fontSize: 18, fontWeight: 600 }}>{p.name}</div>
                <div className="tu-muted">{p.role}</div>
                <div className="tu-row tu-wrap" style={{ marginTop: 8, gap: 6 }}><StatusBadge s={p.status} /><span className="tu-small tu-muted">{p.location}</span></div>
              </div>
            </div>
            <p className="tu-small tu-faint" style={{ margin: "10px 0 0" }}>Live status is explicit demo state, not tracking.</p>
            <div className="pp-facts">
              <Fact k="Team" v={tm?.name || "None"} />
              <Fact k="Base" v={p.base} />
              <Fact k="Office extension" v={p.ext + " via " + db.org.phone} />
              <Fact k="Email (demo contact data)" v={p.email} />
              <Fact k="Start year" v={p.startYear ? String(p.startYear) : "Not recorded in demo"} />
              <Fact k="Reports to" v={mgr ? <PersonLink id={mgr.id} /> : "No manager recorded"} />
              {reports.length > 0 && <Fact k={"Direct reports · " + reports.length} v={<div className="tu-row tu-wrap" style={{ gap: 6 }}>{reports.map((r) => <PersonLink key={r.id} id={r.id} />)}</div>} />}
            </div>
          </Card>
          <Card title="Skills">
            <div className="tu-row tu-wrap" style={{ gap: 6 }}>{p.skills.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</div>
          </Card>
          <Card title="Credentials" sub="Fictional demo records. Due dates are assumptions, not compliance advice." pad={false}>
            {creds.length ? creds.map((c) => {
              const s = credState(c, now);
              const b = bookingFor(db, c);
              return (
                <div key={c.id} className="tu-li" style={{ alignItems: "center" }}>
                  <div className="tu-grow" style={{ minWidth: 0 }}>
                    <button className="tu-link" style={{ color: "var(--ink)", fontWeight: 500 }} onClick={() => openRef("credential", c.id)}>{c.name}</button>
                    <div className="tu-small tu-muted">{c.dueAt ? c.dueKind + " " + fmtDate(c.dueAt) : "No expiry"}{b ? " · training " + b.status.toLowerCase() + " " + fmtKey(keyOf(Date.parse(b.date))) : ""}</div>
                  </div>
                  <Badge tone={s.tone === "plain" ? "" : s.tone}>{s.label}</Badge>
                  {c.dueAt && !b && s.days !== null && s.days <= 90 && <Btn size="xs" kind="navy" onClick={() => openOverlay({ kind: "booking", credentialId: c.id })}>Book refresher</Btn>}
                </div>
              );
            }) : <Empty title="No credentials recorded" />}
          </Card>
        </div>
        <div className="tu-stack">
          <div className="tu-grid tu-g4">
            <Stat label="Planned utilisation" value={pctTxt(u)} tone={utilTone(u) === "ok" ? undefined : utilTone(u) as "warn" | "bad"} sub={allocated(db, p.id) + " of " + p.available + "h this week"} onClick={() => navigate("/people/capacity")} />
            <Stat label="Open tasks" value={open.length} sub={open.filter((t) => Date.parse(t.dueAt) < now).length + " overdue"} tone={open.some((t) => Date.parse(t.dueAt) < now) ? "bad" : undefined} />
            <Stat label="Active projects" value={projs.length} sub={projs.map((x) => x.short).slice(0, 2).join(", ")} />
            <Stat label="Hours logged this week" value={Math.round(loggedWeek * 10) / 10 + "h"} sub="Past days only" onClick={() => navigate("/people/timesheets")} />
          </div>
          <Card title="This week" sub={"Calendar for week of " + weekLabel(mon)} right={<Btn size="sm" kind="ghost" onClick={() => { setPrefs({ calPeople: [p.id] }); navigate("/calendar/week"); }}>Open calendar</Btn>} pad={false}>
            <div className="pp-week">
              {week.map((d) => {
                const list = occ.filter((o) => Date.parse(o.start) < atMs(addDays(d, 1), 0) && Date.parse(o.end) > atMs(d, 0)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));
                return (
                  <div key={d} className={"pp-wday" + (d === today ? " today" : "")}>
                    <div className="pp-wday-h">{DOW[week.indexOf(d)]} <b>{parseKey(d).d}</b></div>
                    {list.length ? list.map((o) => (
                      <button key={o.key + d} className={"pp-ev" + (o.provisional ? " prov" : "")} onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })} style={{ borderLeftColor: db.people.find((x) => x.id === o.ownerId)?.color }}>
                        <span className="tu-small tu-muted">{o.allDay ? "All day" : keyOf(Date.parse(o.start)) !== d ? "to " + hhmm(o.end) : hhmm(o.start)}</span>
                        <span className="tu-ellipsis">{o.title}</span>
                      </button>
                    )) : <span className="tu-small tu-faint">Free</span>}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Timesheet, Mon to Sun" sub="Planned allocation against logged hours" right={<span className="pp-legend"><i className="plan" />Planned<i className="log" />Logged</span>}>
            <div className="pp-bars" role="img" aria-label={"Planned against logged hours this week: " + week.map((d, i) => DOW[i] + " planned " + (i < 5 ? Math.round(plan.plan[i] * 10) / 10 : 0) + ", logged " + ts.filter((t) => t.date === d).reduce((n, t) => n + t.hours, 0)).join("; ")}>
              {week.map((d, i) => {
                const pl = i < 5 ? plan.plan[i] : 0;
                const lg = ts.filter((t) => t.date === d).reduce((n, t) => n + t.hours, 0);
                return (
                  <div key={d} className="pp-bar">
                    <div className="pp-bar-area">
                      <i className="plan" style={{ height: (pl / maxBar) * 100 + "%" }} title={"Planned " + Math.round(pl * 10) / 10 + "h"} />
                      <i className="log" style={{ height: (lg / maxBar) * 100 + "%" }} title={"Logged " + lg + "h"} />
                    </div>
                    <div className="tu-small" style={{ textAlign: "center" }}>{DOW[i]}</div>
                    <div className="tu-small tu-muted" style={{ textAlign: "center" }}>{d > today ? "·" : Math.round(lg * 10) / 10 + "h"}</div>
                  </div>
                );
              })}
            </div>
            {plan.leave.some(Boolean) && <p className="tu-small tu-muted" style={{ margin: "8px 0 0" }}>Leave on {plan.days.filter((_, i) => plan.leave[i]).map((d) => fmtKey(d)).join(" and ")} reduces available hours to {plan.total}h.</p>}
          </Card>
          <Card title="Project assignments" pad={false}>
            {projs.length ? projs.map((pr) => {
              const r = roleOn(pr.id);
              return (
                <button key={pr.id} className="tu-rowbtn" onClick={() => openRef("project", pr.id)}>
                  <span className="tu-grow" style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500 }}>{pr.id} {pr.name}</span>
                    <span className="tu-small tu-muted">{r.roles}{r.hours ? " · " + r.hours + "h a week" : ""}</span>
                  </span>
                  <HealthBadge health={pr.health} />
                </button>
              );
            }) : <Empty title="No project assignments" />}
          </Card>
          <Card title={"Assigned tasks · " + open.length + " open"} pad={false} right={done.length > 0 && <Btn size="sm" kind="ghost" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide completed" : "Completed (" + done.length + ")"}</Btn>}>
            {open.length ? open.map((t) => <TaskLine key={t.id} t={t} />) : <Empty title="No open tasks" />}
            {showDone && done.map((t) => <TaskLine key={t.id} t={t} />)}
          </Card>
        </div>
      </div>
    </Page>
  );
}
function Fact({ k, v }: { k: string; v: ReactNode }) {
  return <div className="pp-fact"><div className="k">{k}</div><div className="v">{v}</div></div>;
}
export { workday };
