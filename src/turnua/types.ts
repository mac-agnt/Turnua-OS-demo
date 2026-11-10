/* Canonical Turnua OS demo model. Every entity has a stable ID and links by ID. */

export type ID = string;
export type Origin = "seed" | "user";

export type Health = "On track" | "At risk" | "Off track";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "QA / Sign Off" | "Done";
export const TASK_STATUSES: TaskStatus[] = ["Backlog", "To Do", "In Progress", "QA / Sign Off", "Done"];
export type Priority = "Urgent" | "High" | "Normal" | "Low";
export const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];
export type Tag = "Civils" | "Permits" | "Safety" | "Splicing" | "QA" | "PPM" | "Commercial" | "Procurement" | "Client" | "Design";
export const TAGS: Tag[] = ["Civils", "Permits", "Safety", "Splicing", "QA", "PPM", "Commercial", "Procurement", "Client", "Design"];
export type TicketPriority = "P1" | "P2" | "P3" | "P4";
export type PersonStatus = "On site" | "In office" | "In a meeting" | "On leave" | "On call";

export interface Organisation {
  name: string; product: string; descriptor: string; website: string; logo: string;
  address: string; phone: string; email: string; timezone: string; currency: string;
  serviceLines: string[]; regions: string[]; sectors: string[];
}

export interface Team { id: ID; name: string; leadId: ID; blurb: string }

export interface Person {
  id: ID; name: string; first: string; initials: string; role: string; teamId: ID;
  status: PersonStatus; location: string; base: string; startYear: number; reportsTo: ID | null;
  email: string; ext: string; skills: string[]; available: number; color: string;
  roleKey: "MD" | "Strategy" | "PM" | "Engineer" | "HSEQ" | "Planner" | "Commercial";
}

export interface Allocation { id: ID; personId: ID; projectId: ID | null; label: string; hours: number }

export interface Credential {
  id: ID; personId: ID; name: string; kind: string;
  issuedAt?: string; dueAt?: string;
  dueKind: "Expiry" | "Renewal" | "Review due" | "Refresher due" | "No expiry";
  evidenceDocId?: ID; requiredFor?: string[]; bookingId?: ID; renewedAt?: string;
}

export interface Client {
  id: ID; name: string; kind: string; sector: string; confidential?: boolean;
  summary: string; since: string;
}
export interface Contact {
  id: ID; name: string; role: string; clientId?: ID; supplierId?: ID; email: string; phone: string; notes?: string;
}
export interface PurchaseOrder {
  id: ID; supplierId: ID; projectId: ID; description: string; value: number;
  orderedAt: string; dueAt: string; revisedDueAt?: string; deliveredAt?: string;
  status: "On order" | "Late" | "Delivered" | "Part delivered";
  history: { at: string; note: string }[];
}
export interface Supplier {
  id: ID; name: string; category: string; contactId: ID; rating: string; summary: string;
}

export interface Phase {
  id: ID; projectId: ID; name: string; note?: string;
  start: string; end: string; baselineEnd: string; pct: number;
}
export interface Milestone {
  id: ID; projectId: ID; name: string; dueAt: string; baselineAt: string; ownerId: ID;
  completedAt?: string; dependsOn: ID[]; handover?: boolean; conditional?: string;
}
export interface WorkArea { id: ID; projectId: ID; name: string; location: string }

export interface Project {
  id: ID; name: string; short: string; clientId: ID; service: string; location: string;
  pmId: ID; techLeadId?: ID; sponsorId: ID; team: ID[];
  model: "Works contract" | "Managed service" | "Internal budget";
  contractValue: number | null; budget: number | null; cost: number | null;
  progress: number; progressLabel: string; health: Health;
  startAt: string; baselineFinish: string; forecastFinish: string;
  scenario?: { label: string; finish: string; state: "Proposed" | "Approved" | "Rejected" };
  blocker?: string; siteIds: ID[]; workAreaIds: ID[];
  update: { authorId: ID; at: string; text: string };
  safety: { lastLtiAt: string; toolboxTalks: number; toolboxThisWeek: number };
  origin: Origin;
}

export interface ChecklistItem { id: ID; text: string; done: boolean }
export interface Comment { id: ID; authorId: ID; text: string; at: string; mentions: ID[] }

export interface Task {
  id: ID; title: string; projectId: ID; ownerId: ID | null; dept: string;
  status: TaskStatus; lastActive?: TaskStatus; priority: Priority; tag: Tag;
  dueAt: string; startAt?: string; order: number; estimate?: number;
  checklist: ChecklistItem[]; comments: Comment[];
  siteId?: ID; workAreaId?: ID; docIds: ID[]; dependsOn: ID[];
  permitId?: ID; ticketId?: ID; approvalId?: ID; maintenanceId?: ID; findingId?: ID;
  description?: string; completedAt?: string; origin: Origin; touched?: boolean;
}

