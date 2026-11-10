/* The demo control strip under the top bar: what is simulated, who you are
   previewing as, the Dublin clock, and Undo / Reset / Ask in one place. */
import { useDB, useClock, update, undo, useUndo, resetDemo, nowIso, newId } from "./store";
import { openOverlay, toast, navigate } from "./ui";
import { Icon } from "./kit";
import { fmtKey, hhmm, keyOf } from "./time";

export const ROLES: [string, string][] = [
  ["MD", "David Cox · Managing Director"], ["PM", "Project manager"], ["Engineer", "Engineer"],
  ["HSEQ", "HSEQ manager"], ["Commercial", "Commercial manager"], ["Viewer", "Viewer (read only)"],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DemoBar({ v }: { v: any }) {
  const db = useDB();
  const now = useClock();
  const u = useUndo();
  const role = db.settings.rolePreview || "MD";
  const setRole = (r: string) => {
    update((d) => {
      d.settings.rolePreview = r;
      d.activity.unshift({ id: newId("ACT"), at: nowIso(), actorType: "system", actorId: "settings", actor: "Role preview", text: "Previewing the workspace as " + (ROLES.find((x) => x[0] === r)?.[1] || r) + " (local UI simulation)", sourceType: "settings", sourceId: "settings", category: "Settings" });
    });
    toast(r === "MD" ? "Back to David Cox, Managing Director" : "Previewing as " + (ROLES.find((x) => x[0] === r)?.[1] || r) + ". Approvals need the MD role.", "plain");
  };
  const minute = Math.floor(now / 60000) * 60000;
  return (
    <div className="tu tu-demobar" role="region" aria-label="Demo controls">
      <button className="tu-demochip" onClick={() => navigate("/settings/experience")} title="Fictional records, local state, simulated integrations. Explained in Settings, Experience.">
        <span className="tu-dot" /> Demo · simulated
      </button>
      <label className="tu-demosel">
        <span className="tu-sr">Preview as role</span>
        <Icon name="user" size={13} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([id, label]) => <option key={id} value={id}>{id === "MD" ? label : "Preview: " + label}</option>)}
        </select>
      </label>
      <span className="tu-democlock" title="Europe/Dublin">
        <Icon name="clock" size={13} /> {fmtKey(keyOf(minute))} · {hhmm(new Date(minute).toISOString())} <span className="tu-faint">Dublin</span>
      </span>
      {role !== "MD" && <span className="tu-badge warn" style={{ height: 26 }}>Read-only for approvals</span>}
      <span className="tu-grow" />
      <button className="tu-btn ghost sm" disabled={!u.can} title={u.can ? "Undo: " + u.label : "Nothing to undo"}
        onClick={() => { const l = undo(); if (l) toast("Undone: " + l, "plain"); }}>
        <Icon name="M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-4" size={14} /> Undo
      </button>
      <button className="tu-btn ghost sm tu-demoreset" onClick={() => openOverlay({ kind: "confirm", title: "Reset the demo?", danger: true, confirmLabel: "Reset demo",
        body: "This clears every change made in this browser and restores the canonical Turnua scenario with dates relative to today. It cannot be undone.",
        onConfirm: () => { resetDemo(); toast("Demo reset to the canonical scenario"); } })}>
        <Icon name="sync" size={14} /> Reset demo
      </button>
      <button className="tu-btn primary sm" onClick={() => (v && typeof v.toggleMini === "function" ? v.toggleMini() : navigate("/home"))}>
        <Icon name="msg" size={14} /> Ask Turnua OS
      </button>
    </div>
  );
}
