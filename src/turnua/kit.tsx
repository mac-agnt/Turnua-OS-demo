/* Shared Turnua OS components, built on the Pulse tokens (turnua.css). */
import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type KeyboardEvent as RKE } from "react";
import type { DB, Health, ID, Person } from "./types";
import { useDB, useClock } from "./store";
import { closeOverlay, navigate, openApproval, openDoc, openEvent, openRecord, openTask, openTicket, useRoute, moduleById } from "./ui";
import { fmtDate, hhmm } from "./time";
import { labelOf } from "./selectors";

/* ── icons: same stroke system as the Pulse rail icons ───────────── */
export const PATHS: Record<string, string> = {
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6 6 18",
  search: "m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  check: "M5 12.5 10 17l9-10",
  chevR: "m9 6 6 6-6 6", chevL: "m15 6-6 6 6 6", chevD: "m6 9 6 6 6-6", chevU: "m6 15 6-6 6 6",
  arrowR: "M5 12h14 M13 6l6 6-6 6",
  alert: "M12 3.5 2.8 19.5h18.4L12 3.5Z M12 10v4.2 M12 17.2v.1",
  clock: "M12 7v5l3.4 2 M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9",
  cal: "M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4",
  user: "M12 4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2 M4.8 20a7.2 7.2 0 0 1 14.4 0",
  doc: "M6.5 3.5h8l4 4v13h-12z M14.5 3.5v4h4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  bolt: "M13 3 4.5 14H10l-1 7 9-11h-5.5z",
  site: "M4 20V7.5L12 4l8 3.5V20 M9.5 20v-5.5h5V20",
  asset: "M4 7h16v10H4z M8 7V5h8v2 M8 12h.01 M12 12h.01 M16 12h.01",
  ticket: "M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z M10 7v10",
  shield: "M12 2.9 5 5.6v5.9c0 4 2.8 7.1 7 8.6 4.2-1.5 7-4.6 7-8.6V5.6L12 2.9Z M9 12l2 2 4-4",
  euro: "M17 6.5A6.5 6.5 0 1 0 17 17.5 M4 10h9 M4 14h9",
  grip: "M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01",
  sort: "M8 9l4-4 4 4 M8 15l4 4 4-4",
  dl: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  copy: "M8 8h11v11H8z M5 16V5h11",
  msg: "M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.9A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z",
  edit: "M4 20h4L19 9a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6V20Z",
  trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  play: "M7 5l12 7-12 7z",
  sync: "M20 12a8 8 0 0 1-14 5.3 M4 12a8 8 0 0 1 14-5.3 M18 3v4h-4 M6 21v-4h4",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  agent: "M8.2 6.5h7.6A2.2 2.2 0 0 1 18 8.7v5.1a2.2 2.2 0 0 1-2.2 2.2H8.2A2.2 2.2 0 0 1 6 13.8V8.7a2.2 2.2 0 0 1 2.2-2.2Z M9.9 10.6v1.4 M14.1 10.6v1.4 M12 2.4v4",
  ok: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8 12.5l2.6 2.6L16 9.6",
  minus: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8 12h8",
  x: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9 9l6 6 M15 9l-6 6",
};
export function Icon({ name, size = 15, stroke = 1.7, style }: { name: string; size?: number; stroke?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", ...style }} aria-hidden="true">
      <path d={PATHS[name] || name} />
    </svg>
  );
}

