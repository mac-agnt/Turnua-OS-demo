/* Records tabs beyond the Ontology: Documents, Customers & Contacts, Register, Suppliers.
   Rendered under the original Records hero; its ask box filters these views (the `query` prop). */
import { useEffect, useMemo, useState } from "react";
import type { DB } from "../../types";
import { useDB } from "../../store";
import { navigate } from "../../ui";
import { Card, Btn, Badge, Avatar, Icon, Empty, Search, Select, SortTh, openRef, Ref } from "../../kit";
import { isOpen, isUnresolved, labelOf, nameOf, person, project } from "../../selectors";
import { daysBetween, eur, fmtDate, keyOf } from "../../time";
import "../dashboard/dashboard.css";

const rowKeys = (fn: () => void) => ({ onClick: fn, tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const hit = (q: string, ...parts: (string | undefined | null)[]) => !q || parts.join(" ").toLowerCase().includes(q.toLowerCase().trim());

export default function RecordsModule({ tab, query }: { tab: string; query: string }) {
  const db = useDB();
  const q = (query || "").trim();
  let body;
  switch (tab) {
    case "documents": body = <Documents db={db} q={q} />; break;
    case "contacts": body = <Contacts db={db} q={q} />; break;
    case "suppliers": body = <Suppliers db={db} q={q} />; break;
    default: body = <Register db={db} q={q} />;
  }
  return <div className="tu tu-page" style={{ paddingTop: 0 }}>{body}</div>;
}

/* ── Documents ───────────────────────────────────────────────────── */
type DocSort = "title" | "type" | "updated" | "review" | "status";
function Documents({ db, q }: { db: DB; q: string }) {
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");
  const [proj, setProj] = useState("All");
  const [sort, setSort] = useState<{ k: DocSort; dir: 1 | -1 }>({ k: "updated", dir: -1 });
  const types = Array.from(new Set(db.docs.map((d) => d.type))).sort();
  const statuses = Array.from(new Set(db.docs.map((d) => d.status))).sort();
  const linked = (id: string) => {
    const d = db.docs.find((x) => x.id === id)!;
    return d.projectId ? labelOf(db, "project", d.projectId) : d.siteId ? labelOf(db, "site", d.siteId) : d.links[0] ? labelOf(db, d.links[0].type, d.links[0].id) : "People records";
  };
  const rows = db.docs.filter((d) => (type === "All" || d.type === type) && (status === "All" || d.status === status) && (proj === "All" || d.projectId === proj)
    && hit(q, d.id, d.title, d.type, d.status, nameOf(db, d.ownerId), linked(d.id), d.body.join(" ")));
  const val = (d: typeof rows[number]): string | number => sort.k === "title" ? d.title : sort.k === "type" ? d.type : sort.k === "status" ? d.status : sort.k === "review" ? (d.reviewAt ? Date.parse(d.reviewAt) : 9e15) : Date.parse(d.updatedAt);
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  return (
    <Card title="Documents" sub={rows.length + " of " + db.docs.length + " documents" + (q ? " matching “" + q + "”" : "")} pad={false}
      right={<div className="tu-row tu-wrap" style={{ gap: 6 }}>
        <Select label="Type" value={type} onChange={setType} options={["All", ...types].map((t) => [t, t === "All" ? "All types" : t] as [string, string])} />
        <Select label="Status" value={status} onChange={setStatus} options={["All", ...statuses].map((t) => [t, t === "All" ? "All statuses" : t] as [string, string])} />
        <Select label="Project" value={proj} onChange={setProj} options={[["All", "All projects"] as [string, string], ...db.projects.map((p) => [p.id, p.short] as [string, string])]} />
      </div>}>
      <div className="tu-tablewrap">
        <table className="tu-table">
          <thead><tr>
            <SortTh k="title" label="Document" sort={sort} setSort={setSort} />
            <SortTh k="type" label="Type" sort={sort} setSort={setSort} />
            <th>Version</th><th>Owner</th><th>Linked to</th>
            <SortTh k="review" label="Review" sort={sort} setSort={setSort} />
            <SortTh k="updated" label="Updated" sort={sort} setSort={setSort} />
            <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
          </tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="click" {...rowKeys(() => openRef("doc", d.id))} aria-label={"Open " + d.title}>
                <td style={{ minWidth: 260 }}><div className="tu-row" style={{ gap: 8 }}><Icon name="doc" size={14} style={{ color: "var(--dim)" }} /><div><div style={{ fontWeight: 500 }}>{d.title}</div><div className="tu-small tu-faint">{d.id}</div></div></div></td>
                <td className="tu-small">{d.type}</td>
                <td className="tu-small">{d.version}</td>
                <td><span className="tu-row" style={{ gap: 6 }}><Avatar person={person(db, d.ownerId)} size={20} /><span className="tu-small">{nameOf(db, d.ownerId)}</span></span></td>
                <td className="tu-small" style={{ minWidth: 150 }}>{linked(d.id)}</td>
                <td className="tu-small">{d.reviewAt ? fmtDate(d.reviewAt) : <span className="tu-faint">Not set</span>}</td>
                <td className="tu-small">{fmtDate(d.updatedAt)}</td>
                <td><Badge tone={d.status === "Approved" || d.status === "Issued" ? "ok" : d.status === "In review" ? "warn" : ""}>{d.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No documents match" action={<Btn size="sm" onClick={() => { setType("All"); setStatus("All"); setProj("All"); }}>Clear filters</Btn>}>Filters and the search above both apply. Try fewer words.</Empty>}
      </div>
    </Card>
  );
}

/* ── Customers & Contacts ────────────────────────────────────────── */
function Contacts({ db, q }: { db: DB; q: string }) {
  const clients = db.clients.filter((c) => {
    const projs = db.projects.filter((p) => p.clientId === c.id);
    const cts = db.contacts.filter((x) => x.clientId === c.id);
    return hit(q, c.name, c.kind, c.sector, c.summary, projs.map((p) => p.name + " " + p.id).join(" "), cts.map((x) => x.name + " " + x.role).join(" "));
  });
  return (
    <>
      <div className="tu-note" style={{ marginBottom: 14 }}>Contacts below are <b>fictional demo contacts</b> with placeholder addresses. No real customer contact details are stored in this workspace.</div>
      <div className="rc-cards">
        {clients.map((c) => {
          const projs = db.projects.filter((p) => p.clientId === c.id);
          const sites = db.sites.filter((s) => s.clientId === c.id);
          const tickets = db.tickets.filter((t) => t.clientId === c.id);
          const docs = db.docs.filter((d) => projs.some((p) => p.id === d.projectId));
          const cts = db.contacts.filter((x) => x.clientId === c.id);
          return (
            <Card key={c.id} title={<div><h2 style={{ margin: 0, fontSize: 15 }}>{c.name}</h2><div className="tu-row tu-wrap" style={{ gap: 6, marginTop: 6 }}><Badge tone={c.kind === "Internal" ? "navy" : "accent"}>{c.kind}</Badge><Badge tone="outline">{c.sector}</Badge>{c.confidential && <Badge tone="warn" icon="shield">Identity withheld</Badge>}</div></div>}
              right={<Btn size="sm" onClick={() => openRef("client", c.id)}>Open</Btn>}>
              <div className="tu-small tu-muted">{c.summary}</div>
              <div className="rc-mini">
                <span><b>{projs.length}</b>project{projs.length === 1 ? "" : "s"}</span>
                <span><b>{sites.length}</b>site{sites.length === 1 ? "" : "s"}</span>
                <span><b>{tickets.filter(isUnresolved).length}</b>open of {tickets.length} tickets</span>
                <span><b>{docs.length}</b>documents</span>
              </div>
              <div className="tu-row tu-wrap" style={{ gap: 6 }}>
                {projs.map((p) => <Btn key={p.id} size="xs" icon="flag" onClick={() => openRef("project", p.id)}>{p.id} {p.short}</Btn>)}
                {sites.map((s) => <Btn key={s.id} size="xs" icon="site" onClick={() => openRef("site", s.id)}>{s.name}</Btn>)}
              </div>
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)" }}>
                {cts.map((x) => (
                  <button key={x.id} className="tu-rowbtn" style={{ padding: "8px 0" }} onClick={() => openRef("contact", x.id)}>
                    <Icon name="user" size={14} style={{ color: "var(--dim)" }} />
                    <span className="tu-grow" style={{ minWidth: 0 }}><span style={{ fontWeight: 500 }}>{x.name}</span><span className="tu-small tu-muted" style={{ display: "block" }}>{x.role}</span><span className="tu-small tu-faint tu-ellipsis" style={{ display: "block" }}>{x.email} · {x.phone}</span></span>
                    <Icon name="chevR" size={13} style={{ color: "var(--faint)" }} />
                  </button>
                ))}
                {!cts.length && <div className="tu-small tu-muted" style={{ paddingTop: 8 }}>No demo contacts recorded.</div>}
              </div>
            </Card>
          );
        })}
      </div>
      {!clients.length && <Card><Empty title={"No accounts match “" + q + "”"}>The search covers account names, types, projects and contact roles.</Empty></Card>}
    </>
  );
}

/* ── Register ────────────────────────────────────────────────────── */
interface RegRow { type: string; label: string; id: string; name: string; rel: string; status: string; tone: "ok" | "warn" | "bad" | "" }
const TYPE_LABEL: Record<string, string> = { project: "Projects", person: "People", site: "Sites", workArea: "Work areas", asset: "Assets", task: "Tasks", permit: "Permits", ticket: "Tickets", change: "Change requests", approval: "Approvals", po: "Purchase orders", doc: "Documents" };
function registerRows(db: DB): RegRow[] {
  const now = Date.now();
  const r: RegRow[] = [];
  const add = (type: string, id: string, name: string, rel: string, status: string, tone: RegRow["tone"] = "") => r.push({ type, label: TYPE_LABEL[type], id, name, rel, status, tone });
  db.projects.forEach((p) => add("project", p.id, p.name, labelOf(db, "client", p.clientId) + " · PM " + nameOf(db, p.pmId), p.health, p.health === "On track" ? "ok" : p.health === "At risk" ? "warn" : "bad"));
  db.people.forEach((p) => add("person", p.id, p.name, p.role + " · " + (db.teams.find((t) => t.id === p.teamId)?.name || ""), p.status));
  db.sites.forEach((s) => add("site", s.id, s.name, labelOf(db, "client", s.clientId) + " · lead " + nameOf(db, s.leadId), s.indicator.label + " " + s.indicator.value));
  db.workAreas.forEach((w) => { const open = db.tasks.filter((t) => t.workAreaId === w.id && isOpen(t)).length; add("workArea", w.id, w.name, labelOf(db, "project", w.projectId), open + " open tasks"); });
  db.assets.forEach((a) => add("asset", a.id, a.name, labelOf(db, "site", a.siteId) + " · " + a.type + " · " + a.category, a.state, a.state === "Fault" ? "bad" : a.condition === "Monitor" ? "warn" : ""));
  db.tasks.forEach((t) => add("task", t.id, t.title, labelOf(db, "project", t.projectId) + " · " + nameOf(db, t.ownerId), t.status, t.status === "Done" ? "ok" : isOpen(t) && Date.parse(t.dueAt) < now ? "bad" : ""));
  db.permits.forEach((p) => add("permit", p.id, p.name, p.authority, p.status, p.status === "Pending decision" ? "warn" : p.status === "Refused" ? "bad" : "ok"));
  db.tickets.forEach((t) => add("ticket", t.id, t.title, t.priority + " · " + labelOf(db, "site", t.siteId) + " · " + nameOf(db, t.engineerId), t.status, t.status === "Resolved" ? "ok" : t.priority === "P1" ? "bad" : t.priority === "P2" ? "warn" : ""));
  db.changes.forEach((c) => add("change", c.id, c.title, labelOf(db, "project", c.projectId) + " · " + (c.amount ? eur(c.amount) : "unpriced"), c.status, c.status === "Approved" ? "ok" : c.status === "Rejected" ? "bad" : c.status === "Awaiting approval" ? "warn" : ""));
  db.approvals.forEach((a) => add("approval", a.id, a.title, "Requested by " + nameOf(db, a.requestedById) + (a.amount ? " · " + eur(a.amount) : ""), a.status, a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "warn"));
  db.purchaseOrders.forEach((p) => add("po", p.id, p.description, labelOf(db, "supplier", p.supplierId) + " · " + labelOf(db, "project", p.projectId), p.status, p.status === "Late" ? "bad" : p.status === "Delivered" ? "ok" : ""));
  db.docs.forEach((d) => add("doc", d.id, d.title, d.type + " · " + nameOf(db, d.ownerId), d.status, d.status === "In review" ? "warn" : d.status === "Approved" || d.status === "Issued" ? "ok" : ""));
  return r;
}
const PAGE = 25;
function Register({ db, q }: { db: DB; q: string }) {
  const [type, setType] = useState("all");
  const [local, setLocal] = useState("");
  const [page, setPage] = useState(0);
  const all = useMemo(() => registerRows(db), [db]);
  const text = (q + " " + local).trim();
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = all.filter((r) => !words.length || words.every((w) => (r.id + " " + r.name + " " + r.rel + " " + r.status + " " + r.label).toLowerCase().includes(w)));
  const rows = matching.filter((r) => type === "all" || r.type === type);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  useEffect(() => { setPage(0); }, [type, q, local]);
  const cur = Math.min(page, pages - 1);
  const counts = Object.keys(TYPE_LABEL).map((t) => ({ t, n: matching.filter((r) => r.type === t).length, total: all.filter((r) => r.type === t).length }));
  return (
    <Card title="Register" sub={rows.length + " records" + (text ? " matching “" + text + "”" : "") + " · " + all.length + " in total"} pad={false}
      right={<Search value={local} onChange={setLocal} placeholder="Search the register" width={240} />}>
      <div className="tu-row tu-wrap" style={{ gap: 6, padding: "12px 18px", borderBottom: "1px solid var(--border)" }} role="group" aria-label="Filter by record type">
        <button className={"tu-chip" + (type === "all" ? " on" : "")} aria-pressed={type === "all"} onClick={() => setType("all")}>All · {matching.length}</button>
        {counts.map(({ t, n, total }) => (
          <button key={t} className={"tu-chip" + (type === t ? " on" : "")} aria-pressed={type === t} onClick={() => setType(t)} title={total + " " + TYPE_LABEL[t].toLowerCase() + " in total"}>{TYPE_LABEL[t]} · {n}</button>
        ))}
      </div>
      <div className="tu-tablewrap">
        <table className="tu-table">
          <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Relationship and owner</th><th>Status</th></tr></thead>
          <tbody>
            {rows.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => (
              <tr key={r.type + r.id} className="click" {...rowKeys(() => openRef(r.type, r.id))} aria-label={"Open " + r.name}>
                <td className="tu-small" style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{r.id}</td>
                <td style={{ minWidth: 220 }}>{r.name}</td>
                <td className="tu-small tu-muted" style={{ whiteSpace: "nowrap" }}>{r.label.replace(/s$/, "").replace(/People/, "Person")}</td>
                <td className="tu-small tu-muted" style={{ minWidth: 220 }}>{r.rel}</td>
                <td><Badge tone={r.tone}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No records match" action={<Btn size="sm" onClick={() => { setType("all"); setLocal(""); }}>Clear filters</Btn>}>The Records search box and this search both apply.</Empty>}
      </div>
      {rows.length > PAGE && (
        <div className="rc-pager">
          <span>Showing {cur * PAGE + 1} to {Math.min(rows.length, cur * PAGE + PAGE)} of {rows.length}</span>
          <Btn size="xs" icon="chevL" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)} />
          <span>Page {cur + 1} of {pages}</span>
          <Btn size="xs" icon="chevR" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} />
        </div>
      )}
    </Card>
  );
}

/* ── Suppliers ───────────────────────────────────────────────────── */
function Suppliers({ db, q }: { db: DB; q: string }) {
  const [open, setOpen] = useState<string | null>("PO-5521");
  const list = db.suppliers.filter((s) => {
    const pos = db.purchaseOrders.filter((p) => p.supplierId === s.id);
    const c = db.contacts.find((x) => x.id === s.contactId);
    return hit(q, s.name, s.category, s.summary, s.rating, c?.name, pos.map((p) => p.id + " " + p.description + " " + p.status).join(" "));
  });
  return (
    <>
      <div className="tu-note" style={{ marginBottom: 14 }}>These are <b>fictional demo suppliers</b>. OEM names in the asset register (Siemens, Vertiv, Delta, APC) describe equipment manufacturers only and do not imply a current purchase contract.</div>
      <div className="tu-stack">
        {list.map((s) => {
          const c = db.contacts.find((x) => x.id === s.contactId);
          const pos = db.purchaseOrders.filter((p) => p.supplierId === s.id).sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
          return (
            <Card key={s.id} pad={false}
              title={<div><h2 style={{ margin: 0, fontSize: 15 }}>{s.name}</h2><div className="tu-small tu-muted" style={{ marginTop: 3 }}>{s.category}</div></div>}
              right={<div className="tu-row" style={{ gap: 8 }}><Badge tone={s.rating === "Good" ? "ok" : "warn"} icon={s.rating === "Good" ? "ok" : "alert"}>{s.rating}</Badge><Btn size="sm" onClick={() => openRef("supplier", s.id)}>Open</Btn></div>}>
              <div className="tu-row tu-wrap" style={{ padding: "12px 18px", gap: 16, borderBottom: "1px solid var(--border)" }}>
                <span className="tu-small tu-muted tu-grow" style={{ minWidth: 220 }}>{s.summary}</span>
                {c && <button className="tu-link tu-row tu-small" style={{ gap: 6 }} onClick={() => openRef("contact", c.id)}><Icon name="user" size={13} />{c.name}, {c.role}</button>}
              </div>
              <div className="tu-tablewrap">
                <table className="tu-table">
                  <thead><tr><th>Order</th><th>Project</th><th className="num">Value</th><th>Due</th><th>Delivery</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {pos.map((p) => {
                      const late = p.revisedDueAt ? daysBetween(keyOf(Date.parse(p.dueAt)), keyOf(Date.parse(p.revisedDueAt))) : 0;
                      const isOpenRow = open === p.id;
                      return [
                        <tr key={p.id} className={"click" + (p.status === "Late" ? " rc-hot" : "")} {...rowKeys(() => openRef("po", p.id))}>
                          <td style={{ minWidth: 240 }}><div style={{ fontWeight: 600 }}>{p.id}</div><div className="tu-small tu-muted">{p.description}</div></td>
                          <td className="tu-small"><Ref type="project" id={p.projectId} /></td>
                          <td className="num tu-small">{eur(p.value)}</td>
                          <td className="tu-small">{fmtDate(p.dueAt)}</td>
                          <td className="tu-small">{p.deliveredAt ? "Delivered " + fmtDate(p.deliveredAt) : p.revisedDueAt ? <span style={{ color: "var(--bad)" }}><Icon name="alert" size={11} style={{ verticalAlign: -1, marginRight: 3 }} />Revised {fmtDate(p.revisedDueAt)}, {late} days late</span> : "As ordered"}</td>
                          <td><Badge tone={p.status === "Late" ? "bad" : p.status === "Delivered" ? "ok" : ""}>{p.status}</Badge></td>
                          <td><Btn size="xs" kind="ghost" icon={isOpenRow ? "chevU" : "chevD"} aria-expanded={isOpenRow} aria-label={(isOpenRow ? "Hide" : "Show") + " delivery history for " + p.id} onClick={(e) => { e.stopPropagation(); setOpen(isOpenRow ? null : p.id); }} /></td>
                        </tr>,
                        isOpenRow && (
                          <tr key={p.id + "-h"}>
                            <td colSpan={7} style={{ background: "var(--surface-faint)" }}>
                              <div className="tu-split" style={{ gap: 18 }}>
                                <div>
                                  <div className="tu-eyebrow" style={{ marginBottom: 8 }}>Order and delivery history</div>
                                  <div className="tu-tl">{p.history.map((h, i) => <div key={i}><div className="tu-small tu-faint">{fmtDate(h.at)}</div><div className="tu-small">{h.note}</div></div>)}</div>
                                </div>
                                {p.id === "PO-5521" && (
                                  <div>
                                    <div className="tu-eyebrow" style={{ marginBottom: 8 }}>What this delay touches</div>
                                    <div className="tu-stack" style={{ gap: 6 }}>
                                      <Btn size="sm" icon="flag" onClick={() => navigate("/projects/p/TRN-2052/timeline")}>Hall 4 timeline</Btn>
                                      <Btn size="sm" icon="link" onClick={() => openRef("task", "T-2052-10")}>Blocked: {labelOf(db, "task", "T-2052-10")}</Btn>
                                      <Btn size="sm" icon="check" onClick={() => openRef("approval", "APR-2052-02")}>Recovery proposal {(db.approvals.find((a) => a.id === "APR-2052-02")?.status || "").toLowerCase()}</Btn>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
        {!list.length && <Card><Empty title={"No suppliers match “" + q + "”"}>The search covers supplier names, categories and orders.</Empty></Card>}
      </div>
    </>
  );
}
export { project };
