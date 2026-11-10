/* Sites & Assets: Sites, Asset Register, Planned Maintenance, Inspections, site detail. */
import { useState } from "react";
import type { Asset, ID, MaintenanceJob, Ticket } from "../../types";
import { useDB, useClock, update, nowIso } from "../../store";
import { closeOverlay, navigate, openNew, openRecord, openTicket, useFilter, toast } from "../../ui";
import { completeJob, reopenJob, closeFinding, findingTask, createTask, log } from "../../actions";
import {
  Avatar, Badge, Btn, Card, Drawer, Empty, Field, Icon, KV, Modal, Page, PersonLink, Progress, Ref, Search, Seg, Select, SortTh, Stat, openRef,
} from "../../kit";
import { ppm, isUnresolved, nameOf, AQC_SITES, labelOf, project as projectOf } from "../../selectors";
import { addDays, ago, at, fmtDate, fmtDateTime, fmtKey, keyOf, mondayOf, num, pct, todayKey } from "../../time";
import { InPortal, SlaCell, TicketPriorityBadge, TicketStatusBadge } from "../helpdesk/common";

const SITE_CODE: Record<string, string> = { "S-LS1": "LS1", "S-LS2": "LS2", "S-H4": "H4", "S-CIH": "CIH", "S-RTH": "RTH", "S-KLD": "KLD" };
const CRIT_ORDER: Record<string, number> = { Critical: 1, High: 2, Medium: 3, Low: 4 };
const STATES: Asset["state"][] = ["In service", "Standby", "Fault", "Commissioning", "Installed"];
const CONDITIONS: Asset["condition"][] = ["Good", "Fair", "Monitor"];
const CRITS: Asset["criticality"][] = ["Critical", "High", "Medium", "Low"];

export default function SitesModule({ tab, id, sub }: { tab: string; id?: string; sub?: string }) {
  if (tab === "detail" && id) return <SiteDetail id={id} sub={sub || "overview"} />;
  if (tab === "assets") return <AssetRegister />;
  if (tab === "maintenance") return <Maintenance />;
  if (tab === "inspections") return <Inspections />;
  return <SitesList />;
}

/* ── helpers ─────────────────────────────────────────────────────── */
const jobState = (j: MaintenanceJob, now: number): "Complete" | "Overdue" | "Due" => j.completedAt ? "Complete" : Date.parse(j.dueAt) < now ? "Overdue" : "Due";
function JobBadge({ j, now }: { j: MaintenanceJob; now: number }) {
  const s = jobState(j, now);
  return <Badge tone={s === "Complete" ? "ok" : s === "Overdue" ? "bad" : "warn"} icon={s === "Complete" ? "ok" : s === "Overdue" ? "alert" : "clock"}>{s}</Badge>;
}
const stateTone = (s: Asset["state"]) => (s === "Fault" ? "bad" : s === "Commissioning" ? "warn" : s === "In service" ? "ok" : "");
function Totals() {
  const db = useDB();
  const all = ppm(db);
  const aqc = ppm(db, AQC_SITES);
  return (
    <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
      <Stat label="Monitored sites" value={db.sites.length} sub="DLR is a project work area, not a site" onClick={() => navigate("/sites/sites")} />
      <Stat label="Assets" value={num(db.assets.length)} sub={db.assets.filter((a) => a.category === "Service").length + " service, " + db.assets.filter((a) => a.category === "Construction").length + " construction"} onClick={() => navigate("/sites/assets")} />
      <Stat label="PPM jobs complete" value={all.done + "/" + all.total} sub={pct(all.ratio) + " of the current cycle"} tone={all.ratio >= 0.9 ? "ok" : "warn"} onClick={() => navigate("/sites/maintenance")} />
      <Stat label="AquaComms PPM cycle" value={pct(aqc.ratio)} sub={aqc.done + " of " + aqc.total + " jobs, both landing stations"} onClick={() => navigate("/sites/maintenance")} />
    </div>
  );
}

/* ── Sites ───────────────────────────────────────────────────────── */
function SitesList() {
  const db = useDB();
  return (
    <Page title="Sites" eyebrow="Sites & Assets" sub="Monitored sites with their assets, planned maintenance and incidents. Uptime figures are seeded service metrics, not live connectivity.">
      <Totals />
      <div className="tu-grid tu-g3">
        {db.sites.map((s) => {
          const r = ppm(db, [s.id]);
          const open = db.tickets.filter((t) => t.siteId === s.id && isUnresolved(t));
          const p1 = open.filter((t) => t.priority === "P1").length;
          const count = db.assets.filter((a) => a.siteId === s.id).length;
          return (
            <Card key={s.id} className="st-sitecard" onClick={() => navigate("/sites/s/" + s.id + "/overview")}
              title={<div><h2>{s.name}</h2><div className="tu-sub">{labelOf(db, "client", s.clientId)} · {s.type}</div></div>}
              right={open.length ? <Badge tone={p1 ? "bad" : "warn"} icon="ticket">{open.length} open</Badge> : <Badge tone="ok" icon="ok">No open tickets</Badge>}>
              <div className="tu-row"><Avatar person={db.people.find((p) => p.id === s.leadId)} size={24} /><span className="tu-grow">{nameOf(db, s.leadId)}</span><span className="tu-small tu-muted">Site lead</span></div>
              <div className="tu-grid tu-g3" style={{ gap: 8 }}>
                <div><div className="tu-small tu-muted">Assets</div><div style={{ fontSize: 18, fontWeight: 600 }}>{count}</div></div>
                <div><div className="tu-small tu-muted">PPM</div><div style={{ fontSize: 18, fontWeight: 600 }}>{r.done}/{r.total}</div></div>
                <div><div className="tu-small tu-muted">{s.indicator.label}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{s.indicator.value}</div></div>
              </div>
              <div><Progress value={r.ratio} tone={r.ratio >= 0.95 ? "ok" : r.ratio >= 0.9 ? undefined : "warn"} label={"PPM completion " + pct(r.ratio)} /><div className="tu-small tu-faint" style={{ marginTop: 4 }}>{pct(r.ratio)} of maintenance jobs complete · {s.indicator.label.toLowerCase()} is a seeded service metric</div></div>
            </Card>
          );
        })}
      </div>
      <div className="tu-note" style={{ marginTop: 14 }}>
        <Icon name="site" size={13} /> The DLR duct route is managed as a project work area, not a monitored site: <Ref type="workArea" id="WA-2063-1" />.
      </div>
    </Page>
  );
}

