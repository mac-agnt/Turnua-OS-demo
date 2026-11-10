/* The canonical demo store: one DB object, persisted locally, with a tiny
   subscribe/notify core so React views and the Pulse shell logic share it. */
import { useSyncExternalStore } from "react";
import type { DB, ID } from "./types";
import { buildSeed, DATA_VERSION } from "./seed";
import { addDays, daysBetween, dublinParts, dublinToMs, fmtKey, keyOf, todayKey, parseKey } from "./time";

const KEY = "turnua-os-demo-v" + DATA_VERSION;

/* ── persistence and day migration ───────────────────────────────── */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftIso(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return iso;
  const p = dublinParts(ms);
  const k = parseKey(addDays(p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"), days));
  return new Date(dublinToMs(k.y, k.m, k.d, p.h, p.min) + p.s * 1000 + (ms % 1000)).toISOString();
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TEXT_DATE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;
let migrateBase = todayKey();
/** Readable dates inside seed text ("Fri 4 Dec") move with the scenario too. */
function shiftText(v: string, days: number): string {
  return v.replace(TEXT_DATE, (_m, _w, d, mon) => {
    const by = parseInt(migrateBase.slice(0, 4), 10);
    let best = "";
    let bestGap = 1e9;
    for (const y of [by - 1, by, by + 1]) {
      const k = y + "-" + String(MONTHS.indexOf(mon) + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const gap = Math.abs(daysBetween(migrateBase, k));
      if (gap < bestGap) { bestGap = gap; best = k; }
    }
    return fmtKey(addDays(best, days));
  });
}
function shiftDeep(v: unknown, days: number): unknown {
  if (typeof v === "string") {
    if (ISO_RE.test(v)) return shiftIso(v, days);
    if (KEY_RE.test(v)) return addDays(v, days);
    if (v.startsWith("Week of ") && KEY_RE.test(v.slice(8))) return "Week of " + addDays(v.slice(8), days);
    return shiftText(v, days);
  }
  if (Array.isArray(v)) return v.map((x) => shiftDeep(x, days));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[KEY_RE.test(k) ? addDays(k, days) : k] = shiftDeep(x, days);
    return o;
  }
  return v;
}
function shiftMs(v: unknown, ms: number): unknown {
  if (typeof v === "string" && ISO_RE.test(v)) return new Date(Date.parse(v) + ms).toISOString();
  if (Array.isArray(v)) return v.map((x) => shiftMs(x, ms));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = shiftMs(x, ms);
    return o;
  }
  return v;
}
/** On a new calendar day, untouched seed records move forward so the scenario
    stays current. User-created or edited records keep their dates. */
function migrate(d: DB): DB {
  const today = todayKey();
  const days = daysBetween(d.meta.seedDay, today);
  if (days <= 0) return d;
  migrateBase = d.meta.seedDay;
  const now = Date.now();
  const out: Record<string, unknown> = { ...d };
  for (const [k, val] of Object.entries(d)) {
    if (k === "meta" || k === "version" || k === "org") continue;
    if (k === "tickets") {
      out[k] = (val as DB["tickets"]).map((t) => (t.origin === "seed" && t.status !== "Resolved" && t.cycles.length === 1 && !t.cycles[0].acknowledgedAt)
        ? shiftMs(t, now - d.meta.seedNow) : shiftDeep(t, days));
      continue;
    }
    if (Array.isArray(val)) {
      out[k] = val.map((item: { origin?: string; touched?: boolean }) => (item && (item.origin === "user" || item.touched)) ? item : shiftDeep(item, days));
    } else if (val && typeof val === "object") {
      out[k] = shiftDeep(val, days);
    }
  }
  const next = out as unknown as DB;
  next.meta = { seedDay: today, seedNow: now, lastOpenDay: today };
  return next;
}

function load(): DB {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === DATA_VERSION && parsed.meta && Array.isArray(parsed.tasks) && parsed.tasks.length) return migrate(parsed);
    }
  } catch { /* stale or blocked storage: fall back to a fresh seed */ }
  return buildSeed(Date.now());
}

let db: DB = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: demo keeps running in memory */ }
  }, 250);
}
persist();

// another tab saved newer data (or reset the demo): adopt it rather than overwrite it later
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      if (!e.newValue) { db = buildSeed(Date.now()); emit(); return; }
      const next = JSON.parse(e.newValue) as DB;
      if (next && next.version === DATA_VERSION) { db = next; emit(); }
    } catch { /* ignore malformed writes */ }
  });
}

export function getDB(): DB { return db; }
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach((fn) => fn()); }

/** Apply a mutation to a private copy, then publish it. */
export function update(recipe: (draft: DB) => void): void {
  const draft = structuredClone(db);
  recipe(draft);
  db = draft;
  persist();
  emit();
}

export function resetDemo(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  db = buildSeed(Date.now());
  persist();
  emit();
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}

/* ── ID helpers ──────────────────────────────────────────────────── */
let seq = Date.now() % 100000;
export function newId(prefix: string): ID { return prefix + "-" + (++seq).toString(36).toUpperCase(); }
export function nowIso(): string { return new Date().toISOString(); }
export function todayIs(iso: string): boolean { return keyOf(Date.parse(iso)) === todayKey(); }

/* ── a one-second clock for SLA timers and "now" lines ───────────── */
let clock = Date.now();
const clockListeners = new Set<() => void>();
setInterval(() => { clock = Date.now(); clockListeners.forEach((f) => f()); }, 1000);
export function useClock(): number {
  return useSyncExternalStore((f) => { clockListeners.add(f); return () => { clockListeners.delete(f); }; }, () => clock, () => clock);
}
