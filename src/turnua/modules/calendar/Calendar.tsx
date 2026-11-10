/* Calendar module (Day, Week, Month) and event overlays: one shared surface,
   driven by the canonical events, leave and on-call series in the store. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./calendar.css";
import type { CalEvent, EventType, Occurrence, ID } from "../../types";
import { EVENT_TYPES } from "../../types";
import { useDB, useClock } from "../../store";
import { closeOverlay, navigate, openOverlay, setPrefs, usePrefs, useRoute, withQuery } from "../../ui";
import { createEvent, updateEvent, deleteEvent, reassignShift } from "../../actions";
import { Avatar, Badge, Btn, Card, Drawer, Empty, Field, Icon, Modal, Page, PersonLink, Ref, Seg } from "../../kit";
import {
  addDays, addMonths, at, atMs, daysInMonth, dublinParts, firstOfMonth, fmtKey, hhmm, keyOf, mondayOf, monthTitle, pad, parseKey, todayKey, weekdayOf, MON, DOW,
} from "../../time";
import { availabilityOn, involves, nameOf, occurrences } from "../../selectors";
import { TimeSelect } from "./TimeSelect";

/* ── shared helpers ──────────────────────────────────────────────── */
const PX_PER_MIN = 0.8; // 48px per hour, matching .tu-tg-hour
export const TYPE_ICON: Record<EventType, string> = {
  Meeting: "user", Client: "flag", "Site visit": "site", Maintenance: "asset", "On call": "clock", Leave: "cal", "Permit window": "shield", Training: "doc",
};
type View = "day" | "week" | "month";

function colourOf(db: ReturnType<typeof useDB>, o: { ownerId: ID }) {
  return db.people.find((p) => p.id === o.ownerId)?.color || "#9AA6BF";
}
function tint(c: string, pctv: number) { return "color-mix(in oklab, " + c + " " + pctv + "%, var(--surface))"; }

/** "Tue 10 Nov, 07:00 to 07:15" or across midnight "Tue 10 Nov 19:00 to Wed 11 Nov 07:00". */
export function rangeLabel(start: string, end: string, allDay?: boolean): string {
  const sk = keyOf(Date.parse(start));
  if (allDay) {
    const lastKey = addDays(keyOf(Date.parse(end)), -1);
    return lastKey <= sk ? fmtKey(sk) + ", all day" : fmtKey(sk) + " to " + fmtKey(lastKey) + ", all day";
  }
  const ek = keyOf(Date.parse(end));
  if (ek === sk) return fmtKey(sk) + ", " + hhmm(start) + " to " + hhmm(end);
  if (ek === addDays(sk, 1) && hhmm(end) === "00:00") return fmtKey(sk) + ", " + hhmm(start) + " to 24:00";
  return fmtKey(sk) + " " + hhmm(start) + " to " + fmtKey(ek) + " " + hhmm(end);
}
function recurrenceLabel(ev: CalEvent): string {
  const r = ev.recurrence;
  if (!r) return "Does not repeat";
  const days = r.byDay.slice().sort((a, b) => a - b);
  const label = days.length === 5 && days.join() === "0,1,2,3,4" ? "every weekday" : "on " + days.map((d) => DOW[d]).join(", ");
  const h = Math.floor(r.durationMins / 60), m = r.durationMins % 60;
  return "Weekly " + label + " at " + r.startTime + " (" + (h ? h + "h" : "") + (m ? (h ? " " : "") + m + " min" : "") + ")";
}
function weekTitle(mon: string): string {
  const sun = addDays(mon, 6);
  const a = parseKey(mon), b = parseKey(sun);
  if (a.m === b.m) return a.d + " to " + b.d + " " + MON[a.m - 1] + " " + a.y;
  if (a.y === b.y) return a.d + " " + MON[a.m - 1] + " to " + b.d + " " + MON[b.m - 1] + " " + b.y;
  return a.d + " " + MON[a.m - 1] + " " + a.y + " to " + b.d + " " + MON[b.m - 1] + " " + b.y;
}
const overlapsDay = (o: Occurrence, day: string) => Date.parse(o.start) < atMs(addDays(day, 1), 0) && Date.parse(o.end) > atMs(day, 0);

