/* The one task editor every entry point opens, plus the new-task form. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskStatus, Priority, Tag, ID } from "../types";
import { TASK_STATUSES, PRIORITIES, TAGS } from "../types";
import { useDB, update, newId, nowIso } from "../store";
import { closeOverlay, setGuard, toast, openApproval } from "../ui";
import { updateTask, addComment, createTask, log } from "../actions";
import { Avatar, Badge, Btn, Drawer, Field, Icon, Modal, PersonLink, PriorityBadge, Ref, Tag as TagChip, openRef } from "../kit";
import { at, dueLabel, fmtDateTime, keyOf, ago, hhmm, addDays, todayKey } from "../time";
import { nameOf, project, site, workArea, isOverdue } from "../selectors";
import { TimeSelect } from "../modules/calendar/TimeSelect";

const toKey = (iso: string) => keyOf(Date.parse(iso));

function draftOf(t: Task) {
  return { title: t.title, status: t.status, ownerId: t.ownerId || "", priority: t.priority, tag: t.tag, dueDate: toKey(t.dueAt), dueTime: hhmm(t.dueAt), description: t.description || "" };
}

export function TaskDrawer({ ok, id }: { ok: string; id: ID }) {
  const db = useDB();
  const t = db.tasks.find((x) => x.id === id);
  const [d, setD] = useState(() => (t ? draftOf(t) : null));
  const [askClose, setAskClose] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<ID[]>([]);
  const [err, setErr] = useState("");
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const dirty = useMemo(() => {
    if (!t || !d) return false;
    const o = draftOf(t);
    return (Object.keys(o) as (keyof typeof o)[]).some((k) => o[k] !== d[k]);
  }, [t, d]);
  useEffect(() => {
    setGuard(ok, () => { if (dirty) { setAskClose(true); return false; } return true; });
    return () => setGuard(ok, null);
  }, [ok, dirty]);

  if (!t || !d) return <Drawer ok={ok} title="Task not found" onClose={() => closeOverlay(ok, true)}><p className="tu-muted">This task no longer exists. It may have been removed by a demo reset.</p></Drawer>;

  const p = project(db, t.projectId);
  const s = site(db, t.siteId);
  const wa = workArea(db, t.workAreaId);
  const rams = db.rams.filter((r) => r.taskIds.includes(t.id) || (t.workAreaId && r.workAreaId === t.workAreaId && r.projectId === t.projectId));
  const permit = db.permits.find((x) => x.id === t.permitId);
  const deps = t.dependsOn.map((x) => db.tasks.find((y) => y.id === x)).filter(Boolean) as Task[];
  const done = t.checklist.filter((c) => c.done).length;
  const dl = dueLabel(t.dueAt, t.status === "Done");
  const team = p ? db.people.filter((x) => p.team.includes(x.id) || x.id === p.sponsorId || x.id === t.ownerId) : db.people;
  const approval = db.approvals.find((a) => a.id === t.approvalId);

  const save = () => {
    if (!d.title.trim()) { setErr("A task needs a title."); return; }
    if (!d.dueDate) { setErr("Choose a due date."); return; }
    const [hh, mm] = (d.dueTime || "23:59").split(":").map(Number);
    if (d.status === "Done" && approval && approval.status === "Pending") { setErr("Decide " + approval.id + " first: the task completes with the decision."); return; }
    setErr("");
    updateTask(t.id, { title: d.title.trim(), status: d.status as TaskStatus, ownerId: d.ownerId || null, priority: d.priority as Priority, tag: d.tag as Tag,
      dueAt: at(d.dueDate, hh, mm), description: d.description || undefined });
    toast("Task saved");
  };
  const close = () => closeOverlay(ok);
  const setCk = (fn: (x: Task) => void, msg?: string) => update((dd) => {
    const x = dd.tasks.find((y) => y.id === t.id)!; fn(x); if (x.origin === "seed") x.touched = true;
    if (msg) log(dd, { text: msg, sourceType: "task", sourceId: t.id, category: "Tasks" });
  });
  const mentionQuery = (() => { const m = comment.match(/@([\p{L}’']*)$/u); return m ? m[1].toLowerCase() : null; })();
  const mentionHits = mentionQuery === null ? [] : db.people.filter((x) => x.name.toLowerCase().includes(mentionQuery) || x.first.toLowerCase().startsWith(mentionQuery)).slice(0, 6);
  const pickMention = (pid: ID) => {
    const name = nameOf(db, pid);
    setComment((c) => c.replace(/@([\p{L}’']*)$/u, "@" + name + " "));
    setMentions((m) => (m.includes(pid) ? m : m.concat([pid])));
    commentRef.current?.focus();
  };
  const post = () => {
    const text = comment.trim();
    if (!text) return;
    const ids = db.people.filter((x) => text.includes("@" + x.name)).map((x) => x.id);
    addComment(t.id, text, Array.from(new Set(ids.concat(mentions.filter((m) => text.includes("@" + nameOf(db, m)))))));
    setComment(""); setMentions([]);
  };

  return (
    <Drawer ok={ok} onClose={close} eyebrow={t.id + " · " + (p?.short || "")} wide
      badges={<><Badge tone={t.status === "Done" ? "ok" : isOverdue(t, Date.now()) ? "bad" : ""}>{t.status}</Badge><PriorityBadge p={t.priority} /><TagChip tag={t.tag} /></>}
      title={<input className="tu-input" aria-label="Task title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} style={{ fontSize: 18, fontWeight: 600, height: 40, border: "1px solid transparent", padding: "0 6px", marginLeft: -7, background: "transparent" }} />}
      footer={askClose ? (
        <>
          <span className="tu-grow" style={{ fontSize: 13 }}><b>Unsaved changes.</b> Keep editing, or discard them?</span>
          <Btn onClick={() => setAskClose(false)} data-autofocus>Keep editing</Btn>
          <Btn kind="danger" onClick={() => closeOverlay(ok, true)}>Discard</Btn>
        </>
      ) : (
        <>
          <span className="tu-grow tu-small tu-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <Btn onClick={close}>Close</Btn>
          <Btn kind="primary" onClick={save} disabled={!dirty}>Save</Btn>
        </>
      )}>
      {err && <div className="tu-note bad" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {approval && approval.status === "Pending" && (
        <div className="tu-note warn" style={{ marginBottom: 14 }}>
          This task completes when <b>{approval.title}</b> is decided. <button className="tu-link" onClick={() => openApproval(approval.id)}>Open approval</button>
        </div>
      )}
      <div className="tu-grid tu-g3" style={{ gap: 10 }}>
        <Field label="Status">
          <select className="tu-select" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as TaskStatus })}>{TASK_STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Owner">
          <select className="tu-select" value={d.ownerId} onChange={(e) => setD({ ...d, ownerId: e.target.value })}>
            <option value="">Unassigned</option>{team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="tu-select" value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value as Priority })}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Due date" help={dl.text}>
          <input className="tu-input" type="date" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} />
        </Field>
        <Field label="Due time">
          <TimeSelect value={d.dueTime} end label="Due time" onChange={(x) => setD({ ...d, dueTime: x })} />
        </Field>
        <Field label="Tag">
          <select className="tu-select" value={d.tag} onChange={(e) => setD({ ...d, tag: e.target.value as Tag })}>{TAGS.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
      </div>
      <div className="tu-section">
        <Field label="Description">
          <textarea className="tu-textarea" value={d.description} placeholder="What needs to happen, and what done looks like" onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
      </div>

      <div className="tu-section">
        <div className="tu-eyebrow">Related records</div>
        <div className="tu-row tu-wrap" style={{ gap: 8 }}>
          {p && <Btn size="sm" icon="flag" onClick={() => openRef("project", p.id)}>{p.id} {p.short}</Btn>}
          {s && <Btn size="sm" icon="site" onClick={() => openRef("site", s.id)}>{s.name}</Btn>}
          {wa && <Btn size="sm" icon="site" onClick={() => openRef("workArea", wa.id)}>{wa.name}</Btn>}
          {permit && <Btn size="sm" icon="shield" onClick={() => openRef("permit", permit.id)}>{permit.id} · {permit.status}</Btn>}
          {rams.map((r) => <Btn key={r.id} size="sm" icon="doc" onClick={() => openRef("rams", r.id)}>{r.id} · {r.status}</Btn>)}
          {t.docIds.map((x) => <Btn key={x} size="sm" icon="doc" onClick={() => openRef("doc", x)}>{db.docs.find((y) => y.id === x)?.title || x}</Btn>)}
          {t.ticketId && <Btn size="sm" icon="ticket" onClick={() => openRef("ticket", t.ticketId!)}>{t.ticketId}</Btn>}
          {approval && <Btn size="sm" icon="check" onClick={() => openApproval(approval.id)}>{approval.id} · {approval.status}</Btn>}
        </div>
        {deps.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="tu-small tu-muted" style={{ marginBottom: 6 }}>Depends on</div>
            {deps.map((x) => (
              <div key={x.id} className="tu-row" style={{ padding: "6px 0" }}>
                <Icon name="link" size={13} /><Ref type="task" id={x.id} /><Badge tone={x.status === "Done" ? "ok" : "warn"}>{x.status}</Badge>
              </div>
            ))}
          </div>
        )}
        {permit && permit.status === "Pending decision" && (
          <div className="tu-note warn" style={{ marginTop: 10 }}>Conditional on {permit.id}: {permit.authority} decides by {fmtDateTime(permit.decisionDueAt)}. A calendar reservation does not satisfy this dependency.</div>
        )}
      </div>

      <div className="tu-section">
        <div className="tu-row"><div className="tu-eyebrow tu-grow">Checklist · {done} of {t.checklist.length}</div></div>
        <div className="tu-card" style={{ borderRadius: 12 }}>
          {t.checklist.map((c) => (
            <div key={c.id} className="tu-li" style={{ alignItems: "center", padding: "8px 12px" }}>
              <label className="tu-check tu-grow">
                <input type="checkbox" checked={c.done} onChange={() => setCk((x) => { const y = x.checklist.find((z) => z.id === c.id)!; y.done = !y.done; }, (c.done ? "Unticked " : "Ticked ") + "“" + c.text + "” on " + t.title)} />
                <span style={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? "var(--dim)" : "var(--ink)" }}>{c.text}</span>
              </label>
              <Btn kind="ghost" size="xs" icon="close" aria-label={"Remove " + c.text} onClick={() => setCk((x) => { x.checklist = x.checklist.filter((z) => z.id !== c.id); })} />
            </div>
          ))}
          <div className="tu-li" style={{ padding: "8px 12px" }}>
            <input className="tu-input" value={newItem} placeholder="Add an item and press Enter" aria-label="New checklist item"
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { e.preventDefault(); const text = newItem.trim(); setCk((x) => { x.checklist.push({ id: newId("CK"), text, done: false }); }); setNewItem(""); } }} />
          </div>
        </div>
      </div>

      <div className="tu-section">
        <div className="tu-eyebrow">Comments · {t.comments.length}</div>
        <div className="tu-stack" style={{ gap: 10 }}>
          {t.comments.map((c) => (
            <div key={c.id} className="tu-row" style={{ alignItems: "flex-start" }}>
              <Avatar person={db.people.find((x) => x.id === c.authorId)} size={26} />
              <div className="tu-grow">
                <div className="tu-small"><b>{nameOf(db, c.authorId)}</b> <span className="tu-faint">{ago(c.at)}</span></div>
                <div style={{ marginTop: 2 }}>{c.text}</div>
              </div>
            </div>
          ))}
          {!t.comments.length && <div className="tu-small tu-muted">No comments yet.</div>}
          <div style={{ position: "relative" }}>
            <textarea ref={commentRef} className="tu-textarea" style={{ minHeight: 64 }} value={comment} aria-label="Write a comment"
              placeholder="Write a comment. Type @ to mention someone." onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); if (e.key === "Enter" && mentionHits.length && !e.shiftKey) { e.preventDefault(); pickMention(mentionHits[0].id); } }} />
            {mentionHits.length > 0 && (
              <div className="tu-card" role="listbox" aria-label="Mention someone" style={{ position: "absolute", left: 0, bottom: "100%", marginBottom: 6, zIndex: 3, width: 280, padding: 4, boxShadow: "0 12px 30px rgba(8,19,42,.18)" }}>
                {mentionHits.map((x) => (
                  <button key={x.id} role="option" aria-selected={false} className="tu-rowbtn" style={{ borderTop: 0, padding: "7px 10px" }} onClick={() => pickMention(x.id)}>
                    <Avatar person={x} size={22} /><span className="tu-grow">{x.name}</span><span className="tu-small tu-faint">{x.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="tu-row" style={{ marginTop: 8 }}>
              <span className="tu-small tu-faint tu-grow">Mentions create an internal demo notification. Nothing is emailed.</span>
              <Btn size="sm" kind="navy" onClick={post} disabled={!comment.trim()}>Post comment</Btn>
            </div>
          </div>
        </div>
      </div>
      <div className="tu-section tu-small tu-faint">
        Created {t.origin === "seed" ? "in the demo scenario" : "in this session"}{t.completedAt ? " · completed " + fmtDateTime(t.completedAt) : ""} · Owner <PersonLink id={t.ownerId} showAvatar={false} />
      </div>
    </Drawer>
  );
}

export function TaskForm({ ok, prefill }: { ok: string; prefill: Record<string, unknown> }) {
  const db = useDB();
  const [f, setF] = useState({
    title: "", projectId: (prefill.projectId as string) || "", ownerId: (prefill.ownerId as string) || "", status: ((prefill.status as string) || "To Do") as TaskStatus,
    priority: "Normal" as Priority, tag: ((prefill.tag as string) || "Client") as Tag, dueDate: (prefill.dueDate as string) || addDays(todayKey(), 7), description: "",
  });
  const [tried, setTried] = useState(false);
  const errs = { title: !f.title.trim() ? "Give the task a title." : "", projectId: !f.projectId ? "Choose a project." : "", dueDate: !f.dueDate ? "Choose a due date." : "" };
  const bad = Object.values(errs).some(Boolean);
  const p = db.projects.find((x) => x.id === f.projectId);
  const people = p ? db.people.filter((x) => p.team.includes(x.id) || x.id === p.sponsorId) : db.people;
  const submit = () => {
    setTried(true);
    if (bad) return;
    const id = createTask({ title: f.title.trim(), projectId: f.projectId, ownerId: f.ownerId || null, status: f.status, priority: f.priority, tag: f.tag, dueAt: at(f.dueDate, 17, 0), description: f.description || undefined });
    closeOverlay(ok, true);
    openRef("task", id);
  };
  return (
    <Modal ok={ok} title="New task" sub="Creates a task in the shared records. It appears on the board, in Work and in search." onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)}>Cancel</Btn><Btn kind="primary" onClick={submit}>Create task</Btn></>}>
      <div className="tu-stack" style={{ gap: 12 }}>
        <Field label="Title" error={tried ? errs.title : ""}><input className="tu-input" data-autofocus value={f.title} aria-invalid={tried && !!errs.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} /></Field>
        <div className="tu-grid tu-g2" style={{ gap: 12 }}>
          <Field label="Project" error={tried ? errs.projectId : ""}>
            <select className="tu-select" value={f.projectId} aria-invalid={tried && !!errs.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">Choose a project</option>{db.projects.map((x) => <option key={x.id} value={x.id}>{x.id} {x.short}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select className="tu-select" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">Unassigned</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Status"><select className="tu-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}>{TASK_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Priority"><select className="tu-select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Tag"><select className="tu-select" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value as Tag })}>{TAGS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Due date" error={tried ? errs.dueDate : ""} help="Due at 17:00 local time"><input className="tu-input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <Field label="Description"><textarea className="tu-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** A compact task row used by lists across modules. */
