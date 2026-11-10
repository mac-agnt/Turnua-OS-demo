/* Interface state that is not business data: the route (hash based, so Back,
   Forward and deep links work), the overlay stack, toasts and view prefs. */
import { useSyncExternalStore } from "react";
import { todayKey } from "./time";

/* ── modules and their top-bar tabs ──────────────────────────────── */
export interface ModuleDef { id: string; page: string; label: string; tabs: { id: string; label: string }[]; hint: string }
export const MODULES: ModuleDef[] = [
  { id: "home", page: "Home", label: "Home", tabs: [], hint: "ASK TURNUA OS" },
  { id: "agents", page: "Agents", label: "Agents", tabs: [{ id: "directory", label: "Directory" }, { id: "runs", label: "Runs" }, { id: "approvals", label: "Approvals" }], hint: "AGENTS" },
  { id: "dashboard", page: "Dashboard", label: "Dashboard", tabs: [{ id: "executive", label: "Executive" }, { id: "delivery", label: "Delivery" }, { id: "commercials", label: "Commercials" }, { id: "service", label: "Service Performance" }, { id: "safety", label: "Safety & Capacity" }], hint: "DASHBOARD" },
  { id: "projects", page: "Projects", label: "Projects", tabs: [{ id: "portfolio", label: "Portfolio" }, { id: "plan", label: "Delivery Plan" }, { id: "commercials", label: "Commercials" }, { id: "risks", label: "Risks & Compliance" }], hint: "PROJECTS" },
  { id: "work", page: "Work", label: "Work", tabs: [{ id: "my", label: "My Work" }, { id: "team", label: "Team Tasks" }, { id: "approvals", label: "Approvals" }, { id: "workflows", label: "Workflows" }], hint: "WORK" },
  { id: "calendar", page: "Calendar", label: "Calendar", tabs: [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }], hint: "CALENDAR" },
  { id: "people", page: "People", label: "People", tabs: [{ id: "directory", label: "Directory" }, { id: "capacity", label: "Capacity" }, { id: "certifications", label: "Certifications" }, { id: "timesheets", label: "Timesheets" }], hint: "PEOPLE" },
  { id: "helpdesk", page: "Helpdesk", label: "24/7 Helpdesk", tabs: [{ id: "queue", label: "Live Queue" }, { id: "oncall", label: "On-call" }, { id: "sla", label: "SLA Reports" }, { id: "knowledge", label: "Knowledge" }], hint: "HELPDESK" },
  { id: "sites", page: "Sites", label: "Sites & Assets", tabs: [{ id: "sites", label: "Sites" }, { id: "assets", label: "Asset Register" }, { id: "maintenance", label: "Planned Maintenance" }, { id: "inspections", label: "Inspections" }], hint: "SITES" },
  { id: "records", page: "Records", label: "Records", tabs: [{ id: "ontology", label: "Ontology" }, { id: "documents", label: "Documents" }, { id: "contacts", label: "Customers & Contacts" }, { id: "register", label: "Register" }, { id: "suppliers", label: "Suppliers" }], hint: "RECORDS" },
  { id: "activity", page: "Activity", label: "Activity", tabs: [{ id: "all", label: "All Activity" }, { id: "people", label: "People" }, { id: "agents", label: "Agents" }, { id: "systems", label: "Systems" }, { id: "audit", label: "Audit" }], hint: "ACTIVITY" },
  { id: "settings", page: "Settings", label: "Settings", tabs: [{ id: "organisation", label: "Organisation" }, { id: "teams", label: "Teams & Permissions" }, { id: "systems", label: "Systems & Integrations" }, { id: "governance", label: "Governance & AI" }, { id: "experience", label: "Experience" }], hint: "SETTINGS" },
];
export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
export const moduleByPage = (page: string) => MODULES.find((m) => m.page === page);