/* ── shared tables ───────────────────────────────────────────────── */
type ASort = "id" | "site" | "type" | "criticality" | "state" | "condition" | "commissioned";
function AssetTable({ assets, pageSize = 25, showSite = true }: { assets: Asset[]; pageSize?: number; showSite?: boolean }) {
  const db = useDB();
  const [sort, setSort] = useState<{ k: ASort; dir: 1 | -1 }>({ k: "id", dir: 1 });
  const [page, setPage] = useState(0);
  const key = (a: Asset): string | number => sort.k === "site" ? labelOf(db, "site", a.siteId) : sort.k === "type" ? a.type : sort.k === "criticality" ? CRIT_ORDER[a.criticality]
    : sort.k === "state" ? a.state : sort.k === "condition" ? a.condition : sort.k === "commissioned" ? Date.parse(a.commissionedAt) : a.id;
  const rows = assets.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const shown = rows.slice(pg * pageSize, pg * pageSize + pageSize);
  const incidents = (id: ID) => db.tickets.filter((t) => t.assetId === id && isUnresolved(t)).length;
  return (
    <>
      <div className="tu-tablewrap">
        <table className="tu-table">
          <thead><tr>
            <SortTh k="id" label="Asset" sort={sort} setSort={setSort} />
            {showSite && <SortTh k="site" label="Site" sort={sort} setSort={setSort} />}
            <SortTh k="type" label="Type" sort={sort} setSort={setSort} />
            <SortTh k="criticality" label="Criticality" sort={sort} setSort={setSort} />
            <SortTh k="state" label="State" sort={sort} setSort={setSort} />
            <SortTh k="condition" label="Condition" sort={sort} setSort={setSort} />
            <th>Category</th>
            <SortTh k="commissioned" label="Commissioned" sort={sort} setSort={setSort} />
          </tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="click" tabIndex={0} onClick={() => openRecord("asset", a.id)} onKeyDown={(e) => { if (e.key === "Enter") openRecord("asset", a.id); }}>
                <td><div style={{ fontWeight: 500 }}>{a.name}</div><div className="tu-small tu-faint tu-mono">{a.id}</div></td>
                {showSite && <td style={{ whiteSpace: "nowrap" }}>{labelOf(db, "site", a.siteId)}</td>}
                <td>{a.type}</td>
                <td><Badge tone={a.criticality === "Critical" ? "navy" : "outline"}>{a.criticality}</Badge></td>
                <td><Badge tone={stateTone(a.state) as "ok" | "warn" | "bad" | ""} icon={a.state === "Fault" ? "alert" : undefined}>{a.state}</Badge>{incidents(a.id) > 0 && <Badge tone="bad" icon="ticket" title="Open incidents">{incidents(a.id)}</Badge>}</td>
                <td className={a.condition === "Monitor" ? "" : "tu-muted"} style={{ color: a.condition === "Monitor" ? "var(--warn)" : undefined }}>{a.condition}</td>
                <td className="tu-muted">{a.category}</td>
                <td style={{ whiteSpace: "nowrap" }} className="tu-muted">{fmtDate(a.commissionedAt, { year: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty title="No assets match">Clear a filter or search for another tag.</Empty>}
      {rows.length > pageSize && (
        <div className="st-pager" role="navigation" aria-label="Asset pages">
          <span className="tu-grow">Showing {pg * pageSize + 1} to {Math.min(rows.length, pg * pageSize + pageSize)} of {num(rows.length)}</span>
          <Btn size="sm" icon="chevL" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label="Previous page" />
          <span>Page {pg + 1} of {pages}</span>
          <Btn size="sm" icon="chevR" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Next page" />
        </div>
      )}
    </>
  );
}

function JobTable({ jobs, showSite = true }: { jobs: MaintenanceJob[]; showSite?: boolean }) {
  const db = useDB();
  const now = Date.now();
  return (
    <div className="tu-tablewrap">
      <table className="tu-table">
        <thead><tr><th>Job</th>{showSite && <th>Site</th>}<th>Asset</th><th>Due</th><th>Engineer</th><th>Status</th><th>Task</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="click" tabIndex={0} onClick={() => openRecord("maintenance", j.id)} onKeyDown={(e) => { if (e.key === "Enter") openRecord("maintenance", j.id); }}>
              <td><div style={{ fontWeight: 500 }}>{j.title}</div><div className="tu-small tu-faint tu-mono">{j.id}</div></td>
              {showSite && <td style={{ whiteSpace: "nowrap" }}>{labelOf(db, "site", j.siteId)}</td>}
              <td className="tu-muted">{labelOf(db, "asset", j.assetId)}</td>
              <td style={{ whiteSpace: "nowrap", color: jobState(j, now) === "Overdue" ? "var(--bad)" : undefined }}>{j.completedAt ? "Done " + fmtDate(j.completedAt) : fmtDate(j.dueAt)}</td>
              <td style={{ whiteSpace: "nowrap" }}><span className="tu-row" style={{ gap: 6 }}><Avatar person={db.people.find((p) => p.id === j.assigneeId)} size={20} />{nameOf(db, j.assigneeId)}</span></td>
              <td><JobBadge j={j} now={now} /></td>
              <td>{j.taskId ? <Ref type="task" id={j.taskId}>{j.taskId}</Ref> : <span className="tu-faint">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!jobs.length && <Empty title="No maintenance jobs match" />}
    </div>
  );
}

function TicketTable({ tickets }: { tickets: Ticket[] }) {
  const db = useDB();
  const now = useClock();
  return (
    <div className="tu-tablewrap">
      <table className="tu-table">
        <thead><tr><th>ID</th><th>Issue</th><th>Priority</th><th>Status</th><th>Engineer</th><th>Response</th></tr></thead>
        <tbody>{tickets.map((t) => (
          <tr key={t.id} className="click" tabIndex={0} onClick={() => openTicket(t.id)} onKeyDown={(e) => { if (e.key === "Enter") openTicket(t.id); }}>
            <td className="tu-mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{t.id}</td><td>{t.title}</td><td><TicketPriorityBadge p={t.priority} /></td><td><TicketStatusBadge t={t} /></td>
            <td style={{ whiteSpace: "nowrap" }}>{nameOf(db, t.engineerId)}</td><td><SlaCell t={t} now={now} /></td>
          </tr>
        ))}</tbody>
      </table>
      {!tickets.length && <Empty title="No tickets at this site" />}
    </div>
  );
}

/* ── Asset Register ──────────────────────────────────────────────── */
function AssetRegister() {
  const db = useDB();
  const [f, setF, resetF] = useFilter("sites.assets");
  const [form, setForm] = useState<{ asset?: Asset } | null>(null);
  const q = (f.q || "").toLowerCase();
  const types = Array.from(new Set(db.assets.map((a) => a.type))).sort();
  const rows = db.assets.filter((a) => (!f.site || a.siteId === f.site) && (!f.type || a.type === f.type) && (!f.crit || a.criticality === f.crit)
    && (!f.state || a.state === f.state) && (!f.cat || a.category === f.cat)
    && (!q || (a.id + " " + a.name + " " + a.type + " " + a.manufacturer + " " + a.model + " " + a.location).toLowerCase().includes(q)));
  const filtered = !!(f.site || f.type || f.crit || f.state || f.cat || f.q);
  return (
    <Page title="Asset Register" eyebrow="Sites & Assets" sub={num(db.assets.length) + " assets across " + db.sites.length + " monitored sites. Manufacturer models are fictional samples; readings are demo values."}
      actions={<Btn kind="primary" icon="plus" onClick={() => setForm({})}>New asset</Btn>}>
      <div className="tu-toolbar">
        <Search value={f.q || ""} onChange={(v) => setF("q", v)} placeholder="Search tag, type, model" width={240} />
        <Select label="Site" value={f.site || ""} onChange={(v) => setF("site", v)} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />
        <Select label="Type" value={f.type || ""} onChange={(v) => setF("type", v)} options={[["", "All types"], ...types]} />
        <Select label="Criticality" value={f.crit || ""} onChange={(v) => setF("crit", v)} options={[["", "Any criticality"], ...CRITS]} />
        <Select label="State" value={f.state || ""} onChange={(v) => setF("state", v)} options={[["", "Any state"], ...STATES]} />
        <Select label="Category" value={f.cat || ""} onChange={(v) => setF("cat", v)} options={[["", "Service and construction"], ["Service", "Service assets"], ["Construction", "Construction assets"]]} />
        {filtered && <Btn kind="ghost" size="sm" onClick={resetF}>Clear filters</Btn>}
        <span className="tu-grow" /><span className="tu-small tu-muted">{num(rows.length)} of {num(db.assets.length)}</span>
      </div>
      <Card pad={false}><AssetTable key={JSON.stringify(f)} assets={rows} /></Card>
      {form && <AssetForm asset={form.asset} onClose={() => setForm(null)} />}
    </Page>
  );
}

function AssetForm({ asset, onClose, siteId }: { asset?: Asset; onClose: () => void; siteId?: string }) {
  const db = useDB();
  const isNew = !asset;
  const [f, setF] = useState({
    tag: asset ? asset.name.split(" ")[0] : "", siteId: asset?.siteId || siteId || "", type: asset?.type || "UPS", category: asset?.category || "Service" as Asset["category"],
    criticality: asset?.criticality || "High" as Asset["criticality"], state: asset?.state || "In service" as Asset["state"], condition: asset?.condition || "Good" as Asset["condition"],
    manufacturer: asset?.manufacturer || "", model: asset?.model || "", location: asset?.location || "", commissioned: asset ? keyOf(Date.parse(asset.commissionedAt)) : todayKey(),
  });
  const [tried, setTried] = useState(false);
  const types = Array.from(new Set(db.assets.map((a) => a.type))).sort();
  const newId = "AST-" + (SITE_CODE[f.siteId] || "X") + "-" + f.tag.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-");
  const errs = {
    tag: !/^[A-Za-z0-9][A-Za-z0-9-]{1,20}$/.test(f.tag.trim()) ? "Use a short tag such as UPS-05." : isNew && db.assets.some((a) => a.id === newId) ? "That tag already exists at this site." : "",
    siteId: !f.siteId ? "Choose a site." : "",
    manufacturer: !f.manufacturer.trim() ? "Enter a manufacturer, or Generic." : "",
    location: !f.location.trim() ? "Enter a location on site." : "",
  };
  const save = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const rec: Asset = {
      ...(asset || {} as Asset), id: asset ? asset.id : newId, siteId: f.siteId, name: f.tag.trim().toUpperCase() + " " + f.type.toLowerCase(), type: f.type, category: f.category,
      criticality: f.criticality, state: f.state, condition: f.condition, manufacturer: f.manufacturer.trim(), model: f.model.trim() || "Not recorded",
      commissionedAt: at(f.commissioned, 12), location: f.location.trim(),
    };
    update((d) => {
      if (isNew) d.assets.push(rec);
      else { const i = d.assets.findIndex((a) => a.id === rec.id); if (i > -1) d.assets[i] = rec; }
      log(d, { text: (isNew ? "Added asset " : "Edited asset ") + rec.name + " at " + labelOf(d, "site", rec.siteId), sourceType: "asset", sourceId: rec.id, category: "Assets",
        audit: !isNew && asset ? (["state", "condition", "criticality", "location"] as const).filter((k) => asset[k] !== rec[k]).map((k) => ({ field: k, before: String(asset[k]), after: String(rec[k]) })) : undefined });
    });
    toast(isNew ? "Asset added to the register" : "Asset updated");
    onClose();
  };
  return (
    <InPortal onEscape={onClose}>
    <Modal ok="st-asset" title={isNew ? "New asset" : "Edit " + asset!.name} sub={isNew ? "Adds the asset to the register and to its site’s counts." : asset!.id} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>{isNew ? "Add asset" : "Save changes"}</Btn></>}>
      <div className="tu-grid tu-g2" style={{ gap: 12 }}>
        <Field label="Tag" error={tried ? errs.tag : ""} help={isNew && f.tag ? "ID " + newId : undefined}><input className="tu-input" data-autofocus value={f.tag} disabled={!isNew} aria-invalid={tried && !!errs.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} /></Field>
        <Field label="Site" error={tried ? errs.siteId : ""}><select className="tu-select" value={f.siteId} disabled={!isNew} onChange={(e) => setF({ ...f, siteId: e.target.value })}><option value="">Choose a site</option>{db.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Type"><select className="tu-select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{types.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Category"><select className="tu-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Asset["category"] })}><option>Service</option><option>Construction</option></select></Field>
        <Field label="Criticality"><select className="tu-select" value={f.criticality} onChange={(e) => setF({ ...f, criticality: e.target.value as Asset["criticality"] })}>{CRITS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="State"><select className="tu-select" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value as Asset["state"] })}>{STATES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Condition"><select className="tu-select" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as Asset["condition"] })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Commissioned"><input className="tu-input" type="date" value={f.commissioned} onChange={(e) => setF({ ...f, commissioned: e.target.value })} /></Field>
        <Field label="Manufacturer" error={tried ? errs.manufacturer : ""}><input className="tu-input" value={f.manufacturer} aria-invalid={tried && !!errs.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
        <Field label="Model (sample)"><input className="tu-input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
        <Field label="Location" error={tried ? errs.location : ""}><input className="tu-input" value={f.location} aria-invalid={tried && !!errs.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. Plant room" /></Field>
      </div>
    </Modal>
    </InPortal>
  );
}

/* ── Planned Maintenance ─────────────────────────────────────────── */
function Maintenance() {
  const db = useDB();
  const now = Date.now();
  const [f, setF, resetF] = useFilter("sites.ppm");
  const view = (f.view || "list") as "list" | "week";
  const status = f.status || "open";
  const jobs = db.maintenance.filter((j) => (!f.site || j.siteId === f.site)
    && (status === "all" || (status === "open" ? !j.completedAt : status === "complete" ? !!j.completedAt : jobState(j, now) === (status === "overdue" ? "Overdue" : "Due")))
    && (!f.week || mondayOf(keyOf(Date.parse(j.dueAt))) === f.week))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const scope = db.maintenance.filter((j) => !f.site || j.siteId === f.site);
  const weeks = Array.from(new Set(scope.map((j) => mondayOf(keyOf(Date.parse(j.dueAt)))))).sort();
  const all = ppm(db, f.site ? [f.site] : undefined);
  const overdue = scope.filter((j) => jobState(j, now) === "Overdue").length;
  const due = scope.filter((j) => jobState(j, now) === "Due").length;
  const grouped = weeks.filter((w) => jobs.some((j) => mondayOf(keyOf(Date.parse(j.dueAt))) === w));
  return (
    <Page title="Planned Maintenance" eyebrow="Sites & Assets" sub="Current maintenance cycle. Counts are jobs, not assets: one asset can have several scheduled jobs.">
      <div className="tu-grid tu-g4" style={{ marginBottom: 14 }}>
        <Stat label="Jobs in cycle" value={all.total} sub={f.site ? labelOf(db, "site", f.site) : "All six sites"} onClick={() => setF("status", "all")} />
        <Stat label="Complete" value={all.done + " (" + pct(all.ratio) + ")"} tone="ok" onClick={() => setF("status", "complete")} />
        <Stat label="Overdue" value={overdue} tone={overdue ? "bad" : "ok"} sub="Past due, not complete" onClick={() => setF("status", "overdue")} />
        <Stat label="Due" value={due} tone={due ? "warn" : undefined} sub="Upcoming in this cycle" onClick={() => setF("status", "due")} />
      </div>
      <div className="tu-toolbar">
        <Seg label="Status" value={status as "open" | "overdue" | "due" | "complete" | "all"} onChange={(v) => setF("status", v)}
          options={[{ id: "open", label: "Open" }, { id: "overdue", label: "Overdue" }, { id: "due", label: "Due" }, { id: "complete", label: "Complete" }, { id: "all", label: "All" }]} />
        <Select label="Site" value={f.site || ""} onChange={(v) => { setF("site", v); setF("week", ""); }} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />
        <Seg label="View" value={view} onChange={(v) => setF("view", v)} options={[{ id: "list", label: "List" }, { id: "week", label: "By week" }]} />
        {(f.site || f.week || status !== "open") && <Btn kind="ghost" size="sm" onClick={resetF}>Reset</Btn>}
      </div>
      <div className="st-week" aria-label="Weeks in the cycle">
        {weeks.map((w) => {
          const wj = scope.filter((j) => mondayOf(keyOf(Date.parse(j.dueAt))) === w);
          const done = wj.filter((j) => j.completedAt).length;
          const late = wj.filter((j) => jobState(j, now) === "Overdue").length;
          return (
            <button key={w} className={f.week === w ? "on" : ""} aria-pressed={f.week === w} onClick={() => setF("week", f.week === w ? "" : w)}>
              <b style={{ fontSize: 12 }}>w/c {fmtKey(w).split(" ").slice(1).join(" ")}</b>
              <span className="n">{done}/{wj.length} done{late ? ", " + late + " late" : ""}</span>
            </button>
          );
        })}
      </div>
      {view === "list" ? <Card pad={false}><JobTable jobs={jobs} /></Card> : (
        <div className="tu-stack">
          {grouped.map((w) => (
            <Card key={w} title={"Week commencing " + fmtKey(w, { long: true, year: false })} pad={false}>
              <JobTable jobs={jobs.filter((j) => mondayOf(keyOf(Date.parse(j.dueAt))) === w)} />
            </Card>
          ))}
          {!grouped.length && <Card><Empty title="No jobs match" /></Card>}
        </div>
      )}
    </Page>
  );
}

/* ── Inspections ─────────────────────────────────────────────────── */
function Inspections() {
  const db = useDB();
  const [f, setF] = useFilter("sites.insp");
  const show = f.show || "open";
  const list = db.inspections.filter((i) => !f.site || i.siteId === f.site).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const openCount = db.findings.filter((x) => x.status === "Open").length;
  return (
    <Page title="Inspections" eyebrow="Sites & Assets" sub={db.inspections.length + " recent inspections, " + openCount + " open findings. Closing a finding updates its linked task and the audit log; it never closes a helpdesk ticket."}>
      <div className="tu-toolbar">
        <Select label="Site" value={f.site || ""} onChange={(v) => setF("site", v)} options={[["", "All sites"], ...db.sites.map((s) => [s.id, s.name] as [string, string])]} />
        <Seg label="Findings" value={show as "open" | "all"} onChange={(v) => setF("show", v)} options={[{ id: "open", label: "Open findings" }, { id: "all", label: "All findings" }]} />
      </div>
      <div className="tu-stack">
        {list.map((i) => {
          const fs = db.findings.filter((x) => i.findingIds.includes(x.id) && (show === "all" || x.status === "Open"));
          return (
            <Card key={i.id} title={<div><h2>{i.type}</h2><div className="tu-sub">{labelOf(db, "site", i.siteId)} · {fmtDate(i.date)} · {nameOf(db, i.inspectorId)}</div></div>}
              right={<Btn size="sm" onClick={() => openRecord("inspection", i.id)}>Open inspection</Btn>} pad={false}>
              <div className="tu-card-b" style={{ paddingBottom: 6 }}><span className="tu-muted">{i.summary}</span></div>
              {fs.length ? (
                <div className="tu-tablewrap">
                  <table className="tu-table">
                    <thead><tr><th>Finding</th><th>Severity</th><th>Owner</th><th>Due</th><th>Status</th><th>Corrective task</th></tr></thead>
                    <tbody>{fs.map((x) => (
                      <tr key={x.id} className="click" tabIndex={0} onClick={() => openRecord("finding", x.id)} onKeyDown={(e) => { if (e.key === "Enter") openRecord("finding", x.id); }}>
                        <td><div style={{ fontWeight: 500 }}>{x.text}</div><div className="tu-small tu-faint tu-mono">{x.id}</div></td>
                        <td><Badge tone={x.severity === "High" ? "bad" : x.severity === "Medium" ? "warn" : "outline"}>{x.severity}</Badge></td>
                        <td style={{ whiteSpace: "nowrap" }}>{nameOf(db, x.ownerId)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(x.dueAt)}</td>
                        <td><Badge tone={x.status === "Closed" ? "ok" : "warn"} icon={x.status === "Closed" ? "ok" : "clock"}>{x.status}</Badge></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {x.taskId ? <Ref type="task" id={x.taskId}>{labelOf(db, "task", x.taskId)}</Ref>
                            : x.status === "Open" ? <Btn size="xs" icon="plus" onClick={() => findingTask(x.id)}>Create task</Btn> : <span className="tu-faint">None</span>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="tu-card-b tu-small tu-muted" style={{ paddingTop: 0 }}>No {show === "open" ? "open " : ""}findings.</div>}
            </Card>
          );
        })}
        {!list.length && <Card><Empty title="No inspections at this site yet" /></Card>}
      </div>
    </Page>
  );
}

/* ── Site detail ─────────────────────────────────────────────────── */
const SUBS = [{ id: "overview", label: "Overview" }, { id: "assets", label: "Assets" }, { id: "maintenance", label: "Maintenance" }, { id: "tickets", label: "Tickets" },
  { id: "people", label: "People" }, { id: "documents", label: "Documents" }, { id: "activity", label: "Activity" }] as const;
type Sub = typeof SUBS[number]["id"];
function SiteDetail({ id, sub }: { id: string; sub: string }) {
  const db = useDB();
  const now = Date.now();
  const s = db.sites.find((x) => x.id === id);
  if (!s) return <Page title="Site not found" crumbs={[{ label: "Sites & Assets", to: "/sites/sites" }, { label: id }]}><Empty title="This site is not in the demo records" action={<Btn onClick={() => navigate("/sites/sites")}>Back to sites</Btn>} /></Page>;
  const tab = (SUBS.some((x) => x.id === sub) ? sub : "overview") as Sub;
  const assets = db.assets.filter((a) => a.siteId === s.id);
  const jobs = db.maintenance.filter((j) => j.siteId === s.id).sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const tickets = db.tickets.filter((t) => t.siteId === s.id).sort((a, b) => Number(!isUnresolved(a)) - Number(!isUnresolved(b)) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const open = tickets.filter(isUnresolved);
  const r = ppm(db, [s.id]);
  const proj = projectOf(db, s.projectId);
  const insp = db.inspections.filter((i) => i.siteId === s.id);
  const findings = db.findings.filter((x) => insp.some((i) => i.findingIds.includes(x.id)) && x.status === "Open");
  const docs = db.docs.filter((d) => d.siteId === s.id || (d.projectId && d.projectId === s.projectId));
  const peopleRoles = new Map<ID, string[]>();
  const addRole = (pid: ID | null | undefined, role: string) => { if (!pid) return; peopleRoles.set(pid, (peopleRoles.get(pid) || []).concat(peopleRoles.get(pid)?.includes(role) ? [] : [role])); };
  addRole(s.leadId, "Site lead");
  proj?.team.forEach((p) => addRole(p, "Project team"));
  addRole(proj?.sponsorId, "Executive sponsor");
  jobs.filter((j) => !j.completedAt).forEach((j) => addRole(j.assigneeId, "Maintenance"));
  open.forEach((t) => addRole(t.engineerId, "Ticket engineer"));
  const related = (a: { sourceType: string; sourceId: string }) =>
    (a.sourceType === "ticket" && tickets.some((t) => t.id === a.sourceId)) || (a.sourceType === "maintenance" && jobs.some((j) => j.id === a.sourceId))
    || (a.sourceType === "asset" && assets.some((x) => x.id === a.sourceId)) || (a.sourceType === "site" && a.sourceId === s.id)
    || (a.sourceType === "project" && a.sourceId === s.projectId) || (a.sourceType === "finding" && db.findings.some((x) => x.id === a.sourceId && insp.some((i) => i.findingIds.includes(x.id))))
    || (a.sourceType === "task" && db.tasks.some((t) => t.id === a.sourceId && (t.siteId === s.id)));
  const acts = db.activity.filter(related).slice(0, 40);
  const readings = assets.filter((a) => a.reading);
  return (
    <Page title={s.name} eyebrow={labelOf(db, "client", s.clientId) + " · " + s.type}
      crumbs={[{ label: "Sites & Assets", to: "/sites/sites" }, { label: s.name }]}
      sub={s.description}
      actions={<><Btn icon="ticket" onClick={() => openNew("ticket", { siteId: s.id })}>New ticket</Btn>{proj && <Btn kind="navy" onClick={() => openRef("project", proj.id)}>{proj.id} {proj.short}</Btn>}</>}>
      <div className="tu-grid tu-g5" style={{ marginBottom: 14 }}>
        <Stat label="Assets" value={assets.length} sub={assets.filter((a) => a.state === "Fault").length + " in fault"} onClick={() => navigate("/sites/s/" + s.id + "/assets")} />
        <Stat label="PPM complete" value={r.done + "/" + r.total} sub={pct(r.ratio)} tone={r.ratio >= 0.95 ? "ok" : "warn"} onClick={() => navigate("/sites/s/" + s.id + "/maintenance")} />
        <Stat label="Open tickets" value={open.length} tone={open.some((t) => t.priority === "P1") ? "bad" : open.length ? "warn" : "ok"} sub={open.filter((t) => t.priority === "P1").length + " P1"} onClick={() => navigate("/sites/s/" + s.id + "/tickets")} />
        <Stat label={s.indicator.label} value={s.indicator.value} sub="Seeded service metric" />
        <Stat label="Open findings" value={findings.length} tone={findings.some((x) => x.severity === "High") ? "bad" : findings.length ? "warn" : "ok"} onClick={() => navigate("/sites/inspections")} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Seg label="Site sections" value={tab} onChange={(v) => navigate("/sites/s/" + s.id + "/" + v)} options={SUBS.map((x) => ({ id: x.id, label: x.label + (x.id === "tickets" && open.length ? " (" + open.length + ")" : "") }))} />
      </div>
      {tab === "overview" && (
        <div className="tu-split">
          <div className="tu-stack">
            <Card title="Open incidents" right={<Btn size="sm" kind="ghost" onClick={() => navigate("/sites/s/" + s.id + "/tickets")}>All tickets</Btn>} pad={false}>
              {open.length ? <TicketTable tickets={open} /> : <Empty title="No open incidents">The last ticket here was {tickets[0] ? tickets[0].id + ", " + ago(tickets[0].createdAt, now) : "not recorded"}.</Empty>}
            </Card>
            <Card title="Next maintenance" pad={false} right={<Btn size="sm" kind="ghost" onClick={() => navigate("/sites/s/" + s.id + "/maintenance")}>All jobs</Btn>}>
              <JobTable jobs={jobs.filter((j) => !j.completedAt).slice(0, 6)} showSite={false} />
            </Card>
          </div>
          <div className="tu-stack">
            <Card title="Site">
              <KV items={[["Client", <Ref type="client" id={s.clientId} />], ["Lead", <PersonLink id={s.leadId} />], ["Project", proj ? <Ref type="project" id={proj.id} /> : "None"], ["Location", s.location]]} />
            </Card>
            <Card title="Demo readings" sub="Seeded values with timestamps, not live telemetry">
              {readings.length ? readings.map((a) => (
                <button key={a.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openRecord("asset", a.id)}>
                  <span className="tu-grow"><b>{a.name}</b><div className="tu-small tu-muted">{a.reading!.label}: {a.reading!.value}</div></span>
                  <span className="tu-small tu-faint">{ago(a.reading!.at, now)}</span>
                </button>
              )) : <div className="tu-small tu-muted">No readings recorded for this site.</div>}
            </Card>
            {findings.length > 0 && (
              <Card title="Open inspection findings">
                {findings.map((x) => <button key={x.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openRecord("finding", x.id)}><Badge tone={x.severity === "High" ? "bad" : "warn"}>{x.severity}</Badge><span className="tu-grow">{x.text}</span></button>)}
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === "assets" && <Card pad={false} title={assets.length + " assets"} right={<SiteAssetAdd siteId={s.id} />}><AssetTable assets={assets} showSite={false} /></Card>}
      {tab === "maintenance" && <Card pad={false} title={r.done + " of " + r.total + " jobs complete"} sub="Current cycle"><JobTable jobs={jobs} showSite={false} /></Card>}
      {tab === "tickets" && <Card pad={false} title={tickets.length + " tickets"} sub={open.length + " unresolved"} right={<Btn size="sm" icon="plus" onClick={() => openNew("ticket", { siteId: s.id })}>New ticket</Btn>}><TicketTable tickets={tickets} /></Card>}
      {tab === "people" && (
        <Card pad={false} title="Assigned people">
          {Array.from(peopleRoles.entries()).map(([pid, roles]) => {
            const p = db.people.find((x) => x.id === pid)!;
            return (
              <div key={pid} className="tu-li" style={{ alignItems: "center" }}>
                <Avatar person={p} size={30} />
                <div className="tu-grow"><PersonLink id={pid} showAvatar={false} /><div className="tu-small tu-muted">{p.role} · {p.location}</div></div>
                <div className="tu-row tu-wrap" style={{ gap: 4 }}>{roles.map((x) => <Badge key={x} tone={x === "Site lead" ? "navy" : "outline"}>{x}</Badge>)}</div>
                <Badge tone={p.status === "On leave" ? "warn" : p.status === "On call" ? "accent" : ""}>{p.status}</Badge>
              </div>
            );
          })}
        </Card>
      )}
      {tab === "documents" && (
        <Card pad={false} title={docs.length + " documents"} sub="Linked to this site or its project">
          {docs.map((d) => (
            <button key={d.id} className="tu-rowbtn" onClick={() => openRef("doc", d.id)}>
              <Icon name="doc" size={15} /><span className="tu-grow"><b>{d.title}</b><div className="tu-small tu-muted">{d.type} · {d.version} · {nameOf(db, d.ownerId)} · {fmtDate(d.updatedAt)}</div></span>
              <Badge tone={d.status === "Approved" || d.status === "Issued" ? "ok" : d.status === "In review" ? "warn" : ""}>{d.status}</Badge>
            </button>
          ))}
          {!docs.length && <Empty title="No documents linked" />}
        </Card>
      )}
      {tab === "activity" && (
        <Card pad={false} title="Activity" sub="Tickets, maintenance, assets and project events for this site">
          {acts.map((a) => (
            <div key={a.id} className="tu-li click" role="button" tabIndex={0} onClick={() => openRef(a.sourceType, a.sourceId)} onKeyDown={(e) => { if (e.key === "Enter") openRef(a.sourceType, a.sourceId); }}>
              <span className="tu-dot" style={{ marginTop: 6, background: a.actorType === "agent" ? "var(--accent-fill)" : a.actorType === "system" ? "var(--neutral)" : "var(--ok)" }} />
              <div className="tu-grow"><div><b>{a.actor}</b> {a.text}</div><div className="tu-small tu-faint">{ago(a.at, now)} · {a.category}</div></div>
            </div>
          ))}
          {!acts.length && <Empty title="No activity recorded for this site yet" />}
        </Card>
      )}
    </Page>
  );
}
function SiteAssetAdd({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  return <><Btn size="sm" icon="plus" onClick={() => setOpen(true)}>New asset</Btn>{open && <AssetForm siteId={siteId} onClose={() => setOpen(false)} />}</>;
}

/* ── record drawers: asset, maintenance, inspection, finding ─────── */
export function SiteRecordDrawer({ ok, type, id }: { ok: string; type: string; id: string }) {
  if (type === "asset") return <AssetDrawer ok={ok} id={id} />;
  if (type === "maintenance") return <JobDrawer ok={ok} id={id} />;
  if (type === "inspection") return <InspectionDrawer ok={ok} id={id} />;
  if (type === "finding") return <FindingDrawer ok={ok} id={id} />;
  return null;
}
const NotFound = ({ ok, what }: { ok: string; what: string }) => <Drawer ok={ok} title={what + " not found"} onClose={() => closeOverlay(ok)}><p className="tu-muted">It is not in the demo records, possibly after a reset.</p></Drawer>;

function AssetDrawer({ ok, id }: { ok: string; id: string }) {
  const db = useDB();
  const now = useClock();
  const [edit, setEdit] = useState(false);
  const a = db.assets.find((x) => x.id === id);
  if (!a) return <NotFound ok={ok} what="Asset" />;
  const jobs = db.maintenance.filter((j) => j.assetId === a.id).sort((x, y) => Date.parse(y.dueAt) - Date.parse(x.dueAt));
  const incidents = db.tickets.filter((t) => t.assetId === a.id);
  const site = db.sites.find((s) => s.id === a.siteId);
  const docs = db.docs.filter((d) => d.siteId === a.siteId || (site && d.projectId === site.projectId && /RAMS|Test pack|Service review|Drawing/.test(d.type))).slice(0, 6);
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow={a.id + " · " + a.category + " asset"}
      badges={<><Badge tone={stateTone(a.state) as "ok" | "warn" | "bad" | ""} icon={a.state === "Fault" ? "alert" : undefined}>{a.state}</Badge><Badge tone={a.criticality === "Critical" ? "navy" : "outline"}>{a.criticality}</Badge></>}
      title={a.name}
      footer={<><Btn icon="ticket" onClick={() => openNew("ticket", { siteId: a.siteId, assetId: a.id })}>Raise ticket</Btn><span className="tu-grow" /><Btn icon="edit" onClick={() => setEdit(true)}>Edit asset</Btn></>}>
      <KV items={[["Site", <Ref type="site" id={a.siteId} />], ["Location", a.location], ["Type", a.type], ["Condition", a.condition],
        ["Manufacturer", a.manufacturer], ["Model (sample)", a.model], ["Commissioned", fmtDate(a.commissionedAt, { year: true })], ["Category", a.category]]} />
      {a.reading && (
        <div className="tu-section"><div className="tu-eyebrow">Latest demo reading</div>
          <div className="tu-note">{a.reading.label}: <b>{a.reading.value}</b><div className="tu-small tu-faint" style={{ marginTop: 4 }}>Recorded {fmtDateTime(a.reading.at)} ({ago(a.reading.at, now)}). Demo reading, not live telemetry.</div></div></div>
      )}
      <div className="tu-section">
        <div className="tu-eyebrow">Incidents · {incidents.length}</div>
        {incidents.length ? incidents.map((t) => (
          <button key={t.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openTicket(t.id)}>
            <TicketPriorityBadge p={t.priority} /><span className="tu-grow"><b>{t.id}</b> {t.title}</span><TicketStatusBadge t={t} />
          </button>
        )) : <div className="tu-small tu-muted">No incidents recorded against this asset.</div>}
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Maintenance schedule · {jobs.length}</div>
        {jobs.length ? jobs.map((j) => (
          <button key={j.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openRecord("maintenance", j.id)}>
            <span className="tu-grow"><b>{j.title}</b><div className="tu-small tu-muted">{j.completedAt ? "Completed " + fmtDate(j.completedAt) : "Due " + fmtDate(j.dueAt)} · {nameOf(db, j.assigneeId)}</div></span><JobBadge j={j} now={now} />
          </button>
        )) : <div className="tu-small tu-muted">No jobs in the current cycle for this asset.</div>}
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Documents</div>
        <div className="tu-row tu-wrap" style={{ gap: 8 }}>{docs.length ? docs.map((d) => <Btn key={d.id} size="sm" icon="doc" onClick={() => openRef("doc", d.id)}>{d.title}</Btn>) : <span className="tu-small tu-muted">No documents linked.</span>}</div>
      </div>
      {edit && <AssetForm asset={a} onClose={() => setEdit(false)} />}
    </Drawer>
  );
}

function JobDrawer({ ok, id }: { ok: string; id: string }) {
  const db = useDB();
  const now = Date.now();
  const j = db.maintenance.find((x) => x.id === id);
  const [evidence, setEvidence] = useState("");
  const [err, setErr] = useState("");
  const [confirmReopen, setConfirmReopen] = useState(false);
  if (!j) return <NotFound ok={ok} what="Maintenance job" />;
  const site = db.sites.find((s) => s.id === j.siteId)!;
  const ticks = j.checklist.filter((c) => c.done).length;
  const toggle = (cid: string) => update((d) => { const x = d.maintenance.find((y) => y.id === j.id)!; const c = x.checklist.find((y) => y.id === cid)!; c.done = !c.done; });
  const complete = () => {
    if (ticks < j.checklist.length) { setErr("Tick every checklist item before completing the job."); return; }
    if (evidence.trim().length < 6) { setErr("Record the evidence: readings, photos or a short note."); return; }
    setErr(""); completeJob(j.id, evidence.trim()); setEvidence("");
  };
  const makeTask = () => {
    const tid = createTask({ title: "PPM: " + j.title, projectId: site.projectId, ownerId: j.assigneeId, priority: jobState(j, now) === "Overdue" ? "High" : "Normal", tag: "PPM", dueAt: j.dueAt, siteId: j.siteId, maintenanceId: j.id });
    update((d) => { const x = d.maintenance.find((y) => y.id === j.id)!; x.taskId = tid; });
  };
  const state = jobState(j, now);
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow={j.id + " · Planned maintenance"} badges={<JobBadge j={j} now={now} />} title={j.title}
      footer={j.completedAt ? (
        confirmReopen ? (
          <><span className="tu-grow" style={{ fontSize: 13 }}>Reopen this job? Completion and evidence are cleared and site ratios update.</span><Btn onClick={() => setConfirmReopen(false)}>Back</Btn><Btn kind="danger" onClick={() => { reopenJob(j.id); setConfirmReopen(false); }}>Reopen job</Btn></>
        ) : <><span className="tu-grow tu-small tu-muted">Completed {fmtDateTime(j.completedAt)}</span><Btn onClick={() => setConfirmReopen(true)}>Reopen</Btn></>
      ) : (
        <><span className="tu-grow tu-small tu-muted">{ticks} of {j.checklist.length} checklist items done</span><Btn kind="primary" icon="check" onClick={complete}>Complete job</Btn></>
      )}>
      <KV items={[["Site", <Ref type="site" id={j.siteId} />], ["Asset", <Ref type="asset" id={j.assetId} />], ["Due", fmtDate(j.dueAt) + (state === "Overdue" ? " (overdue)" : "")], ["Engineer", <PersonLink id={j.assigneeId} />], ["Cycle", j.cycle], ["Task", j.taskId ? <Ref type="task" id={j.taskId} /> : "None"]]} />
      <div className="tu-section">
        <div className="tu-eyebrow">Checklist</div>
        <div className="tu-card" style={{ borderRadius: 12 }}>
          {j.checklist.map((c) => (
            <div key={c.id} className="tu-li" style={{ padding: "8px 12px" }}>
              <label className="tu-check tu-grow"><input type="checkbox" checked={c.done} disabled={!!j.completedAt} onChange={() => toggle(c.id)} /><span style={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? "var(--dim)" : undefined }}>{c.text}</span></label>
            </div>
          ))}
        </div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Evidence</div>
        {j.completedAt ? <div className="tu-note accent">{j.evidence}</div> : (
          <Field label="Evidence and readings" error={err} help="Required to complete. Stored with the job and the audit log.">
            <textarea className="tu-textarea" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Impedance within limits, photos 1 to 4 uploaded" />
          </Field>
        )}
      </div>
      {!j.taskId && !j.completedAt && (
        <div className="tu-section tu-row"><span className="tu-small tu-muted tu-grow">Need it on someone’s task list? This links one task to the job; it will not create duplicates.</span><Btn size="sm" icon="plus" onClick={makeTask}>Create linked task</Btn></div>
      )}
    </Drawer>
  );
}

function InspectionDrawer({ ok, id }: { ok: string; id: string }) {
  const db = useDB();
  const i = db.inspections.find((x) => x.id === id);
  if (!i) return <NotFound ok={ok} what="Inspection" />;
  const fs = db.findings.filter((x) => i.findingIds.includes(x.id));
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow={i.id + " · Inspection"} badges={<Badge tone={fs.some((x) => x.status === "Open") ? "warn" : "ok"}>{fs.filter((x) => x.status === "Open").length} open findings</Badge>} title={i.type}>
      <KV items={[["Site", <Ref type="site" id={i.siteId} />], ["Date", fmtDate(i.date)], ["Inspector", <PersonLink id={i.inspectorId} />], ["Findings", String(fs.length)]]} />
      <div className="tu-section"><div className="tu-eyebrow">Summary</div><div className="tu-note">{i.summary}</div></div>
      <div className="tu-section">
        <div className="tu-eyebrow">Findings</div>
        {fs.map((x) => (
          <button key={x.id} className="tu-rowbtn" style={{ padding: "9px 0" }} onClick={() => openRecord("finding", x.id)}>
            <Badge tone={x.severity === "High" ? "bad" : x.severity === "Medium" ? "warn" : "outline"}>{x.severity}</Badge>
            <span className="tu-grow"><b>{x.text}</b><div className="tu-small tu-muted">{nameOf(db, x.ownerId)} · due {fmtDate(x.dueAt)}</div></span>
            <Badge tone={x.status === "Closed" ? "ok" : "warn"}>{x.status}</Badge>
          </button>
        ))}
      </div>
    </Drawer>
  );
}

function FindingDrawer({ ok, id }: { ok: string; id: string }) {
  const db = useDB();
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const x = db.findings.find((f) => f.id === id);
  if (!x) return <NotFound ok={ok} what="Finding" />;
  const ins = db.inspections.find((i) => i.id === x.inspectionId);
  const t = db.tasks.find((y) => y.id === x.taskId);
  const close = () => { if (note.trim().length < 4) { setErr("Add a short closing note: what was done."); return; } setErr(""); closeFinding(x.id, note.trim()); setNote(""); };
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow={x.id + " · Inspection finding"}
      badges={<><Badge tone={x.severity === "High" ? "bad" : x.severity === "Medium" ? "warn" : "outline"}>{x.severity}</Badge><Badge tone={x.status === "Closed" ? "ok" : "warn"} icon={x.status === "Closed" ? "ok" : "clock"}>{x.status}</Badge></>}
      title={x.text}
      footer={x.status === "Open" ? <><span className="tu-grow tu-small tu-muted">Closing updates the linked task and the audit log. Helpdesk tickets are not closed.</span><Btn kind="primary" icon="check" onClick={close}>Close finding</Btn></> : <span className="tu-small tu-muted">Closed {fmtDateTime(x.closedAt)}</span>}>
      <KV items={[["Inspection", ins ? <Ref type="inspection" id={ins.id}>{ins.type}</Ref> : "Not found"], ["Site", ins ? <Ref type="site" id={ins.siteId} /> : ""], ["Owner", <PersonLink id={x.ownerId} />], ["Due", fmtDate(x.dueAt)]]} />
      <div className="tu-section">
        <div className="tu-eyebrow">Photo record</div>
        <div className="st-photo" role="img" aria-label={"Photo placeholder: " + x.photo}>
          <span className="ph"><Icon name="asset" size={22} /></span>
          <div><div className="tu-small tu-faint">Site photo (demo placeholder description)</div><div style={{ marginTop: 4 }}>{x.photo}</div></div>
        </div>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Corrective action</div>
        {t ? <div className="tu-row"><Icon name="check" size={13} /><Ref type="task" id={t.id} /><Badge>{t.status}</Badge><span className="tu-small tu-muted">{nameOf(db, t.ownerId)}</span></div>
          : x.status === "Open" ? <Btn size="sm" icon="plus" onClick={() => findingTask(x.id)}>Create corrective task</Btn> : <span className="tu-small tu-muted">No task linked.</span>}
      </div>
      {x.status === "Open" && (
        <div className="tu-section"><Field label="Closing note" error={err}><textarea className="tu-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done and how it was checked" /></Field></div>
      )}
    </Drawer>
  );
}


