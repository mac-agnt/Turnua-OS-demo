/* Internal marketing: overview, Social Studio, campaigns, inbound leads and the content calendar. */
import type { Campaign, ContentItem, Lead } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate, withQuery, useFilter } from "../../ui";
import { convertLead, setCampaignStatus, setContentStatus, setLead } from "../../growthActions";
import { Avatar, Badge, Btn, Card, Empty, Page, Search, Select, Stat } from "../../kit";
import { nameOf } from "../../selectors";
import { ago, eur, eurShort, fmtDate, hhmm, num, pct, relDay, addDays, todayKey, keyOf, mondayOf, fmtKey } from "../../time";
import Studio from "./Studio";
import "../growth.css";

const OWNERS = ["P01", "P02", "P03", "P04", "P05"];
const CH_COL: Record<Campaign["channel"], string> = { LinkedIn: "#8b9cf7", "Google Ads": "#f0a35e", Events: "var(--accent-fill,var(--accent))", Email: "#9ECBC2", Partner: "#C5B5E6", PR: "#E8A1AE" };

export default function MarketingModule({ tab }: { tab: string }) {
  if (tab === "studio") return <Page title="Social Studio" sub="Upload an image or video, let the Marketing agent apply the brand and write the post, then schedule it across your channels."><Studio /></Page>;
  if (tab === "campaigns") return <Campaigns />;
  if (tab === "leads") return <Leads />;
  if (tab === "calendar") return <ContentCalendar />;
  return <Overview />;
}