export interface Risk {
  id: ID; projectId: ID; title: string; probability: number; impact: number;
  mitigation: string; ownerId: ID; reviewAt: string; status: "Open" | "Mitigating" | "Closed";
}
export interface Permit {
  id: ID; projectId: ID; workAreaId: ID; name: string; authority: string;
  status: "Pending decision" | "Approved" | "Refused" | "Granted with conditions";
  appliedAt: string; decisionDueAt: string; expiresAt?: string;
  blockedTaskIds: ID[]; docId: ID; escalatedAt?: string;
  decision?: { at: string; outcome: string; reference: string; provenance: string; recordedBy: ID };
}
export interface Rams {
  id: ID; projectId: ID; title: string; status: "Approved" | "In review" | "Draft";
  reviewAt: string; ownerId: ID; docId: ID; workAreaId?: ID; taskIds: ID[];
}
export interface ChangeRequest {
  id: ID; projectId: ID; title: string; kind: "Variation" | "Recovery proposal";
  amount: number | null; status: "Draft" | "Awaiting approval" | "Approved" | "Rejected";
  ownerId: ID; raisedAt: string; decidedAt?: string; evidenceDocIds: ID[];
  approvalId?: ID; effect: string; reason: string;
}
export interface Valuation {
  id: ID; projectId: ID; period: string; amount: number; reviewAt: string;
  status: "Draft" | "In review" | "Submitted"; readiness: number; evidence: string[];
}

export interface Site {
  id: ID; name: string; clientId: ID; projectId: ID; type: string; leadId: ID; location: string;
  indicator: { label: string; value: string }; description: string;
}
export interface Asset {
  id: ID; siteId: ID; name: string; type: string; category: "Service" | "Construction";
  criticality: "Critical" | "High" | "Medium" | "Low"; state: "In service" | "Standby" | "Fault" | "Commissioning" | "Installed";
  manufacturer: string; model: string; commissionedAt: string; condition: "Good" | "Fair" | "Monitor";
  location: string; reading?: { label: string; value: string; at: string };
}
export interface MaintenanceJob {
  id: ID; siteId: ID; assetId: ID; title: string; dueAt: string; assigneeId: ID;
  completedAt?: string; checklist: ChecklistItem[]; evidence?: string; cycle: string; taskId?: ID;
}
export interface Finding {
  id: ID; inspectionId: ID; text: string; severity: "High" | "Medium" | "Low";
  ownerId: ID; dueAt: string; status: "Open" | "Closed"; taskId?: ID; closedAt?: string; photo: string;
}
export interface Inspection {
  id: ID; siteId: ID; type: string; date: string; inspectorId: ID; summary: string; findingIds: ID[];
}

export interface SlaCycle { startedAt: string; dueAt: string; acknowledgedAt?: string; result?: "Met" | "Missed" }
export interface Ticket {
  id: ID; title: string; description: string; siteId: ID; assetId?: ID; clientId: ID;
  priority: TicketPriority; status: "Open" | "Assigned" | "In progress" | "Resolved";
  engineerId: ID | null; createdAt: string; cycles: SlaCycle[];
  resolvedAt?: string; resolutionNote?: string; taskId?: ID; runbookId?: ID;
  timeline: { at: string; actor: string; text: string }[]; notes: { at: string; authorId: ID; text: string }[];
  origin: Origin;
}
export interface SlaReport {
  scope: string; from: string; to: string; cutoffAt: string;
  eligible: number; met: number; missed: number; meanResponseMins: number;
  byPriority: { priority: TicketPriority; eligible: number; met: number; mean: number }[];
  bySite: { siteId: ID; eligible: number; met: number }[];
  weekly: { week: string; eligible: number; met: number; mean: number }[];
  missedRows: { id: ID; at: string; siteId: ID; priority: TicketPriority; title: string; responseMins: number; targetMins: number }[];
}
export interface Runbook {
  id: ID; title: string; ownerId: ID; version: string; reviewAt: string;
  assetTypes: string[]; summary: string; steps: string[];
}

export type ApprovalKind = "Recovery proposal" | "Variation" | "Readiness gate" | "Training request" | "Escalation" | "Shift change" | "Agent proposal";
export interface Approval {
  id: ID; kind: ApprovalKind; title: string; reason: string; effect: string;
  sourceType: string; sourceId: ID; projectId?: ID; amount?: number | null;
  requestedById: ID; approverId: ID; requestedAt: string; dueAt?: string;
  status: "Pending" | "Approved" | "Rejected"; decidedAt?: string; note?: string;
  evidenceDocIds: ID[]; agentId?: ID; origin: Origin;
}