/* ── route ───────────────────────────────────────────────────────── */
export interface Route { module: string; tab: string; id?: string; sub?: string; query: Record<string, string>; path: string }

function parse(hash: string): Route {
  const raw = (hash || "").replace(/^#/, "") || "/home";
  const [p, qs] = raw.split("?");
  const parts = p.split("/").filter(Boolean).map(decodeURIComponent);
  const query: Record<string, string> = {};
  if (qs) for (const kv of qs.split("&")) { const [k, val] = kv.split("="); if (k) query[decodeURIComponent(k)] = decodeURIComponent(val || ""); }
  const mod = moduleById(parts[0]) ? parts[0] : "home";
  const def = moduleById(mod)!;
  let tab = parts[1] || (def.tabs[0] ? def.tabs[0].id : "");
  let id: string | undefined, sub: string | undefined;
  // entity detail routes: /projects/p/:id/:sub, /people/p/:id, /sites/s/:id/:sub
  if ((mod === "projects" || mod === "people") && parts[1] === "p" && parts[2]) { tab = "detail"; id = parts[2]; sub = parts[3]; }
  if (mod === "sites" && parts[1] === "s" && parts[2]) { tab = "detail"; id = parts[2]; sub = parts[3]; }
  if (tab !== "detail" && def.tabs.length && !def.tabs.find((t) => t.id === tab)) tab = def.tabs[0].id;
  return { module: mod, tab, id, sub, query, path: "/" + parts.join("/") };
}

let route: Route = parse(typeof location !== "undefined" ? location.hash : "");
const routeListeners = new Set<() => void>();
function syncFromLocation() {
  const next = parse(location.hash);
  if (next.path === route.path && JSON.stringify(next.query) === JSON.stringify(route.query)) return;
  route = next;
  routeListeners.forEach((f) => f());
}
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", syncFromLocation);
  window.addEventListener("popstate", syncFromLocation);
  // some embedded browsers change the URL without firing either event
  setInterval(syncFromLocation, 400);
}
export function getRoute(): Route { return route; }
export function subscribeRoute(fn: () => void) { routeListeners.add(fn); return () => { routeListeners.delete(fn); }; }
export function useRoute(): Route { return useSyncExternalStore(subscribeRoute, getRoute, getRoute); }

/** Navigate to an app path like "/projects/p/TRN-2052/timeline". */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = "#" + (to.startsWith("/") ? to : "/" + to);
  if (location.hash === target) return;
  if (opts.replace) { history.replaceState(null, "", target); route = parse(target); routeListeners.forEach((f) => f()); }
  else location.hash = target;
}
export function withQuery(path: string, q: Record<string, string | undefined>): string {
  const parts = Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v as string));
  return path + (parts.length ? "?" + parts.join("&") : "");
}

/* ── generic tiny store helper ───────────────────────────────────── */
function makeStore<S>(initial: S) {
  let s = initial;
  const ls = new Set<() => void>();
  return {
    get: () => s,
    set: (patch: Partial<S> | ((p: S) => Partial<S>)) => { s = { ...s, ...(typeof patch === "function" ? (patch as (p: S) => Partial<S>)(s) : patch) }; ls.forEach((f) => f()); },
    sub: (f: () => void) => { ls.add(f); return () => { ls.delete(f); }; },
  };
}

/* ── overlays: drawers and dialogs, topmost closes on Escape ─────── */
export interface Overlay { key: string; kind: string; [k: string]: unknown }
type OverlayState = { stack: Overlay[] };
const overlays = makeStore<OverlayState>({ stack: [] });
const guards = new Map<string, () => boolean>();
const returnFocus = new Map<string, Element | null>();
let okey = 0;