/* ── layout ──────────────────────────────────────────────────────── */
export function Page({ title, sub, actions, crumbs, children, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]; children: ReactNode; eyebrow?: ReactNode }) {
  const route = useRoute();
  const now = useClock();
  const mod = moduleById(route.module);
  const tab = mod?.tabs.find((t) => t.id === route.tab);
  const minute = new Date(Math.floor(now / 60000) * 60000).toISOString();
  // every page opens with where you are and when, as in a real operations console
  const stamp = fmtDate(minute) + " · " + hhmm(minute);
  if (!eyebrow && !crumbs) eyebrow = (mod ? mod.label : "") + (tab ? " · " + tab.label : "") + " · " + stamp;
  else if (typeof eyebrow === "string") eyebrow = eyebrow + " · " + stamp;
  return (
    <div className="tu tu-page">
      {crumbs && (
        <nav className="tu-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="tu-row" style={{ gap: 6 }}>
              {i > 0 && <Icon name="chevR" size={12} />}
              {c.to ? <button onClick={() => navigate(c.to!)}>{c.label}</button> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <header className="tu-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="tu-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="tu-sub">{sub}</div>}
        </div>
        {actions && <div className="tu-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
export function Card({ title, sub, right, children, footer, pad = true, className = "", onClick, style }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; footer?: ReactNode; pad?: boolean; className?: string; onClick?: () => void; style?: CSSProperties }) {
  const click = !!onClick;
  return (
    <section className={"tu-card " + (click ? "tu-click " : "") + className} style={style} onClick={onClick}
      tabIndex={click ? 0 : undefined} role={click ? "button" : undefined}
      onKeyDown={click ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}>
      {(title || right) && (
        <div className="tu-card-h">
          <div className="tu-grow">{typeof title === "string" ? <h2>{title}</h2> : title}{sub && <div className="tu-sub">{sub}</div>}</div>
          {right}
        </div>
      )}
      {pad ? <div className="tu-card-b">{children}</div> : children}
      {footer && <div className="tu-card-f">{footer}</div>}
    </section>
  );
}
export function Stat({ label, value, sub, tone, onClick, title }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad"; onClick?: () => void; title?: string }) {
  const color = tone ? "var(--" + tone + ")" : undefined;
  const inner = (<><div className="k">{label}</div><div className="v" style={{ color }}>{value}</div>{sub && <div className="s">{sub}</div>}</>);
  return onClick ? <button className="tu-stat" onClick={onClick} title={title}>{inner}</button> : <div className="tu-stat">{inner}</div>;
}

/* ── controls ────────────────────────────────────────────────────── */
export function Btn({ kind = "", size = "", icon, children, ...rest }: { kind?: "" | "primary" | "ghost" | "danger" | "navy"; size?: "" | "sm" | "xs"; icon?: string; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={["tu-btn", kind, size, !children && icon ? "icon" : ""].filter(Boolean).join(" ")} {...rest}>
      {icon && <Icon name={icon} size={size === "xs" ? 12 : 14} stroke={1.9} />}
      {children}
    </button>
  );
}
export function Seg<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tu-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
export function Search({ value, onChange, placeholder, label, width }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; width?: number }) {
  return (
    <label className="tu-search" style={{ width }}>
      <span className="tu-sr">{label || placeholder || "Search"}</span>
      <Icon name="search" size={14} />
      <input className="tu-input" value={value} placeholder={placeholder || "Search"} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function Select({ value, onChange, options, label, hideLabel = true, style }: { value: string; onChange: (v: string) => void; options: (string | [string, string])[]; label: string; hideLabel?: boolean; style?: CSSProperties }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className={hideLabel ? "tu-sr" : "tu-small tu-muted"}>{label}</span>
      <select className="tu-select" value={value} onChange={(e) => onChange(e.target.value)} style={style}>
        {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    </label>
  );
}
export function Field({ label, error, help, children }: { label: string; error?: string; help?: string; children: ReactNode }) {
  return (
    <label className="tu-field">
      <span>{label}</span>
      {children}
      {help && !error && <span className="help">{help}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </label>
  );
}

/* ── status ──────────────────────────────────────────────────────── */
export function Badge({ tone, children, icon, title }: { tone?: "ok" | "warn" | "bad" | "accent" | "navy" | "outline" | ""; children: ReactNode; icon?: string; title?: string }) {
  return <span className={"tu-badge " + (tone || "")} title={title}>{icon && <Icon name={icon} size={12} stroke={2} />}{children}</span>;
}
export const healthTone = (h: Health) => (h === "On track" ? "ok" : h === "At risk" ? "warn" : "bad");
export function HealthBadge({ health }: { health: Health }) {
  return <Badge tone={healthTone(health)} icon={health === "On track" ? "ok" : health === "At risk" ? "alert" : "x"}>{health}</Badge>;
}
export function Progress({ value, tone, label }: { value: number; tone?: "ok" | "warn" | "bad"; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return <div className={"tu-prog " + (tone || "")} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: v * 100 + "%" }} /></div>;
}
export const TAG_COLOR: Record<string, string> = {
  Civils: "#F0A35E", Permits: "#8B9CF7", Safety: "#E86C7A", Splicing: "#5FD3A1", QA: "#16C6D8",
  PPM: "#7BC4F2", Commercial: "#D9A97A", Procurement: "#C38BEB", Client: "#9CCB62", Design: "#F2C14E",
};
export function Tag({ tag }: { tag: string }) {
  const c = TAG_COLOR[tag] || "#9AA6BF";
  return <span className="tu-tag" style={{ background: c + "2E", color: "color-mix(in oklab," + c + " 55%, var(--ink))" }}>{tag}</span>;
}
export const PRIORITY_TONE: Record<string, "bad" | "warn" | "" | "outline"> = { Urgent: "bad", High: "warn", Normal: "", Low: "outline" };
export function PriorityBadge({ p }: { p: string }) { return <Badge tone={PRIORITY_TONE[p]} icon={p === "Urgent" ? "alert" : p === "High" ? "chevU" : undefined}>{p}</Badge>; }

/* ── people ──────────────────────────────────────────────────────── */
export function Avatar({ person, size = 26, title }: { person?: Person | null; size?: number; title?: string }) {
  if (!person) return <span className="tu-av" style={{ width: size, height: size, background: "var(--track)", color: "var(--dim)", fontSize: size * 0.36 }} title="Unassigned">?</span>;
  return <span className="tu-av" style={{ width: size, height: size, background: person.color, fontSize: size * 0.37 }} title={title || person.name + ", " + person.role}>{person.initials}</span>;
}
export function AvatarStack({ ids, size = 24, max = 5 }: { ids: ID[]; size?: number; max?: number }) {
  const db = useDB();
  const list = ids.map((i) => db.people.find((p) => p.id === i)).filter(Boolean) as Person[];
  return (
    <span className="tu-avs" aria-label={list.map((p) => p.name).join(", ")}>
      {list.slice(0, max).map((p) => <Avatar key={p.id} person={p} size={size} />)}
      {list.length > max && <span className="tu-av" style={{ width: size, height: size, background: "var(--track)", color: "var(--dim)", fontSize: size * 0.36 }}>+{list.length - max}</span>}
    </span>
  );
}
export function PersonLink({ id, showAvatar = true }: { id?: ID | null; showAvatar?: boolean }) {
  const db = useDB();
  const p = db.people.find((x) => x.id === id);
  if (!p) return <span className="tu-faint">Unassigned</span>;
  return (
    <button className="tu-link tu-row" style={{ gap: 7, color: "var(--ink)", display: "inline-flex" }} onClick={(e) => { e.stopPropagation(); closeAllThenGo("/people/p/" + p.id); }}>
      {showAvatar && <Avatar person={p} size={22} />}<span className="tu-ellipsis">{p.name}</span>
    </button>
  );
}

/* ── references to any record ────────────────────────────────────── */
function closeAllThenGo(path: string) {
  // navigating away from a page should not leave drawers stacked on top of it
  for (let i = 0; i < 6; i++) closeOverlay(undefined, true);
  navigate(path);
}
export function openRef(type: string, id: ID) {
  switch (type) {
    case "project": return closeAllThenGo("/projects/p/" + id + "/overview");
    case "person": return closeAllThenGo("/people/p/" + id);
    case "site": return closeAllThenGo("/sites/s/" + id);
    case "task": return openTask(id);
    case "ticket": return openTicket(id);
    case "approval": return openApproval(id);
    case "doc": return openDoc(id);
    case "event": return openEvent(id);
    case "agent": return closeAllThenGo("/agents/directory?agent=" + id);
    case "run": return closeAllThenGo("/agents/runs?run=" + id);
    case "integration": return closeAllThenGo("/settings/systems");
    case "settings": return closeAllThenGo("/settings/governance");
    case "timesheet": return closeAllThenGo("/people/timesheets");
    default: return openRecord(type, id);
  }
}
export function Ref({ type, id, children, className }: { type: string; id: ID; children?: ReactNode; className?: string }) {
  const db = useDB();
  return <button className={"tu-link " + (className || "")} onClick={(e) => { e.stopPropagation(); openRef(type, id); }}>{children ?? labelOf(db, type, id)}</button>;
}
export function refLabel(db: DB, type: string, id: ID) { return labelOf(db, type, id); }

/* ── empty and misc ──────────────────────────────────────────────── */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="tu-empty"><b>{title}</b>{children && <div>{children}</div>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}
export function SortTh<K extends string>({ k, label, sort, setSort, num }: { k: K; label: string; sort: { k: K; dir: 1 | -1 }; setSort: (s: { k: K; dir: 1 | -1 }) => void; num?: boolean }) {
  const on = sort.k === k;
  return (
    <th className={num ? "num" : ""} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort({ k, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })}>{label}<Icon name={on ? (sort.dir === 1 ? "chevU" : "chevD") : "sort"} size={11} /></button>
    </th>
  );
}

/* ── accessible overlay shells (focus trap, Escape handled globally) ── */
function useTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const first = el.querySelector<HTMLElement>("[data-autofocus]") || el.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])") || el;
    setTimeout(() => first.focus(), 20);
  }, [open]);
  const onKeyDown = (e: RKE) => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = Array.from(ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], b = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
  };
  return { ref, onKeyDown };
}
export function Drawer({ ok, title, eyebrow, badges, children, footer, onClose, wide }: { ok: string; title: ReactNode; eyebrow?: ReactNode; badges?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  const t = useTrap(true);
  return (
    <>
      <div className="tu-scrim" onClick={onClose} />
      <div ref={t.ref} onKeyDown={t.onKeyDown} className={"tu tu-drawer" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby={ok + "-t"} tabIndex={-1}>
        <div className="tu-drawer-h">
          <div className="tu-grow">
            <div className="tu-row tu-wrap" style={{ gap: 8 }}>{eyebrow && <span className="tu-eyebrow">{eyebrow}</span>}{badges}</div>
            <h2 id={ok + "-t"}>{title}</h2>
          </div>
          <Btn kind="ghost" size="sm" icon="close" onClick={onClose} aria-label="Close" data-close="1" />
        </div>
        <div className="tu-drawer-b">{children}</div>
        {footer && <div className="tu-drawer-f">{footer}</div>}
      </div>
    </>
  );
}
export function Modal({ ok, title, sub, children, footer, onClose, size = "" }: { ok: string; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; size?: "" | "sm" | "lg" }) {
  const t = useTrap(true);
  return (
    <>
      <div className="tu-scrim" onClick={onClose} />
      <div className="tu-modal-wrap" onClick={onClose}>
        <div ref={t.ref} onKeyDown={t.onKeyDown} onClick={(e) => e.stopPropagation()} className={"tu tu-modal " + size} role="dialog" aria-modal="true" aria-labelledby={ok + "-t"} tabIndex={-1}>
          <div className="tu-drawer-h" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="tu-grow"><h2 id={ok + "-t"} style={{ margin: 0 }}>{title}</h2>{sub && <div className="tu-small tu-muted" style={{ marginTop: 4 }}>{sub}</div>}</div>
            <Btn kind="ghost" size="sm" icon="close" onClick={onClose} aria-label="Close" data-close="1" />
          </div>
          <div style={{ padding: "16px 22px 18px" }}>{children}</div>
          {footer && <div className="tu-drawer-f" style={{ borderRadius: "0 0 var(--card-r,20px) var(--card-r,20px)", justifyContent: "flex-end" }}>{footer}</div>}
        </div>
      </div>
    </>
  );
}
export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return <div className="tu-kv">{items.map(([k, v], i) => <div key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>;
}

/** Local file download of generated text: CSV exports and mock document copies. */
export function download(name: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => { const s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
}
export function useLocalState<T>(init: T): [T, (v: T) => void] { const [s, set] = useState(init); return [s, set]; }