export type EventType = "Meeting" | "Client" | "Site visit" | "Maintenance" | "On call" | "Leave" | "Permit window" | "Training";
export const EVENT_TYPES: EventType[] = ["Meeting", "Client", "Site visit", "Maintenance", "On call", "Leave", "Permit window", "Training"];
export interface Recurrence { freq: "weekly"; byDay: number[]; startTime: string; durationMins: number; from: string; until?: string }
export interface CalEvent {
  id: ID; title: string; type: EventType; ownerId: ID; attendeeIds: ID[];
  start: string; end: string; allDay?: boolean; location: string;
  projectId?: ID; siteId?: ID; notes?: string; provisional?: boolean;
  recurrence?: Recurrence;
  exceptions?: Record<string, { deleted?: boolean; attendeeIds?: ID[]; title?: string; start?: string; end?: string; note?: string }>;
  origin: Origin; touched?: boolean;
}
/** One concrete occurrence of an event on the calendar grid. */
export interface Occurrence {
  key: string; eventId: ID; date: string; title: string; type: EventType; ownerId: ID; attendeeIds: ID[];
  start: string; end: string; allDay: boolean; location: string; provisional?: boolean; recurring: boolean;
  projectId?: ID; siteId?: ID; note?: string;
}

export interface Timesheet {
  id: ID; personId: ID; projectId: ID | null; label: string; date: string; hours: number;
  status: "Draft" | "Submitted" | "Approved"; history: { at: string; text: string }[];
}
export interface TrainingRequest {
  id: ID; personId: ID; credentialId: ID; course: string; provider: string; date: string;
  status: "Awaiting approval" | "Booked" | "Rejected"; approvalId: ID; eventId?: ID; coverId?: ID; createdAt: string;
}

export type DocType = "RAMS" | "Permit" | "Programme" | "Variation evidence" | "Test pack" | "Service review" | "Training evidence" | "Report" | "Drawing" | "Method statement" | "Purchase order";
export interface Doc {
  id: ID; title: string; type: DocType; version: string; ownerId: ID; updatedAt: string; reviewAt?: string;
  status: "Approved" | "In review" | "Draft" | "Issued" | "Superseded";
  projectId?: ID; siteId?: ID; links: { type: string; id: ID }[]; body: string[]; origin: Origin;
}

export interface Agent {
  id: ID; name: string; purpose: string; trigger: string; schedule: string; inputs: string[];
  boundaries: string[]; shape: string; tint: string; enabled: boolean;
}
export interface AgentRun {
  id: ID; agentId: ID; at: string; trigger: "Schedule" | "Manual" | "Record change";
  headline: string; lines: string[]; sources: { type: string; id: ID; label: string }[];
  confidence: "High" | "Medium" | "Low"; limitations: string;
  actions: { label: string; kind: "approval" | "task" | "report" | "none"; refId?: ID }[];
  signature: string;
}
export interface Activity {
  id: ID; at: string; actorType: "person" | "agent" | "system" | "workflow"; actorId: ID; actor: string;
  text: string; sourceType: string; sourceId: ID; category: string;
  audit?: { field: string; before: string; after: string }[];
}
export interface Message { id: ID; withId: ID; fromId: ID; text: string; at: string }
export interface Workflow {
  id: ID; name: string; trigger: string; ownerId: ID; stages: string[]; example: { type: string; id: ID; label: string };
  runs: { at: string; by: string; result: string }[];
}
export interface Notification { id: ID; at: string; text: string; tone: "ok" | "warn" | "bad" | "plain"; sourceType: string; sourceId: ID; read?: boolean }
export interface Briefing { id: ID; at: string; lines: string[]; sources: { type: string; id: ID; label: string }[] }
export interface Report { id: ID; at: string; clientId: ID; title: string; lines: string[]; sources: { type: string; id: ID; label: string }[] }

export interface Integration {
  id: ID; name: string; kind: string; status: "Demo connection" | "Proposed, vendor not confirmed";
  lastSync?: string; mapping: { from: string; to: string }[]; scope: string;
}
export interface SettingsState {
  governance: Record<string, boolean>;
  retentionDays: number;
  notifications: Record<string, boolean>;
  reducedMotion: boolean;
  dateFormat: "Irish" | "ISO";
  rolePreview: string;
  integrations: Integration[];
}

export interface DB {
  version: number;
  meta: { seedDay: string; seedNow: number; lastOpenDay: string };
  org: Organisation;
  teams: Team[]; people: Person[]; allocations: Allocation[]; credentials: Credential[];
  clients: Client[]; contacts: Contact[]; suppliers: Supplier[]; purchaseOrders: PurchaseOrder[];
  projects: Project[]; phases: Phase[]; milestones: Milestone[]; workAreas: WorkArea[];
  tasks: Task[]; risks: Risk[]; permits: Permit[]; rams: Rams[]; changes: ChangeRequest[]; valuations: Valuation[];
  sites: Site[]; assets: Asset[]; maintenance: MaintenanceJob[]; inspections: Inspection[]; findings: Finding[];
  tickets: Ticket[]; sla: SlaReport; runbooks: Runbook[];
  approvals: Approval[]; events: CalEvent[]; timesheets: Timesheet[]; training: TrainingRequest[];
  docs: Doc[]; agents: Agent[]; runs: AgentRun[]; activity: Activity[]; messages: Message[];
  workflows: Workflow[]; notifications: Notification[]; briefings: Briefing[]; reports: Report[];
  settings: SettingsState;
}
