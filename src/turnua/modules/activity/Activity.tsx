/* Activity: All, People, Agents, Systems, Audit. A live log of what happened, from the store. */
import { Fragment, useMemo, useState } from "react";
import type { Activity, DB } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate } from "../../ui";
import { Avatar, Badge, Btn, Card, Empty, Icon, Page, Search, Select, Stat, download, openRef, toCsv } from "../../kit";
import { ago, fmtDateTime, keyOf, todayKey, daysBetween, hhmm, relDay } from "../../time";
import { labelOf } from "../../selectors";
import AgentFace from "../../../components/AgentFace";
import "./activity.css";

const TABS: Record<string, { title: string; sub: string; match: (a: Activity) => boolean }> = {
  all: { title: "All activity", sub: "Everything people, agents, systems and workflows did, newest first. Every action in this demo writes here.", match: () => true },
  people: { title: "People", sub: "Task moves, comments, calendar edits, timesheets, maintenance completions and approvals made by the team.", match: (a) => a.actorType === "person" },
  agents: { title: "Agents", sub: "Findings, briefings, recovery proposals and approval requests from the eight agents.", match: (a) => a.actorType === "agent" },
  systems: { title: "Systems", sub: "Simulated calendar syncs and mock monitoring or document imports. No live vendor connections exist in this demo.", match: (a) => a.actorType === "system" || a.actorType === "workflow" },
  audit: { title: "Audit", sub: "Before and after values for approvals, status, assignment, financial baselines and settings.", match: (a) => !!a.audit && a.audit.length > 0 },
};

function Actor({ a, db }: { a: Activity; db: DB }) {
  if (a.actorType === "person") return <Avatar person={db.people.find((p) => p.id === a.actorId)} size={28} />;
  if (a.actorType === "agent") {
    const ag = db.agents.find((x) => x.id === a.actorId);
    return <AgentFace shape={ag?.shape || "crown-pebble"} state="complete" tint={ag?.tint || "#08132a"} size="28" />;
  }
  return <span className="act-sys" aria-hidden="true"><Icon name={a.actorType === "workflow" ? "bolt" : "sync"} size={14} /></span>;
}

const RANGES: [string, string][] = [["all", "All dates"], ["today", "Today"], ["7d", "Last 7 days"]];

export default function ActivityModule({ tab }: { tab: string }) {
  return <ActivityView key={tab} tab={tab} />;
}

