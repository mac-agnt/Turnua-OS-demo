/* 24-hour time picker in 15-minute steps; native time inputs follow the browser locale. */
import { pad } from "../../time";

export function TimeSelect({ value, onChange, end, label }: { value: string; onChange: (v: string) => void; end?: boolean; label?: string }) {
  const opts: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) opts.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
  if (end) opts.push("23:59");
  if (value && !opts.includes(value)) { opts.push(value); opts.sort(); }
  return (
    <select className="tu-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