/* ── module ──────────────────────────────────────────────────────── */
export default function CalendarModule({ tab }: { tab: string }) {
  const db = useDB();
  const r = useRoute();
  const prefs = usePrefs();
  const now = useClock();
  const today = keyOf(now);
  const view: View = tab === "week" || tab === "month" ? tab : "day";
  const date = r.query.d || prefs.calDate || today;
  const sel = prefs.calPeople;

  // Desktop opens on Week; phones stay on the Day agenda unless a view is chosen.
  useEffect(() => {
    if (r.path === "/calendar" && typeof window !== "undefined" && window.innerWidth >= 640) navigate(withQuery("/calendar/week", { d: r.query.d }), { replace: true });
  }, [r.path, r.query.d]);
  useEffect(() => { if (r.query.d && r.query.d !== prefs.calDate) setPrefs({ calDate: r.query.d }); }, [r.query.d, prefs.calDate]);

  const go = (v: View, d: string) => { setPrefs({ calDate: d }); navigate(withQuery("/calendar/" + v, { d })); };
  const step = (dir: 1 | -1) => go(view, view === "day" ? addDays(date, dir) : view === "week" ? addDays(date, 7 * dir) : addMonths(firstOfMonth(date), dir));
  const title = view === "day" ? fmtKey(date, { long: true }) : view === "week" ? weekTitle(mondayOf(date)) : monthTitle(date);
  const visible = (o: Occurrence) => !sel || sel.some((p) => involves(o, p));

  return (
    <Page title="Calendar" sub="One shared calendar for the demo team: meetings, site visits, maintenance windows, on-call, leave and permit windows. Times in Europe/Dublin.">
      <div className="tu-cal">
        <SideRail date={date} today={today} onPick={(d) => go(view, d)} />
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="cal-bar">
            <span className="cal-mob"><Btn size="sm" kind="primary" icon="plus" aria-label="Create event" onClick={() => openOverlay({ kind: "eventForm", date })} /></span>
            <Btn size="sm" onClick={() => go(view, today)}>Today</Btn>
            <Btn size="sm" kind="ghost" icon="chevL" aria-label={"Previous " + view} onClick={() => step(-1)} />
            <Btn size="sm" kind="ghost" icon="chevR" aria-label={"Next " + view} onClick={() => step(1)} />
            <h2 className="cal-title" aria-live="polite">{title}</h2>
            <button className="cal-sync" onClick={() => navigate("/settings/systems")}
              title="Simulated synchronisation for this demo. No Google or Outlook account is connected and no invitations are sent. Details in Settings, Systems & Integrations.">
              <Icon name="sync" size={13} />Synced with Google and Outlook<b>Demo</b>
            </button>
            <Seg label="Calendar view" value={view} onChange={(v) => go(v, date)} options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} />
          </div>
          {view === "month"
            ? <MonthGrid date={date} today={today} visible={visible} onDay={(d) => go("day", d)} />
            : <TimeView view={view} date={date} today={today} now={now} visible={visible} onDay={(d) => go("day", d)} />}
        </Card>
      </div>
    </Page>
  );
}

/* ── left rail: create, mini month, team calendars, legend ───────── */
function SideRail({ date, today, onPick }: { date: string; today: string; onPick: (d: string) => void }) {
  const db = useDB();
  const prefs = usePrefs();
  const [month, setMonth] = useState(firstOfMonth(date));
  useEffect(() => { setMonth(firstOfMonth(date)); }, [date]);
  const start = mondayOf(month);
  const weeks = Math.ceil((weekdayOf(month) + daysInMonth(month)) / 7);
  const sel = prefs.calPeople;
  const on = (id: ID) => !sel || sel.includes(id);
  const toggle = (id: ID) => {
    const cur = sel || db.people.map((p) => p.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id]);
    setPrefs({ calPeople: next.length === db.people.length ? null : next });
  };
  return (
    <div className="tu-stack cal-rail" style={{ gap: 12 }}>
      <Btn kind="primary" icon="plus" onClick={() => openOverlay({ kind: "eventForm", date })} style={{ height: 40, width: "100%" }}>Create event</Btn>
      <Card pad={false}>
        <div className="tu-row" style={{ padding: "10px 10px 4px 14px" }}>
          <b className="tu-grow" style={{ fontSize: 13 }}>{monthTitle(month)}</b>
          <Btn size="xs" kind="ghost" icon="chevL" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
          <Btn size="xs" kind="ghost" icon="chevR" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
        </div>
        <div className="tu-mini" style={{ padding: "0 8px 10px" }} role="grid" aria-label={"Mini calendar, " + monthTitle(month)}>
          {DOW.map((d) => <span key={d} className="tu-faint" style={{ fontSize: 10.5, padding: "4px 0" }}>{d.slice(0, 1)}</span>)}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const k = addDays(start, i);
            const cls = [k.slice(0, 7) !== month.slice(0, 7) ? "out" : "", k === today ? "today" : "", k === date && k !== today ? "sel" : ""].join(" ");
            return <button key={k} className={cls} aria-label={fmtKey(k, { long: true })} aria-current={k === date ? "date" : undefined} onClick={() => onPick(k)}>{parseKey(k).d}</button>;
          })}
        </div>
      </Card>
      <Card title="Team calendars" right={
        <div className="tu-row" style={{ gap: 4 }}>
          <Btn size="xs" kind={!sel ? "navy" : ""} onClick={() => setPrefs({ calPeople: null })}>Show all</Btn>
          <Btn size="xs" kind={sel && sel.length === 1 && sel[0] === "P01" ? "navy" : ""} onClick={() => setPrefs({ calPeople: ["P01"] })}>Only mine</Btn>
        </div>}>
        <div className="cal-people" role="group" aria-label="Show calendars for">
          {db.people.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={on(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: p.color }} />
              <span className="tu-dot" style={{ background: p.color }} />
              <span className="tu-grow tu-ellipsis">{p.name}{p.id === "P01" ? " (me)" : ""}</span>
              {p.status === "On leave" && <Badge tone="outline">Leave</Badge>}
            </label>
          ))}
        </div>
      </Card>
      <Card title="Event types" sub="Colour shows the calendar owner; the icon shows the type">
        <div className="cal-legend">
          {EVENT_TYPES.map((t) => <span key={t}><Icon name={TYPE_ICON[t]} size={13} />{t}</span>)}
          <span style={{ gridColumn: "1 / -1" }}><span style={{ width: 22, height: 12, borderRadius: 3, flex: "none", background: "repeating-linear-gradient(135deg,var(--track) 0 4px,transparent 4px 8px)", border: "1px solid var(--border-strong)" }} />Striped: provisional</span>
          <span style={{ gridColumn: "1 / -1" }}><span style={{ width: 22, height: 12, borderRadius: 3, flex: "none", borderLeft: "3px dashed var(--dim)", background: "var(--track)" }} />Band: on-call availability, not booked work</span>
        </div>
      </Card>
    </div>
  );
}