export function openOverlay(o: Omit<Overlay, "key">): string {
  const key = "ov" + ++okey;
  returnFocus.set(key, typeof document !== "undefined" ? document.activeElement : null);
  overlays.set((p) => ({ stack: p.stack.concat([{ ...o, key } as Overlay]) }));
  return key;
}
export function closeOverlay(key?: string, force = false) {
  const stack = overlays.get().stack;
  const target = key ? stack.find((o) => o.key === key) : stack[stack.length - 1];
  if (!target) return;
  const g = guards.get(target.key);
  if (!force && g && !g()) return;
  guards.delete(target.key);
  overlays.set((p) => ({ stack: p.stack.filter((o) => o.key !== target.key) }));
  const el = returnFocus.get(target.key) as HTMLElement | null;
  returnFocus.delete(target.key);
  if (el && typeof el.focus === "function" && document.contains(el)) setTimeout(() => el.focus(), 0);
}
export function replaceOverlay(key: string, patch: Partial<Overlay>) {
  overlays.set((p) => ({ stack: p.stack.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));
}
/** A guard returns false to keep the overlay open (for unsaved edits). */
export function setGuard(key: string, fn: (() => boolean) | null) { if (fn) guards.set(key, fn); else guards.delete(key); }
export function useOverlays(): Overlay[] { return useSyncExternalStore(overlays.sub, () => overlays.get().stack, () => overlays.get().stack); }
export function hasOverlay(): boolean { return overlays.get().stack.length > 0; }

/* shortcuts used everywhere */
export const openTask = (id: string) => openOverlay({ kind: "task", id });
export const openTicket = (id: string) => openOverlay({ kind: "ticket", id });
export const openApproval = (id: string) => openOverlay({ kind: "approval", id });
export const openDoc = (id: string) => openOverlay({ kind: "doc", id });
export const openRecord = (type: string, id: string) => openOverlay({ kind: "record", type, id });
export const openEvent = (id: string, date?: string) => openOverlay({ kind: "event", id, date });
export const openNew = (what: "task" | "event" | "project" | "ticket", prefill: Record<string, unknown> = {}) => openOverlay({ kind: "new", what, prefill });

/* ── toasts ──────────────────────────────────────────────────────── */
export interface Toast { id: number; text: string; tone: "ok" | "warn" | "bad" | "plain"; action?: { label: string; run: () => void } }
const toasts = makeStore<{ list: Toast[] }>({ list: [] });
let tn = 0;
export function toast(text: string, tone: Toast["tone"] = "ok", action?: Toast["action"]) {
  const id = ++tn;
  toasts.set((p) => ({ list: p.list.concat([{ id, text, tone, action }]).slice(-4) }));
  setTimeout(() => toasts.set((p) => ({ list: p.list.filter((t) => t.id !== id) })), 4600);
}
export function dismissToast(id: number) { toasts.set((p) => ({ list: p.list.filter((t) => t.id !== id) })); }
export function useToasts(): Toast[] { return useSyncExternalStore(toasts.sub, () => toasts.get().list, () => toasts.get().list); }

/* ── view prefs that survive drill-through and return ────────────── */
export interface Prefs {
  calDate: string; calPeople: string[] | null; myWorkPerson: string;
  filters: Record<string, Record<string, string>>;
  projectView: "cards" | "list";
}
const prefs = makeStore<Prefs>({ calDate: todayKey(), calPeople: null, myWorkPerson: "P01", filters: {}, projectView: "cards" });
export function usePrefs(): Prefs { return useSyncExternalStore(prefs.sub, prefs.get, prefs.get); }
export function setPrefs(p: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) { prefs.set(p); }
export function getPrefs(): Prefs { return prefs.get(); }
export function useFilter(scope: string): [Record<string, string>, (k: string, v: string) => void, () => void] {
  const p = usePrefs();
  const f = p.filters[scope] || {};
  return [f,
    (k, v) => prefs.set((x) => ({ filters: { ...x.filters, [scope]: { ...(x.filters[scope] || {}), [k]: v } } })),
    () => prefs.set((x) => ({ filters: { ...x.filters, [scope]: {} } }))];
}
