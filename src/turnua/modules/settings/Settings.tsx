/* Settings: Organisation, Teams & Permissions, Systems & Integrations, Governance & AI, Experience. */
import { useState, type ReactNode } from "react";
import type { DB, Person } from "../../types";
import { useDB, resetDemo, useClock } from "../../store";
import { openOverlay, toast, navigate } from "../../ui";
import { saveSettings, simulateSync } from "../../actions";
import { Avatar, AvatarStack, Badge, Btn, Card, Icon, KV, Page, PersonLink, Select } from "../../kit";
import { ago, fmtDateTime, fmtKey, hhmm, todayKey } from "../../time";
import "../agents/agents.css";
import "./settings.css";

export function Switch({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: ReactNode; disabled?: boolean }) {
  return (
    <div className="st-switchrow">
      <div className="tu-grow">
        <div className="st-switchlabel">{label}</div>
        {sub && <div className="tu-small tu-muted" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      <button className="ag-switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
        <span className="ag-track" data-on={on ? "1" : "0"}><span className="ag-knob" /></span>
        <span className="tu-small" style={{ minWidth: 22 }}>{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/* ── organisation ────────────────────────────────────────────────── */
function Organisation({ db }: { db: DB }) {
  const o = db.org;
  return (
    <div className="tu-split">
      <div className="tu-stack">
        <Card pad={false}>
          <div className="st-brand">
            <img src="/turnua-logo.svg" alt="Turnua" width={201} height={36} />
            <div>
              <div className="st-brand-name">{o.product}</div>
              <div className="st-brand-sub">{o.descriptor}</div>
            </div>
          </div>
          <div className="tu-card-b">
            <KV items={[
              ["Trading name", o.name],
              ["Website", <a className="tu-link" href={o.website} target="_blank" rel="noopener noreferrer">turnua.com</a>],
              ["Address", o.address],
              ["Telephone (public office)", o.phone],
              ["General email (public)", o.email],
              ["Timezone", o.timezone + " (Irish time, daylight saving aware)"],
              ["Currency", o.currency + ", values exclude VAT"],
              ["Registered legal entity and CRO number", "Not verified, not shown"],
            ]} />
          </div>
        </Card>
        <Card title="Service lines" sub="As described on turnua.com">
          <div className="tu-row tu-wrap" style={{ gap: 8 }}>{o.serviceLines.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div>
          <div className="tu-section">
            <div className="tu-eyebrow">Operating regions</div>
            <div className="tu-row tu-wrap" style={{ gap: 8 }}>{o.regions.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</div>
          </div>
          <div className="tu-section">
            <div className="tu-eyebrow">Sectors</div>
            <div className="tu-row tu-wrap" style={{ gap: 8 }}>{o.sectors.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</div>
          </div>
        </Card>
      </div>
      <div className="tu-stack">
        <Card title="Workspace">
          <KV items={[
            ["Product", o.product + " · " + o.descriptor],
            ["Signed in as", "David Cox, Managing Director"],
            ["Demo team", db.people.length + " people (not total headcount)"],
            ["Records", db.projects.length + " projects · " + db.sites.length + " sites · " + db.assets.length + " assets"],
          ]} />
        </Card>
        <Card title="About this information">
          <p style={{ margin: 0, lineHeight: 1.6 }}>Public details come from turnua.com, reviewed 10 November 2026. The registered company name, CRO number, turnover and headcount were not verified and are deliberately left out.</p>
          <div className="tu-row" style={{ marginTop: 12 }}><Btn size="sm" onClick={() => navigate("/settings/experience")}>How the demo workspace works</Btn></div>
        </Card>
      </div>
    </div>
  );
}

/* ── teams and permissions ───────────────────────────────────────── */
const ROLES = ["MD", "PM", "Engineer", "HSEQ", "Commercial", "Viewer"] as const;
const CAPS: { cap: string; roles: string[] }[] = [
  { cap: "Approve commercial changes and recovery plans", roles: ["MD"] },
  { cap: "Approve training bookings and shift changes", roles: ["MD"] },
  { cap: "Raise change requests", roles: ["MD", "PM", "Commercial"] },
  { cap: "Create and edit tasks", roles: ["MD", "PM", "Engineer", "HSEQ", "Commercial"] },
  { cap: "Acknowledge and resolve helpdesk tickets", roles: ["MD", "Engineer"] },
  { cap: "Complete maintenance jobs and close findings", roles: ["MD", "Engineer", "HSEQ"] },
  { cap: "Approve RAMS and record permit decisions", roles: ["MD", "PM", "HSEQ"] },
  { cap: "View cost, burn and valuations", roles: ["MD", "PM", "Commercial"] },
  { cap: "Approve timesheets", roles: ["MD", "PM"] },
  { cap: "Change settings and integrations", roles: ["MD"] },
  { cap: "View projects, people and activity", roles: ["MD", "PM", "Engineer", "HSEQ", "Commercial", "Viewer"] },
];
const ROLE_OF: Record<Person["roleKey"], string> = { MD: "MD", Strategy: "PM", PM: "PM", Engineer: "Engineer", HSEQ: "HSEQ", Planner: "PM", Commercial: "Commercial" };

function Reports({ db, id, depth }: { db: DB; id: string; depth: number }) {
  const kids = db.people.filter((p) => p.reportsTo === id);
  if (!kids.length) return null;
  return (
    <ul className="st-tree" style={{ paddingLeft: depth ? 22 : 0 }}>
      {kids.map((p) => (
        <li key={p.id}>
          <div className="tu-row" style={{ gap: 8, padding: "5px 0" }}><PersonLink id={p.id} /><span className="tu-small tu-muted">{p.role}</span></div>
          <Reports db={db} id={p.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function Teams({ db }: { db: DB }) {
  const role = db.settings.rolePreview || "MD";
  const can = CAPS.filter((c) => c.roles.includes(role));
  const md = db.people.find((p) => p.id === "P01")!;
  return (
    <div className="tu-stack">
      <div className="st-teams">
        {db.teams.map((t) => {
          const members = db.people.filter((p) => p.teamId === t.id);
          return (
            <Card key={t.id} title={t.name} sub={t.blurb} right={<Badge tone="outline">{members.length}</Badge>}>
              <div className="tu-small tu-muted" style={{ marginBottom: 6 }}>Lead</div>
              <PersonLink id={t.leadId} />
              <div className="tu-small tu-muted" style={{ margin: "12px 0 6px" }}>Members</div>
              <div className="tu-stack" style={{ gap: 8 }}>{members.map((p) => <div key={p.id} style={{ minWidth: 0 }}><PersonLink id={p.id} /><div className="tu-small tu-faint tu-ellipsis" style={{ paddingLeft: 29 }}>{p.role}</div></div>)}</div>
            </Card>
          );
        })}
      </div>
      <div className="tu-split">
        <Card title="Role matrix (sample)" sub="What each demo role can do. Illustrative, for discussion." pad={false}>
          <div className="tu-tablewrap">
            <table className="tu-table st-matrix">
              <thead><tr><th>Capability</th>{ROLES.map((r) => <th key={r} style={{ textAlign: "center" }} className={r === role ? "st-col-on" : ""}>{r}</th>)}</tr></thead>
              <tbody>
                {CAPS.map((c) => (
                  <tr key={c.cap}>
                    <td>{c.cap}</td>
                    {ROLES.map((r) => (
                      <td key={r} style={{ textAlign: "center" }} className={r === role ? "st-col-on" : ""}>
                        {c.roles.includes(r) ? <span title="Allowed" style={{ color: "var(--ok)" }}><Icon name="check" size={14} stroke={2.2} /><span className="tu-sr">Allowed</span></span> : <span className="tu-faint" aria-label="Not allowed">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="tu-stack">
          <Card title="Preview as role" sub="Local UI simulation only">
            <Select label="Preview as role" hideLabel={false} value={role} onChange={(v) => saveSettings({ rolePreview: v }, "Role preview set to " + v)} options={ROLES.map((r) => r)} />
            <div className="tu-note" style={{ marginTop: 12 }}>
              Previewing as <b>{role}</b>: {can.length} of {CAPS.length} capabilities.
              <ul className="ag-lines" style={{ marginTop: 6 }}>{can.slice(0, 5).map((c) => <li key={c.cap}>{c.cap}</li>)}{can.length > 5 && <li>and {can.length - 5} more</li>}</ul>
            </div>
            <p className="tu-small tu-muted" style={{ marginBottom: 0 }}>This preview is a local UI simulation, not a security implementation. Authentication is unchanged and every screen stays available in the demo.</p>
          </Card>
          <Card title="Reporting lines">
            <div className="tu-row" style={{ gap: 8 }}><Avatar person={md} size={26} /><b>{md.name}</b><span className="tu-small tu-muted">{md.role}</span></div>
            <Reports db={db} id="P01" depth={1} />
          </Card>
          <Card title="Who has which role">
            <div className="tu-stack" style={{ gap: 6 }}>
              {ROLES.filter((r) => r !== "Viewer").map((r) => {
                const ids = db.people.filter((p) => ROLE_OF[p.roleKey] === r).map((p) => p.id);
                return <div key={r} className="tu-row"><span style={{ width: 92 }} className="tu-small">{r}</span><AvatarStack ids={ids} size={22} max={7} /><span className="tu-small tu-faint">{ids.length}</span></div>;
              })}
              <div className="tu-row"><span style={{ width: 92 }} className="tu-small">Viewer</span><span className="tu-small tu-faint">Client and partner read access (none set up)</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── systems and integrations ────────────────────────────────────── */
function Systems({ db }: { db: DB }) {
  const now = useClock();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tu-stack">
      <div className="tu-note accent">
        <b>No live connections.</b> Google Calendar and Microsoft Outlook are demo connections: syncs are simulated and nothing leaves this browser. The other systems are proposed integrations with sample mappings; Turnua’s current vendors are not confirmed. There are no OAuth grants or API keys in this workspace.
      </div>
      {db.settings.integrations.map((i) => {
        const demo = i.status === "Demo connection";
        const isOpen = open === i.id;
        return (
          <Card key={i.id}
            title={<span className="tu-row" style={{ gap: 10 }}><span className="st-int-ic"><Icon name={i.kind === "Calendar" ? "cal" : i.kind === "Monitoring" ? "bolt" : i.kind === "Documents" ? "doc" : "euro"} size={15} /></span><span><b>{i.name}</b><span className="tu-small tu-muted" style={{ display: "block", fontWeight: 400 }}>{i.kind} · {i.scope}</span></span></span>}
            right={<Badge tone={demo ? "accent" : "outline"} icon={demo ? "sync" : "clock"}>{i.status}</Badge>}>
            <div className="tu-row tu-wrap" style={{ gap: 10 }}>
              <span className="tu-small tu-muted tu-grow">{demo ? (i.lastSync ? "Last demo sync " + ago(i.lastSync, now) + " (" + fmtDateTime(i.lastSync) + ")" : "Not synced yet") : "Sample data mapping only. No connection exists."}</span>
              <Btn size="sm" icon={isOpen ? "chevU" : "chevD"} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.id)}>{isOpen ? "Hide mapping" : "View mapping"}</Btn>
              <Btn size="sm" kind={demo ? "navy" : ""} icon="sync" onClick={() => simulateSync(i.id)}>{demo ? "Simulate sync" : "Refresh sample mapping"}</Btn>
            </div>
            {isOpen && (
              <div className="tu-tablewrap" style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
                <table className="tu-table">
                  <thead><tr><th>{demo ? i.name + " field" : "Source record (sample)"}</th><th aria-label="maps to" /><th>Turnua OS record</th></tr></thead>
                  <tbody>{i.mapping.map((m, k) => <tr key={k}><td>{m.from}</td><td style={{ width: 30 }}><Icon name="arrowR" size={13} /></td><td>{m.to}</td></tr>)}</tbody>
                </table>
                <div className="tu-small tu-muted" style={{ padding: "8px 18px" }}>{demo ? "Read and write are simulated: events created in Turnua OS are not sent to any external calendar." : "Vendor not confirmed. This mapping is a proposal for discussion."}</div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ── governance and AI ───────────────────────────────────────────── */
const GOV: { k: string; label: string; sub: string }[] = [
  { k: "commercialApproval", label: "Human approval for commercial changes", sub: "Variations and priced change requests wait for the MD before baselines change." },
  { k: "recoveryApproval", label: "Human approval for recovery plans", sub: "Programme recovery proposals and their cost need a decision." },
  { k: "shiftChangeApproval", label: "Human approval for shift changes", sub: "On-call and crew reassignments are previewed before they save." },
  { k: "trainingApproval", label: "Human approval for training bookings", sub: "Refresher bookings route to an approver." },
  { k: "externalCommsApproval", label: "Human approval for external communication", sub: "Client reports and escalation notes stay as drafts until a person sends them. In this demo nothing is ever sent." },
];
const AGENT_PERMS: { k: string; label: string; sub: string }[] = [
  { k: "agentsCanDraftTasks", label: "Agents may draft tasks", sub: "Compliance and Commercial Control can create draft review tasks. Off withholds new drafts from runs started here." },
  { k: "agentsShowSources", label: "Show sources on every agent output", sub: "Runs list the records they read so answers can be checked." },
];
const RETENTION: [string, string][] = [["365", "1 year"], ["1095", "3 years"], ["2555", "7 years"], ["3650", "10 years"]];

function Governance({ db }: { db: DB }) {
  const [g, setG] = useState<Record<string, boolean>>({ ...db.settings.governance });
  const [ret, setRet] = useState(String(db.settings.retentionDays));
  const dirty = JSON.stringify(g) !== JSON.stringify(db.settings.governance) || ret !== String(db.settings.retentionDays);
  const save = () => saveSettings({ governance: g, retentionDays: Number(ret) }, "Governance & AI");
  return (
    <div className="tu-split">
      <div className="tu-stack">
        <Card title="Human approval" sub="Who must decide before an action takes effect">
          {GOV.map((x) => <Switch key={x.k} on={!!g[x.k]} label={x.label} sub={x.sub} onChange={(v) => setG({ ...g, [x.k]: v })} />)}
        </Card>
        <Card title="Agent permissions">
          {AGENT_PERMS.map((x) => <Switch key={x.k} on={!!g[x.k]} label={x.label} sub={x.sub} onChange={(v) => setG({ ...g, [x.k]: v })} />)}
          <div className="st-switchrow">
            <div className="tu-grow"><div className="st-switchlabel">Audit retention (example policy)</div><div className="tu-small tu-muted">How long activity and audit entries would be kept. Illustrative only.</div></div>
            <Select label="Audit retention" value={ret} onChange={setRet} options={RETENTION} />
          </div>
        </Card>
        <div className="tu-row st-savebar">
          <span className="tu-grow tu-small tu-muted">{dirty ? "Unsaved changes. Saving writes an audit entry." : "Saved. Changes are recorded in Activity, Audit."}</span>
          <Btn disabled={!dirty} onClick={() => { setG({ ...db.settings.governance }); setRet(String(db.settings.retentionDays)); }}>Discard</Btn>
          <Btn kind="primary" disabled={!dirty} onClick={save}>Save governance</Btn>
        </div>
      </div>
      <div className="tu-stack">
        <Card title="What each agent may do">
          <div className="tu-stack" style={{ gap: 10 }}>
            {db.agents.map((a) => (
              <button key={a.id} className="st-agentrow" onClick={() => openOverlay({ kind: "agent", id: a.id })}>
                <b>{a.name}</b><span className="tu-small tu-muted">{a.boundaries.join(" · ")}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Confidence and limitations">
          <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>Every agent run states a confidence (high, medium or low) and its limitations, for example that a recovery forecast assumes the supplier holds its revised date. Low confidence never triggers an action on its own.</p>
          <p style={{ margin: 0, lineHeight: 1.6 }}>Execution is demo-only: agents read local records, write runs, and propose approvals or draft tasks. They never send email, change a calendar outside this browser, or approve money.</p>
        </Card>
      </div>
    </div>
  );
}

/* ── experience ──────────────────────────────────────────────────── */
const NOTIF: { k: string; label: string }[] = [
  { k: "approvals", label: "Approvals waiting on me" }, { k: "p1", label: "P1 incidents" }, { k: "mentions", label: "Mentions in comments" },
  { k: "credentials", label: "Credential reviews due within 45 days" }, { k: "agentDigest", label: "Daily agent digest" },
];
function Experience({ db }: { db: DB }) {
  const now = useClock();
  const s = db.settings;
  const confirmReset = () => openOverlay({
    kind: "confirm", title: "Reset the demo?", danger: true, confirmLabel: "Reset demo",
    body: "This clears every local change made in this browser (tasks moved, approvals decided, events, bookings, messages, settings) and restores the canonical Turnua scenario with dates relative to today. It cannot be undone.",
    onConfirm: () => { resetDemo(); toast("Demo reset to the canonical scenario"); },
  });
  return (
    <div className="tu-split">
      <div className="tu-stack">
        <Card title="Demo workspace" sub="What is real and what is not">
          <ul className="ag-lines st-facts">
            <li>Projects, values, people details, tasks, incidents, assets and dates are fictional demo records built for this demonstration.</li>
            <li>Everything you change is stored locally in this browser. Nothing is written to a server.</li>
            <li>Google Calendar and Outlook syncs are simulated. No messages, invitations, emails or notifications leave the workspace.</li>
            <li>Public company details come from turnua.com, reviewed 10 November 2026. The registered legal entity, CRO number and turnover are not verified.</li>
            <li>The problems shown are discovery hypotheses, not facts confirmed with Turnua. The Rathdrum scenario is fictional; the public Rathdrum project is completed work.</li>
            <li>The twelve people are a demo team, not Turnua’s headcount. Live status is demo state, not tracking.</li>
            <li>The hyperscale client is kept confidential throughout.</li>
          </ul>
        </Card>
        <Card title="Reset demo">
          <p style={{ margin: "0 0 12px", lineHeight: 1.6 }}>Restore the canonical, coherent scenario. Useful between demonstrations. Local changes are cleared after you confirm.</p>
          <Btn kind="danger" icon="sync" onClick={confirmReset}>Reset demo</Btn>
        </Card>
      </div>
      <div className="tu-stack">
        <Card title="Appearance and accessibility">
          <div className="st-switchrow"><div className="tu-grow"><div className="st-switchlabel">Theme</div><div className="tu-small tu-muted">Use the sun and moon button in the top bar to switch between Turnua light and Turnua dark.</div></div><Icon name="M12 4.2V2.6 M12 21.4v-1.6 M4.2 12H2.6 M21.4 12h-1.6 M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Z" size={18} /></div>
          <Switch on={s.reducedMotion} label="Reduce motion" sub="Turns off decorative animation. The system setting is also respected." onChange={(v) => saveSettings({ reducedMotion: v }, "Reduce motion " + (v ? "on" : "off"))} />
          <div className="st-switchrow"><div className="tu-grow"><div className="st-switchlabel">Date and time display</div><div className="tu-small tu-muted">Irish dates, 24-hour times, Europe/Dublin with daylight saving. Example: {fmtKey(todayKey(), { long: true })}, {hhmm(new Date(now).toISOString())}.</div></div></div>
        </Card>
        <Card title="Notifications" sub="In-app demo notifications only">
          {NOTIF.map((n) => <Switch key={n.k} on={!!s.notifications[n.k]} label={n.label} onChange={(v) => saveSettings({ notifications: { ...s.notifications, [n.k]: v } }, "Notification preference: " + n.label + " " + (v ? "on" : "off"))} />)}
        </Card>
      </div>
    </div>
  );
}

const TITLES: Record<string, [string, string]> = {
  organisation: ["Organisation", "Turnua’s public details and the shape of this workspace."],
  teams: ["Teams & Permissions", "Departments, reporting lines and a sample role matrix."],
  systems: ["Systems & Integrations", "Demo connections and proposed integrations, clearly labelled."],
  governance: ["Governance & AI", "Human approval, agent permissions and audit."],
  experience: ["Experience", "Appearance, accessibility, notifications and the demo workspace."],
};

export default function SettingsModule({ tab }: { tab: string }) {
  const db = useDB();
  const [title, sub] = TITLES[tab] || TITLES.organisation;
  return (
    <Page title={title} sub={sub} eyebrow="Settings">
      {tab === "teams" ? <Teams db={db} /> : tab === "systems" ? <Systems db={db} /> : tab === "governance" ? <Governance key={JSON.stringify(db.settings.governance) + db.settings.retentionDays} db={db} /> : tab === "experience" ? <Experience db={db} /> : <Organisation db={db} />}
    </Page>
  );
}