/* ── Day and Week time grid ──────────────────────────────────────── */
interface Placed { o: Occurrence; top: number; bottom: number; lane: number; lanes: number; contStart: boolean; contEnd: boolean }
function layoutDay(occ: Occurrence[], day: string): { timed: Placed[]; bands: Placed[] } {
  const lo = atMs(day, 0), hi = atMs(addDays(day, 1), 0);
  const items: Placed[] = [];
  const bands: Placed[] = [];
  for (const o of occ) {
    if (o.allDay || !overlapsDay(o, day)) continue;
    const s = Math.max(lo, Date.parse(o.start)), e = Math.min(hi, Date.parse(o.end));
    if (e <= s) continue;
    const p: Placed = { o, top: (s - lo) / 60000, bottom: (e - lo) / 60000, lane: 0, lanes: 1, contStart: Date.parse(o.start) < lo, contEnd: Date.parse(o.end) > hi };
    (o.type === "On call" ? bands : items).push(p);
  }
  items.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => { cluster.forEach((c) => { c.lanes = laneEnds.length; }); cluster = []; laneEnds = []; clusterEnd = -1; };
  for (const it of items) {
    const vb = Math.max(it.bottom, it.top + 24);
    if (cluster.length && it.top >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.top);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(vb); } else laneEnds[lane] = vb;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, vb);
  }
  flush();
  bands.sort((a, b) => a.top - b.top);
  return { timed: items, bands };
}

