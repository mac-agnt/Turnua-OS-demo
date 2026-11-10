/* Small pieces shared by the Helpdesk and Sites modules. */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Ticket, TicketPriority } from "../../types";
import { Badge, Icon, Progress } from "../../kit";
import { sla } from "../../selectors";
import "./helpdesk.css";

export const P_TONE: Record<TicketPriority, "bad" | "warn" | "accent" | "outline"> = { P1: "bad", P2: "warn", P3: "accent", P4: "outline" };
export const P_ORDER: Record<TicketPriority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
export const PRIORITIES: TicketPriority[] = ["P1", "P2", "P3", "P4"];

export function TicketPriorityBadge({ p }: { p: TicketPriority }) {
  return <Badge tone={P_TONE[p]} icon={p === "P1" ? "alert" : p === "P2" ? "chevU" : undefined} title={"Priority " + p}>{p}</Badge>;
}
export function TicketStatusBadge({ t }: { t: Ticket }) {
  const tone = t.status === "Resolved" ? "ok" : t.status === "In progress" ? "accent" : t.status === "Assigned" ? "" : "warn";
  return <Badge tone={tone} icon={t.status === "Resolved" ? "ok" : t.status === "Open" ? "clock" : undefined}>{t.status}</Badge>;
}

/** Response timer cell: label plus elapsed share of the target. */
export function SlaCell({ t, now }: { t: Ticket; now: number }) {
  const s = sla(t, now);
  if (t.status === "Resolved") {
    const c = t.cycles[t.cycles.length - 1];
    const met = c.result !== "Missed";
    return (
      <div className="hd-sla">
        <span className={"lbl " + (met ? "ok" : "bad")}><Icon name={met ? "ok" : "x"} size={12} />Resolved · response {met ? "met" : "missed"}</span>
      </div>
    );
  }
  const tone = s.state === "acknowledged" ? (s.tone === "bad" ? "bad" : "ok") : s.state === "breached" ? "bad" : s.tone;
  return (
    <div className="hd-sla">
      <span className={"lbl " + tone}>
        <Icon name={s.state === "acknowledged" ? "ok" : s.state === "breached" ? "alert" : "clock"} size={12} />
        {s.state === "acknowledged" ? s.label : s.state === "breached" ? s.label : s.label + " to respond"}
      </span>
      <Progress value={s.share} tone={tone === "plain" ? undefined : (tone as "ok" | "warn" | "bad")} label={"Share of response target used: " + Math.round(s.share * 100) + "%"} />
    </div>
  );
}

/** Page-level dialogs render at the themed app root so they sit above the top bar. */
export function InPortal({ children, onEscape }: { children: ReactNode; onEscape?: () => void }) {
  const host = (typeof document !== "undefined" && (document.querySelector(".sc-host > [data-theme]") || document.body)) as Element;
  return createPortal(<div onKeyDown={(e) => { if (e.key === "Escape" && onEscape) { e.stopPropagation(); onEscape(); } }}>{children}</div>, host);
}