export function TaskLine({ t, showProject = true, onToggle }: { t: Task; showProject?: boolean; onToggle?: () => void }) {
  const db = useDB();
  const dl = dueLabel(t.dueAt, t.status === "Done");
  return (
    <div className="tu-li click" onClick={() => openRef("task", t.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openRef("task", t.id); }} style={{ alignItems: "center" }}>
      {onToggle && (
        <input type="checkbox" aria-label={"Complete " + t.title} checked={t.status === "Done"} onClick={(e) => e.stopPropagation()} onChange={onToggle}
          style={{ width: 16, height: 16, accentColor: "var(--accent-fill)" }} />
      )}
      <div className="tu-grow">
        <div className="tu-ellipsis" style={{ fontWeight: 500, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? "var(--dim)" : undefined }}>{t.title}</div>
        <div className="tu-small tu-muted tu-ellipsis">{showProject ? (project(db, t.projectId)?.short || "") + " · " : ""}{t.status}</div>
      </div>
      <PriorityBadge p={t.priority} />
      <span className="tu-small" style={{ minWidth: 92, textAlign: "right", color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : "var(--dim)" }}>{dl.tone === "bad" && <Icon name="alert" size={12} style={{ marginRight: 4, verticalAlign: -2 }} />}{dl.text}</span>
      <Avatar person={db.people.find((x) => x.id === t.ownerId)} size={24} />
    </div>
  );
}
export { nowIso };