function TimeView({ view, date, today, now, visible, onDay }: { view: "day" | "week"; date: string; today: string; now: number; visible: (o: Occurrence) => boolean; onDay: (d: string) => void }) {
  const db = useDB();
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i)) : [date];
  const from = days[0], to = addDays(days[days.length - 1], 1);
  const occ = useMemo(() => occurrences(db, from, to).filter(visible), [db, from, to, visible]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * 48 - 6; }, [view]);
  const cols = "56px repeat(" + days.length + ", minmax(" + (view === "week" ? 84 : 160) + "px, 1fr))";
  const minW = 56 + days.length * (view === "week" ? 84 : 160);
  const nowP = dublinParts(now);
  const nowTop = (nowP.h * 60 + nowP.min) * PX_PER_MIN;
  const allDay = (d: string) => occ.filter((o) => o.allDay && overlapsDay(o, d));

  const grid = (
    <div className="cal-scroll-x" role="region" aria-label={view === "week" ? "Week grid" : "Day grid"} tabIndex={0}>
      <div style={{ minWidth: minW }}>
        <div className="cal-heads" style={{ gridTemplateColumns: cols }}>
          <div className="tu-faint" style={{ fontSize: 10, padding: "10px 6px 0 0", textAlign: "right" }}>GMT/IST</div>
          {days.map((d) => (
            <div key={d} className="cal-head">
              <span className="d">{DOW[weekdayOf(d)]}</span>
              <button className={"tu-daynum" + (d === today ? " today" : "")} aria-label={"Open day view for " + fmtKey(d, { long: true })} onClick={() => onDay(d)} style={{ width: 30, height: 30, fontSize: 14 }}>{parseKey(d).d}</button>
            </div>
          ))}
        </div>
        <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
          <div className="lbl">All day</div>
          {days.map((d) => (
            <div key={d}>
              {allDay(d).map((o) => {
                const c = colourOf(db, o);
                return (
                  <button key={o.key} className={"cal-adchip" + (o.provisional ? " tu-ev prov" : "")} style={{ position: "static", background: tint(c, o.type === "Leave" ? 18 : 30), borderLeft: "3px solid " + c }}
                    onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })} title={o.title + (o.provisional ? " (provisional)" : "")}>
                    <Icon name={TYPE_ICON[o.type]} size={11} />{o.type === "Leave" ? nameOf(db, o.ownerId) + ": " : ""}{o.title}{o.provisional ? " (provisional)" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="tu-timegrid" ref={scrollRef}>
          <div className="tu-tg-cols" style={{ gridTemplateColumns: cols }}>
            <div aria-hidden="true">{Array.from({ length: 24 }, (_, h) => <div key={h} className="tu-tg-hour">{h ? pad(h) + ":00" : ""}</div>)}</div>
            {days.map((d) => <DayColumn key={d} day={d} occ={occ} isToday={d === today} nowTop={nowTop} />)}
          </div>
        </div>
      </div>
    </div>
  );
  if (view === "week") return grid;
  return (
    <div className="cal-day-layout" style={{ padding: 0 }}>
      <div style={{ minWidth: 0 }}>{grid}</div>
      <DayPanel date={date} occ={occ.filter((o) => overlapsDay(o, date))} />
    </div>
  );
}

function DayColumn({ day, occ, isToday, nowTop }: { day: string; occ: Occurrence[]; isToday: boolean; nowTop: number }) {
  const db = useDB();
  const { timed, bands } = layoutDay(occ, day);
  return (
    <div className="tu-tg-day" style={{ height: 24 * 48 }}>
      {Array.from({ length: 48 }, (_, i) => {
        const hh = pad(Math.floor(i / 2)), mm = i % 2 ? "30" : "00";
        return <div key={i} className="tu-tg-slot" role="button" tabIndex={-1} aria-label={"Create event " + fmtKey(day) + " " + hh + ":" + mm}
          onClick={() => openOverlay({ kind: "eventForm", date: day, prefill: { start: hh + ":" + mm } })} />;
      })}
      {bands.map((b, i) => {
        const c = colourOf(db, b.o);
        const style: CSSProperties = { top: b.top * PX_PER_MIN, height: (b.bottom - b.top) * PX_PER_MIN, color: c, background: "transparent" };
        return (
          <div key={b.o.key} className="cal-band" style={style}>
            <button className="cal-band-lbl" style={{ top: 2 + i * 18, background: tint(c, 34) }} onClick={() => openOverlay({ kind: "event", id: b.o.eventId, date: b.o.date })}
              title={b.o.title + ", " + rangeLabel(b.o.start, b.o.end)}>
              {nameOf(db, b.o.attendeeIds[0] || b.o.ownerId).split(" ")[0]} on call{b.contStart ? " (from previous day)" : b.contEnd ? " (to next day)" : ""}
            </button>
          </div>
        );
      })}
      {timed.map((p) => {
        const c = colourOf(db, p.o);
        const h = Math.max(18, (p.bottom - p.top) * PX_PER_MIN - 2);
        const w = 100 / p.lanes;
        const style: CSSProperties = {
          top: p.top * PX_PER_MIN + 1, height: h, left: "calc(" + (p.lane * w) + "% + 2px)", width: "calc(" + w + "% - 4px)", zIndex: 2,
          background: tint(c, 30), borderLeft: "3px solid " + c,
        };
        return (
          <button key={p.o.key} className={"tu-ev cal-ev" + (p.o.provisional ? " prov" : "")} style={style} onClick={() => openOverlay({ kind: "event", id: p.o.eventId, date: p.o.date })}
            aria-label={p.o.title + ", " + rangeLabel(p.o.start, p.o.end) + (p.o.provisional ? ", provisional" : "")}>
            <span className="t"><Icon name={TYPE_ICON[p.o.type]} size={10} /><span>{p.o.title}</span></span>
            {h > 30 && <span className="s">{hhmm(p.o.start)} to {p.contEnd ? "next day" : hhmm(p.o.end)}{p.o.location ? ", " + p.o.location : ""}</span>}
          </button>
        );
      })}
      {isToday && <div className="tu-nowline" style={{ top: nowTop }} aria-hidden="true" />}
    </div>
  );
}

function agendaTime(o: Occurrence, date: string): string {
  if (o.allDay) return "All day";
  const sk = keyOf(Date.parse(o.start)), ek = keyOf(Date.parse(o.end));
  if (sk < date) return "Until " + hhmm(o.end) + " (from " + fmtKey(sk) + ")";
  if (ek > date && !(ek === addDays(date, 1) && hhmm(o.end) === "00:00")) return hhmm(o.start) + " to " + fmtKey(ek) + " " + hhmm(o.end);
  return hhmm(o.start) + " to " + (hhmm(o.end) === "00:00" ? "24:00" : hhmm(o.end));
}
function DayPanel({ date, occ }: { date: string; occ: Occurrence[] }) {
  const db = useDB();
  const av = availabilityOn(db, date);
  const order = { Available: 0, "Partly booked": 1, Unavailable: 2 } as Record<string, number>;
  av.sort((a, b) => order[a.state] - order[b.state]);
  const sorted = occ.slice().sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));
  return (
    <div className="tu-stack" style={{ padding: 12, gap: 12 }}>
      <Card title="Agenda" sub={fmtKey(date, { long: true, year: false })} pad={false}>
        {sorted.length ? sorted.map((o) => (
          <button key={o.key} className="tu-rowbtn" onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })}>
            <span className="tu-dot" style={{ background: colourOf(db, o) }} />
            <span className="tu-grow" style={{ minWidth: 0 }}>
              <span className="tu-ellipsis" style={{ display: "block", fontWeight: 500 }}>{o.title}{o.provisional ? " (provisional)" : ""}</span>
              <span className="tu-small tu-muted">{agendaTime(o, date)}</span>
            </span>
            <Icon name={TYPE_ICON[o.type]} size={13} />
          </button>
        )) : <Empty title="Nothing scheduled">Click a time slot to create an event.</Empty>}
      </Card>
      <Card title="Availability" sub="08:00 to 17:00, from events, leave and on-call rest" pad={false}>
        {av.map((a) => (
          <button key={a.person.id} className="tu-rowbtn" onClick={() => navigate("/people/p/" + a.person.id)} style={{ alignItems: "flex-start" }}>
            <Avatar person={a.person} size={24} />
            <span className="tu-grow" style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 500 }}>{a.person.name}</span>
              {a.reasons.length > 0 && <span className="tu-small tu-muted" style={{ display: "block" }}>{a.reasons.join("; ")}</span>}
            </span>
            <Badge tone={a.state === "Available" ? "ok" : a.state === "Partly booked" ? "warn" : "bad"}>{a.state}</Badge>
          </button>
        ))}
        <div className="tu-card-f">An open calendar alone does not prove someone holds the skill or credential for a role.</div>
      </Card>
    </div>
  );
}

