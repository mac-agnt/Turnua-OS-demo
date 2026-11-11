/* Global "+ New": task, event, project or helpdesk ticket, each a validated form. */
import { useEffect, useRef, useState } from "react";
import { openNew } from "./ui";
import { Icon } from "./kit";

const ITEMS: { what: "task" | "event" | "project" | "ticket"; label: string; icon: string; hint: string }[] = [
  { what: "task", label: "Task", icon: "check", hint: "On any project" },
  { what: "event", label: "Event", icon: "cal", hint: "Shared calendar" },
  { what: "project", label: "Project", icon: "flag", hint: "Portfolio and records" },
  { what: "ticket", label: "Helpdesk ticket", icon: "ticket", hint: "With a response timer" },
];

export default function NewMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 60, right: 24 });
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    // the header clips overflow, so the menu is positioned against the viewport
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } };
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <div ref={ref} className="tu" style={{ position: "relative", flex: "none", padding: "0 4px" }}>
      <button ref={btn} className="tu-btn primary" style={{ height: 40, padding: "0 14px" }} aria-haspopup="menu" aria-expanded={open} aria-label="Create new" onClick={toggle}>
        <Icon name="plus" size={15} stroke={2.2} /><span className="tu-newlabel">New</span>
      </button>
      {open && (
        <div role="menu" aria-label="Create new" className="tu-card" style={{ position: "fixed", right: pos.right, top: pos.top, zIndex: 70, width: 240, padding: 6, boxShadow: "0 18px 50px rgba(22,24,28,.22)" }}>
          {ITEMS.map((i, n) => (
            <button key={i.what} role="menuitem" autoFocus={n === 0} className="tu-rowbtn" style={{ borderTop: 0, borderRadius: 10, padding: "9px 10px" }}
              onClick={() => { setOpen(false); openNew(i.what); }}>
              <Icon name={i.icon} size={15} /><span className="tu-grow"><span style={{ display: "block", fontWeight: 500 }}>{i.label}</span><span className="tu-small tu-muted">{i.hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