function Overview() {
  const db = useDB();
  const now = useClock();
  const spend = db.campaigns.reduce((n, c) => n + c.spend, 0);
  const leads = db.campaigns.reduce((n, c) => n + c.leads, 0);
  const sqls = db.campaigns.reduce((n, c) => n + c.sqls, 0);
  const pipe = db.campaigns.reduce((n, c) => n + c.pipeline, 0);
  const won = db.deals.filter((d) => d.stage === "Won").reduce((n, d) => n + d.value, 0);
  const fresh = db.leads.filter((l) => l.status === "New");
  const byCh = Object.entries(db.campaigns.reduce((m, c) => { m[c.channel] = (m[c.channel] || 0) + c.pipeline; return m; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
  const maxCh = Math.max(1, ...byCh.map((x) => x[1]));
  const next = db.posts.filter((p) => p.status === "Scheduled").sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!)).slice(0, 4);
  const funnel = [["Leads", leads, 1], ["Sales qualified", sqls, 0.72], ["Opportunities", db.deals.filter((d) => d.source.startsWith("Marketing") || d.source.includes("campaign") || d.source.includes("Datacloud")).length + 3, 0.5], ["Won", 1, 0.32]] as const;
  return (
    <Page title="Marketing" sub="Where pipeline comes from, what it costs and what is going out next."
      actions={<Btn kind="primary" icon="plus" onClick={() => navigate("/marketing/studio")}>Create a post</Btn>}>
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        <Stat label="Marketing sourced pipeline" value={eurShort(pipe)} sub={"from " + db.campaigns.length + " campaigns"} onClick={() => navigate("/marketing/campaigns")} />
        <Stat label="Spend to date" value={eurShort(spend)} sub={"ROI on pipeline " + Math.round(pipe / Math.max(1, spend)) + "x"} />
        <Stat label="Cost per lead" value={eur(Math.round(spend / Math.max(1, leads)))} sub={leads + " leads"} />
        <Stat label="Lead to SQL" value={pct(sqls / Math.max(1, leads))} sub={sqls + " sales qualified"} />
        <Stat label="New leads" value={fresh.length} tone={fresh.length ? "warn" : "ok"} sub="waiting for first contact" onClick={() => navigate("/marketing/leads")} />
      </div>
      <div className="tu-split">
        <div className="tu-stack">
          <Card title="Pipeline by channel">
            <div className="gr-bars">
              {byCh.map(([ch, v]) => (
                <div key={ch} className="gr-bar"><span className="lab">{ch}</span><span className="trk"><i style={{ width: v / maxCh * 100 + "%", background: CH_COL[ch as Campaign["channel"]] }} /></span><span className="val">{eurShort(v)}</span></div>
              ))}
            </div>
          </Card>
          <Card title="Hot leads" sub="Score 70 and above, newest first" pad={false} right={<Btn size="sm" onClick={() => navigate("/marketing/leads")}>All leads</Btn>}>
            <div className="tu-list">
              {db.leads.filter((l) => l.score >= 60 && (l.status === "New" || l.status === "Contacted")).sort((a, b) => b.score - a.score).slice(0, 4).map((l) => (
                <div key={l.id} className="tu-li">
                  <ScoreRing s={l.score} />
                  <div className="tu-grow"><div style={{ fontWeight: 550, color: "var(--ink)" }}>{l.company}</div><div className="tu-small tu-muted">{l.name}, {l.role} · {l.interest} · {ago(l.createdAt, now).toLowerCase()}</div></div>
                  <span className="sa-val">{eurShort(l.estValue)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="tu-stack">
          <Card title="Funnel, this quarter">
            <div className="gr-funnel">
              {funnel.map(([l, v, w]) => <div key={l} style={{ width: w * 100 + "%", background: l === "Won" ? "var(--ok)" : "color-mix(in oklab,var(--accent) " + Math.round(w * 100) + "%,var(--surface-2))" }}><span>{l}</span><span>{v}</span></div>)}
            </div>
            <div className="tu-small tu-muted" style={{ marginTop: 10 }}>Closed won this quarter: {eurShort(won)}.</div>
          </Card>
          <Card title="Going out next" pad={false} right={<Btn size="sm" onClick={() => navigate("/marketing/studio")}>Social Studio</Btn>}>
            <div className="tu-list">
              {next.map((p) => (
                <button key={p.id} className="tu-li click" style={{ border: 0, background: "none", textAlign: "left", width: "100%", font: "inherit", color: "inherit" }} onClick={() => navigate(withQuery("/marketing/studio", { post: p.id }))}>
                  <div className="ss-thumb" style={{ width: 54, height: 54, aspectRatio: "auto", borderRadius: 10, fontSize: 9, padding: 4, flex: "none" }}>{p.creative ? <img src={p.creative} alt="" /> : p.headline}</div>
                  <div className="tu-grow"><div style={{ fontWeight: 550, color: "var(--ink)" }}>{p.title}</div><div className="tu-small tu-muted">{relDay(p.scheduledAt!, now)} {hhmm(p.scheduledAt!)} · {p.platforms.join(", ")}</div></div>
                </button>
              ))}
              {!next.length && <div className="tu-li tu-muted">Nothing scheduled. Create a post in Social Studio.</div>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
function ScoreRing({ s }: { s: number }) {
  const c = s >= 70 ? "var(--ok)" : s >= 50 ? "var(--warn)" : "var(--faint)";
  return <span style={{ width: 34, height: 34, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "conic-gradient(" + c + " " + s * 3.6 + "deg, var(--track) 0)", fontSize: 11, fontWeight: 700, color: "var(--ink)" }}><span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}>{s}</span></span>;
}

function Campaigns() {
  const db = useDB();
  return (
    <Page title="Campaigns" sub="Budget, spend and what each campaign has put into the pipeline.">
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Campaign</th><th>Channel</th><th className="num">Spend / budget</th><th className="num">Leads</th><th className="num">CPL</th><th className="num">SQLs</th><th className="num">Pipeline</th><th>Status</th></tr></thead>
            <tbody>
              {db.campaigns.map((c) => {
                const burn = c.spend / Math.max(1, c.budget);
                return (
                  <tr key={c.id}>
                    <td><div style={{ fontWeight: 550, color: "var(--ink)" }}>{c.name}</div><div className="tu-small tu-muted">{c.audience} · {fmtDate(c.start)} to {fmtDate(c.end)} · {nameOf(db, c.ownerId)}</div></td>
                    <td><span className="gr-sw" style={{ background: CH_COL[c.channel] }} />{c.channel}</td>
                    <td className="num"><div className="tu-mono">{eurShort(c.spend)} / {eurShort(c.budget)}</div><div className="fa-load" style={{ marginTop: 5 }}><i style={{ width: Math.min(100, burn * 100) + "%", background: burn > 0.85 ? "var(--bad)" : burn > 0.7 ? "var(--warn)" : "var(--ok)" }} /></div></td>
                    <td className="num tu-mono">{c.leads}</td>
                    <td className="num tu-mono">{c.leads ? eur(Math.round(c.spend / c.leads)) : "n/a"}</td>
                    <td className="num tu-mono">{c.sqls}</td>
                    <td className="num tu-mono">{eurShort(c.pipeline)}</td>
                    <td>
                      <div className="tu-row" style={{ gap: 6 }}>
                        <Badge tone={c.status === "Live" ? "ok" : c.status === "Paused" ? "warn" : c.status === "Planned" ? "accent" : "outline"}>{c.status}</Badge>
                        {c.status === "Live" && <Btn size="xs" onClick={() => setCampaignStatus(c.id, "Paused")}>Pause</Btn>}
                        {(c.status === "Paused" || c.status === "Planned") && <Btn size="xs" onClick={() => setCampaignStatus(c.id, "Live")}>{c.status === "Planned" ? "Launch" : "Resume"}</Btn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

function Leads() {
  const db = useDB();
  const now = useClock();
  const [f, setF] = useFilter("mkt.leads");
  const q = (f.q || "").toLowerCase();
  const rows = db.leads.filter((l) => (f.status ? l.status === f.status : l.status !== "Disqualified" && l.status !== "Converted") && (!q || (l.name + " " + l.company + " " + l.interest).toLowerCase().includes(q)))
    .sort((a, b) => b.score - a.score);
  return (
    <Page title="Leads" sub="Inbound from campaigns, the website and events. Give each one an owner the same day; convert qualified leads into Sales opportunities.">
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search leads" width={240} />
        <Select label="Status" value={f.status || ""} onChange={(v) => setF("status", v)} options={[["", "Open leads"], "New", "Contacted", "Qualified", "Converted", "Disqualified"]} />
      </div>
      <Card pad={false}>
        <div className="tu-tablewrap">
          <table className="tu-table">
            <thead><tr><th>Score</th><th>Lead</th><th>Interest</th><th>Source</th><th className="num">Est. value</th><th>Owner</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><ScoreRing s={l.score} /></td>
                  <td><div style={{ fontWeight: 550, color: "var(--ink)" }}>{l.name}</div><div className="tu-small tu-muted">{l.role}, {l.company} · {ago(l.createdAt, now).toLowerCase()}</div></td>
                  <td>{l.interest}<div className="tu-small tu-muted">{l.sector}</div></td>
                  <td className="tu-small">{l.source}{l.campaignId && <div className="tu-muted">{db.campaigns.find((c) => c.id === l.campaignId)?.name}</div>}</td>
                  <td className="num tu-mono">{l.estValue ? eurShort(l.estValue) : "n/a"}</td>
                  <td><Select label="Owner" value={l.ownerId || ""} onChange={(v) => setLead(l.id, { ownerId: v || null, status: l.status === "New" && v ? "Contacted" : l.status }, "Owner set to " + nameOf(db, v))} options={[["", "Unassigned"], ...OWNERS.map((p) => [p, nameOf(db, p)] as [string, string])]} /></td>
                  <td><Select label="Status" value={l.status} onChange={(v) => setLead(l.id, { status: v as Lead["status"] }, "Lead " + v.toLowerCase())} options={["New", "Contacted", "Qualified", "Converted", "Disqualified"]} /></td>
                  <td>{l.dealId ? <button className="tu-link" onClick={() => navigate(withQuery("/sales/pipeline", { deal: l.dealId! }))}>{l.dealId}</button>
                    : l.status !== "Disqualified" && <Btn size="xs" kind={l.status === "Qualified" ? "primary" : ""} onClick={() => { const id = convertLead(l.id); if (id) navigate(withQuery("/sales/pipeline", { deal: id })); }}>To pipeline</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty title="No leads match" />}
        </div>
      </Card>
    </Page>
  );
}

function ContentCalendar() {
  const db = useDB();
  const start = mondayOf(todayKey());
  const days = Array.from({ length: 21 }, (_, i) => addDays(start, i));
  const items = [
    ...db.content.map((c) => ({ key: c.id, day: keyOf(Date.parse(c.dueAt)), title: c.title, kind: c.kind, status: c.status as string, c, post: undefined as undefined | string })),
    ...db.posts.filter((p) => p.scheduledAt && !db.content.some((c) => c.title === p.title)).map((p) => ({ key: p.id, day: keyOf(Date.parse(p.scheduledAt!)), title: p.title, kind: "Social post", status: p.status as string, c: undefined, post: p.id })),
  ];
  const today = todayKey();
  return (
    <Page title="Content Calendar" sub="Three weeks of case studies, posts, video and events. Click a social post to open it in Social Studio.">
      <div className="tu-grid" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="tu-eyebrow">{d}</div>)}
        {days.map((d) => (
          <div key={d} style={{ minHeight: 120, border: "1px solid " + (d === today ? "var(--accent-fill)" : "var(--border)"), borderRadius: 12, padding: 8, background: d < today ? "var(--surface-faint)" : "var(--surface)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="tu-small" style={{ fontWeight: 600, color: d === today ? "var(--ink)" : "var(--dim)" }}>{fmtKey(d)}</div>
            {items.filter((x) => x.day === d).map((x) => (
              <button key={x.key} className="tu-kcard" style={{ cursor: "pointer", padding: "6px 8px" }} onClick={() => x.post ? navigate(withQuery("/marketing/studio", { post: x.post })) : undefined}>
                <div className="tu-small tu-muted">{x.kind}</div>
                <div style={{ fontSize: 12, fontWeight: 550, color: "var(--ink)", lineHeight: 1.3 }}>{x.title}</div>
                <div className="tu-row" style={{ marginTop: 4, gap: 4 }}>
                  <Badge tone={x.status === "Published" ? "ok" : x.status === "Scheduled" ? "accent" : x.status === "In review" ? "warn" : "outline"}>{x.status}</Badge>
                </div>
                {x.c && x.c.status !== "Published" && <select className="tu-select" value={x.c.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setContentStatus(x.c!.id, e.target.value as ContentItem["status"])} aria-label="Status" style={{ marginTop: 4 }}>
                  {["Idea", "Drafting", "In review", "Scheduled", "Published"].map((s) => <option key={s}>{s}</option>)}</select>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="tu-row" style={{ gap: 8, marginTop: 12 }}><Avatar person={db.people.find((p) => p.id === "P02")} size={20} /><span className="tu-small tu-muted">{num(items.length)} items. Owners: {Array.from(new Set(db.content.map((c) => nameOf(db, c.ownerId)))).join(", ")}.</span></div>
    </Page>
  );
}