/* ── Month grid ──────────────────────────────────────────────────── */
/** One-off and all-day items first; daily briefings and on-call cover last. */
function monthRank(db: ReturnType<typeof useDB>, o: Occurrence): number {
  if (o.allDay) return 0;
  const ev = db.events.find((e) => e.id === o.eventId);
  if (!ev?.recurrence) return 1;
  if (o.type === "On call") return 4;
  return ev.recurrence.byDay.length >= 5 ? 3 : 2;
}
function MonthGrid({ date, today, visible, onDay }: { date: string; today: string; visible: (o: Occurrence) => boolean; onDay: (d: string) => void }) {
  const db = useDB();
  const month = firstOfMonth(date);
  const start = mondayOf(month);
  const weeks = Math.ceil((weekdayOf(month) + daysInMonth(month)) / 7);
  const end = addDays(start, weeks * 7);
  const occ = useMemo(() => occurrences(db, start, end).filter(visible), [db, start, end, visible]);
  return (
    <div className="cal-scroll-x" role="region" aria-label={"Month grid, " + monthTitle(month)}>
      <div style={{ minWidth: 560 }}>
        <div className="tu-month" style={{ borderTop: 0 }}>
          {DOW.map((d) => <div key={d} style={{ minHeight: 0, padding: "8px 6px", fontSize: 11, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>{d}</div>)}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const k = addDays(start, i);
            const out = k.slice(0, 7) !== month.slice(0, 7);
            const list = occ.filter((o) => overlapsDay(o, k) && (o.allDay || keyOf(Date.parse(o.start)) === k))
              .sort((a, b) => monthRank(db, a) - monthRank(db, b) || Date.parse(a.start) - Date.parse(b.start));
            const shown = list.slice(0, 3);
            return (
              <div key={k} className={out ? "out" : ""}>
                <button className={"tu-daynum n" + (k === today ? " today" : "")} aria-label={"Open day view for " + fmtKey(k, { long: true })} onClick={() => onDay(k)}>{parseKey(k).d}</button>
                {shown.map((o) => {
                  const c = colourOf(db, o);
                  return (
                    <button key={o.key} className={"tu-mchip cal-mchip" + (o.provisional ? " tu-ev prov" : "")} style={{ position: "static", background: tint(c, 30), borderLeft: "3px solid " + c }}
                      onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })} title={o.title + ", " + rangeLabel(o.start, o.end, o.allDay)}>
                      <Icon name={TYPE_ICON[o.type]} size={10} />{o.allDay ? "" : hhmm(o.start) + " "}{o.type === "Leave" ? nameOf(db, o.ownerId).split(" ")[0] + ": " : ""}{o.title}
                    </button>
                  );
                })}
                {list.length > 3 && <button className="cal-more" onClick={() => onDay(k)} aria-label={"Show all " + list.length + " events on " + fmtKey(k)}>+{list.length - 3} more</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── event detail drawer ─────────────────────────────────────────── */
export function EventDrawer({ ok, id, date }: { ok: string; id: string; date?: string }) {
  const db = useDB();
  const [confirm, setConfirm] = useState(false);
  const [cover, setCover] = useState("");
  const ev = db.events.find((e) => e.id === id);
  const occ = useMemo(() => {
    if (!ev || !ev.recurrence) return null;
    const from = date || todayKey();
    return occurrences(db, from, addDays(from, date ? 1 : 14)).find((o) => o.eventId === id && (!date || o.date === date)) || null;
  }, [db, ev, id, date]);
  if (!ev) return <Drawer ok={ok} title="Event not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">This event no longer exists. It may have been deleted or cleared by a demo reset.</p></Drawer>;
  const start = occ ? occ.start : ev.start, end = occ ? occ.end : ev.end;
  const attendees = occ ? occ.attendeeIds : ev.attendeeIds;
  const occDate = occ ? occ.date : keyOf(Date.parse(ev.start));
  const note = occ?.note || ev.notes;
  const exception = ev.recurrence && ev.exceptions?.[occDate];
  const close = () => closeOverlay(ok);
  const edit = () => { closeOverlay(ok, true); openOverlay({ kind: "eventForm", eventId: ev.id, date: ev.recurrence ? occDate : undefined }); };
  const del = (scope: "occurrence" | "series") => { deleteEvent(ev.id, scope, occDate); closeOverlay(ok, true); };
  const p = db.projects.find((x) => x.id === ev.projectId);
  const s = db.sites.find((x) => x.id === ev.siteId);
  const avail = cover ? availabilityOn(db, occDate).find((a) => a.person.id === cover) : null;
  const nextDayAvail = cover && ev.type === "On call" && dublinParts(Date.parse(start)).h >= 18 ? availabilityOn(db, addDays(occDate, 1)).find((a) => a.person.id === cover) : null;
  return (
    <Drawer ok={ok} onClose={close} eyebrow={ev.type + (ev.recurrence ? " · Recurring" : "")}
      badges={<>{ev.provisional && <Badge tone="warn" icon="alert">Provisional</Badge>}{exception && <Badge tone="accent">Changed for this date</Badge>}</>}
      title={occ?.title || ev.title}
      footer={confirm ? (
        ev.recurrence ? (
          <>
            <span className="tu-grow" style={{ fontSize: 13 }}>Delete which events?</span>
            <Btn onClick={() => setConfirm(false)} data-autofocus>Cancel</Btn>
            <Btn kind="danger" onClick={() => del("occurrence")}>This occurrence</Btn>
            <Btn kind="danger" onClick={() => del("series")}>Whole series</Btn>
          </>
        ) : (
          <>
            <span className="tu-grow" style={{ fontSize: 13 }}>Delete this event? It is removed from every calendar view.</span>
            <Btn onClick={() => setConfirm(false)} data-autofocus>Cancel</Btn>
            <Btn kind="danger" onClick={() => del("series")}>Delete event</Btn>
          </>
        )
      ) : (
        <>
          <span className="tu-grow tu-small tu-muted">Local demo event. Invitations are simulated.</span>
          <Btn kind="danger" icon="trash" onClick={() => setConfirm(true)}>Delete</Btn>
          <Btn kind="navy" icon="edit" onClick={edit}>Edit</Btn>
        </>
      )}>
      <div className="tu-note" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Icon name={TYPE_ICON[ev.type]} size={16} />
        <div><b>{rangeLabel(start, end, ev.allDay)}</b>{ev.recurrence && <div className="tu-small tu-muted">{recurrenceLabel(ev)}</div>}</div>
      </div>
      <div className="tu-section">
        <div className="tu-kv">
          <div><div className="k">Calendar owner</div><div className="v"><PersonLink id={ev.ownerId} /></div></div>
          <div><div className="k">Location</div><div className="v">{ev.location || "Not set"}</div></div>
          <div><div className="k">Project</div><div className="v">{p ? <Ref type="project" id={p.id} /> : "None"}</div></div>
          <div><div className="k">Site</div><div className="v">{s ? <Ref type="site" id={s.id} /> : "None"}</div></div>
        </div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Attendees · {attendees.length}</div>
        <div className="tu-stack" style={{ gap: 6 }}>{attendees.map((a) => <PersonLink key={a} id={a} />)}</div>
      </div>
      {note && <div className="tu-section"><div className="tu-eyebrow">Notes</div><div className="tu-note">{note}</div></div>}
      {ev.provisional && <div className="tu-section"><div className="tu-note warn">Provisional reservation. It holds people and dates but does not satisfy any permit or licence dependency.</div></div>}
      {ev.type === "On call" && (
        <div className="tu-section">
          <div className="tu-eyebrow">Reassign this shift</div>
          <div className="tu-row tu-wrap" style={{ gap: 8 }}>
            <label className="tu-sr" htmlFor={ok + "-cover"}>Cover person</label>
            <select id={ok + "-cover"} className="tu-select" style={{ width: 240 }} value={cover} onChange={(e) => setCover(e.target.value)}>
              <option value="">Choose cover</option>
              {db.people.filter((x) => !attendees.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <Btn size="sm" kind="navy" disabled={!cover || avail?.state === "Unavailable"} onClick={() => { reassignShift(ev.id, occDate, cover); setCover(""); }}>Reassign {fmtKey(occDate)}</Btn>
          </div>
          {avail && (
            <div className={"tu-note " + (avail.state === "Unavailable" ? "bad" : avail.reasons.length ? "warn" : "")} style={{ marginTop: 8 }}>
              {avail.person.name}: {avail.state}{avail.reasons.length ? ". " + avail.reasons.join("; ") : ". No conflicts on " + fmtKey(occDate) + "."}
              {nextDayAvail && <div style={{ marginTop: 4 }}>Night shift: {avail.person.first} should be rested until 15:00 on {fmtKey(addDays(occDate, 1))}; check their daytime work that day ({nextDayAvail.state.toLowerCase()}).</div>}
            </div>
          )}
          <p className="tu-small tu-muted" style={{ marginTop: 6 }}>On-call is availability, not booked work. Reassigning updates this date only and is written to the audit log.</p>
        </div>
      )}
    </Drawer>
  );
}

/* ── create and edit form ────────────────────────────────────────── */
const addMins = (hm: string, mins: number) => {
  const [h, m] = hm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return pad(Math.floor(t / 60)) + ":" + pad(t % 60);
};

export function EventForm({ ok, eventId, date, prefill }: { ok: string; eventId?: string; date?: string; prefill?: Record<string, unknown> }) {
  const db = useDB();
  const pf = prefill || {};
  const ev = eventId ? db.events.find((e) => e.id === eventId) : undefined;
  const occ = ev && ev.recurrence && date ? occurrences(db, date, addDays(date, 1)).find((o) => o.eventId === ev.id && o.date === date) : undefined;
  const [f, setF] = useState(() => {
    if (ev) {
      const s = occ ? occ.start : ev.start, e = occ ? occ.end : ev.end;
      const sk = keyOf(Date.parse(s));
      let ek = keyOf(Date.parse(e)), et = hhmm(e);
      if (ev.allDay) ek = addDays(ek, -1);
      else if (et === "00:00" && ek === addDays(sk, 1)) { ek = sk; et = "23:59"; }
      return { title: occ?.title || ev.title, type: ev.type, ownerId: ev.ownerId, attendees: (occ ? occ.attendeeIds : ev.attendeeIds).slice(), startDate: sk, startTime: hhmm(s), endDate: ek, endTime: et,
        allDay: !!ev.allDay, location: ev.location, projectId: ev.projectId || "", siteId: ev.siteId || "", notes: ev.notes || "", provisional: !!ev.provisional,
        repeat: !!ev.recurrence, byDay: ev.recurrence ? ev.recurrence.byDay.slice() : [weekdayOf(sk)] };
    }
    const d = (pf.date as string) || date || todayKey();
    let st = (pf.start as string) || "";
    if (!st) {
      const n = dublinParts(Date.now());
      st = d === todayKey() ? pad(Math.min(22, n.h + 1)) + ":00" : "09:00";
    }
    const owner = (pf.ownerId as string) || "P01";
    return { title: (pf.title as string) || "", type: ((pf.type as EventType) || "Meeting") as EventType, ownerId: owner, attendees: (pf.attendeeIds as string[]) || [owner],
      startDate: d, startTime: st, endDate: d, endTime: (pf.end as string) || addMins(st, 60), allDay: false, location: (pf.location as string) || "", projectId: (pf.projectId as string) || "",
      siteId: (pf.siteId as string) || "", notes: "", provisional: false, repeat: false, byDay: [weekdayOf(d)] };
  });
  const [scope, setScope] = useState<"occurrence" | "series">(ev?.recurrence && date ? "occurrence" : "series");
  const [tried, setTried] = useState(false);
  const [override, setOverride] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const startIso = f.allDay ? at(f.startDate, 0) : at(f.startDate, ...(f.startTime.split(":").map(Number) as [number, number]));
  const endIso = f.allDay ? at(addDays(f.endDate || f.startDate, 1), 0) : at(f.endDate || f.startDate, ...(f.endTime.split(":").map(Number) as [number, number]));
  const sMs = Date.parse(startIso), eMs = Date.parse(endIso);
  const errs = {
    title: !f.title.trim() ? "Give the event a title." : "",
    ownerId: !f.ownerId ? "Choose whose calendar this is on." : "",
    time: !f.startDate ? "Choose a date." : f.allDay ? (f.endDate < f.startDate ? "The last day cannot be before the first day." : "")
      : !(eMs > sMs) ? (f.endDate === f.startDate ? "End must be after start. For an overnight event, set the end date to the next day." : "End must be after start.") : "",
    byDay: f.repeat && !f.byDay.length && scope === "series" ? "Pick at least one weekday." : "",
  };
  const people = Array.from(new Set([f.ownerId, ...f.attendees])).filter(Boolean);
  const conflicts = useMemo(() => {
    if (!f.startDate || !(eMs > sMs)) return [] as Occurrence[];
    const occ2 = occurrences(db, keyOf(sMs), addDays(keyOf(eMs - 1), 1));
    return occ2.filter((o) => o.eventId !== eventId && Date.parse(o.start) < eMs && Date.parse(o.end) > sMs && people.some((pid) => involves(o, pid)));
  }, [db, sMs, eMs, eventId, people.join(","), f.startDate]);
  const bad = Object.values(errs).some(Boolean);
  const needOverride = conflicts.length > 0 && !override;

  const save = () => {
    setTried(true);
    if (bad || needOverride) return;
    const attendeeIds = people;
    const base = {
      title: f.title.trim(), type: f.type, ownerId: f.ownerId, attendeeIds, start: startIso, end: endIso, allDay: f.allDay || undefined, location: f.location.trim(),
      projectId: f.projectId || undefined, siteId: f.siteId || undefined, notes: f.notes.trim() || undefined, provisional: f.provisional || undefined,
    };
    if (!ev) {
      const recurrence = f.repeat && !f.allDay ? { freq: "weekly" as const, byDay: f.byDay.slice().sort(), startTime: f.startTime, durationMins: Math.round((eMs - sMs) / 60000), from: f.startDate } : undefined;
      createEvent({ ...base, recurrence });
    } else if (ev.recurrence && scope === "occurrence" && date) {
      updateEvent(ev.id, { title: base.title, attendeeIds, start: startIso, end: endIso }, "occurrence", date);
    } else if (ev.recurrence) {
      updateEvent(ev.id, { ...base, recurrence: { ...ev.recurrence, byDay: f.byDay.slice().sort() } }, "series");
    } else {
      updateEvent(ev.id, base, "series");
    }
    closeOverlay(ok, true);
  };
  const toggleInv = (pid: ID) => set({ attendees: f.attendees.includes(pid) ? f.attendees.filter((x) => x !== pid) : f.attendees.concat([pid]) });
  const projectSites = f.projectId ? db.sites.filter((s) => s.projectId === f.projectId) : db.sites;
  const seriesLocked = !!ev?.recurrence && scope === "occurrence";

  return (
    <Modal ok={ok} size="lg" title={ev ? "Edit event" : "Create event"} sub={ev ? undefined : "Saved to the shared calendar. Invitations are simulated; nothing is emailed."} onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={tried && (bad || needOverride)}>{ev ? "Save changes" : "Save event"}</Btn></>}>
      <div className="tu-stack" style={{ gap: 12 }}>
        {ev?.recurrence && date && (
          <fieldset className="tu-fs">
            <legend>This is a recurring event. Apply changes to</legend>
            <Seg label="Apply changes to" value={scope} onChange={setScope} options={[{ id: "occurrence", label: "This occurrence (" + fmtKey(date) + ")" }, { id: "series", label: "Series" }]} />
          </fieldset>
        )}
        <Field label="Title" error={tried ? errs.title : ""}>
          <input className="tu-input" data-autofocus value={f.title} aria-invalid={tried && !!errs.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Hall 4 handover rehearsal" />
        </Field>
        <div className="tu-grid tu-g4" style={{ gap: 10 }}>
          <Field label="Date" help={f.startDate ? fmtKey(f.startDate, { year: true }) : undefined}><input className="tu-input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: f.endDate < e.target.value || f.endDate === f.startDate ? e.target.value : f.endDate })} /></Field>
          {!f.allDay && <Field label="Start"><TimeSelect value={f.startTime} onChange={(v) => set({ startTime: v, endTime: f.endDate === f.startDate && f.endTime <= v ? addMins(v, 60) : f.endTime })} /></Field>}
          <Field label={f.allDay ? "Last day" : "End date"} help={f.endDate !== f.startDate ? (f.allDay ? "Until " : "Overnight: ends ") + fmtKey(f.endDate) : undefined}>
            <input className="tu-input" type="date" value={f.endDate} min={f.startDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          {!f.allDay && <Field label="End"><TimeSelect end value={f.endTime} onChange={(v) => set({ endTime: v })} /></Field>}
        </div>
        <div className="tu-row tu-wrap" style={{ gap: 14 }}>
          <label className="tu-check"><input type="checkbox" checked={f.allDay} disabled={seriesLocked} onChange={(e) => set({ allDay: e.target.checked, repeat: e.target.checked ? false : f.repeat })} />All day</label>
          {!f.allDay && f.endDate === f.startDate && <Btn size="xs" onClick={() => set({ endDate: addDays(f.startDate, 1) })}>Ends next day</Btn>}
          <label className="tu-check"><input type="checkbox" checked={f.provisional} disabled={seriesLocked} onChange={(e) => set({ provisional: e.target.checked })} />Provisional</label>
        </div>
        {tried && errs.time && <div className="tu-note bad" role="alert">{errs.time}</div>}
        <div className="tu-grid tu-g3" style={{ gap: 10 }}>
          <Field label="Calendar owner" error={tried ? errs.ownerId : ""}>
            <select className="tu-select" value={f.ownerId} disabled={seriesLocked} onChange={(e) => set({ ownerId: e.target.value, attendees: f.attendees.includes(e.target.value) ? f.attendees : [e.target.value].concat(f.attendees) })}>
              <option value="">Choose</option>{db.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Type"><select className="tu-select" value={f.type} disabled={seriesLocked} onChange={(e) => set({ type: e.target.value as EventType })}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Location"><input className="tu-input" value={f.location} disabled={seriesLocked} onChange={(e) => set({ location: e.target.value })} placeholder="Site, office or Teams" /></Field>
          <Field label="Project (optional)">
            <select className="tu-select" value={f.projectId} disabled={seriesLocked} onChange={(e) => set({ projectId: e.target.value, siteId: "" })}>
              <option value="">None</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.id} {p.short}</option>)}
            </select>
          </Field>
          <Field label="Site (optional)">
            <select className="tu-select" value={f.siteId} disabled={seriesLocked} onChange={(e) => set({ siteId: e.target.value })}>
              <option value="">None</option>{projectSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Repeats">
            <select className="tu-select" value={f.repeat ? "weekly" : "none"} disabled={f.allDay || !!ev} onChange={(e) => set({ repeat: e.target.value === "weekly" })}>
              <option value="none">Does not repeat</option><option value="weekly">Weekly on selected days</option>
            </select>
          </Field>
        </div>
        {f.repeat && !f.allDay && !seriesLocked && (
          <fieldset className="tu-fs">
            <legend>Repeat on</legend>
            <div className="cal-wd">
              {DOW.map((d, i) => <button key={d} type="button" aria-pressed={f.byDay.includes(i)} onClick={() => set({ byDay: f.byDay.includes(i) ? f.byDay.filter((x) => x !== i) : f.byDay.concat([i]) })}>{d}</button>)}
            </div>
            {tried && errs.byDay && <div className="tu-small" style={{ color: "var(--bad)", marginTop: 6 }} role="alert">{errs.byDay}</div>}
          </fieldset>
        )}
        <fieldset className="tu-fs">
          <legend>Invite people ({people.length})</legend>
          <div className="cal-inv">
            {db.people.map((p) => (
              <label key={p.id}>
                <input type="checkbox" checked={p.id === f.ownerId || f.attendees.includes(p.id)} disabled={p.id === f.ownerId} onChange={() => toggleInv(p.id)} style={{ accentColor: p.color }} />
                <span className="tu-dot" style={{ background: p.color }} /><span className="tu-ellipsis">{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes (optional)"><textarea className="tu-textarea" style={{ minHeight: 60 }} value={f.notes} disabled={seriesLocked} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {conflicts.length > 0 && (
          <div className="tu-note warn" role="status">
            <b>{conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} for the people on this event</b>
            <div className="tu-stack" style={{ gap: 4, marginTop: 6 }}>
              {conflicts.slice(0, 6).map((o) => (
                <div key={o.key} className="tu-small">
                  {people.filter((pid) => involves(o, pid)).map((pid) => nameOf(db, pid).split(" ")[0]).join(", ")}:{" "}
                  <button className="tu-link" onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })}>{o.title}</button> ({o.allDay ? "all day" : hhmm(o.start) + " to " + hhmm(o.end)}{o.type === "Leave" ? ", on leave" : o.type === "On call" ? ", on-call availability" : ""})
                </div>
              ))}
            </div>
            <label className="tu-check" style={{ marginTop: 8 }}><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />Save anyway (deliberate demo planning override)</label>
            {tried && needOverride && <div className="tu-small" style={{ color: "var(--bad)", marginTop: 4 }} role="alert">Confirm the override to save over these conflicts.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
