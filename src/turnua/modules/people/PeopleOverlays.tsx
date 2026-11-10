/* People overlays: refresher booking, evidence-based cover finder, internal messages. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, Person } from "../../types";
import { useDB, update, newId, nowIso } from "../../store";
import { closeOverlay, navigate, openOverlay, setPrefs } from "../../ui";
import { assignCover, bookTraining, sendMessage, log } from "../../actions";
import { Avatar, Badge, Btn, Drawer, Empty, Field, Icon, KV, Modal, PersonLink, Progress, openRef } from "../../kit";
import { addDays, at, ago, dueLabel, fmtDate, fmtDateTime, fmtKey, hhmm, keyOf, todayKey, weekdayOf } from "../../time";
import { TimeSelect } from "../calendar/TimeSelect";
import { availabilityOn, credState, involves, nameOf, occurrences, project, utilisation, utilTone, isOpen } from "../../selectors";

/** The live training booking for a credential, whether linked from the credential or the request. */
export function bookingFor(db: ReturnType<typeof useDB>, c?: { id: string; bookingId?: string }) {
  if (!c) return undefined;
  return db.training.find((t) => (t.id === c.bookingId || t.credentialId === c.id) && t.status !== "Rejected");
}
/** Next working day on or after a date key. */
export function workday(k: string): string {
  let x = k;
  while (weekdayOf(x) > 4) x = addDays(x, 1);
  return x;
}

