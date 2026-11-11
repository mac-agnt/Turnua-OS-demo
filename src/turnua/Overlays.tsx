/* Hosts every drawer and dialog, the toasts, and the global keys:
   Escape closes the topmost overlay, "/" opens search unless you are typing. */
import { useEffect } from "react";
import { closeOverlay, dismissToast, hasOverlay, useOverlays, useToasts, type Overlay } from "./ui";
import { useDB } from "./store";
import { TaskDrawer, TaskForm } from "./drawers/TaskDrawer";
import { ApprovalDrawer } from "./drawers/ApprovalDrawer";
import { DocDrawer, RecordDrawer, ChainDrawer, ConfirmModal, ProjectForm } from "./drawers/Records";
import { EventDrawer, EventForm } from "./modules/calendar/Calendar";
import { BookingForm, MessageDrawer, CoverDrawer } from "./modules/people/People";
import { TicketDrawer, TicketForm } from "./modules/helpdesk/Helpdesk";
import { SiteRecordDrawer } from "./modules/sites/Sites";
import { AgentDetailDrawer } from "./modules/agents/Agents";

const SITE_TYPES = new Set(["asset", "maintenance", "inspection", "finding"]);

function One({ o }: { o: Overlay }) {
  const s = (k: string) => o[k] as string;
  switch (o.kind) {
    case "task": return <TaskDrawer ok={o.key} id={s("id")} />;
    case "approval": return <ApprovalDrawer ok={o.key} id={s("id")} />;
    case "doc": return <DocDrawer ok={o.key} id={s("id")} />;
    case "record": return SITE_TYPES.has(s("type")) ? <SiteRecordDrawer ok={o.key} type={s("type")} id={s("id")} /> : <RecordDrawer ok={o.key} type={s("type")} id={s("id")} />;
    case "ticket": return <TicketDrawer ok={o.key} id={s("id")} />;
    case "event": return <EventDrawer ok={o.key} id={s("id")} date={o.date as string | undefined} />;
    case "eventForm": return <EventForm ok={o.key} eventId={o.eventId as string | undefined} date={o.date as string | undefined} prefill={o.prefill as Record<string, unknown> | undefined} />;
    case "booking": return <BookingForm ok={o.key} credentialId={s("credentialId")} />;
    case "message": return <MessageDrawer ok={o.key} personId={s("personId")} />;
    case "cover": return <CoverDrawer ok={o.key} personId={o.personId as string | undefined} credentialId={o.credentialId as string | undefined} />;
    case "agent": return <AgentDetailDrawer ok={o.key} id={s("id")} />;
    case "chain": return <ChainDrawer ok={o.key} id={s("id")} />;
    case "confirm": return <ConfirmModal ok={o.key} o={o} />;
    case "new": {
      const prefill = (o.prefill || {}) as Record<string, unknown>;
      if (o.what === "task") return <TaskForm ok={o.key} prefill={prefill} />;
      if (o.what === "project") return <ProjectForm ok={o.key} />;
      if (o.what === "ticket") return <TicketForm ok={o.key} prefill={prefill} />;
      if (o.what === "event") return <EventForm ok={o.key} prefill={prefill} date={prefill.date as string | undefined} />;
      return null;
    }
    default: return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TurnuaOverlays({ v }: { v: any }) {
  const stack = useOverlays();
  const toasts = useToasts();
  const db = useDB();
  const reduce = db.settings.reducedMotion;
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduced-motion", !!reduce);
    if (reduce) document.documentElement.setAttribute("data-reduced-motion", "1");
  }, [reduce]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasOverlay()) {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeOverlay();
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (typing || hasOverlay()) return;
        e.preventDefault();
        if (v && typeof v.openPalette === "function") v.openPalette();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [v]);
  return (
    <>
      {stack.map((o) => <One key={o.key} o={o} />)}
      <div className="tu tu-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"tu-toast " + t.tone}>
            <span className="tu-dot" />
            <span style={{ flex: 1, minWidth: 0 }}>{t.text}</span>
            {t.action && <button onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} style={{ color: "#A0A49D" }}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}