function ActivityView({ tab }: { tab: string }) {
  const db = useDB();
  const now = useClock();
  const def = TABS[tab] || TABS.all;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [actor, setActor] = useState("all");
  const [range, setRange] = useState("all");
  const [openAudit, setOpenAudit] = useState<string | null>(null);

  const base = useMemo(() => db.activity.filter(def.match).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [db.activity, def]);
  const cats = Array.from(new Set(base.map((a) => a.category))).sort();
  const actors = Array.from(new Set(base.map((a) => a.actor))).sort();
  const today = todayKey();
  const rows = base.filter((a) => {
    if (cat !== "all" && a.category !== cat) return false;
    if (actor !== "all" && a.actor !== actor) return false;
    if (range === "today" && keyOf(Date.parse(a.at)) !== today) return false;
    if (range === "7d" && daysBetween(keyOf(Date.parse(a.at)), today) > 6) return false;
    if (q.trim()) {
      const s = (a.text + " " + a.actor + " " + a.sourceId + " " + a.category + " " + (a.audit || []).map((x) => x.field + " " + x.before + " " + x.after).join(" ")).toLowerCase();
      if (!s.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });
  const todayCount = db.activity.filter((a) => keyOf(Date.parse(a.at)) === today).length;
  const exportCsv = () => {
    const head = tab === "audit" ? ["Time", "Actor", "Actor type", "Category", "Event", "Source type", "Source", "Field", "Before", "After"] : ["Time", "Actor", "Actor type", "Category", "Event", "Source type", "Source"];
    const body: (string | number)[][] = [];
    rows.forEach((a) => {
      const common = [fmtDateTime(a.at), a.actor, a.actorType, a.category, a.text, a.sourceType, a.sourceId];
      if (tab === "audit" && a.audit) a.audit.forEach((x) => body.push([...common, x.field, x.before, x.after]));
      else body.push(common);
    });
    download("turnua-activity-" + tab + "-" + today + ".csv", toCsv([head, ...body]), "text/csv");
  };
  const clear = () => { setQ(""); setCat("all"); setActor("all"); setRange("all"); };

  // group by calendar day for readability
  const groups: { day: string; items: Activity[] }[] = [];
  rows.forEach((a) => {
    const k = keyOf(Date.parse(a.at));
    const g = groups[groups.length - 1];
    if (g && g.day === k) g.items.push(a); else groups.push({ day: k, items: [a] });
  });

  return (
    <Page title={def.title} sub={def.sub} actions={<Btn icon="dl" onClick={exportCsv} disabled={!rows.length}>Export CSV</Btn>}>
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Events today" value={todayCount} sub="across all sources" onClick={() => setRange(range === "today" ? "all" : "today")} title="Show today only" />
        <Stat label="By people" value={db.activity.filter((a) => a.actorType === "person").length} onClick={() => navigate("/activity/people")} />
        <Stat label="By agents" value={db.activity.filter((a) => a.actorType === "agent").length} onClick={() => navigate("/activity/agents")} />
        <Stat label="With audit detail" value={db.activity.filter((a) => a.audit && a.audit.length).length} sub="before and after values" onClick={() => navigate("/activity/audit")} />
      </div>
      <div className="tu-toolbar">
        <Search value={q} onChange={setQ} placeholder="Search events, people, records" width={280} />
        <Select label="Category" value={cat} onChange={setCat} options={[["all", "All categories"] as [string, string], ...cats.map((c) => [c, c] as [string, string])]} />
        <Select label="Actor" value={actor} onChange={setActor} options={[["all", "Everyone"] as [string, string], ...actors.map((c) => [c, c] as [string, string])]} />
        <Select label="Date range" value={range} onChange={setRange} options={RANGES} />
        {(q || cat !== "all" || actor !== "all" || range !== "all") && <Btn kind="ghost" size="sm" onClick={clear}>Clear filters</Btn>}
        <span className="tu-grow" />
        <span className="tu-small tu-muted">{rows.length} of {base.length} events</span>
      </div>
      <Card pad={false}>
        {rows.length ? groups.map((g) => (
          <Fragment key={g.day}>
            <div className="act-day">{relDay(g.day + "T12:00:00Z", now)} · {g.items.length} events</div>
            {g.items.map((a) => {
              const isAud = openAudit === a.id;
              return (
                <div key={a.id} className="act-row">
                  <Actor a={a} db={db} />
                  <div className="tu-grow">
                    <div className="act-text"><b>{a.actor}</b> {/^[A-Z][a-z]/.test(a.text) ? a.text.charAt(0).toLowerCase() + a.text.slice(1) : a.text}</div>
                    <div className="tu-row tu-wrap" style={{ gap: 8, marginTop: 4 }}>
                      <span className="tu-small tu-faint" title={fmtDateTime(a.at)}>{ago(a.at, now)} · {hhmm(a.at)}</span>
                      <Badge tone={a.actorType === "agent" ? "accent" : a.actorType === "system" ? "outline" : ""}>{a.category}</Badge>
                      {a.actorType === "system" && <Badge tone="outline">Simulated</Badge>}
                      <button className="tu-link tu-small" onClick={() => openRef(a.sourceType, a.sourceId)} title={"Open " + a.sourceType}>
                        <Icon name="link" size={11} style={{ marginRight: 4, verticalAlign: -1 }} />{labelOf(db, a.sourceType, a.sourceId)}
                      </button>
                      {a.audit && a.audit.length > 0 && tab !== "audit" && (
                        <button className="tu-link tu-small" aria-expanded={isAud} onClick={() => setOpenAudit(isAud ? null : a.id)}>{isAud ? "Hide changes" : "Show changes (" + a.audit.length + ")"}</button>
                      )}
                    </div>
                    {(tab === "audit" || isAud) && a.audit && a.audit.length > 0 && (
                      <div className="tu-tablewrap act-audit">
                        <table className="tu-table">
                          <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                          <tbody>{a.audit.map((x, i) => <tr key={i}><td>{x.field}</td><td className="act-before">{x.before || "None"}</td><td>{x.after || "None"}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Fragment>
        )) : (
          <Empty title="No events match" action={<Btn onClick={clear}>Clear filters</Btn>}>
            {tab === "audit" ? "Approve a change, move a task or save a setting to add an audited entry." : "Try a wider date range or a different category."}
          </Empty>
        )}
      </Card>
    </Page>
  );
}