/* ── book refresher ──────────────────────────────────────────────── */
export function BookingForm({ ok, credentialId }: { ok: string; credentialId: string }) {
  const db = useDB();
  const c = db.credentials.find((x) => x.id === credentialId);
  const today = todayKey();
  const [bookedId, setBookedId] = useState<string | null>(null);
  const providers = Array.from(new Set(["Kildare Safety Training (Demo)", ...db.suppliers.filter((s) => /training/i.test(s.category)).map((s) => s.name), "Internal HSEQ session (Turnua)"]));
  const [f, setF] = useState(() => {
    const dueK = c?.dueAt ? keyOf(Date.parse(c.dueAt)) : addDays(today, 30);
    let k = addDays(dueK, -7);
    if (k <= today) k = addDays(today, 2);
    return { course: c ? c.name.replace(/\s*(renewal|refresher)\s*/i, " ").replace(/\s+/g, " ").trim() + " refresher course" : "", provider: providers[0], date: workday(k), time: "08:30", approveNow: true };
  });
  const [tried, setTried] = useState(false);
  if (!c) return <Modal ok={ok} title="Credential not found" onClose={() => closeOverlay(ok, true)}><p className="tu-muted">This credential is not in the demo records.</p></Modal>;
  const p = db.people.find((x) => x.id === c.personId)!;
  const st = credState(c, Date.now());
  const existing = bookingFor(db, c);
  const errs = {
    course: !f.course.trim() ? "Enter the course." : "",
    provider: !f.provider.trim() ? "Choose a provider." : "",
    date: !f.date ? "Choose a date." : f.date < today ? "Choose today or a later date." : "",
  };
  const bad = Object.values(errs).some(Boolean);
  const afterDue = c.dueAt && f.date > keyOf(Date.parse(c.dueAt));
  const dayOcc = f.date ? occurrences(db, f.date, addDays(f.date, 1)).filter((o) => involves(o, p.id) && o.type !== "On call") : [];
  const av = f.date ? availabilityOn(db, f.date).find((a) => a.person.id === p.id) : undefined;
  const save = () => {
    setTried(true);
    if (bad) return;
    const [hh, mm] = f.time.split(":").map(Number);
    const id = bookTraining({ credentialId: c.id, course: f.course.trim(), provider: f.provider, date: at(f.date, hh || 8, mm || 0), approveNow: f.approveNow });
    setBookedId(id);
  };
  const booked = bookedId ? db.training.find((t) => t.id === bookedId) : undefined;
  if (booked) {
    return (
      <Modal ok={ok} title={booked.status === "Booked" ? "Training booked" : "Training request sent"} onClose={() => closeOverlay(ok, true)}
        footer={<>
          <Btn onClick={() => { closeOverlay(ok, true); setPrefs({ calPeople: [p.id], calDate: keyOf(Date.parse(booked.date)) }); navigate("/calendar/day?d=" + keyOf(Date.parse(booked.date))); }}>Open in calendar</Btn>
          <Btn kind="navy" icon="user" onClick={() => { closeOverlay(ok, true); openOverlay({ kind: "cover", personId: p.id, credentialId: c.id }); }}>Find cover for {fmtKey(keyOf(Date.parse(booked.date)))}</Btn>
          <Btn kind="primary" onClick={() => closeOverlay(ok, true)}>Done</Btn>
        </>}>
        <div className="tu-note accent">{booked.course} for {p.name} with {booked.provider}, {fmtDateTime(booked.date)}. {booked.status === "Booked" ? "Approved by David Cox and added to the calendar." : "Waiting for approval in Work, Approvals; the calendar block is provisional."}</div>
        <div className="tu-note warn" style={{ marginTop: 10 }}><b>The credential is not renewed yet.</b> {c.name} still shows as due {fmtDate(c.dueAt)} until renewal evidence is uploaded after the course.</div>
        <p className="tu-small tu-muted" style={{ marginBottom: 0 }}>Next: arrange qualified cover for the day so {p.first}’s work keeps moving.</p>
      </Modal>
    );
  }
  return (
    <Modal ok={ok} title="Book refresher training" sub={p.name + ", " + c.name} onClose={() => closeOverlay(ok, true)}
      footer={<><Btn onClick={() => closeOverlay(ok, true)}>Cancel</Btn><Btn kind="primary" icon="cal" onClick={save} disabled={!!existing}>{f.approveNow ? "Book training" : "Send for approval"}</Btn></>}>
      <div className="tu-stack" style={{ gap: 12 }}>
        <KV items={[["Attendee", <PersonLink id={p.id} />], ["Current status", <Badge tone={st.tone === "plain" ? "" : st.tone}>{st.label}</Badge>], [c.dueKind === "No expiry" ? "Expiry" : c.dueKind, c.dueAt ? fmtDate(c.dueAt) : "No expiry"], ["Required for", c.requiredFor?.join(", ") || "General"]]} />
        {existing && <div className="tu-note">Already {existing.status.toLowerCase()}: {existing.course}, {fmtDateTime(existing.date)}. Open the credential to see the booking.</div>}
        <Field label="Course" error={tried ? errs.course : ""}><input className="tu-input" data-autofocus value={f.course} aria-invalid={tried && !!errs.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></Field>
        <div className="tu-grid tu-g3" style={{ gap: 10 }}>
          <Field label="Provider" error={tried ? errs.provider : ""}><select className="tu-select" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{providers.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Date" error={tried ? errs.date : ""} help={f.date ? fmtKey(f.date, { year: true }) : undefined}><input className="tu-input" type="date" min={today} value={f.date} aria-invalid={tried && !!errs.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Start time" help="Course blocks 7 hours"><TimeSelect value={f.time} onChange={(v) => setF({ ...f, time: v })} /></Field>
        </div>
        {afterDue && <div className="tu-note warn">This date is after the {c.dueKind.toLowerCase()} date ({fmtDate(c.dueAt)}). The credential would be overdue before the course.</div>}
        {av && av.state === "Unavailable" && <div className="tu-note bad">{p.first} is unavailable on {fmtKey(f.date)}: {av.reasons.join("; ")}.</div>}
        {dayOcc.length > 0 && (
          <div className="tu-note warn">
            <b>{p.first} already has {dayOcc.length} calendar item{dayOcc.length === 1 ? "" : "s"} on {fmtKey(f.date)}:</b>
            {dayOcc.slice(0, 5).map((o) => <div key={o.key} className="tu-small">{o.allDay ? "All day" : hhmm(o.start) + " to " + hhmm(o.end)} · <button className="tu-link" onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })}>{o.title}</button></div>)}
          </div>
        )}
        <label className="tu-check"><input type="checkbox" checked={f.approveNow} onChange={(e) => setF({ ...f, approveNow: e.target.checked })} />Approve now as David Cox (MD)</label>
        <p className="tu-small tu-muted" style={{ margin: 0 }}>Booking adds a training block to {p.first}’s calendar and an approval record. It does not renew the credential; that needs renewal evidence afterwards. Certification due dates are demo assumptions, not compliance advice.</p>
      </div>
    </Modal>
  );
}

