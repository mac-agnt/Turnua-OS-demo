/* Shared bits for the Projects module. */
import type { DB, Project } from "../../types";
import { eur, eurShort, pct } from "../../time";
import { burn, currentContract } from "../../selectors";
import { Progress } from "../../kit";

export function valueLabel(db: DB, p: Project, short = true): { main: string; sub: string } {
  if (p.model === "Managed service") return { main: "Managed service", sub: "No contract value seeded" };
  if (p.model === "Internal budget") return { main: (short ? eurShort(p.budget || 0) : eur(p.budget || 0)) + " internal budget", sub: "Internal programme, not revenue" };
  const cur = currentContract(db, p);
  return { main: (short ? eurShort(p.contractValue || 0) : eur(p.contractValue || 0)) + " contract", sub: cur !== p.contractValue ? "Current " + eur(cur) + " incl. approved variations" : "Excl. VAT" };
}

/** Cost burn against physical progress. Amber when burn runs ahead of progress. */
export function BurnCell({ p }: { p: Project }) {
  if (p.model === "Managed service") return <span className="tu-small tu-muted">Service agreement</span>;
  const b = burn(p) || 0;
  const ahead = b > p.progress;
  return (
    <div style={{ minWidth: 120 }}>
      <div className="tu-row" style={{ gap: 8 }}>
        <div className="tu-grow"><Progress value={b} tone={ahead ? "warn" : "ok"} label="Cost burn" /></div>
        <span className="tu-small" style={{ color: ahead ? "var(--warn)" : "var(--dim)", fontWeight: ahead ? 600 : 400 }}>{pct(b)}</span>
      </div>
      <div className="tu-small tu-faint" style={{ marginTop: 2 }}>{p.model === "Internal budget" ? "of internal budget" : ahead ? Math.round((b - p.progress) * 100) + " pts ahead of progress" : "within progress"}</div>
    </div>
  );
}
export function ProgressCell({ p }: { p: Project }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div className="tu-row" style={{ gap: 8 }}>
        <div className="tu-grow"><Progress value={p.progress} label={p.model === "Managed service" ? "PPM cycle complete" : "Physical progress"} /></div>
        <span className="tu-small" style={{ fontWeight: 600 }}>{pct(p.progress)}</span>
      </div>
      <div className="tu-small tu-faint" style={{ marginTop: 2 }}>{p.model === "Managed service" ? "PPM cycle complete" : p.progressLabel}</div>
    </div>
  );
}