/* ── find cover ──────────────────────────────────────────────────── */
const REQ_KIND: [RegExp, string][] = [
  [/height|mewp/i, "IPAF"], [/electric/i, "Safe Electric-related training"], [/fibre|splic|otdr|cabling/i, "BICSI"],
  [/chapter 8|traffic/i, "Chapter 8"], [/confined/i, "Confined Space"], [/cooling/i, "F-Gas"],
];
const reqFor = (skill: string) => (REQ_KIND.find(([re]) => re.test(skill)) || [/$^/, ""])[1];
const skillMatch = (p: Person, skill: string) => p.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(s.toLowerCase()));

export function CoverDrawer({ ok, personId, credentialId }: { ok: string; personId?: string; credentialId?: string }) {
  const db = useDB();
  const cred = credentialId ? db.credentials.find((c) => c.id === credentialId) : undefined;
  const absentId = personId || cred?.personId || "";
  const absent = db.people.find((p) => p.id === absentId);
  const booking = bookingFor(db, cred);
  const today = todayKey();
  const [date, setDate] = useState(() => booking ? keyOf(Date.parse(booking.date)) : workday(addDays(today, 1)));
  const defaultSkill = useMemo(() => {
    if (!absent) return "";
    return absent.skills.find((s) => db.people.some((p) => p.id !== absent.id && skillMatch(p, s))) || absent.skills[0] || "";
  }, [absent, db.people]);
  const [skill, setSkill] = useState(defaultSkill);
  const [req, setReq] = useState(() => reqFor(defaultSkill));
  const [pick, setPick] = useState<ID>("");
  const [chosenTasks, setChosenTasks] = useState<ID[] | null>(null);
  const [addBlock, setAddBlock] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setPick(""); }, [date, skill, req]);

  if (!absent) return <Drawer ok={ok} title="Find cover" onClose={() => closeOverlay(ok)}><Empty title="Choose a person first">Open Find cover from a person, a credential or the Capacity view.</Empty></Drawer>;

  const av = availabilityOn(db, date, skill);
  const kinds = Array.from(new Set(db.credentials.map((c) => c.kind))).sort();
  const rows = db.people.filter((p) => p.id !== absent.id).map((p) => {
    const a = av.find((x) => x.person.id === p.id)!;
    const hasSkill = !skill || skillMatch(p, skill);
    const credOk = !req || db.credentials.some((c) => c.personId === p.id && c.kind === req && (c.renewedAt || !c.dueAt || keyOf(Date.parse(c.dueAt)) >= date));
    const why: string[] = [];
    if (a.state === "Unavailable") why.push(a.reasons[0] || "Unavailable");
    if (!hasSkill) why.push("No recorded " + skill.toLowerCase() + " skill");
    if (!credOk) why.push("No valid " + req + " credential on " + fmtKey(date));
    return { p, a, ok: why.length === 0, why };
  });
  const order = { Available: 0, "Partly booked": 1, Unavailable: 2 } as Record<string, number>;
  const shortlist = rows.filter((r) => r.ok).sort((x, y) => order[x.a.state] - order[y.a.state] || x.a.load - y.a.load);
  const excluded = rows.filter((r) => !r.ok);
  const openTasks = db.tasks.filter((t) => t.ownerId === absent.id && isOpen(t)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const windowEnd = addDays(date, 3);
  const defaultTasks = openTasks.filter((t) => { const k = keyOf(Date.parse(t.dueAt)); return k >= date && k <= windowEnd; }).map((t) => t.id);
  const tasks = chosenTasks ?? defaultTasks;
  const cand = shortlist.find((r) => r.p.id === pick);
  const candDay = cand ? occurrences(db, date, addDays(date, 1)).filter((o) => involves(o, cand.p.id)) : [];
  const extra = openTasks.filter((t) => tasks.includes(t.id)).reduce((n, t) => n + (t.estimate || 4), 0);
  const loadNow = cand ? utilisation(db, cand.p) : 0;
  const loadAfter = cand ? (loadNow * cand.p.available + extra) / cand.p.available : 0;
  const reason = "cover for " + absent.name + " on " + fmtKey(date) + (cred ? " (" + cred.name + " training)" : "");

  const save = () => {
    if (!cand) return;
    if (tasks.length) assignCover(tasks, cand.p.id, reason);
    if (addBlock) {
      update((d) => {
        const id = newId("EV");
        const pid = openTasks.find((t) => tasks.includes(t.id))?.projectId;
        d.events.push({ id, title: "Cover for " + absent.name + (pid ? " (" + (project(d, pid)?.short || pid) + ")" : ""), type: "Site visit", ownerId: cand.p.id, attendeeIds: [cand.p.id],
          start: at(date, 8, 0), end: at(date, 16, 30), location: pid ? (project(d, pid)?.location || "") : absent.base, projectId: pid, origin: "user",
          notes: "Cover assignment created from People, Find cover. " + (cred ? cred.name + " booking does not renew the credential." : "") });
        log(d, { text: "Added cover block for " + cand.p.name + " on " + fmtKey(date) + " (" + reason + ")", sourceType: "event", sourceId: id, category: "Calendar" });
      });
    }
    setSaved(true);
  };

  if (saved && cand) {
    return (
      <Drawer ok={ok} onClose={() => closeOverlay(ok, true)} eyebrow="Cover assigned" title={cand.p.name + " covers " + absent.first + " on " + fmtKey(date)}
        footer={<><Btn onClick={() => { closeOverlay(ok, true); setPrefs({ calPeople: [cand.p.id, absent.id] }); navigate("/calendar/day?d=" + date); }}>Open calendar</Btn><Btn kind="primary" onClick={() => closeOverlay(ok, true)}>Done</Btn></>}>
        <div className="tu-note accent">{tasks.length ? tasks.length + " task" + (tasks.length === 1 ? "" : "s") + " reassigned to " + cand.p.name + ". " : ""}{addBlock ? "A cover block is on " + cand.p.first + "’s calendar. " : ""}The change is in the activity log; {cand.p.first} gets an internal demo notification.</div>
        {cred && <div className="tu-note warn" style={{ marginTop: 10 }}>{absent.first}’s {cred.name} still awaits renewal evidence after the course.</div>}
      </Drawer>
    );
  }

  return (
    <Drawer ok={ok} wide onClose={() => closeOverlay(ok)} eyebrow="Find cover" title={"Cover for " + absent.name}
      footer={<>
        <span className="tu-grow tu-small tu-muted">{cand ? "Assign " + cand.p.name + (tasks.length ? " and reassign " + tasks.length + " task" + (tasks.length === 1 ? "" : "s") : "") : "Pick someone from the shortlist to preview the change."}</span>
        <Btn onClick={() => closeOverlay(ok)}>Cancel</Btn>
        <Btn kind="primary" icon="check" disabled={!cand || (!tasks.length && !addBlock)} onClick={save}>Save cover</Btn>
      </>}>
      {cred && <div className="tu-note" style={{ marginBottom: 12 }}>{absent.first} is away for {cred.name}{booking ? " on " + fmtDateTime(booking.date) + " (" + booking.status.toLowerCase() + ")" : ""}. Training booked is not certification renewed.</div>}
      <div className="tu-grid tu-g3" style={{ gap: 10 }}>
        <Field label="Date needed" help={fmtKey(date, { year: true })}><input className="tu-input" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <Field label="Skill needed">
          <select className="tu-select" value={skill} onChange={(e) => { setSkill(e.target.value); setReq(reqFor(e.target.value)); }}>
            {absent.skills.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Credential required">
          <select className="tu-select" value={req} onChange={(e) => setReq(e.target.value)}>
            <option value="">None</option>{kinds.map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">Shortlist · {shortlist.length}</div>
        {shortlist.length ? (
          <div className="tu-card" role="radiogroup" aria-label="Cover candidates" style={{ borderRadius: 12 }}>
            {shortlist.map((r) => (
              <label key={r.p.id} className="tu-li" style={{ alignItems: "flex-start", cursor: "pointer", background: pick === r.p.id ? "var(--accent-faint)" : undefined }}>
                <input type="radio" name={ok + "-cand"} checked={pick === r.p.id} onChange={() => setPick(r.p.id)} style={{ marginTop: 4, accentColor: "var(--accent-fill)" }} />
                <Avatar person={r.p} size={28} />
                <div className="tu-grow">
                  <div style={{ fontWeight: 600 }}>{r.p.name} <span className="tu-small tu-muted">{r.p.role}</span></div>
                  <div className="tu-small tu-muted">{r.a.reasons.length ? r.a.reasons.join("; ") : "No bookings in the working window"} · planned load {Math.round(r.a.load * 100)}%</div>
                </div>
                <Badge tone={r.a.state === "Available" ? "ok" : "warn"}>{r.a.state}</Badge>
              </label>
            ))}
          </div>
        ) : <div className="tu-card" style={{ borderRadius: 12 }}><Empty title="Nobody qualifies on this date">Try another date, a different skill, or drop the credential requirement if the work allows it.</Empty></div>}
        {excluded.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="tu-small" style={{ cursor: "pointer", color: "var(--dim)" }}>Not recommended · {excluded.length} people, with reasons</summary>
            <div className="tu-stack" style={{ gap: 4, marginTop: 8 }}>
              {excluded.map((r) => <div key={r.p.id} className="tu-small"><b>{r.p.name}</b>: {r.why.join("; ")}</div>)}
            </div>
          </details>
        )}
      </div>
      <div className="tu-section">
        <div className="tu-eyebrow">{absent.first}’s open work to hand over</div>
        {openTasks.length ? (
          <div className="tu-card" style={{ borderRadius: 12 }}>
            {openTasks.map((t) => {
              const dl = dueLabel(t.dueAt, false);
              return (
                <label key={t.id} className="tu-li" style={{ alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={tasks.includes(t.id)} onChange={() => setChosenTasks(tasks.includes(t.id) ? tasks.filter((x) => x !== t.id) : tasks.concat([t.id]))} style={{ accentColor: "var(--accent-fill)" }} />
                  <span className="tu-grow tu-ellipsis">{t.title} <span className="tu-small tu-muted">· {project(db, t.projectId)?.short}</span></span>
                  <span className="tu-small" style={{ color: dl.tone === "bad" ? "var(--bad)" : dl.tone === "warn" ? "var(--warn)" : "var(--dim)" }}>{dl.text}</span>
                </label>
              );
            })}
          </div>
        ) : <div className="tu-small tu-muted">No open tasks assigned.</div>}
        {!defaultTasks.length && openTasks.length > 0 && chosenTasks === null && <p className="tu-small tu-muted">Nothing is due between {fmtKey(date)} and {fmtKey(windowEnd)}, so no tasks are pre-selected.</p>}
        <label className="tu-check" style={{ marginTop: 10 }}><input type="checkbox" checked={addBlock} onChange={(e) => setAddBlock(e.target.checked)} />Add a cover block (08:00 to 16:30) to the cover person’s calendar</label>
      </div>
      {cand && (
        <div className="tu-section">
          <div className="tu-eyebrow">Preview for {cand.p.name}</div>
          <div className="tu-grid tu-g2" style={{ gap: 10 }}>
            <div className="tu-card" style={{ padding: 12, borderRadius: 12 }}>
              <div className="tu-small tu-muted">Planned load</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: "var(--" + utilTone(loadAfter) + ")" }}>{Math.round(loadNow * 100)}% to {Math.round(loadAfter * 100)}%</div>
              <Progress value={Math.min(1, loadAfter)} tone={utilTone(loadAfter) as "ok" | "warn" | "bad"} label="Planned load after cover" />
              <div className="tu-small tu-muted" style={{ marginTop: 6 }}>Adds about {extra}h of estimated task work.</div>
              {loadAfter > 0.95 && <div className="tu-small" style={{ color: "var(--bad)", marginTop: 4 }}>Above 95%: consider handing over fewer tasks.</div>}
            </div>
            <div className="tu-card" style={{ padding: 12, borderRadius: 12 }}>
              <div className="tu-small tu-muted">{cand.p.first}’s calendar on {fmtKey(date)}</div>
              {candDay.length ? candDay.map((o) => (
                <div key={o.key} className="tu-small" style={{ marginTop: 4 }}>
                  <button className="tu-link" onClick={() => openOverlay({ kind: "event", id: o.eventId, date: o.date })}>{o.title}</button> {o.allDay ? "all day" : hhmm(o.start) + " to " + hhmm(o.end)}
                  {addBlock && !o.allDay && o.type !== "On call" && Date.parse(o.start) < Date.parse(at(date, 16, 30)) && Date.parse(o.end) > Date.parse(at(date, 8)) ? <Badge tone="warn">Overlaps cover</Badge> : null}
                </div>
              )) : <div className="tu-small" style={{ marginTop: 4 }}>Nothing booked.</div>}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ── internal messages ───────────────────────────────────────────── */
export function MessageDrawer({ ok, personId }: { ok: string; personId: string }) {
  const db = useDB();
  const p = db.people.find((x) => x.id === personId);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const thread = db.messages.filter((m) => m.withId === personId).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [thread.length]);
  if (!p) return <Drawer ok={ok} title="Person not found" onClose={() => closeOverlay(ok)}><p className="tu-muted">Not in the demo records.</p></Drawer>;
  const send = () => { const t = text.trim(); if (!t) return; sendMessage(p.id, t); setText(""); };
  return (
    <Drawer ok={ok} onClose={() => closeOverlay(ok)} eyebrow="Internal message · demo" badges={<Badge>{p.status}</Badge>}
      title={<span className="tu-row"><Avatar person={p} size={30} />{p.name}</span>}
      footer={<div style={{ width: "100%" }}>
        <label className="tu-sr" htmlFor={ok + "-msg"}>Message {p.first}</label>
        <textarea id={ok + "-msg"} className="tu-textarea" data-autofocus style={{ minHeight: 60 }} value={text} placeholder={"Message " + p.first + ". Enter to send, Shift and Enter for a new line."}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="tu-row" style={{ marginTop: 8 }}>
          <span className="tu-grow tu-small tu-muted">Saved in this demo workspace only. Nothing is sent outside it.</span>
          <Btn kind="primary" icon="arrowR" onClick={send} disabled={!text.trim()}>Send</Btn>
        </div>
      </div>}>
      <div className="tu-stack" style={{ gap: 10 }}>
        {thread.length ? thread.map((m) => {
          const mine = m.fromId === "P01";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%" }}>
                <div style={{ padding: "9px 13px", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: mine ? "var(--accent-fill)" : "var(--surface-2)", color: mine ? "var(--on-accent)" : "var(--ink)", border: mine ? 0 : "1px solid var(--border)", lineHeight: 1.5 }}>{m.text}</div>
                <div className="tu-small tu-faint" style={{ marginTop: 3, textAlign: mine ? "right" : "left" }}>{mine ? "You" : nameOf(db, m.fromId).split(" ")[0]} · {ago(m.at)}</div>
              </div>
            </div>
          );
        }) : <Empty title={"No messages with " + p.first + " yet"}>Start a conversation below.</Empty>}
        <div ref={endRef} />
      </div>
      <div className="tu-row" style={{ marginTop: 16, gap: 8 }}>
        <Icon name="link" size={13} /><button className="tu-link" onClick={() => openRef("person", p.id)}>Open {p.first}’s profile</button>
      </div>
    </Drawer>
  );
}
export { nowIso };
