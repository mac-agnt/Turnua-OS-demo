/* Deterministic Turnua OS demo scenario, seeded relative to "now" in Europe/Dublin.
   Project values, people details, tasks, incidents and assets are fictional demo data. */
import type {
  DB, Person, Credential, Task, TaskStatus, Priority, Tag, Asset, MaintenanceJob, CalEvent, Timesheet,
  Doc, Activity, AgentRun, Phase, Milestone, ChecklistItem, Comment, Ticket, TicketPriority,
} from "./types";
import { addDays, at, endOfDay, keyOf, weekdayOf, mondayOf, fmtKey } from "./time";

export const DATA_VERSION = 5;
export const SLA_TARGET: Record<TicketPriority, number> = { P1: 60, P2: 240, P3: 1440, P4: 2880 };

/** Small deterministic PRNG so 344 assets and 212 jobs come out the same on every reset. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(now: number): DB {
  const T = keyOf(now);
  const D = (n: number) => addDays(T, n);
  /** Readable date for text, e.g. "Fri 4 Dec". The store migrates these on a new day. */
  const F = (n: number) => fmtKey(D(n));
  const eod = (n: number) => endOfDay(D(n));
  const atD = (n: number, h: number, m = 0) => at(D(n), h, m);
  const inH = (h: number) => new Date(now + h * 3600000).toISOString();
  const minsAgo = (m: number) => new Date(now - m * 60000).toISOString();
  let cid = 0;
  const ck = (items: [string, boolean][]): ChecklistItem[] => items.map(([text, done]) => ({ id: "CK-" + ++cid, text, done }));
  const cm = (authorId: string, text: string, hoursAgo: number, mentions: string[] = []): Comment =>
    ({ id: "CM-" + ++cid, authorId, text, at: inH(-hoursAgo), mentions });

  /* ── organisation and people ─────────────────────────────────────── */
  const org = {
    name: "Turnua", product: "Turnua OS", descriptor: "Operations Platform", website: "https://turnua.com/",
    logo: "/turnua-logo.svg",
    address: "Unit 21, Monread Industrial Park, Monread Road, Naas, Co. Kildare, W91 P2RW, Ireland",
    phone: "+353 45 395 033", email: "info@turnua.com", timezone: "Europe/Dublin", currency: "EUR",
    serviceLines: ["Fibre & Low-Voltage Cabling", "Critical Facilities Management", "Critical IT Infrastructure", "Fibre & Telecoms", "Construction & Building Fabric Solutions"],
    regions: ["Ireland", "United Kingdom", "United States"],
    sectors: ["Hyperscale", "Subsea", "Enterprise", "Public sector"],
  };

  const teams = [
    { id: "TM-LEAD", name: "Leadership & Strategy", leadId: "P01", blurb: "Direction, client relationships and investment decisions." },
    { id: "TM-PD", name: "Project Delivery", leadId: "P03", blurb: "Civils, public realm and building fabric delivery." },
    { id: "TM-FT", name: "Fibre & Telecoms", leadId: "P04", blurb: "FTTH builds, splicing, testing and acceptance." },
    { id: "TM-CF", name: "Critical Facilities & IT", leadId: "P05", blurb: "Landing stations, data halls, 24/7 helpdesk." },
    { id: "TM-HSEQ", name: "HSEQ", leadId: "P08", blurb: "Health, safety, environment and quality assurance." },
    { id: "TM-PLAN", name: "Planning", leadId: "P10", blurb: "Programmes, crew scheduling and dependencies." },
    { id: "TM-COM", name: "Commercial", leadId: "P12", blurb: "Commitments, cost, changes and valuations." },
  ];

  const P = (id: string, name: string, role: string, teamId: string, status: Person["status"], location: string,
    base: string, startYear: number | null, reportsTo: string | null, ext: string, skills: string[], color: string,
    roleKey: Person["roleKey"], available = 40): Person => {
    const first = name.split(" ")[0];
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const email = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ’']/g, "").replace(/\s+/g, ".") + "@turnua.com";
    return { id, name, first, initials, role, teamId, status, location, base, startYear: startYear ?? 0, reportsTo, email, ext, skills, available, color, roleKey };
  };
  const people: Person[] = [
    P("P01", "David Cox", "Managing Director", "TM-LEAD", "In office", "CI Hub, Naas", "CI Hub, Naas", null, null, "Ext. 201",
      ["Executive sponsorship", "Client relationships", "Commercial approval", "Critical infrastructure strategy"], "#16C6D8", "MD"),
    P("P02", "Gillian Daly", "Lead Strategist", "TM-LEAD", "In a meeting", "CI Hub, Naas", "CI Hub, Naas", null, "P01", "Ext. 202",
      ["Strategy", "Programme governance", "AI build space planning", "Stakeholder reporting"], "#8B9CF7", "Strategy"),
    P("P03", "Ciarán Murphy", "Senior PM, Civils", "TM-PD", "On site", "Rathdrum Works", "Naas", 2015, "P01", "Ext. 214",
      ["Civils delivery", "Utility diversions", "Contract administration", "Programme recovery", "Chapter 8 traffic management"], "#F0A35E", "PM"),
    P("P04", "Aoife Brennan", "Fibre PM", "TM-FT", "On site", "Kildare FTTH Cluster", "Naas", 2018, "P01", "Ext. 221",
      ["FTTH delivery", "Network acceptance", "Splicing QA", "Client reporting"], "#5FD3A1", "PM"),
    P("P05", "Paul O’Neill", "Critical Facilities Lead", "TM-CF", "On call", "Landing Station 1", "Naas", 2014, "P01", "Ext. 231",
      ["UPS and battery systems", "Cooling systems", "Generator systems", "Incident command", "Electrical"], "#E86C7A", "Engineer"),
    P("P06", "Conor Walsh", "Data Centre Engineer", "TM-CF", "On site", "Hall 4, Dublin 15", "Dublin 15", 2019, "P05", "Ext. 232",
      ["Structured cabling", "Containment", "Rack and grounding", "Fibre polarity testing", "Working at height", "Electrical"], "#F2C14E", "Engineer"),
    P("P07", "Seán Keane", "Fibre Splicing Supervisor", "TM-FT", "On site", "Kildare FTTH Cluster", "Naas", 2016, "P04", "Ext. 222",
      ["Fusion splicing", "OTDR testing", "Cabinet build", "Crew supervision"], "#7BC4F2", "Engineer"),
    P("P08", "Niamh Byrne", "HSEQ Manager", "TM-HSEQ", "On site", "Rathdrum Works", "Naas", 2017, "P01", "Ext. 241",
      ["RAMS review", "Site audits", "Incident investigation", "First aid", "Quality inspection"], "#C38BEB", "HSEQ"),
    P("P09", "Eoin Kelly", "Site Engineer", "TM-PD", "On site", "DLR works corridor", "Naas", 2021, "P03", "Ext. 215",
      ["Setting out", "Chamber construction", "Duct installation", "Permit coordination", "Chapter 8 traffic management"], "#9CCB62", "Engineer"),
    P("P10", "Sarah Doyle", "Planner & Scheduler", "TM-PLAN", "In office", "CI Hub, Naas", "Naas", 2019, "P01", "Ext. 251",
      ["Programme planning", "Crew scheduling", "Dependency tracking", "Client programmes"], "#F08BC1", "Planner"),
    P("P11", "Liam Fitzgerald", "Night Helpdesk Engineer", "TM-CF", "On call", "Remote support", "Remote", 2022, "P05", "Ext. 233",
      ["Remote monitoring", "Alarm triage", "UPS and battery systems", "Escalation"], "#6F8FE8", "Engineer"),
    P("P12", "Róisín Nolan", "Commercial Manager", "TM-COM", "On leave", "Annual leave", "Naas", 2017, "P01", "Ext. 261",
      ["Cost control", "Change control", "Valuations", "Supplier commercial"], "#D9A97A", "Commercial", 24),
  ];

  const A = (personId: string, projectId: string | null, label: string, hours: number) =>
    ({ id: "AL-" + personId + "-" + (projectId || label.replace(/\W+/g, "")), personId, projectId, label, hours });
  const allocations = [
    A("P01", null, "Portfolio leadership", 19), A("P01", "TRN-2052", "Hall 4 sponsor", 4), A("P01", "TRN-2041", "Rathdrum sponsor", 3),
    A("P01", "TRN-2035", "AquaComms sponsor", 2), A("P01", "TRN-2059", "CI Hub sponsor", 2), A("P01", "TRN-2063", "DLR sponsor", 1),
    A("P02", "TRN-2059", "CI Hub programme owner", 18), A("P02", null, "Strategy and governance", 15),
    A("P03", "TRN-2041", "Rathdrum PM", 16), A("P03", "TRN-2052", "Hall 4 PM", 14), A("P03", "TRN-2063", "DLR PM", 8),
    A("P04", "TRN-2048", "Kildare PM", 34),
    A("P05", "TRN-2035", "Landing stations lead", 35),
    A("P06", "TRN-2052", "Hall 4 technical lead", 22), A("P06", "TRN-2059", "CI Hub technical lead", 9), A("P06", "TRN-2035", "Landing station support", 8),
    A("P07", "TRN-2048", "Splicing supervision", 34),
    A("P08", "TRN-2041", "Rathdrum HSEQ", 8), A("P08", "TRN-2048", "Kildare HSEQ", 6), A("P08", "TRN-2052", "Hall 4 HSEQ", 6), A("P08", "TRN-2063", "DLR HSEQ", 6), A("P08", "TRN-2035", "Landing station HSEQ", 4),
    A("P09", "TRN-2063", "DLR site engineer", 18), A("P09", "TRN-2041", "Rathdrum chambers", 10), A("P09", "TRN-2048", "Kildare duct snags", 8),
    A("P10", "TRN-2052", "Hall 4 programme", 8), A("P10", "TRN-2041", "Rathdrum programme", 6), A("P10", "TRN-2059", "CI Hub programme", 5), A("P10", "TRN-2063", "DLR programme", 5), A("P10", "TRN-2048", "Kildare programme", 5),
    A("P11", "TRN-2035", "Night helpdesk", 32),
    A("P12", "TRN-2052", "Hall 4 commercial", 5), A("P12", "TRN-2041", "Rathdrum commercial", 4), A("P12", "TRN-2063", "DLR commercial", 3), A("P12", "TRN-2059", "CI Hub budget", 3),
  ];

  const C = (id: string, personId: string, name: string, kind: string, dueN: number | null, dueKind: Credential["dueKind"], issuedN: number, requiredFor: string[] = []): Credential =>
    ({ id, personId, name, kind, issuedAt: atD(issuedN, 9), dueAt: dueN === null ? undefined : eod(dueN), dueKind, requiredFor, evidenceDocId: "DOC-CERT-" + personId });
  const credentials: Credential[] = [
    C("CERT-01-SP", "P01", "Safe Pass", "Safe Pass", 300, "Renewal", -1160),
    C("CERT-02-SP", "P02", "Safe Pass", "Safe Pass", 410, "Renewal", -1050),
    C("CERT-03-SP", "P03", "Safe Pass renewal", "Safe Pass", 24, "Renewal", -1436, ["Site access"]),
    C("CERT-03-CH8", "P03", "Chapter 8 temporary traffic management", "Chapter 8", 380, "Refresher due", -715, ["Traffic management"]),
    C("CERT-03-NEB", "P03", "NEBOSH Construction Certificate", "NEBOSH", null, "No expiry", -2400),
    C("CERT-04-SP", "P04", "Safe Pass", "Safe Pass", 520, "Renewal", -940),
    C("CERT-04-CH8", "P04", "Chapter 8 temporary traffic management", "Chapter 8", 260, "Refresher due", -835),
    C("CERT-04-BIC", "P04", "BICSI optical fibre installer", "BICSI", 640, "Renewal", -455, ["Fibre"]),
    C("CERT-05-ELEC", "P05", "Electrical compliance training review", "Safe Electric-related training", 34, "Review due", -1061, ["Electrical"]),
    C("CERT-05-FG", "P05", "F-Gas handling, Category 1", "F-Gas", 700, "Renewal", -1125, ["Cooling"]),
    C("CERT-05-SP", "P05", "Safe Pass", "Safe Pass", 190, "Renewal", -1270),
    C("CERT-05-CS", "P05", "Confined space entry", "Confined Space", 300, "Refresher due", -795),
    C("CERT-06-IPAF", "P06", "IPAF renewal (MEWP 3a/3b)", "IPAF", 18, "Renewal", -1807, ["Working at height"]),
    C("CERT-06-SP", "P06", "Safe Pass", "Safe Pass", 450, "Renewal", -1010),
    C("CERT-06-BIC", "P06", "BICSI installer, copper and fibre", "BICSI", 300, "Renewal", -795, ["Fibre"]),
    C("CERT-06-ELEC", "P06", "Electrical compliance training review", "Safe Electric-related training", 260, "Review due", -835, ["Electrical"]),
    C("CERT-07-SP", "P07", "Safe Pass", "Safe Pass", 330, "Renewal", -1130),
    C("CERT-07-BIC", "P07", "BICSI optical fibre installer", "BICSI", 400, "Renewal", -695, ["Fibre"]),
    C("CERT-07-CH8", "P07", "Chapter 8 temporary traffic management", "Chapter 8", 150, "Refresher due", -945),
    C("CERT-07-CS", "P07", "Confined space entry", "Confined Space", 190, "Refresher due", -905),
    C("CERT-08-FA", "P08", "First Aid refresher", "First Aid", 41, "Refresher due", -689, ["First aider on site"]),
    C("CERT-08-NEB", "P08", "NEBOSH General Certificate", "NEBOSH", null, "No expiry", -2900),
    C("CERT-08-SP", "P08", "Safe Pass", "Safe Pass", 600, "Renewal", -860),
    C("CERT-08-CH8", "P08", "Chapter 8 temporary traffic management", "Chapter 8", 410, "Refresher due", -685),
    C("CERT-09-SP", "P09", "Safe Pass", "Safe Pass", 240, "Renewal", -1220),
    C("CERT-09-CSCS", "P09", "CSCS excavation and trenching", "CSCS", 500, "Renewal", -1325),
    C("CERT-09-CH8", "P09", "Chapter 8 temporary traffic management", "Chapter 8", 120, "Refresher due", -975),
    C("CERT-09-CS", "P09", "Confined space entry", "Confined Space", 95, "Refresher due", -1000),
    C("CERT-10-SP", "P10", "Safe Pass", "Safe Pass", 560, "Renewal", -900),
    C("CERT-11-ELEC", "P11", "Electrical compliance training review", "Safe Electric-related training", 220, "Review due", -875, ["Electrical"]),
    C("CERT-11-FG", "P11", "F-Gas handling, Category 1", "F-Gas", 500, "Renewal", -1325),
    C("CERT-11-SP", "P11", "Safe Pass", "Safe Pass", 380, "Renewal", -1080),
    C("CERT-12-SP", "P12", "Safe Pass", "Safe Pass", 470, "Renewal", -990),
  ];

  /* ── clients, contacts, suppliers ────────────────────────────────── */
  const clients = [
    { id: "CL-WCC", name: "Wicklow County Council", kind: "Local authority", sector: "Public sector", summary: "Public realm, roads and utilities works in Rathdrum.", since: "Public realm framework" },
    { id: "CL-NBI", name: "National Broadband Ireland", kind: "Network operator", sector: "Telecoms", summary: "FTTH cluster build, splicing, testing and acceptance in Kildare.", since: "Cluster build programme" },
    { id: "CL-AQC", name: "AquaComms", kind: "Subsea network operator", sector: "Subsea", summary: "Critical facilities management and 24/7 helpdesk for two landing stations.", since: "Managed service" },
    { id: "CL-HYP", name: "Confidential hyperscale client", kind: "Hyperscale operator", sector: "Hyperscale", confidential: true, summary: "White space fit out of Hall 4, Dublin 15. Client identity withheld in this workspace.", since: "Works package" },
    { id: "CL-DLR", name: "Dún Laoghaire–Rathdown County Council", kind: "Local authority", sector: "Public sector", summary: "Duct route and chamber upgrade along the DLR works corridor.", since: "Works package" },
    { id: "CL-TRN", name: "Turnua (internal programme)", kind: "Internal", sector: "Internal", summary: "CI Hub AI build space investment, reported separately from client revenue.", since: "Internal" },
  ];
  const contacts = [
    { id: "CT-01", name: "Siobhán Kearney", role: "Senior Executive Engineer (demo contact)", clientId: "CL-WCC", email: "s.kearney@wicklow-council.example", phone: "+353 1 555 0141" },
    { id: "CT-02", name: "Declan Fahy", role: "Area Engineer, Rathdrum (demo contact)", clientId: "CL-WCC", email: "d.fahy@wicklow-council.example", phone: "+353 1 555 0142" },
    { id: "CT-03", name: "Orla Kinsella", role: "Build Programme Manager (demo contact)", clientId: "CL-NBI", email: "o.kinsella@nbi-partner.example", phone: "+353 1 555 0151" },
    { id: "CT-04", name: "Fergal Byrne", role: "Acceptance Engineer (demo contact)", clientId: "CL-NBI", email: "f.byrne@nbi-partner.example", phone: "+353 1 555 0152" },
    { id: "CT-05", name: "Maeve Lynch", role: "Operations Manager, Landing Stations (demo contact)", clientId: "CL-AQC", email: "m.lynch@aquacomms-partner.example", phone: "+353 1 555 0161" },
    { id: "CT-06", name: "Client delivery lead", role: "Hall 4 programme lead (identity withheld)", clientId: "CL-HYP", email: "hall4-delivery@confidential.example", phone: "Via secure portal" },
    { id: "CT-07", name: "Niall Corcoran", role: "Senior Engineer, Roads (demo contact)", clientId: "CL-DLR", email: "n.corcoran@dlr-council.example", phone: "+353 1 555 0171" },
    { id: "CT-08", name: "Gillian Daly", role: "Programme owner, internal", clientId: "CL-TRN", email: "gillian.daly@turnua.com", phone: "Ext. 202" },
    { id: "CT-09", name: "Barry Quigley", role: "Account manager (demo contact)", supplierId: "SUP-LCS", email: "b.quigley@leinster-containment.example", phone: "+353 1 555 0181" },
    { id: "CT-10", name: "Tara Mulligan", role: "Sales desk (demo contact)", supplierId: "SUP-MCS", email: "t.mulligan@midland-civils.example", phone: "+353 1 555 0182" },
    { id: "CT-11", name: "Kevin Dunphy", role: "Test lead (demo contact)", supplierId: "SUP-FTS", email: "k.dunphy@fibre-test.example", phone: "+353 1 555 0183" },
    { id: "CT-12", name: "Emer Walsh", role: "Course coordinator (demo contact)", supplierId: "SUP-KST", email: "e.walsh@kildare-safety.example", phone: "+353 45 555 0184" },
  ];
  const suppliers = [
    { id: "SUP-LCS", name: "Leinster Containment Supply (Demo)", category: "Containment and cable management", contactId: "CT-09", rating: "Under review", summary: "Cable tray, basket and containment for data hall fit outs." },
    { id: "SUP-MCS", name: "Midland Civils Supply (Demo)", category: "Civils materials", contactId: "CT-10", rating: "Good", summary: "Ductile iron fittings, chambers, kerbs and reinstatement materials." },
    { id: "SUP-FTS", name: "Fibre Test Services (Demo)", category: "Test equipment and witness testing", contactId: "CT-11", rating: "Good", summary: "OTDR hire, calibration and independent witness testing." },
    { id: "SUP-KST", name: "Kildare Safety Training (Demo)", category: "Training provider", contactId: "CT-12", rating: "Good", summary: "Safe Pass, IPAF, First Aid and confined space courses." },
  ];
  const purchaseOrders = [
    { id: "PO-5521", supplierId: "SUP-LCS", projectId: "TRN-2052", description: "Hall 4 containment package: cable tray, basket and fixings, Zones A to D", value: 186400,
      orderedAt: atD(-48, 10), dueAt: atD(-7, 8), revisedDueAt: atD(14, 8), status: "Late" as const,
      history: [{ at: atD(-48, 10), note: "Order placed against approved drawings rev C." }, { at: atD(-12, 15), note: "Supplier advised mill delay on galvanised basket." },
        { at: atD(-7, 9), note: "Original delivery date missed." }, { at: atD(-5, 11), note: "Revised delivery confirmed by supplier for " + F(14) + " (21 days late)." }] },
    { id: "PO-5498", supplierId: "SUP-MCS", projectId: "TRN-2041", description: "Ductile iron fittings and valves for Main Street watermain diversion", value: 48200,
      orderedAt: atD(-70, 9), dueAt: atD(-40, 8), deliveredAt: atD(-41, 13), status: "Delivered" as const,
      history: [{ at: atD(-70, 9), note: "Order placed." }, { at: atD(-41, 13), note: "Delivered to Rathdrum compound, signed by Eoin Kelly." }] },
    { id: "PO-5530", supplierId: "SUP-FTS", projectId: "TRN-2048", description: "OTDR hire and independent witness testing, Phase 3 acceptance", value: 22800,
      orderedAt: atD(-20, 9), dueAt: atD(16, 9), status: "On order" as const, history: [{ at: atD(-20, 9), note: "Witness test slot requested for acceptance week." }] },
    { id: "PO-5536", supplierId: "SUP-MCS", projectId: "TRN-2063", description: "Chamber covers and frames CH-12 to CH-15", value: 31600,
      orderedAt: atD(-9, 10), dueAt: atD(5, 8), status: "On order" as const, history: [{ at: atD(-9, 10), note: "Order placed, delivery to DLR compound." }] },
    { id: "PO-5539", supplierId: "SUP-KST", projectId: "TRN-2041", description: "Training bookings framework (Safe Pass, IPAF, First Aid)", value: 6400,
      orderedAt: atD(-30, 10), dueAt: atD(60, 10), status: "On order" as const, history: [{ at: atD(-30, 10), note: "Framework call-off opened for Q4 refreshers." }] },
  ];

  /* ── projects ────────────────────────────────────────────────────── */
  const safety = { lastLtiAt: atD(-426, 12), toolboxTalks: 0, toolboxThisWeek: 0 };
  const projects = [
    { id: "TRN-2041", name: "Rathdrum Public Realm and Utilities", short: "Rathdrum", clientId: "CL-WCC", service: "Construction & Building Fabric", location: "Rathdrum, Co. Wicklow",
      pmId: "P03", sponsorId: "P01", team: ["P03", "P08", "P09", "P10", "P12"], model: "Works contract" as const,
      contractValue: 4800000, budget: null, cost: 3312000, progress: 0.62, progressLabel: "62% physical progress", health: "At risk" as const,
      startAt: atD(-120, 8), baselineFinish: eod(45), forecastFinish: eod(52), blocker: "Watermain diversion clash at Main Street",
      siteIds: ["S-RTH"], workAreaIds: ["WA-2041-A", "WA-2041-B"],
      update: { authorId: "P03", at: atD(-1, 17, 40), text: "Trial holes on Main Street found the existing watermain 600 mm east of the record drawings, clashing with the new diversion route. Diversion is paused on that 40 m section while Irish Water records and the council engineer agree a revised alignment. Paving in Market Square continues. Variation CR-2041-03 (€84,000) prices the redesign, extra excavation and night works; it needs David’s decision before we instruct. Forecast handover moves from " + F(45) + " to " + F(52) + "." },
      safety: { ...safety, toolboxTalks: 41, toolboxThisWeek: 2 }, origin: "seed" as const },
    { id: "TRN-2048", name: "Kildare FTTH Cluster Build Phase 3", short: "Kildare FTTH", clientId: "CL-NBI", service: "Fibre & Telecoms", location: "Kildare cluster",
      pmId: "P04", sponsorId: "P01", team: ["P04", "P07", "P09", "P10", "P08"], model: "Works contract" as const,
      contractValue: 2100000, budget: null, cost: 1386000, progress: 0.74, progressLabel: "1,248 of 1,680 premises passed", health: "On track" as const,
      startAt: atD(-90, 8), baselineFinish: eod(28), forecastFinish: eod(28),
      siteIds: ["S-KLD"], workAreaIds: ["WA-2048-C"],
      update: { authorId: "P04", at: atD(-1, 16, 10), text: "1,248 of 1,680 premises passed. Splicing is ahead of the cabinet labelling, so 96 splice records are waiting for final QA before the evidence review with NBI. OTDR traces for cabinets C10 to C14 upload today. One duct blockage snag on the Naas Road remains open. On track for acceptance on " + F(28) + "." },
      safety: { ...safety, toolboxTalks: 33, toolboxThisWeek: 1 }, origin: "seed" as const },
    { id: "TRN-2035", name: "Landing Station CFM and 24/7 Support", short: "AquaComms CFM", clientId: "CL-AQC", service: "Critical Facilities Management", location: "Landing Station 1 and Landing Station 2",
      pmId: "P05", sponsorId: "P01", team: ["P05", "P11", "P06", "P08"], model: "Managed service" as const,
      contractValue: null, budget: null, cost: null, progress: 0.92, progressLabel: "92 of 100 PPM jobs, current cycle", health: "On track" as const,
      startAt: atD(-180, 8), baselineFinish: eod(185), forecastFinish: eod(185),
      siteIds: ["S-LS1", "S-LS2"], workAreaIds: [],
      update: { authorId: "P05", at: atD(0, 7, 20), text: "Current PPM cycle is at 92 of 100 jobs across both landing stations. HD-4821 (cooling high return temperature, Landing Station 1) came in this morning and I am attending. HD-4820 and HD-4817 are with Liam and me. Service review pack is due " + F(5) + "; the action log review is with David." },
      safety: { ...safety, toolboxTalks: 18, toolboxThisWeek: 1 }, origin: "seed" as const },
    { id: "TRN-2052", name: "Hyperscale DC White Space Fit Out, Hall 4", short: "Hall 4", clientId: "CL-HYP", service: "Fibre & Low-Voltage Cabling", location: "Dublin 15",
      pmId: "P03", techLeadId: "P06", sponsorId: "P01", team: ["P03", "P06", "P10", "P08", "P12"], model: "Works contract" as const,
      contractValue: 6300000, budget: null, cost: 3654000, progress: 0.41, progressLabel: "41% physical progress", health: "Off track" as const,
      startAt: atD(-75, 8), baselineFinish: eod(56), forecastFinish: eod(77),
      scenario: { label: "Recovery proposal CR-2052-02", finish: eod(67), state: "Proposed" as const },
      blocker: "Containment package PO-5521 delivered 21 days late",
      siteIds: ["S-H4"], workAreaIds: ["WA-2052-Z"],
      update: { authorId: "P03", at: atD(-1, 18, 5), text: "Containment package PO-5521 was due " + F(-7) + "; the supplier has confirmed " + F(14) + ", 21 days late. Zones A and B are cabled, but Zones C and D cannot start until the tray lands. Cost burn is 58% against 41% physical progress. The recovery proposal (CR-2052-02, €42,000) adds a weekend second shift and resequences Zone D to win back 10 days, targeting " + F(67) + " against the " + F(56) + " baseline. Forecast without recovery is " + F(77) + "." },
      safety: { ...safety, toolboxTalks: 27, toolboxThisWeek: 2 }, origin: "seed" as const },
    { id: "TRN-2059", name: "CI Hub AI Build Space Upgrade", short: "CI Hub", clientId: "CL-TRN", service: "Critical IT Infrastructure", location: "CI Hub, Naas",
      pmId: "P02", techLeadId: "P06", sponsorId: "P01", team: ["P02", "P06", "P10", "P12"], model: "Internal budget" as const,
      contractValue: null, budget: 380000, cost: 110200, progress: 0.36, progressLabel: "36% physical progress", health: "On track" as const,
      startAt: atD(-30, 8), baselineFinish: eod(35), forecastFinish: eod(35),
      siteIds: ["S-CIH"], workAreaIds: ["WA-2059-B"],
      update: { authorId: "P02", at: atD(-2, 15, 0), text: "Strip-out and electrical survey are done. Power and cooling capacity validation is under way ahead of the readiness review on " + F(6) + ". Demo environment sign-off is planned for " + F(14) + ". Spend is €110,200 of the €380,000 internal budget." },
      safety: { ...safety, toolboxTalks: 6, toolboxThisWeek: 1 }, origin: "seed" as const },
    { id: "TRN-2063", name: "DLR Duct Route and Chamber Upgrade", short: "DLR corridor", clientId: "CL-DLR", service: "Construction & Building Fabric", location: "DLR works corridor",
      pmId: "P03", techLeadId: "P09", sponsorId: "P01", team: ["P03", "P09", "P08", "P10", "P12"], model: "Works contract" as const,
      contractValue: 960000, budget: null, cost: 211200, progress: 0.18, progressLabel: "18% physical progress", health: "At risk" as const,
      startAt: atD(-21, 8), baselineFinish: eod(49), forecastFinish: eod(56),
      blocker: "Road opening licence PER-DLR-017 pending council decision",
      siteIds: [], workAreaIds: ["WA-2063-1"],
      update: { authorId: "P09", at: atD(-1, 15, 30), text: "Route survey and walkdown are complete. Main works cannot start until the council decides road opening licence PER-DLR-017, due " + F(2) + ". Sarah has a three-person crew window provisionally reserved from " + F(3) + ", but that reservation does not satisfy the licence dependency. Forecast is provisional at " + F(56) + " until the decision lands." },
      safety: { ...safety, toolboxTalks: 4, toolboxThisWeek: 1 }, origin: "seed" as const },
  ];

  const workAreas = [
    { id: "WA-2041-A", projectId: "TRN-2041", name: "Main Street watermain diversion", location: "Main Street, Rathdrum" },
    { id: "WA-2041-B", projectId: "TRN-2041", name: "Market Square public realm", location: "Market Square, Rathdrum" },
    { id: "WA-2048-C", projectId: "TRN-2048", name: "Cabinets C10 to C14", location: "Naas Road cluster, Kildare" },
    { id: "WA-2052-Z", projectId: "TRN-2052", name: "Hall 4 white space, Zones A to D", location: "Hall 4, Dublin 15" },
    { id: "WA-2059-B", projectId: "TRN-2059", name: "AI build space, ground floor", location: "CI Hub, Naas" },
    { id: "WA-2063-1", projectId: "TRN-2063", name: "DLR works corridor, chambers CH-12 to CH-15", location: "DLR works corridor" },
  ];

  const ph = (projectId: string, list: [string, number, number, number, number, string?][]): Phase[] =>
    list.map(([name, s, e, be, pct, note], i) => ({ id: projectId + "-PH" + (i + 1), projectId, name, start: atD(s, 8), end: eod(e), baselineEnd: eod(be), pct, note }));
  const phases = [
    ...ph("TRN-2041", [["Mobilisation and design", -120, -95, -95, 1], ["Procurement", -105, -20, -20, 1], ["Main works", -90, 30, 23, 0.64, "Watermain diversion clash on Main Street"], ["Testing and commissioning", 20, 45, 38, 0], ["Handover", 45, 52, 45, 0]]),
    ...ph("TRN-2048", [["Mobilisation and design", -90, -70, -70, 1], ["Procurement", -80, -30, -30, 1], ["Main works", -70, 10, 10, 0.88, "1,248 of 1,680 premises passed"], ["Testing and commissioning", -20, 21, 21, 0.55, "96 splice records awaiting QA"], ["Handover", 21, 28, 28, 0]]),
    ...ph("TRN-2035", [["Mobilisation and design", -180, -150, -150, 1, "Service transition"], ["Procurement", -160, -120, -120, 1, "Critical spares holding"], ["Main works", -45, 30, 30, 0.92, "Current PPM cycle, 92 of 100 jobs"], ["Testing and commissioning", 12, 14, 14, 0, "Standby transfer test, approved window"], ["Handover", 170, 185, 185, 0, "Term review"]]),
    ...ph("TRN-2052", [["Mobilisation and design", -75, -45, -45, 1], ["Procurement", -60, 14, -7, 0.7, "Containment PO-5521 21 days late"], ["Main works", -40, 50, 35, 0.38, "Zones C and D wait for containment"], ["Testing and commissioning", 40, 70, 50, 0], ["Handover", 70, 77, 56, 0]]),
    ...ph("TRN-2059", [["Mobilisation and design", -30, -18, -18, 1], ["Procurement", -24, 6, 6, 0.6], ["Main works", -14, 22, 22, 0.3], ["Testing and commissioning", 18, 30, 30, 0], ["Handover", 30, 35, 35, 0]]),
    ...ph("TRN-2063", [["Mobilisation and design", -21, -7, -7, 1], ["Procurement", -14, 2, 2, 0.7, "Licence PER-DLR-017 decision due"], ["Main works", 3, 42, 35, 0, "Conditional on PER-DLR-017"], ["Testing and commissioning", 38, 50, 43, 0], ["Handover", 50, 56, 49, 0]]),
  ];

  const MS = (id: string, projectId: string, name: string, dueN: number, baseN: number, ownerId: string, done: boolean, dependsOn: string[] = [], handover = false, conditional?: string): Milestone =>
    ({ id, projectId, name, dueAt: eod(dueN), baselineAt: eod(baseN), ownerId, completedAt: done ? atD(dueN, 16) : undefined, dependsOn, handover, conditional });
  const milestones = [
    MS("MS-2041-1", "TRN-2041", "Main Street ducting complete", -30, -30, "P03", true),
    MS("MS-2041-2", "TRN-2041", "Watermain diversion complete", 4, -3, "P03", false, ["MS-2041-1"]),
    MS("MS-2041-3", "TRN-2041", "Market Square paving complete", 30, 23, "P09", false, ["MS-2041-2"]),
    MS("MS-2041-4", "TRN-2041", "Snagging and council walk-down", 45, 38, "P08", false, ["MS-2041-3"]),
    MS("MS-2041-5", "TRN-2041", "Handover to Wicklow County Council", 52, 45, "P03", false, ["MS-2041-4"], true),
    MS("MS-2048-1", "TRN-2048", "1,000 premises passed", -21, -21, "P04", true),
    MS("MS-2048-2", "TRN-2048", "Evidence review with NBI", 3, 3, "P04", false, ["MS-2048-1"]),
    MS("MS-2048-3", "TRN-2048", "All 1,680 premises passed", 18, 18, "P07", false, ["MS-2048-2"]),
    MS("MS-2048-4", "TRN-2048", "NBI acceptance and handover", 28, 28, "P04", false, ["MS-2048-3"], true),
    MS("MS-2035-1", "TRN-2035", "Q3 service review held", -85, -85, "P05", true),
    MS("MS-2035-2", "TRN-2035", "Quarterly service review", 5, 5, "P05", false, ["MS-2035-1"]),
    MS("MS-2035-3", "TRN-2035", "Standby transfer test (approved window)", 13, 13, "P05", false),
    MS("MS-2035-4", "TRN-2035", "Current PPM cycle complete", 30, 30, "P05", false, ["MS-2035-3"]),
    MS("MS-2052-1", "TRN-2052", "Design freeze, drawings rev C", -50, -50, "P06", true),
    MS("MS-2052-2", "TRN-2052", "Containment package on site", 14, -7, "P03", false, ["MS-2052-1"]),
    MS("MS-2052-3", "TRN-2052", "Cabling complete, Zones A to D", 51, 30, "P06", false, ["MS-2052-2"]),
    MS("MS-2052-4", "TRN-2052", "Commissioning witness test", 71, 50, "P06", false, ["MS-2052-3"]),
    MS("MS-2052-5", "TRN-2052", "Handover to client", 77, 56, "P03", false, ["MS-2052-4"], true),
    MS("MS-2059-1", "TRN-2059", "Design sign-off", -18, -18, "P02", true),
    MS("MS-2059-2", "TRN-2059", "Power and cooling readiness review", 6, 6, "P02", false, ["MS-2059-1"]),
    MS("MS-2059-3", "TRN-2059", "Demo environment sign-off", 14, 14, "P06", false, ["MS-2059-2"]),
    MS("MS-2059-4", "TRN-2059", "Internal handover", 35, 35, "P02", false, ["MS-2059-3"], true),
    MS("MS-2063-1", "TRN-2063", "Route survey and walkdown complete", -10, -10, "P09", true),
    MS("MS-2063-2", "TRN-2063", "Council decision on PER-DLR-017", 2, 2, "P09", false, ["MS-2063-1"], false, "External decision by the council"),
    MS("MS-2063-3", "TRN-2063", "Main works start", 3, 3, "P09", false, ["MS-2063-2"], false, "Conditional on PER-DLR-017"),
    MS("MS-2063-4", "TRN-2063", "Chambers CH-12 to CH-15 upgraded", 42, 35, "P09", false, ["MS-2063-3"]),
    MS("MS-2063-5", "TRN-2063", "Handover to DLR County Council", 56, 49, "P03", false, ["MS-2063-4"], true),
  ];

  /* ── tasks: 72, twelve per project, with fixed status and due quotas ── */
  type Due = ["od", number] | ["h", number] | ["today"] | ["tom"] | ["d", number] | ["done", number];
  const dueOf = (d: Due): string => {
    switch (d[0]) {
      case "od": return eod(d[1]);
      case "h": return inH(d[1]);
      case "today": return eod(0);
      case "tom": return eod(1);
      case "d": return eod(d[1]);
      case "done": return eod(d[1]);
    }
  };
  const DEPT: Record<string, string> = { P01: "Leadership & Strategy", P02: "Leadership & Strategy", P03: "Project Delivery", P04: "Fibre & Telecoms", P05: "Critical Facilities & IT", P06: "Critical Facilities & IT", P07: "Fibre & Telecoms", P08: "HSEQ", P09: "Project Delivery", P10: "Planning", P11: "Critical Facilities & IT", P12: "Commercial" };
  type TaskDef = [string, TaskStatus, string, Priority, Tag, Due, Partial<Task>?];
  const tasks: Task[] = [];
  const addTasks = (projectId: string, defs: TaskDef[]) => {
    defs.forEach(([title, status, ownerId, priority, tag, due, extra], i) => {
      const id = "T-" + projectId.slice(4) + "-" + String(i + 1).padStart(2, "0");
      const done = status === "Done";
      tasks.push({
        id, title, projectId, ownerId, dept: DEPT[ownerId], status, priority, tag, dueAt: dueOf(due), order: i,
        checklist: [], comments: [], docIds: [], dependsOn: [], origin: "seed",
        completedAt: done ? atD((due as ["done", number])[1], 15) : undefined,
        lastActive: done ? "QA / Sign Off" : undefined,
        ...(extra || {}),
      });
    });
  };

  addTasks("TRN-2041", [
    ["Resolve watermain diversion clash", "In Progress", "P03", "Urgent", "Civils", ["od", -2], { workAreaId: "WA-2041-A", siteId: "S-RTH",
      description: "Existing watermain found 600 mm east of record drawings on a 40 m section of Main Street. Agree revised alignment with the council engineer and Irish Water records.",
      checklist: ck([["Trial holes TH-07 to TH-09 logged", true], ["Revised alignment sketch issued to council", true], ["Irish Water records confirmation", false], ["Instruction to proceed", false]]),
      comments: [cm("P09", "Trial hole TH-08 photos uploaded. Main is at 1.1 m depth, not 0.8 m.", 30), cm("P03", "@David Cox variation is priced, needs your decision before we instruct night works.", 18, ["P01"])],
      docIds: ["DOC-2041-VAR03", "DOC-2041-RAMS07"] }],
    ["Review variation CR-2041-03 (€84,000)", "To Do", "P01", "High", "Commercial", ["today"], { approvalId: "APR-2041-03",
      description: "Watermain diversion redesign, extra excavation and night works. Original contract stays at €4,800,000 until the variation is approved.",
      checklist: ck([["Read PM status update", true], ["Review trial hole evidence", false], ["Decide variation", false]]), docIds: ["DOC-2041-VAR03"] }],
    ["Update diversion RAMS", "In Progress", "P08", "High", "Safety", ["h", 6], { workAreaId: "WA-2041-A", docIds: ["DOC-2041-RAMS07"],
      checklist: ck([["Revise excavation depth and shoring", true], ["Night-works lighting plan", false], ["Brief crew", false]]) }],
    ["Approve temporary traffic layout", "To Do", "P09", "Normal", "Permits", ["d", 5], { workAreaId: "WA-2041-A", docIds: ["DOC-2041-TTM"] }],
    ["Check chamber levels", "In Progress", "P09", "Normal", "Civils", ["h", 26], { workAreaId: "WA-2041-B", checklist: ck([["Chambers MS-01 to MS-04", true], ["Chambers MS-05 to MS-08", false]]) }],
    ["Coordinate utility survey", "In Progress", "P03", "High", "Civils", ["od", -1], { workAreaId: "WA-2041-A", description: "GPR and utility survey of the 40 m clash section ahead of the revised alignment." }],
    ["Update public access notice", "To Do", "P10", "Low", "Client", ["d", 3], { workAreaId: "WA-2041-A" }],
    ["Prepare valuation evidence", "QA / Sign Off", "P12", "Normal", "Commercial", ["d", 6], { docIds: ["DOC-2041-VAL08"], checklist: ck([["Measured quantities", true], ["Photo record", true], ["Variation status note", false]]) }],
    ["Reinstate footpath, section 3", "Backlog", "P09", "Normal", "Civils", ["d", 14], { workAreaId: "WA-2041-B" }],
    ["Planting and topsoil package sign-off", "QA / Sign Off", "P10", "Low", "QA", ["d", 8], { workAreaId: "WA-2041-B" }],
    ["Lay ducting along Main Street", "Done", "P09", "Normal", "Civils", ["done", -30], { workAreaId: "WA-2041-A" }],
    ["Install street lighting columns, Market Square", "Done", "P09", "Normal", "Civils", ["done", -12], { workAreaId: "WA-2041-B" }],
  ]);

  addTasks("TRN-2048", [
    ["QA 96 splice records", "QA / Sign Off", "P07", "High", "QA", ["d", 3], { workAreaId: "WA-2048-C", siteId: "S-KLD", docIds: ["DOC-2048-TP"],
      description: "Final QA of 96 splice records before the evidence review with NBI. Completing this task readies evidence; it does not change the premises-passed count.",
      checklist: ck([["Records 1 to 32 checked", true], ["Records 33 to 64 checked", false], ["Records 65 to 96 checked", false], ["Exceptions logged", false]]) }],
    ["Upload OTDR traces, cabinets C10 to C14", "In Progress", "P07", "Normal", "Splicing", ["h", 8], { workAreaId: "WA-2048-C", siteId: "S-KLD", docIds: ["DOC-2048-TP"] }],
    ["Complete cabinet labelling", "To Do", "P09", "Normal", "Splicing", ["h", 40], { workAreaId: "WA-2048-C", siteId: "S-KLD" }],
    ["Reconcile 1,248 premises passed", "QA / Sign Off", "P04", "High", "Client", ["h", 22], { siteId: "S-KLD", description: "Reconcile the premises-passed register with NBI address data before the evidence review." }],
    ["Review reinstatement photos", "QA / Sign Off", "P08", "Normal", "QA", ["d", 4], { siteId: "S-KLD" }],
    ["Close duct blockage snag, Naas Road", "In Progress", "P09", "Normal", "Civils", ["d", 5], { siteId: "S-KLD" }],
    ["Prepare NBI acceptance pack", "To Do", "P04", "High", "Client", ["d", 9], { docIds: ["DOC-2048-ACC"] }],
    ["Confirm final test witness", "Backlog", "P10", "Normal", "Client", ["d", 16] ],
    ["Splice cabinet KLD-C14 distribution", "Done", "P07", "Normal", "Splicing", ["done", -6]],
    ["Drop fibre install, batch 7", "Done", "P07", "Normal", "Splicing", ["done", -9]],
    ["Pole survey, Naas Road", "Done", "P09", "Low", "Civils", ["done", -25]],
    ["Phase 3 traffic management plan", "Done", "P08", "Normal", "Safety", ["done", -60]],
  ]);

  addTasks("TRN-2035", [
    ["Respond to cooling high return temperature (HD-4821)", "In Progress", "P05", "Urgent", "PPM", ["h", 0.3], { siteId: "S-LS1", ticketId: "HD-4821",
      checklist: ck([["Acknowledge HD-4821", false], ["Check CRAC-03 return air and setpoints", false], ["Confirm redundancy status", false], ["Update client", false]]) }],
    ["Inspect UPS battery threshold (HD-4820)", "In Progress", "P11", "High", "PPM", ["h", 1.6], { siteId: "S-LS2", ticketId: "HD-4820" }],
    ["Investigate generator sensor drift (HD-4817)", "In Progress", "P05", "High", "PPM", ["d", 4], { siteId: "S-LS1", ticketId: "HD-4817" }],
    ["Complete PPM evidence, current cycle", "To Do", "P11", "Normal", "PPM", ["d", 5], { siteId: "S-LS2", docIds: ["DOC-2035-SR"] }],
    ["Test standby transfer sequence in approved window", "Backlog", "P05", "Normal", "PPM", ["d", 12], { siteId: "S-LS1" }],
    ["Review AquaComms service action log", "QA / Sign Off", "P01", "High", "Client", ["od", -1], { docIds: ["DOC-2035-SR"],
      checklist: ck([["Open actions reviewed", true], ["Close completed actions", false], ["Sign off for service review", false]]) }],
    ["Reconcile alarm history", "Done", "P11", "Normal", "PPM", ["done", -3], { siteId: "S-LS1" }],
    ["Update on-call handover", "Done", "P05", "Normal", "PPM", ["done", -1]],
    ["Quarterly UPS load test, Landing Station 2", "Done", "P05", "Normal", "PPM", ["done", -14], { siteId: "S-LS2" }],
    ["Replace CRAC filter set, Landing Station 1", "Done", "P06", "Normal", "PPM", ["done", -20], { siteId: "S-LS1" }],
    ["Battery string impedance test, Landing Station 1", "Done", "P11", "Normal", "PPM", ["done", -8], { siteId: "S-LS1" }],
    ["Compile Q3 service review pack", "Done", "P05", "Normal", "Client", ["done", -85]],
  ]);

  addTasks("TRN-2052", [
    ["Confirm revised containment delivery", "In Progress", "P03", "High", "Procurement", ["od", -2], { workAreaId: "WA-2052-Z", siteId: "S-H4",
      description: "Supplier has advised " + F(14) + " for PO-5521. Get written confirmation of the delivery split by zone.",
      comments: [cm("P03", "Barry at Leinster Containment Supply (Demo) says Zones C and D basket ships together. Chasing written confirmation.", 26)] }],
    ["Approve Hall 4 €42,000 recovery proposal", "To Do", "P01", "High", "Commercial", ["tom"], { approvalId: "APR-2052-02", docIds: ["DOC-2052-REC"],
      description: "Weekend second shift and Zone D resequence to target " + F(67) + ". Approval authorises the plan; it does not deliver the containment." }],
    ["Release containment shop drawings", "In Progress", "P06", "Normal", "Design", ["od", -4], { workAreaId: "WA-2052-Z", docIds: ["DOC-2052-DRG"] }],
    ["Verify rack grounding, rows A and B", "In Progress", "P06", "High", "Safety", ["h", 20], { workAreaId: "WA-2052-Z", siteId: "S-H4",
      checklist: ck([["Row A bonding test", true], ["Row B bonding test", false], ["Record results", false]]) }],
    ["Update access sequence for Zones C and D", "To Do", "P10", "Normal", "Design", ["od", -1], { workAreaId: "WA-2052-Z" }],
    ["QA fibre polarity results, Zone B", "QA / Sign Off", "P06", "Normal", "QA", ["h", 30], { siteId: "S-H4", docIds: ["DOC-2052-TP"] }],
    ["Confirm commissioning witness plan", "Backlog", "P03", "Normal", "Client", ["d", 21]],
    ["Issue revised client programme", "To Do", "P10", "High", "Client", ["d", 4], { docIds: ["DOC-2052-PRG"] }],
    ["Review hot-works RAMS for Zone C", "In Progress", "P08", "High", "Safety", ["d", 5], { docIds: ["DOC-2052-RAMS04"] }],
    ["Install containment and cable tray, Zone C", "Backlog", "P06", "High", "Procurement", ["d", 17], { workAreaId: "WA-2052-Z", siteId: "S-H4", dependsOn: ["T-2052-01"],
      description: "Blocked until containment package PO-5521 arrives. Recovery proposal CR-2052-02 resequences this work onto a weekend second shift." }],
    ["Install fibre trunk cables, rows A to D", "Done", "P06", "Normal", "Splicing", ["done", -10], { siteId: "S-H4" }],
    ["Hall 4 mobilisation induction", "Done", "P08", "Normal", "Safety", ["done", -70]],
  ]);

  addTasks("TRN-2059", [
    ["Approve CI Hub readiness gate", "To Do", "P01", "Normal", "QA", ["d", 6], { approvalId: "APR-2059-01", description: "Power and cooling readiness gate for the AI build space." }],
    ["Validate power and cooling capacity", "In Progress", "P06", "High", "Design", ["h", 18], { siteId: "S-CIH",
      checklist: ck([["DB-3 load survey", true], ["In-row cooling duty check", false], ["UPS headroom calculation", false]]) }],
    ["Install demo rack patching", "In Progress", "P06", "Normal", "Splicing", ["d", 5], { siteId: "S-CIH" }],
    ["Complete access control checks", "To Do", "P10", "Normal", "Safety", ["d", 4], { siteId: "S-CIH" }],
    ["Review AI build space layout", "In Progress", "P02", "Normal", "Design", ["d", 3], { docIds: ["DOC-2059-LAY"] }],
    ["Check monitoring dashboards", "QA / Sign Off", "P06", "Normal", "QA", ["d", 7], { siteId: "S-CIH" }],
    ["Sign off network segmentation", "Backlog", "P02", "High", "Design", ["d", 10]],
    ["Prepare internal handover pack", "Backlog", "P10", "Low", "Client", ["d", 30]],
    ["Strip out former training room", "Done", "P06", "Normal", "Design", ["done", -20]],
    ["Order PDUs and in-row cooling units", "To Do", "P12", "Normal", "Procurement", ["d", 8]],
    ["Electrical survey of DB-3", "Done", "P06", "Normal", "Safety", ["done", -16], { siteId: "S-CIH" }],
    ["Fire-stopping survey", "Done", "P06", "Normal", "Safety", ["done", -14], { siteId: "S-CIH" }],
  ]);

  addTasks("TRN-2063", [
    ["Escalate licence decision PER-DLR-017", "To Do", "P01", "High", "Permits", ["today"], { workAreaId: "WA-2063-1", permitId: "PER-DLR-017", approvalId: "APR-2063-01",
      description: "Approve escalation to the council roads section. David cannot approve the licence itself; only the council decides." }],
    ["Track PER-DLR-017", "In Progress", "P09", "High", "Permits", ["h", 30], { workAreaId: "WA-2063-1", permitId: "PER-DLR-017", docIds: ["DOC-2063-PER"] }],
    ["Reserve provisional crew window", "Done", "P10", "Normal", "Permits", ["done", -2], { workAreaId: "WA-2063-1",
      description: "Three-person crew window reserved from " + F(3) + ". Provisional until the licence is granted." }],
    ["Update traffic management drawings", "In Progress", "P09", "Normal", "Design", ["d", 5], { workAreaId: "WA-2063-1" }],
    ["Verify chamber survey", "To Do", "P09", "Normal", "Civils", ["od", -2], { workAreaId: "WA-2063-1" }],
    ["Confirm reinstatement method", "To Do", "P03", "Normal", "Civils", ["d", 9], { workAreaId: "WA-2063-1" }],
    ["Review excavation RAMS", "QA / Sign Off", "P08", "High", "Safety", ["d", 3], { workAreaId: "WA-2063-1", docIds: ["DOC-2063-RAMS02"] }],
    ["Prepare council evidence pack", "To Do", "P10", "Normal", "Client", ["d", 6], { workAreaId: "WA-2063-1" }],
    ["Open duct section DLR-04 to DLR-07", "Backlog", "P09", "Normal", "Civils", ["d", 10], { workAreaId: "WA-2063-1", permitId: "PER-DLR-017", dependsOn: ["T-2063-02"] }],
    ["Upgrade chambers CH-12 to CH-15", "Backlog", "P09", "Normal", "Civils", ["d", 14], { workAreaId: "WA-2063-1", permitId: "PER-DLR-017", dependsOn: ["T-2063-09"] }],
    ["Reinstate chambers CH-12 to CH-15", "Backlog", "P09", "Low", "Civils", ["d", 28], { workAreaId: "WA-2063-1", permitId: "PER-DLR-017", dependsOn: ["T-2063-10"] }],
    ["Route walkdown and survey", "Done", "P09", "Normal", "Civils", ["done", -10], { workAreaId: "WA-2063-1" }],
  ]);
  const taskEst: Record<string, number> = { Urgent: 6, High: 8, Normal: 6, Low: 3 };
  tasks.forEach((t) => { t.estimate = taskEst[t.priority]; if (!t.startAt) t.startAt = new Date(Date.parse(t.dueAt) - 4 * 86400000).toISOString(); });

  /* ── risks, permits, RAMS, commercials ───────────────────────────── */
  const R = (id: string, projectId: string, title: string, probability: number, impact: number, mitigation: string, ownerId: string, reviewN: number, status: "Open" | "Mitigating" | "Closed" = "Open") =>
    ({ id, projectId, title, probability, impact, mitigation, ownerId, reviewAt: eod(reviewN), status });
  const risks = [
    R("RSK-2041-01", "TRN-2041", "Watermain diversion clash delays Main Street works", 5, 4, "Revised alignment with council engineer; variation CR-2041-03 priced; night works planned.", "P03", 1, "Mitigating"),
    R("RSK-2041-02", "TRN-2041", "Unrecorded services in Market Square", 3, 3, "GPR survey ahead of each excavation; hand dig within 500 mm.", "P09", 7),
    R("RSK-2041-03", "TRN-2041", "Public access complaints during night works", 2, 2, "Updated public access notice; council liaison.", "P10", 10),
    R("RSK-2048-01", "TRN-2048", "Splice QA backlog delays acceptance evidence", 3, 3, "Seán to clear 96 records before evidence review.", "P07", 3, "Mitigating"),
    R("RSK-2048-02", "TRN-2048", "Duct blockage on Naas Road", 2, 2, "Rod and rope, then targeted excavation if needed.", "P09", 5),
    R("RSK-2035-01", "TRN-2035", "Cooling alarm recurrence at Landing Station 1", 3, 4, "CRAC-03 coil service and setpoint review after HD-4821.", "P05", 4),
    R("RSK-2035-02", "TRN-2035", "UPS battery string end of life at Landing Station 2", 2, 4, "Impedance trend review; replacement quote.", "P11", 14),
    R("RSK-2052-01", "TRN-2052", "Containment package delivery slips further", 3, 5, "Written confirmation by zone; weekly supplier call; recovery proposal CR-2052-02.", "P03", 2, "Mitigating"),
    R("RSK-2052-02", "TRN-2052", "Weekend shift capacity for recovery", 3, 3, "Confirm crew availability against rest windows before approval.", "P10", 3),
    R("RSK-2052-03", "TRN-2052", "Commissioning witness slot availability", 2, 3, "Early booking of client witness dates.", "P06", 14),
    R("RSK-2059-01", "TRN-2059", "Cooling headroom insufficient for AI racks", 2, 4, "Validate in-row duty before readiness gate.", "P06", 6, "Mitigating"),
    R("RSK-2059-02", "TRN-2059", "PDU lead time", 2, 2, "Order placed early; alternative supplier identified.", "P12", 8),
    R("RSK-2063-01", "TRN-2063", "Road opening licence decision delayed", 4, 4, "Escalation to council roads section; provisional crew window held.", "P09", 2, "Mitigating"),
    R("RSK-2063-02", "TRN-2063", "Chamber condition worse than survey", 2, 3, "Verify chamber survey before ordering extra covers.", "P09", 5),
  ];

  const permits = [
    { id: "PER-DLR-017", projectId: "TRN-2063", workAreaId: "WA-2063-1", name: "Road opening licence, DLR works corridor", authority: "Dún Laoghaire–Rathdown County Council",
      status: "Pending decision" as const, appliedAt: atD(-18, 10), decisionDueAt: eod(2), blockedTaskIds: ["T-2063-09", "T-2063-10", "T-2063-11"], docId: "DOC-2063-PER" },
    { id: "PER-2041-009", projectId: "TRN-2041", workAreaId: "WA-2041-A", name: "Road opening licence, Main Street", authority: "Wicklow County Council",
      status: "Approved" as const, appliedAt: atD(-140, 10), decisionDueAt: eod(-125), expiresAt: eod(60), blockedTaskIds: [], docId: "DOC-2041-TTM",
      decision: { at: atD(-126, 11), outcome: "Approved", reference: "WCC-ROL-0912", provenance: "Council licence letter filed in Documents", recordedBy: "P03" } },
    { id: "PER-2048-022", projectId: "TRN-2048", workAreaId: "WA-2048-C", name: "Road works licence, Naas Road", authority: "Kildare County Council",
      status: "Granted with conditions" as const, appliedAt: atD(-100, 10), decisionDueAt: eod(-85), expiresAt: eod(40), blockedTaskIds: [], docId: "DOC-2048-TMP",
      decision: { at: atD(-86, 11), outcome: "Granted with conditions (off-peak only)", reference: "KCC-RWL-2214", provenance: "Council licence letter filed in Documents", recordedBy: "P04" } },
    { id: "PER-2052-004", projectId: "TRN-2052", workAreaId: "WA-2052-Z", name: "Client hot-works permit, Zone C", authority: "Client site permit office",
      status: "Approved" as const, appliedAt: atD(-20, 10), decisionDueAt: eod(-15), expiresAt: eod(12), blockedTaskIds: [], docId: "DOC-2052-RAMS04",
      decision: { at: atD(-15, 9), outcome: "Approved", reference: "H4-HW-118", provenance: "Client permit system export", recordedBy: "P08" } },
  ];
  const rams = [
    { id: "RAMS-2041-07", projectId: "TRN-2041", title: "Watermain diversion excavation and night works", status: "In review" as const, reviewAt: eod(1), ownerId: "P08", docId: "DOC-2041-RAMS07", workAreaId: "WA-2041-A", taskIds: ["T-2041-03", "T-2041-01"] },
    { id: "RAMS-2041-03", projectId: "TRN-2041", title: "Traffic management, Main Street", status: "Approved" as const, reviewAt: eod(30), ownerId: "P08", docId: "DOC-2041-TTM", workAreaId: "WA-2041-A", taskIds: ["T-2041-04"] },
    { id: "RAMS-2048-05", projectId: "TRN-2048", title: "Splicing and cabinet works", status: "Approved" as const, reviewAt: eod(45), ownerId: "P08", docId: "DOC-2048-RAMS", workAreaId: "WA-2048-C", taskIds: ["T-2048-02"] },
    { id: "RAMS-2052-02", projectId: "TRN-2052", title: "Containment install at height (MEWP)", status: "Approved" as const, reviewAt: eod(20), ownerId: "P08", docId: "DOC-2052-RAMS02", workAreaId: "WA-2052-Z", taskIds: ["T-2052-10"] },
    { id: "RAMS-2052-04", projectId: "TRN-2052", title: "Hot works, Zone C", status: "In review" as const, reviewAt: eod(5), ownerId: "P08", docId: "DOC-2052-RAMS04", workAreaId: "WA-2052-Z", taskIds: ["T-2052-09"] },
    { id: "RAMS-2035-01", projectId: "TRN-2035", title: "LV, UPS and cooling planned maintenance", status: "Approved" as const, reviewAt: eod(60), ownerId: "P05", docId: "DOC-2035-RAMS", taskIds: [] },
    { id: "RAMS-2059-01", projectId: "TRN-2059", title: "CI Hub electrical fit out", status: "Approved" as const, reviewAt: eod(40), ownerId: "P08", docId: "DOC-2059-RAMS", workAreaId: "WA-2059-B", taskIds: ["T-2059-03"] },
    { id: "RAMS-2063-02", projectId: "TRN-2063", title: "Excavation and chamber works, DLR corridor", status: "In review" as const, reviewAt: eod(3), ownerId: "P08", docId: "DOC-2063-RAMS02", workAreaId: "WA-2063-1", taskIds: ["T-2063-07", "T-2063-09", "T-2063-10"] },
  ];
  const changes = [
    { id: "CR-2041-03", projectId: "TRN-2041", title: "Watermain diversion redesign, extra excavation and night works", kind: "Variation" as const, amount: 84000,
      status: "Awaiting approval" as const, ownerId: "P03", raisedAt: atD(-2, 16), evidenceDocIds: ["DOC-2041-VAR03", "DOC-2041-RAMS07"], approvalId: "APR-2041-03",
      reason: "Existing watermain 600 mm east of record drawings on a 40 m section.", effect: "If approved, approved variations rise by €84,000. The original €4,800,000 contract value is retained for audit." },
    { id: "CR-2041-02", projectId: "TRN-2041", title: "Additional kerbing at Market Square", kind: "Variation" as const, amount: 18500,
      status: "Rejected" as const, ownerId: "P12", raisedAt: atD(-45, 11), decidedAt: atD(-40, 15), evidenceDocIds: [], reason: "Client instructed omission.", effect: "No change to contract value." },
    { id: "CR-2052-02", projectId: "TRN-2052", title: "Hall 4 recovery proposal: weekend second shift and Zone D resequence", kind: "Recovery proposal" as const, amount: 42000,
      status: "Awaiting approval" as const, ownerId: "P03", raisedAt: atD(-1, 11), evidenceDocIds: ["DOC-2052-REC", "DOC-2052-PRG"], approvalId: "APR-2052-02",
      reason: "Containment package PO-5521 is 21 days late; Zones C and D cannot start.", effect: "Authorises €42,000 of recovery cost targeting " + F(67) + " (10 days recovered of 21). The containment delivery itself stays pending." },
    { id: "CR-2063-01", projectId: "TRN-2063", title: "Night-works traffic management uplift", kind: "Variation" as const, amount: null,
      status: "Draft" as const, ownerId: "P12", raisedAt: atD(-3, 10), evidenceDocIds: [], reason: "Council may require off-peak working on the corridor.", effect: "Being priced. Not included in pending priced changes." },
  ];
  const valuations = [
    { id: "VAL-2041-08", projectId: "TRN-2041", period: "Valuation 8", amount: 265000, reviewAt: eod(7), status: "Draft" as const, readiness: 0.7, evidence: ["Measured quantities", "Photo record", "Variation status note (pending)"] },
    { id: "VAL-2048-05", projectId: "TRN-2048", period: "Valuation 5", amount: 180000, reviewAt: eod(10), status: "Draft" as const, readiness: 0.55, evidence: ["Premises-passed register", "OTDR traces", "Splice QA (96 records pending)"] },
    { id: "VAL-2052-04", projectId: "TRN-2052", period: "Valuation 4", amount: 420000, reviewAt: eod(12), status: "Draft" as const, readiness: 0.6, evidence: ["Zones A and B cabling", "Polarity test results", "Programme revision"] },
    { id: "VAL-2063-01", projectId: "TRN-2063", period: "Valuation 1", amount: 65000, reviewAt: eod(14), status: "Draft" as const, readiness: 0.4, evidence: ["Survey and walkdown", "Preliminaries"] },
  ];

  /* ── sites, assets, maintenance, inspections ─────────────────────── */
  const sites = [
    { id: "S-LS1", name: "Landing Station 1", clientId: "CL-AQC", projectId: "TRN-2035", type: "Subsea cable landing station", leadId: "P05", location: "East coast landing station", indicator: { label: "Service uptime", value: "99.99%" }, description: "Power, cooling and monitoring for the subsea cable landing station. 24/7 helpdesk coverage." },
    { id: "S-LS2", name: "Landing Station 2", clientId: "CL-AQC", projectId: "TRN-2035", type: "Subsea cable landing station", leadId: "P05", location: "Second landing station", indicator: { label: "Service uptime", value: "100%" }, description: "Second landing station under the same managed-service agreement." },
    { id: "S-H4", name: "Hall 4, Dublin 15", clientId: "CL-HYP", projectId: "TRN-2052", type: "Hyperscale data hall (fit out)", leadId: "P06", location: "Dublin 15", indicator: { label: "Monitored-system uptime", value: "99.98%" }, description: "White space fit out: containment, structured cabling, racks and grounding." },
    { id: "S-CIH", name: "CI Hub, Naas", clientId: "CL-TRN", projectId: "TRN-2059", type: "Turnua CI Hub", leadId: "P02", location: "Monread Industrial Park, Naas", indicator: { label: "Monitored-system uptime", value: "100%" }, description: "Turnua’s CI Hub, including the AI build space upgrade." },
    { id: "S-RTH", name: "Rathdrum Works", clientId: "CL-WCC", projectId: "TRN-2041", type: "Civils works site", leadId: "P03", location: "Rathdrum, Co. Wicklow", indicator: { label: "Site link", value: "Connected" }, description: "Construction site compound, plant and temporary works for the public realm scheme." },
    { id: "S-KLD", name: "Kildare FTTH Cluster", clientId: "CL-NBI", projectId: "TRN-2048", type: "FTTH network cluster", leadId: "P04", location: "Kildare cluster", indicator: { label: "Monitored-network uptime", value: "99.97%" }, description: "Fibre cabinets, splice closures and monitoring gateways across the Phase 3 cluster." },
  ];

  const r = rng(20261110);
  const pick = <X,>(a: X[]) => a[Math.floor(r() * a.length)];
  const MAKER: Record<string, [string, string][]> = {
    "UPS": [["Vertiv", "UPS 120 kVA (sample)"], ["APC", "UPS 80 kVA (sample)"], ["Delta", "Modular UPS 100 kVA (sample)"]],
    "Battery string": [["Vertiv", "VRLA string 40 x 12 V (sample)"], ["APC", "VRLA string (sample)"]],
    "Generator": [["Siemens", "Standby genset controls (sample)"], ["Delta", "Genset monitoring (sample)"]],
    "Cooling unit": [["Vertiv", "Close control unit 45 kW (sample)"], ["Delta", "In-row cooler 30 kW (sample)"]],
    "Distribution board": [["Siemens", "LV distribution board (sample)"], ["APC", "Rack PDU 22 kW (sample)"]],
    "Rack": [["APC", "42U rack 800 x 1200 (sample)"], ["Vertiv", "48U rack (sample)"]],
    "Patch panel": [["Generic", "48-port LC patch panel (sample)"], ["Generic", "96-fibre MPO panel (sample)"]],
    "Access reader": [["Siemens", "Card reader (sample)"]],
    "Monitoring gateway": [["Siemens", "BMS gateway (sample)"], ["Delta", "Environmental monitor (sample)"]],
    "Containment run": [["Leinster Containment Supply (Demo)", "Cable basket 300 mm"]],
    "Fibre cabinet": [["Generic", "Street cabinet 288F (sample)"]],
    "Splice closure": [["Generic", "Dome closure 144F (sample)"]],
    "Temporary traffic signals": [["Generic", "Portable signals (sample)"]],
    "Pump set": [["Generic", "Dewatering pump 4 in (sample)"]],
    "Site generator": [["Generic", "Site generator 20 kVA (sample)"]],
    "Chamber": [["Midland Civils Supply (Demo)", "Precast chamber (sample)"]],
    "Welfare unit": [["Generic", "Welfare cabin (sample)"]],
  };
  const PREFIX: Record<string, string> = { "UPS": "UPS", "Battery string": "BAT", "Generator": "GEN", "Cooling unit": "CRAC", "Distribution board": "DB", "Rack": "R", "Patch panel": "PP",
    "Access reader": "AR", "Monitoring gateway": "MON", "Containment run": "CT", "Fibre cabinet": "CAB", "Splice closure": "SC", "Temporary traffic signals": "TS", "Pump set": "PMP",
    "Site generator": "SG", "Chamber": "CH", "Welfare unit": "WEL" };
  const MIX: Record<string, [string, number][]> = {
    "S-LS1": [["UPS", 4], ["Battery string", 8], ["Generator", 2], ["Cooling unit", 6], ["Distribution board", 8], ["Rack", 10], ["Patch panel", 4], ["Access reader", 4], ["Monitoring gateway", 2]],
    "S-LS2": [["UPS", 3], ["Battery string", 6], ["Generator", 2], ["Cooling unit", 4], ["Distribution board", 6], ["Rack", 8], ["Patch panel", 3], ["Access reader", 2], ["Monitoring gateway", 2]],
    "S-H4": [["Rack", 64], ["Patch panel", 32], ["Distribution board", 8], ["Cooling unit", 6], ["Containment run", 8], ["Access reader", 4], ["Monitoring gateway", 2]],
    "S-CIH": [["UPS", 2], ["Battery string", 4], ["Cooling unit", 2], ["Distribution board", 4], ["Rack", 8], ["Patch panel", 6], ["Access reader", 4], ["Monitoring gateway", 2]],
    "S-RTH": [["Temporary traffic signals", 4], ["Pump set", 2], ["Site generator", 2], ["Chamber", 6], ["Monitoring gateway", 2], ["Welfare unit", 2]],
    "S-KLD": [["Fibre cabinet", 40], ["Splice closure", 38], ["Monitoring gateway", 8]],
  };
  const SITE_CODE: Record<string, string> = { "S-LS1": "LS1", "S-LS2": "LS2", "S-H4": "H4", "S-CIH": "CIH", "S-RTH": "RTH", "S-KLD": "KLD" };
  const CONSTRUCTION = new Set(["Containment run", "Temporary traffic signals", "Pump set", "Site generator", "Chamber", "Welfare unit"]);
  const assets: Asset[] = [];
  for (const siteId of Object.keys(MIX)) {
    const code = SITE_CODE[siteId];
    for (const [type, count] of MIX[siteId]) {
      for (let i = 1; i <= count; i++) {
        let label = PREFIX[type] + "-" + String(i).padStart(2, "0");
        if (siteId === "S-H4" && (type === "Rack" || type === "Patch panel")) {
          const row = "ABCDEFGH"[Math.floor((i - 1) / (type === "Rack" ? 8 : 4))];
          const pos = ((i - 1) % (type === "Rack" ? 8 : 4)) + 1;
          label = (type === "Rack" ? "R-" : "PP-") + row + String(type === "Rack" ? pos : 10 + pos).padStart(2, "0");
        }
        if (siteId === "S-KLD" && type === "Fibre cabinet") label = "KLD-C" + String(i).padStart(2, "0");
        if (siteId === "S-KLD" && type === "Splice closure") label = "KLD-SC" + String(i).padStart(3, "0");
        const [manufacturer, model] = pick(MAKER[type]);
        const construction = CONSTRUCTION.has(type) || (siteId === "S-H4" && type !== "Monitoring gateway" && type !== "Cooling unit");
        const commissioned = siteId === "S-H4" ? -40 + Math.floor(r() * 30) : siteId === "S-CIH" ? -900 - Math.floor(r() * 400) : siteId === "S-RTH" ? -110 + Math.floor(r() * 30) : -1400 - Math.floor(r() * 900);
        assets.push({
          id: "AST-" + code + "-" + label.replace(/^KLD-/, ""),
          siteId, name: label + " " + type.toLowerCase(), type, category: construction ? "Construction" : "Service",
          criticality: ["UPS", "Battery string", "Generator", "Cooling unit"].includes(type) ? "Critical" : ["Distribution board", "Fibre cabinet", "Monitoring gateway"].includes(type) ? "High" : ["Rack", "Splice closure", "Chamber"].includes(type) ? "Medium" : "Low",
          state: siteId === "S-H4" && construction ? (i % 3 === 0 ? "Commissioning" : "Installed") : type === "Generator" ? "Standby" : "In service",
          manufacturer, model, commissionedAt: atD(commissioned, 12), condition: r() < 0.08 ? "Monitor" : r() < 0.25 ? "Fair" : "Good",
          location: siteId === "S-H4" ? "White space" : siteId === "S-KLD" ? "Cluster route" : siteId === "S-RTH" ? "Site compound" : pick(["Plant room", "Equipment hall", "Battery room", "Comms room"]),
        });
      }
    }
  }
  const findAsset = (id: string) => assets.find((a) => a.id === id)!;
  const crac3 = findAsset("AST-LS1-CRAC-03"); crac3.state = "Fault"; crac3.condition = "Monitor"; crac3.reading = { label: "Return air (demo reading)", value: "31.4 °C (setpoint 24 °C)", at: minsAgo(4) };
  const ls2bat = findAsset("AST-LS2-BAT-02"); ls2bat.condition = "Monitor"; ls2bat.reading = { label: "String voltage (demo reading)", value: "12.31 V per block, threshold 12.35 V", at: minsAgo(9) };
  const gen1 = findAsset("AST-LS1-GEN-01"); gen1.condition = "Monitor"; gen1.reading = { label: "Fuel level sensor (demo reading)", value: "Drifting ±6% vs dip check", at: minsAgo(12) };
  findAsset("AST-LS1-UPS-01").reading = { label: "Load (demo reading)", value: "41% of rated capacity", at: minsAgo(3) };
  findAsset("AST-KLD-C14").reading = { label: "Gateway link (demo reading)", value: "Restored, 0 packet loss", at: minsAgo(70) };

  const JOBS: Record<string, string> = {
    "UPS": "UPS quarterly inspection", "Battery string": "Battery impedance test", "Generator": "Generator load bank test", "Cooling unit": "Cooling unit filter and coil service",
    "Distribution board": "Thermal imaging survey", "Rack": "Rack PDU and grounding check", "Patch panel": "Patch panel labelling audit", "Access reader": "Access control function test",
    "Monitoring gateway": "Monitoring gateway health check", "Containment run": "Containment fixing inspection", "Fibre cabinet": "Cabinet inspection and clean", "Splice closure": "Closure seal check",
    "Temporary traffic signals": "Signal function check", "Pump set": "Pump service", "Site generator": "Site generator service", "Chamber": "Chamber level check", "Welfare unit": "Welfare unit inspection",
  };
  const PPM: Record<string, [number, number, string]> = { "S-LS1": [50, 47, "P05"], "S-LS2": [50, 45, "P11"], "S-H4": [25, 22, "P06"], "S-CIH": [12, 12, "P06"], "S-RTH": [25, 24, "P09"], "S-KLD": [50, 49, "P07"] };
  const maintenance: MaintenanceJob[] = [];
  let jn = 0;
  for (const siteId of Object.keys(PPM)) {
    const [total, complete, lead] = PPM[siteId];
    const siteAssets = assets.filter((a) => a.siteId === siteId);
    for (let i = 0; i < total; i++) {
      const asset = siteAssets[(i * 7) % siteAssets.length];
      const isDone = i < complete;
      const openIdx = i - complete;
      const dueN = isDone ? -40 + Math.floor((i / complete) * 38) : [-2, 3, 6, 9, 12][openIdx % 5];
      const assignee = siteId === "S-LS1" || siteId === "S-LS2" ? (i % 3 === 0 ? "P11" : i % 5 === 0 ? "P06" : "P05") : lead;
      jn++;
      maintenance.push({
        id: "PPM-" + SITE_CODE[siteId] + "-" + String(i + 1).padStart(3, "0"), siteId, assetId: asset.id,
        title: JOBS[asset.type] + ", " + asset.name.split(" ")[0], dueAt: eod(dueN), assigneeId: assignee, cycle: "Current cycle",
        completedAt: isDone ? atD(dueN - (i % 3), 11) : undefined, evidence: isDone ? "Checklist and readings recorded" : undefined,
        checklist: ck([["Isolate or confirm safe state", isDone], ["Inspect and record readings", isDone], ["Photos uploaded", isDone], ["Return to service", isDone]]),
      });
    }
  }

  const inspections = [
    { id: "INS-01", siteId: "S-LS1", type: "Electrical visual check", date: atD(-6, 10), inspectorId: "P05", summary: "LV boards and UPS room visual inspection.", findingIds: ["FND-01", "FND-02"] },
    { id: "INS-02", siteId: "S-RTH", type: "Site safety inspection", date: atD(-3, 9), inspectorId: "P08", summary: "Weekly HSEQ inspection of excavations and traffic management.", findingIds: ["FND-03", "FND-04"] },
    { id: "INS-03", siteId: "S-H4", type: "Working at height and access", date: atD(-4, 14), inspectorId: "P08", summary: "MEWP use, edge protection and access routes in Zones A and B.", findingIds: ["FND-05"] },
    { id: "INS-04", siteId: "S-CIH", type: "Access control audit", date: atD(-9, 11), inspectorId: "P06", summary: "Door readers and visitor process for the AI build space.", findingIds: ["FND-06"] },
    { id: "INS-05", siteId: "S-KLD", type: "Fibre quality inspection", date: atD(-5, 13), inspectorId: "P07", summary: "Splice closures and cabinet terminations, sample of 20.", findingIds: ["FND-07"] },
    { id: "INS-06", siteId: "S-LS2", type: "Building fabric check", date: atD(-12, 10), inspectorId: "P05", summary: "Roof, penetrations and fire-stopping in the equipment hall.", findingIds: ["FND-08"] },
  ];
  const FIND = (id: string, inspectionId: string, text: string, severity: "High" | "Medium" | "Low", ownerId: string, dueN: number, status: "Open" | "Closed", taskId: string | undefined, photo: string) =>
    ({ id, inspectionId, text, severity, ownerId, dueAt: eod(dueN), status, taskId, photo, closedAt: status === "Closed" ? atD(dueN - 1, 15) : undefined });
  const findings = [
    FIND("FND-01", "INS-01", "Outgoing way labels missing on DB-04", "Medium", "P11", 6, "Open", undefined, "Board DB-04 with three unlabelled outgoing ways, ways 7 to 9."),
    FIND("FND-02", "INS-01", "UPS room door closer slow to latch", "Low", "P05", -2, "Closed", undefined, "Door closer adjusted and latching tested."),
    FIND("FND-03", "INS-02", "Barrier gap at Main Street excavation", "High", "P09", -3, "Closed", undefined, "Pedestrian barrier gap of 1.2 m at the north end of the trench, closed same day."),
    FIND("FND-04", "INS-02", "Spoil heap within 1 m of trench edge", "High", "P08", 1, "Open", "T-2041-03", "Spoil stockpiled within 1 m of the edge on the diversion section; captured in the RAMS update."),
    FIND("FND-05", "INS-03", "MEWP pre-use checks not signed on two days", "Medium", "P06", 2, "Open", undefined, "Pre-use check sheet with two blank days for MEWP-02."),
    FIND("FND-06", "INS-04", "Visitor badge return not enforced", "Low", "P10", 4, "Open", "T-2059-04", "Visitor log with three badges not returned."),
    FIND("FND-07", "INS-05", "Two closures with incomplete heat-shrink records", "Medium", "P07", 3, "Open", "T-2048-01", "Splice records SC-031 and SC-034 missing heat-shrink confirmation."),
    FIND("FND-08", "INS-06", "Fire-stopping missing at one cable penetration", "Medium", "P05", 8, "Open", undefined, "Penetration P-12 above rack row B without fire-stopping."),
  ];

  /* ── helpdesk ────────────────────────────────────────────────────── */
  const TK = (id: string, title: string, siteId: string, assetId: string | undefined, clientId: string, priority: TicketPriority, status: Ticket["status"], engineerId: string, remaining: number, desc: string, runbookId?: string, taskId?: string): Ticket => {
    const created = now - (SLA_TARGET[priority] - remaining) * 60000;
    const createdAt = new Date(created).toISOString();
    return { id, title, description: desc, siteId, assetId, clientId, priority, status, engineerId, createdAt,
      cycles: [{ startedAt: createdAt, dueAt: new Date(created + SLA_TARGET[priority] * 60000).toISOString() }],
      runbookId, taskId, origin: "seed",
      timeline: [{ at: createdAt, actor: "Monitoring (demo feed)", text: "Alarm raised and ticket opened." },
        ...(status === "Assigned" ? [{ at: new Date(created + 3 * 60000).toISOString(), actor: "Liam Fitzgerald", text: "Assigned to " + (engineerId === "P05" ? "Paul O’Neill" : engineerId === "P11" ? "Liam Fitzgerald" : "Conor Walsh") + "." }] : [])],
      notes: [] };
  };
  const tickets: Ticket[] = [
    TK("HD-4821", "Cooling high return temperature", "S-LS1", "AST-LS1-CRAC-03", "CL-AQC", "P1", "Assigned", "P05", 18,
      "CRAC-03 return air at 31.4 °C against a 24 °C setpoint. Redundant units are carrying the load. Equipment hall temperature trending up slowly.", "KB-01", "T-2035-01"),
    TK("HD-4820", "UPS battery threshold alarm", "S-LS2", "AST-LS2-BAT-02", "CL-AQC", "P2", "Assigned", "P11", 97,
      "Battery string 2 block voltage below the 12.35 V threshold on the UPS-B string.", "KB-02", "T-2035-02"),
    TK("HD-4819", "Patch panel labelling discrepancy", "S-H4", "AST-H4-PP-C14", "CL-HYP", "P3", "Open", "P06", 482,
      "Client walkdown found PP-C14 labels do not match the as-built schedule for ports 25 to 36."),
    TK("HD-4818", "Access reader intermittent fault", "S-CIH", "AST-CIH-AR-02", "CL-TRN", "P3", "Open", "P06", 320,
      "AR-02 on the AI build space door intermittently fails to read badges in the morning."),
    TK("HD-4817", "Generator fuel sensor drift", "S-LS1", "AST-LS1-GEN-01", "CL-AQC", "P2", "Assigned", "P05", 44,
      "GEN-01 fuel level sensor drifting about 6% against a manual dip check.", "KB-03", "T-2035-03"),
    TK("HD-4816", "Rack elevation clarification", "S-H4", "AST-H4-R-C07", "CL-HYP", "P4", "Open", "P06", 1860,
      "Client requests confirmation of the R-C07 rack elevation against drawing rev C."),
  ];
  const resolvedCreated = now - 26 * 3600000;
  tickets.push({ id: "HD-4815", title: "Cabinet monitoring link restored", description: "Monitoring gateway on cabinet KLD-C14 lost its link after mains work. Link restored and verified.",
    siteId: "S-KLD", assetId: "AST-KLD-C14", clientId: "CL-NBI", priority: "P3", status: "Resolved", engineerId: "P07", createdAt: new Date(resolvedCreated).toISOString(),
    cycles: [{ startedAt: new Date(resolvedCreated).toISOString(), dueAt: new Date(resolvedCreated + 1440 * 60000).toISOString(), acknowledgedAt: new Date(resolvedCreated + 9 * 60000).toISOString(), result: "Met" }],
    resolvedAt: new Date(now - 20 * 3600000).toISOString(), resolutionNote: "Gateway power supply reseated after mains work, link verified for 30 minutes.", runbookId: "KB-04", origin: "seed",
    timeline: [{ at: new Date(resolvedCreated).toISOString(), actor: "Monitoring (demo feed)", text: "Gateway link lost." },
      { at: new Date(resolvedCreated + 9 * 60000).toISOString(), actor: "Seán Keane", text: "Acknowledged, attending." },
      { at: new Date(now - 20 * 3600000).toISOString(), actor: "Seán Keane", text: "Resolved: power supply reseated, link verified." }], notes: [] });

  const to = eod(-1);
  const from = endOfDay(addDays(T, -91));
  const weekly = Array.from({ length: 13 }, (_, i) => {
    const eligible = [96, 101, 94, 99, 103, 97, 92, 100, 104, 98, 95, 102, 103][i];
    const missed = [1, 0, 1, 1, 0, 2, 0, 1, 0, 1, 1, 1, 1][i];
    return { week: "Week of " + addDays(mondayOf(T), -7 * (13 - i)), eligible, met: eligible - missed, mean: [4.4, 4.0, 4.3, 4.6, 3.9, 4.8, 3.8, 4.2, 4.0, 4.3, 4.1, 4.2, 4.0][i] };
  });
  const sla = {
    scope: "Managed-service SLA: AquaComms Landing Station 1 and Landing Station 2", from, to, cutoffAt: to,
    eligible: 1284, met: 1274, missed: 10, meanResponseMins: 4.2,
    byPriority: [{ priority: "P1" as const, eligible: 38, met: 37, mean: 3.1 }, { priority: "P2" as const, eligible: 146, met: 144, mean: 3.6 },
      { priority: "P3" as const, eligible: 702, met: 698, mean: 4.3 }, { priority: "P4" as const, eligible: 398, met: 395, mean: 4.5 }],
    bySite: [{ siteId: "S-LS1", eligible: 702, met: 696 }, { siteId: "S-LS2", eligible: 582, met: 578 }],
    weekly,
    missedRows: [
      ["HD-4402", -86, "S-LS1", "P3", "Door contact alarm, comms room", 1512, 1440], ["HD-4437", -78, "S-LS2", "P4", "Lighting fault, generator room", 2950, 2880],
      ["HD-4481", -71, "S-LS1", "P2", "UPS bypass alarm", 251, 240], ["HD-4520", -64, "S-LS1", "P3", "Water detection test alarm", 1475, 1440],
      ["HD-4566", -55, "S-LS2", "P3", "Humidity high, equipment hall", 1468, 1440], ["HD-4590", -49, "S-LS1", "P1", "Mains failure, transfer to generator", 64, 60],
      ["HD-4633", -40, "S-LS2", "P4", "Fence sensor fault", 2905, 2880], ["HD-4689", -31, "S-LS1", "P3", "Smoke detector head fault", 1490, 1440],
      ["HD-4724", -19, "S-LS1", "P2", "Cooling unit compressor alarm", 248, 240], ["HD-4771", -8, "S-LS2", "P4", "CCTV camera offline", 2896, 2880],
    ].map(([id, dn, siteId, priority, title, responseMins, targetMins]) => ({ id: id as string, at: atD(dn as number, 3 + ((dn as number) % 9 + 9) % 9), siteId: siteId as string, priority: priority as TicketPriority, title: title as string, responseMins: responseMins as number, targetMins: targetMins as number })),
  };

  const runbooks = [
    { id: "KB-01", title: "Cooling alarm triage", ownerId: "P05", version: "v2.3", reviewAt: eod(120), assetTypes: ["Cooling unit"], summary: "Coordinate response to high return or supply temperature alarms.",
      steps: ["Acknowledge the ticket and note the alarm values and time.", "Check the site monitoring view for redundant unit status and hall temperature trend.", "Phone the on-site contact or attend; do not change setpoints remotely without the lead engineer.", "Confirm redundancy is carrying the load and record readings every 15 minutes.", "Update the client contact with status and next update time.", "Hand over to the day lead with readings and actions taken."] },
    { id: "KB-02", title: "UPS battery alert", ownerId: "P05", version: "v1.8", reviewAt: eod(90), assetTypes: ["UPS", "Battery string"], summary: "Coordinate response to battery voltage, temperature or impedance alerts.",
      steps: ["Acknowledge and capture block voltages from the monitoring export.", "Check whether the UPS is on mains and the load level.", "Compare with the last impedance test results.", "Book a site visit with a qualified engineer if the trend continues.", "Raise a replacement quote request if the string is end of life."] },
    { id: "KB-03", title: "Generator sensor investigation", ownerId: "P05", version: "v1.2", reviewAt: eod(150), assetTypes: ["Generator"], summary: "Investigate fuel, temperature or oil sensor drift on standby generators.",
      steps: ["Acknowledge and record the reported value against the last manual check.", "Arrange a manual dip check at the next visit.", "Review recent fuel deliveries and run hours.", "Log the sensor for calibration with the service provider."] },
    { id: "KB-04", title: "Fibre link loss", ownerId: "P04", version: "v3.0", reviewAt: eod(80), assetTypes: ["Monitoring gateway", "Fibre cabinet"], summary: "Coordinate response when a monitored fibre link or gateway drops.",
      steps: ["Acknowledge and check whether other gateways on the route are affected.", "Check for planned works or mains outages on the route.", "Dispatch the nearest splicing crew with the cabinet reference.", "Verify link stability for 30 minutes before resolving."] },
    { id: "KB-05", title: "After-hours escalation", ownerId: "P05", version: "v2.0", reviewAt: eod(60), assetTypes: [], summary: "Who to call, in what order, outside normal hours.",
      steps: ["Night helpdesk engineer triages and acknowledges.", "P1: phone the on-call lead immediately, then the Managing Director if no answer in 15 minutes.", "P2: phone the on-call lead within 30 minutes.", "Record every call in the ticket timeline.", "Hand over at 07:00 with open actions."] },
  ];

  /* ── approvals ───────────────────────────────────────────────────── */
  const approvals = [
    { id: "APR-2052-02", kind: "Recovery proposal" as const, title: "Hall 4 recovery proposal, €42,000", sourceType: "change", sourceId: "CR-2052-02", projectId: "TRN-2052", amount: 42000,
      requestedById: "P03", approverId: "P01", requestedAt: atD(-1, 11, 20), dueAt: eod(1), status: "Pending" as const, agentId: "recovery",
      reason: "Containment package PO-5521 is 21 days late. Weekend second shift and Zone D resequence recover 10 days.",
      effect: "Authorises €42,000 recovery cost. Forecast scenario moves to " + F(67) + " (still 11 days behind the " + F(56) + " baseline). Containment delivery stays pending.",
      evidenceDocIds: ["DOC-2052-REC", "DOC-2052-PRG"], origin: "seed" as const },
    { id: "APR-2041-03", kind: "Variation" as const, title: "Rathdrum variation CR-2041-03, €84,000", sourceType: "change", sourceId: "CR-2041-03", projectId: "TRN-2041", amount: 84000,
      requestedById: "P03", approverId: "P01", requestedAt: atD(-2, 16, 30), dueAt: eod(0), status: "Pending" as const,
      reason: "Watermain found 600 mm east of record drawings on a 40 m section of Main Street.",
      effect: "Approved variations rise by €84,000. Original contract value (€4,800,000) is retained; current value shown separately.",
      evidenceDocIds: ["DOC-2041-VAR03", "DOC-2041-RAMS07"], origin: "seed" as const },
    { id: "APR-2059-01", kind: "Readiness gate" as const, title: "CI Hub power and cooling readiness gate", sourceType: "milestone", sourceId: "MS-2059-2", projectId: "TRN-2059", amount: null,
      requestedById: "P02", approverId: "P01", requestedAt: atD(-1, 9, 45), dueAt: eod(6), status: "Pending" as const,
      reason: "Gate before AI rack installation: DB-3 load survey done, cooling duty check in progress.",
      effect: "Releases rack installation and demo environment work on the CI Hub programme.", evidenceDocIds: ["DOC-2059-LAY"], origin: "seed" as const },
    { id: "APR-TR-01", kind: "Training request" as const, title: "Safe Pass renewal for Ciarán Murphy", sourceType: "training", sourceId: "TR-01", amount: 120,
      requestedById: "P08", approverId: "P01", requestedAt: atD(-1, 14, 0), dueAt: eod(5), status: "Pending" as const,
      reason: "Safe Pass renewal due " + F(24) + ". Course slot held with Kildare Safety Training (Demo).",
      effect: "Books the course and adds it to Ciarán’s calendar. The credential stays due until renewal evidence is uploaded.", evidenceDocIds: [], origin: "seed" as const },
    { id: "APR-2063-01", kind: "Escalation" as const, title: "Escalate PER-DLR-017 to council roads section", sourceType: "permit", sourceId: "PER-DLR-017", projectId: "TRN-2063", amount: null,
      requestedById: "P09", approverId: "P01", requestedAt: atD(-1, 12, 10), dueAt: eod(0), status: "Pending" as const, agentId: "watchdog",
      reason: "Decision due " + F(2) + "; crew window reserved from " + F(3) + ". No response to two follow-ups.",
      effect: "Sends a demo escalation note from David to the council (not a real message). The licence stays pending until the council decides.", evidenceDocIds: ["DOC-2063-PER"], origin: "seed" as const },
  ];
  const training = [
    { id: "TR-01", personId: "P03", credentialId: "CERT-03-SP", course: "Safe Pass (renewal)", provider: "Kildare Safety Training (Demo)", date: atD(16, 8, 30),
      status: "Awaiting approval" as const, approvalId: "APR-TR-01", createdAt: atD(-1, 14, 0) },
  ];

  /* ── calendar ────────────────────────────────────────────────────── */
  const wd = weekdayOf(T);
  const leave1 = wd <= 3 ? T : wd === 4 ? addDays(T, -1) : addDays(mondayOf(T), 3);
  const leave2 = addDays(leave1, 1);
  const series = (id: string, title: string, type: CalEvent["type"], ownerId: string, attendeeIds: string[], byDay: number[], hh: number, mm: number, durationMins: number, location: string, extra: Partial<CalEvent> = {}): CalEvent => {
    const from = addDays(mondayOf(T), -56);
    const startTime = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
    return { id, title, type, ownerId, attendeeIds, start: at(from, hh, mm), end: new Date(Date.parse(at(from, hh, mm)) + durationMins * 60000).toISOString(),
      location, recurrence: { freq: "weekly", byDay, startTime, durationMins, from }, origin: "seed", ...extra };
  };
  const single = (id: string, title: string, type: CalEvent["type"], ownerId: string, attendeeIds: string[], start: string, end: string, location: string, extra: Partial<CalEvent> = {}): CalEvent =>
    ({ id, title, type, ownerId, attendeeIds, start, end, location, origin: "seed", ...extra });
  const supplierWed = addDays(mondayOf(T), 2);
  const events: CalEvent[] = [
    series("EV-STANDUP", "Monday ops stand-up", "Meeting", "P01", ["P01", "P02", "P03", "P04", "P05"], [0], 8, 30, 30, "CI Hub, Naas and Teams"),
    series("EV-BRF-H4", "Hall 4 site briefing", "Site visit", "P06", ["P06"], [0, 1, 2, 3, 4], 7, 0, 15, "Hall 4, Dublin 15", { projectId: "TRN-2052", siteId: "S-H4" }),
    series("EV-BRF-RTH", "Rathdrum site briefing", "Site visit", "P03", ["P03", "P08"], [0, 1, 2, 3, 4], 7, 0, 15, "Rathdrum Works", { projectId: "TRN-2041", siteId: "S-RTH" }),
    series("EV-BRF-KLD", "Kildare crew briefing", "Site visit", "P04", ["P04", "P07"], [0, 1, 2, 3, 4], 7, 0, 15, "Kildare FTTH Cluster", { projectId: "TRN-2048", siteId: "S-KLD" }),
    series("EV-BRF-DLR", "DLR corridor briefing", "Site visit", "P09", ["P09"], [0, 1, 2, 3, 4], 7, 0, 15, "DLR works corridor", { projectId: "TRN-2063" }),
    series("EV-AQC-WEEKLY", "AquaComms service review", "Client", "P05", ["P05", "P01"], [1], 10, 0, 45, "Teams", { projectId: "TRN-2035" }),
    series("EV-H4-STEER", "Hall 4 recovery steering group", "Meeting", "P03", ["P03", "P06", "P10"], [2], 11, 0, 60, "Hall 4 site office", { projectId: "TRN-2052" }),
    series("EV-RTH-CLIENT", "Rathdrum client coordination", "Client", "P03", ["P03", "P08"], [3], 9, 30, 60, "Rathdrum site office", { projectId: "TRN-2041" }),
    series("EV-PPM-WIN", "Landing station PPM window", "Maintenance", "P05", ["P05", "P11"], [1, 3], 22, 0, 120, "Landing Station 1", { projectId: "TRN-2035", siteId: "S-LS1", notes: "Paul on site; Liam covering the helpdesk." }),
    series("EV-LIAM-NIGHT", "Night on-call, helpdesk", "On call", "P11", ["P11"], [6, 0, 1, 2, 3], 19, 0, 720, "Remote support", { projectId: "TRN-2035", notes: "Handover at 07:00. Rest protected until 15:00 after a night shift." }),
    series("EV-PAUL-ONCALL", "Primary on-call, AquaComms sites", "On call", "P05", ["P05"], [0, 1, 2, 3, 4], 7, 0, 720, "Landing stations", { projectId: "TRN-2035", notes: "Day cover 07:00 to 19:00. Availability window, not booked work." }),
    series("EV-WKND-DAY", "Weekend day on-call, AquaComms sites", "On call", "P05", ["P05"], [5, 6], 7, 0, 720, "Landing stations", { projectId: "TRN-2035", notes: "Weekend day cover 07:00 to 19:00. Availability window, not booked work." }),
    series("EV-WKND-NIGHT", "Weekend night on-call, helpdesk", "On call", "P06", ["P06"], [4, 5], 19, 0, 720, "Remote support", { projectId: "TRN-2035", notes: "Friday and Saturday nights. Handover at 07:00; no site work the following morning." }),
    series("EV-HSEQ-AUDIT", "HSEQ site audit", "Site visit", "P08", ["P08"], [4], 9, 0, 90, "Rathdrum Works", { projectId: "TRN-2041", siteId: "S-RTH" }),
    series("EV-SUPPLIER", "Containment supplier call", "Meeting", "P03", ["P03", "P12"], [2], 14, 30, 30, "Teams", { projectId: "TRN-2052",
      exceptions: (supplierWed === leave1 || supplierWed === leave2) ? { [supplierWed]: { attendeeIds: ["P03", "P01"], note: "David covering for Róisín (annual leave)." } } : {} }),
    single("EV-LEAVE-P12", "Annual leave", "Leave", "P12", ["P12"], at(leave1, 0), at(addDays(leave2, 1), 0), "", { allDay: true }),
    single("EV-DLR-DECISION", "PER-DLR-017 decision due (council)", "Permit window", "P09", ["P09", "P03"], atD(2, 10), atD(2, 10, 30), "DLR County Council", { projectId: "TRN-2063", notes: "External decision. Turnua cannot approve the licence." }),
    single("EV-DLR-CREW", "Provisional crew window, DLR main works (Eoin + 2 operatives)", "Permit window", "P10", ["P09"], at(D(3), 0), at(D(6), 0), "DLR works corridor", { allDay: true, provisional: true, projectId: "TRN-2063", notes: "Provisional until PER-DLR-017 is granted. A reservation does not satisfy the licence dependency." }),
    single("EV-H4-DELIVERY", "Containment delivery, PO-5521 (revised)", "Site visit", "P06", ["P06", "P03"], atD(14, 8), atD(14, 10), "Hall 4, Dublin 15", { projectId: "TRN-2052", siteId: "S-H4" }),
    single("EV-CIH-GATE", "CI Hub readiness review", "Meeting", "P02", ["P02", "P01", "P06"], atD(6, 14), atD(6, 15), "CI Hub, Naas", { projectId: "TRN-2059", siteId: "S-CIH" }),
    single("EV-KLD-EVID", "NBI evidence review", "Client", "P04", ["P04", "P07", "P10"], atD(3, 11), atD(3, 12, 30), "Teams", { projectId: "TRN-2048" }),
    single("EV-AQC-QSR", "Quarterly service review, AquaComms", "Client", "P05", ["P05", "P01"], atD(5, 10), atD(5, 11, 30), "Teams", { projectId: "TRN-2035" }),
    single("EV-H4-WALK", "Hall 4 site walk with client", "Client", "P03", ["P03", "P01", "P06"], atD(1, 15), atD(1, 16), "Hall 4, Dublin 15", { projectId: "TRN-2052", siteId: "S-H4" }),
    single("EV-RTH-VAL", "Rathdrum valuation 8 review", "Meeting", "P12", ["P12", "P03"], atD(7, 11), atD(7, 12), "CI Hub, Naas", { projectId: "TRN-2041" }),
    single("EV-BOARD", "Board pack review", "Meeting", "P02", ["P02", "P01"], atD(1, 9), atD(1, 10), "CI Hub, Naas"),
    single("EV-GILLIAN-NOW", "Strategy session, CI Hub AI build space", "Meeting", "P02", ["P02", "P10"],
      new Date(Math.floor((now - 30 * 60000) / 900000) * 900000).toISOString(), new Date(Math.floor((now + 60 * 60000) / 900000) * 900000).toISOString(), "CI Hub, Naas", { projectId: "TRN-2059" }),
  ];

  /* ── timesheets: planned allocation is separate; logged hours only for past days ── */
  const timesheets: Timesheet[] = [];
  const mon = mondayOf(T);
  const prevMon = addDays(mon, -7);
  let tsn = 0;
  const logWeek = (weekMon: string, status: Timesheet["status"], untilKey: string) => {
    for (let d = 0; d < 5; d++) {
      const key = addDays(weekMon, d);
      if (key >= untilKey) break;
      for (const al of allocations) {
        if (al.personId === "P12" && (key === leave1 || key === leave2)) continue;
        const base = al.hours / (al.personId === "P12" ? 3 : 5);
        const hours = Math.round(base * 2) / 2;
        if (hours <= 0) continue;
        timesheets.push({ id: "TS-" + ++tsn, personId: al.personId, projectId: al.projectId, label: al.label, date: key, hours, status,
          history: [{ at: at(key, 18), text: "Logged" + (status !== "Draft" ? ", " + status.toLowerCase() : "") }] });
      }
    }
  };
  logWeek(prevMon, "Approved", mon);
  logWeek(mon, "Draft", T);

  /* ── documents ───────────────────────────────────────────────────── */
  const DOCX = (id: string, title: string, type: Doc["type"], version: string, ownerId: string, updN: number, status: Doc["status"], projectId: string | undefined, body: string[], links: { type: string; id: string }[] = [], siteId?: string, reviewN?: number): Doc =>
    ({ id, title, type, version, ownerId, updatedAt: atD(updN, 14), status, projectId, siteId, links, body, reviewAt: reviewN !== undefined ? eod(reviewN) : undefined, origin: "seed" });
  const docs: Doc[] = [
    DOCX("DOC-2041-VAR03", "CR-2041-03 variation evidence pack", "Variation evidence", "v2", "P03", -2, "In review", "TRN-2041",
      ["Scope: watermain diversion redesign on a 40 m section of Main Street.", "Trial holes TH-07 to TH-09: existing main found 600 mm east of record, at 1.1 m depth.", "Pricing: redesign €9,400; extra excavation and reinstatement €41,200; night-works traffic management €21,800; programme preliminaries €11,600.", "Total: €84,000 excluding VAT.", "Programme effect: handover moves from baseline " + F(45) + " to forecast " + F(52) + "."],
      [{ type: "change", id: "CR-2041-03" }, { type: "task", id: "T-2041-01" }], "S-RTH"),
    DOCX("DOC-2041-RAMS07", "RAMS: watermain diversion excavation and night works", "RAMS", "v3 draft", "P08", -1, "In review", "TRN-2041",
      ["Activity: excavation to 1.4 m with trench support; night works 20:00 to 06:00.", "Hazards: live services, open excavation, public interface, lighting.", "Controls: CAT and Genny scan, hand dig within 500 mm, trench box, Chapter 8 layout TM-04.", "Open action: spoil stockpile set-back of 1 m (inspection finding FND-04)."],
      [{ type: "rams", id: "RAMS-2041-07" }], "S-RTH", 1),
    DOCX("DOC-2041-TTM", "Traffic management layout TM-04, Main Street", "Drawing", "rev B", "P09", -20, "Approved", "TRN-2041", ["Chapter 8 layout for single-lane shuttle working with portable signals.", "Pedestrian route on the west footpath with 1.2 m clear width."], [{ type: "permit", id: "PER-2041-009" }]),
    DOCX("DOC-2041-VAL08", "Valuation 8 supporting schedule", "Report", "draft", "P12", -3, "Draft", "TRN-2041", ["Measured works to date by bill item.", "Draft amount €265,000; review " + F(7) + ".", "Variation CR-2041-03 excluded until approved."]),
    DOCX("DOC-2048-TP", "Phase 3 splice and OTDR test pack", "Test pack", "v5", "P07", -1, "In review", "TRN-2048",
      ["Cabinets C01 to C14 OTDR traces at 1310 and 1550 nm.", "Splice loss records: 96 records awaiting final QA.", "Exceptions: SC-031 and SC-034 heat-shrink confirmation missing."], [{ type: "task", id: "T-2048-01" }], "S-KLD"),
    DOCX("DOC-2048-ACC", "NBI acceptance pack (draft)", "Report", "v1", "P04", -4, "Draft", "TRN-2048", ["Premises-passed register: 1,248 of 1,680.", "Evidence review " + F(3) + ".", "Acceptance target " + F(28) + "."]),
    DOCX("DOC-2048-TMP", "Naas Road traffic management plan", "Method statement", "v2", "P08", -60, "Approved", "TRN-2048", ["Off-peak working only, as conditioned by the road works licence."], [{ type: "permit", id: "PER-2048-022" }]),
    DOCX("DOC-2048-RAMS", "RAMS: splicing and cabinet works", "RAMS", "v2", "P08", -50, "Approved", "TRN-2048", ["Fibre handling, cabinet works and roadside working controls."], [], "S-KLD", 45),
    DOCX("DOC-2035-SR", "AquaComms service action log and review pack", "Service review", "v4", "P05", -1, "In review", "TRN-2035",
      ["Open service actions: 7 (3 due before the quarterly review).", "Current PPM cycle: 92 of 100 jobs complete across both sites.", "Managed-service SLA, last 90 days: 1,274 of 1,284 met (99.2%), mean response 4.2 minutes.", "Live incidents at time of writing: HD-4821, HD-4820, HD-4817."], [{ type: "task", id: "T-2035-06" }], "S-LS1"),
    DOCX("DOC-2035-RAMS", "RAMS: LV, UPS and cooling planned maintenance", "RAMS", "v6", "P05", -90, "Approved", "TRN-2035", ["Isolation, permit-to-work and battery handling controls."], [], "S-LS1", 60),
    DOCX("DOC-2052-REC", "Hall 4 recovery proposal CR-2052-02", "Programme", "v1", "P03", -1, "In review", "TRN-2052",
      ["Problem: containment PO-5521 due " + F(-7) + ", now " + F(14) + " (21 days late).", "Option A (proposed): weekend second shift for Zones C and D, resequence Zone D cabling ahead of Zone C terminations. Cost €42,000.", "Effect: recovers 10 days. Forecast " + F(67) + " against baseline " + F(56) + ". Remaining slip 11 days.", "Not included: any change to the supplier’s delivery date. Containment remains on the critical path.", "Prepared with the Programme Recovery agent; reviewed by Ciarán Murphy and Sarah Doyle."], [{ type: "change", id: "CR-2052-02" }], "S-H4"),
    DOCX("DOC-2052-PRG", "Hall 4 programme revision 7", "Programme", "rev 7", "P10", -1, "Draft", "TRN-2052", ["Baseline handover " + F(56) + "; forecast " + F(77) + " without recovery; " + F(67) + " with CR-2052-02."]),
    DOCX("DOC-2052-DRG", "Containment shop drawings, Zones C and D", "Drawing", "rev C", "P06", -9, "In review", "TRN-2052", ["Tray routes, drop points and fixings for Zones C and D."]),
    DOCX("DOC-2052-TP", "Zone B fibre polarity results", "Test pack", "v1", "P06", -1, "In review", "TRN-2052", ["Polarity method B, 384 links tested, 2 re-terminations required."], [], "S-H4"),
    DOCX("DOC-2052-RAMS02", "RAMS: containment install at height (MEWP)", "RAMS", "v2", "P08", -30, "Approved", "TRN-2052", ["MEWP operation, exclusion zones and rescue plan."], [], "S-H4", 20),
    DOCX("DOC-2052-RAMS04", "RAMS: hot works, Zone C", "RAMS", "v1 draft", "P08", -2, "In review", "TRN-2052", ["Hot-works permit H4-HW-118, fire watch 60 minutes after works."], [], "S-H4", 5),
    DOCX("DOC-2059-LAY", "AI build space layout and capacity note", "Drawing", "v3", "P02", -3, "In review", "TRN-2059", ["Eight racks at up to 20 kW each, in-row cooling, DB-3 feed.", "Readiness gate " + F(6) + "; demo environment sign-off " + F(14) + "."], [], "S-CIH"),
    DOCX("DOC-2059-RAMS", "RAMS: CI Hub electrical fit out", "RAMS", "v1", "P08", -25, "Approved", "TRN-2059", ["Isolation of DB-3, permit-to-work, testing and inspection."], [], "S-CIH", 40),
    DOCX("DOC-2063-PER", "PER-DLR-017 road opening licence application", "Permit", "submitted", "P09", -18, "Issued", "TRN-2063",
      ["Application submitted " + F(-18) + " to Dún Laoghaire–Rathdown County Council.", "Works: duct route DLR-04 to DLR-07 and chambers CH-12 to CH-15.", "Decision due " + F(2) + ".", "Follow-ups sent " + F(-6) + " and " + F(-2) + "."], [{ type: "permit", id: "PER-DLR-017" }]),
    DOCX("DOC-2063-RAMS02", "RAMS: excavation and chamber works, DLR", "RAMS", "v1 draft", "P08", -2, "In review", "TRN-2063", ["Excavation, chamber lifting and roadside working controls."], [], undefined, 3),
    DOCX("DOC-CERT-P06", "Training evidence: Conor Walsh", "Training evidence", "current", "P08", -200, "Approved", undefined, ["IPAF 3a/3b card on file; renewal due " + F(18) + ".", "Safe Pass and BICSI certificates on file."]),
    DOCX("DOC-CERT-P03", "Training evidence: Ciarán Murphy", "Training evidence", "current", "P08", -300, "Approved", undefined, ["Safe Pass card on file; renewal due " + F(24) + "."]),
    DOCX("DOC-CERT-P05", "Training evidence: Paul O’Neill", "Training evidence", "current", "P08", -280, "Approved", undefined, ["Electrical compliance training review due " + F(34) + ". F-Gas and confined space certificates on file."]),
    DOCX("DOC-CERT-P08", "Training evidence: Niamh Byrne", "Training evidence", "current", "P08", -260, "Approved", undefined, ["First Aid refresher due " + F(41) + ". NEBOSH certificate on file."]),
  ];
  for (const p of people) if (!docs.find((d) => d.id === "DOC-CERT-" + p.id)) docs.push(DOCX("DOC-CERT-" + p.id, "Training evidence: " + p.name, "Training evidence", "current", "P08", -180, "Approved", undefined, ["Certificates on file for the credentials listed on the profile (demo records)."]));
  docs.push(DOCX("DOC-PO-5521", "Purchase order PO-5521", "Purchase order", "issued", "P12", -48, "Issued", "TRN-2052", ["Leinster Containment Supply (Demo): cable tray, basket and fixings, Zones A to D.", "Value €186,400. Original delivery " + F(-7) + "; revised " + F(14) + "."], [{ type: "po", id: "PO-5521" }]));

  /* ── agents and seeded run history ───────────────────────────────── */
  const agents = [
    { id: "briefing", name: "Briefing", purpose: "Writes the MD’s morning briefing from live records, with the decisions that need David.", trigger: "Weekdays 07:00, or Run now", schedule: "Weekdays 07:00",
      inputs: ["Projects", "Approvals", "Helpdesk tickets", "Calendar", "Change requests"], boundaries: ["Read only", "Creates a briefing record and suggested links", "Never sends email"], shape: "crown-pebble", tint: "#08132a", enabled: true },
    { id: "watchdog", name: "Ops Watchdog", purpose: "Watches overdue work, blocked permits, dependencies, SLA deadlines and missing owners.", trigger: "On record change, or manual scan", schedule: "Continuous (demo: on change)",
      inputs: ["Tasks", "Permits", "Dependencies", "SLA timers", "Owners"], boundaries: ["Proposes escalations and tasks", "No duplicate alerts for the same open issue"], shape: "shield", tint: "#1b2430", enabled: true },
    { id: "recovery", name: "Programme Recovery", purpose: "Explains programme slippage and drafts recovery scenarios for approval.", trigger: "Forecast slip over 7 days, or Run now", schedule: "On slip",
      inputs: ["Baseline and forecast", "Procurement dates", "Dependencies", "Capacity", "Recovery proposals"], boundaries: ["Drafts scenarios only", "No programme guarantees", "Approval by David"], shape: "control-cube", tint: "#16241f", enabled: true },
    { id: "workforce", name: "Workforce Planner", purpose: "Finds people for a day or window using skills, credentials, leave, on-call rest and load.", trigger: "On request", schedule: "On request",
      inputs: ["Skills", "Credentials", "Calendar", "Leave", "On-call rest", "Allocations"], boundaries: ["Previews changes", "Applies only after approval"], shape: "low-dome", tint: "#241b2e", enabled: true },
    { id: "compliance", name: "Compliance", purpose: "Tracks credential reviews, permits and RAMS, and prepares renewal plans.", trigger: "Daily 06:30", schedule: "Daily 06:30",
      inputs: ["Credentials", "Permits", "RAMS", "Training bookings", "Role requirements"], boundaries: ["Never certifies compliance", "Prepares requests and checklists"], shape: "executive-capsule", tint: "#2a2118", enabled: true },
    { id: "triage", name: "CFM Triage", purpose: "Summarises incidents, suggests an owner and checklist, and drafts handovers.", trigger: "New P1 or P2 ticket", schedule: "On ticket",
      inputs: ["Ticket", "Site and asset history", "Priority policy", "On-call roster", "Runbook"], boundaries: ["Humans acknowledge and resolve", "No remote control actions"], shape: "rim-capsule", tint: "#2b1b1e", enabled: true },
    { id: "commercial", name: "Commercial Control", purpose: "Compares cost with progress, tracks pending changes and valuation readiness.", trigger: "Weekly, or Run now", schedule: "Mondays 06:00",
      inputs: ["Cost", "Progress", "Original and approved baselines", "Pending changes", "Valuation evidence"], boundaries: ["No financial approvals", "Drafts review tasks only"], shape: "offset-pebble", tint: "#191c1f", enabled: true },
    { id: "reporting", name: "Client Reporting", purpose: "Drafts client-specific reports from milestones, evidence, risks and service metrics.", trigger: "On request", schedule: "On request",
      inputs: ["Milestones", "QA evidence", "Risks", "Decisions", "Service metrics"], boundaries: ["Local drafts only", "Never emails a client"], shape: "glass-visor", tint: "#1b2430", enabled: true },
  ];
  const RUN = (id: string, agentId: string, hoursAgo: number, trigger: AgentRun["trigger"], headline: string, lines: string[], sources: AgentRun["sources"], actions: AgentRun["actions"], confidence: AgentRun["confidence"] = "High", limitations = "Reads demo records only."): AgentRun =>
    ({ id, agentId, at: inH(-hoursAgo), trigger, headline, lines, sources, actions, confidence, limitations, signature: id });
  const hoursSince7 = Math.max(0.2, (now - Date.parse(atD(0, 7))) / 3600000);
  const runs: AgentRun[] = [
    RUN("RUN-B-02", "briefing", hoursSince7 > 0 ? hoursSince7 : 18, "Schedule", "Morning briefing: two decisions and one live P1",
      ["Hall 4 is 21 days behind on containment; €42,000 recovery proposal waits for you (targets " + F(67) + ").", "Rathdrum variation CR-2041-03, €84,000, needs a decision today.", "AquaComms P1 HD-4821 at Landing Station 1, Paul assigned.", "DLR licence decision due " + F(2) + "; escalation waiting for your approval."],
      [{ type: "project", id: "TRN-2052", label: "Hall 4" }, { type: "change", id: "CR-2041-03", label: "CR-2041-03" }, { type: "ticket", id: "HD-4821", label: "HD-4821" }], [{ label: "Open approvals", kind: "none" }]),
    RUN("RUN-B-01", "briefing", 24 + hoursSince7, "Schedule", "Morning briefing: Hall 4 recovery options in preparation",
      ["Programme Recovery is drafting options for Hall 4.", "Rathdrum trial holes confirmed the watermain offset.", "No live P1 incidents."], [{ type: "project", id: "TRN-2052", label: "Hall 4" }], []),
    RUN("RUN-W-01", "watchdog", 1.5, "Record change", "6 exceptions across 4 projects",
      ["7 overdue tasks, 3 on Hall 4.", "PER-DLR-017 decision due in 2 days; three tasks blocked.", "HD-4821 response target inside 30 minutes.", "No unowned tasks."], [{ type: "permit", id: "PER-DLR-017", label: "PER-DLR-017" }, { type: "ticket", id: "HD-4821", label: "HD-4821" }],
      [{ label: "Escalation proposed: APR-2063-01", kind: "approval", refId: "APR-2063-01" }]),
    RUN("RUN-R-01", "recovery", 26, "Record change", "Hall 4: 21-day containment delay, recovery option drafted",
      ["Containment PO-5521 moved from " + F(-7) + " to " + F(14) + ": 21 days.", "Without recovery, handover forecast " + F(77) + " against baseline " + F(56) + ".", "Option A: weekend second shift and Zone D resequence, €42,000, recovers 10 days to " + F(67) + ". 11 days of slip remain.", "Crew check: Conor and Ciarán above 90% planned load; weekend shift needs subcontract operatives."],
      [{ type: "po", id: "PO-5521", label: "PO-5521" }, { type: "project", id: "TRN-2052", label: "Hall 4" }, { type: "change", id: "CR-2052-02", label: "CR-2052-02" }],
      [{ label: "Approval requested: APR-2052-02", kind: "approval", refId: "APR-2052-02" }], "Medium", "Assumes the supplier holds the revised date; productivity rates from Zones A and B."),
    RUN("RUN-F-01", "workforce", 30, "Manual", "Weekend cover options for Hall 4 recovery",
      ["Conor Walsh: available, but IPAF renewal due " + F(18) + " affects MEWP work after that date.", "Liam Fitzgerald: not suitable after night on-call (rest window).", "Eoin Kelly: possible from " + F(3) + " only if DLR licence slips."], [{ type: "person", id: "P06", label: "Conor Walsh" }], []),
    RUN("RUN-C-01", "compliance", hoursSince7 + 0.5, "Schedule", "4 credential reviews due within 45 days",
      ["Conor Walsh, IPAF renewal, " + F(18) + ".", "Ciarán Murphy, Safe Pass renewal, " + F(24) + " (training request awaiting approval).", "Paul O’Neill, electrical compliance training review, " + F(34) + ".", "Niamh Byrne, First Aid refresher, " + F(41) + ".", "RAMS in review: 3. Permit pending: PER-DLR-017."],
      [{ type: "credential", id: "CERT-06-IPAF", label: "CERT-06-IPAF" }, { type: "credential", id: "CERT-03-SP", label: "CERT-03-SP" }], [], "High", "Due dates are demo assumptions, not compliance advice."),
    RUN("RUN-T-01", "triage", 0.7, "Record change", "HD-4821: cooling high return temperature, Landing Station 1",
      ["P1, response target 60 minutes. Paul O’Neill is primary on-call and assigned.", "CRAC-03 return air 31.4 °C (demo reading); redundant units carrying load.", "Runbook KB-01 cooling alarm triage attached.", "Suggested checklist: acknowledge, confirm redundancy, readings every 15 minutes, client update."],
      [{ type: "ticket", id: "HD-4821", label: "HD-4821" }, { type: "asset", id: "AST-LS1-CRAC-03", label: "CRAC-03" }], [{ label: "Response task T-2035-01", kind: "task", refId: "T-2035-01" }]),
    RUN("RUN-M-01", "commercial", 52, "Schedule", "Weekly commercial control",
      ["Hall 4 cost burn 58% against 41% physical progress: 17 percentage points.", "Rathdrum burn 69% against 62% progress; CR-2041-03 €84,000 pending.", "Pending priced changes €126,000.", "Valuation drafts: €930,000 across four projects in the next 14 days."],
      [{ type: "project", id: "TRN-2052", label: "Hall 4" }, { type: "project", id: "TRN-2041", label: "Rathdrum" }], []),
    RUN("RUN-P-01", "reporting", 72, "Manual", "Draft: NBI weekly progress note",
      ["1,248 of 1,680 premises passed (74%).", "96 splice records in final QA ahead of the evidence review.", "Acceptance target " + F(28) + "."], [{ type: "project", id: "TRN-2048", label: "Kildare FTTH" }], [{ label: "Report draft saved", kind: "report" }]),
  ];

  /* ── activity: historical entries around the six story threads ───── */
  let an = 0;
  const ACT = (hoursAgo: number, actorType: Activity["actorType"], actorId: string, actor: string, text: string, sourceType: string, sourceId: string, category: string, audit?: Activity["audit"]): Activity =>
    ({ id: "ACT-S" + ++an, at: inH(-hoursAgo), actorType, actorId, actor, text, sourceType, sourceId, category, audit });
  const activity: Activity[] = [
    ACT(0.7, "system", "monitoring", "Monitoring (demo feed)", "HD-4821 opened: cooling high return temperature, Landing Station 1", "ticket", "HD-4821", "Helpdesk"),
    ACT(0.65, "agent", "triage", "CFM Triage", "Summarised HD-4821 and attached runbook KB-01", "ticket", "HD-4821", "Agents"),
    ACT(0.6, "person", "P11", "Liam Fitzgerald", "Assigned HD-4821 to Paul O’Neill", "ticket", "HD-4821", "Helpdesk", [{ field: "Engineer", before: "Unassigned", after: "Paul O’Neill" }]),
    ACT(1.5, "agent", "watchdog", "Ops Watchdog", "Proposed escalation of PER-DLR-017 (decision due in 2 days)", "approval", "APR-2063-01", "Agents"),
    ACT(2.4, "person", "P11", "Liam Fitzgerald", "Assigned HD-4820 UPS battery threshold alarm to himself", "ticket", "HD-4820", "Helpdesk"),
    ACT(3.3, "person", "P05", "Paul O’Neill", "Assigned HD-4817 generator fuel sensor drift", "ticket", "HD-4817", "Helpdesk"),
    ACT(hoursSince7, "agent", "briefing", "Briefing", "Morning briefing prepared for David Cox", "run", "RUN-B-02", "Agents"),
    ACT(hoursSince7 + 0.5, "agent", "compliance", "Compliance", "Flagged 4 credential reviews due within 45 days", "run", "RUN-C-01", "Agents"),
    ACT(14, "person", "P03", "Ciarán Murphy", "Posted status update on Hall 4", "project", "TRN-2052", "Projects"),
    ACT(16, "person", "P04", "Aoife Brennan", "Posted status update on Kildare FTTH Phase 3", "project", "TRN-2048", "Projects"),
    ACT(18, "person", "P03", "Ciarán Murphy", "Mentioned David Cox on “Resolve watermain diversion clash”", "task", "T-2041-01", "Projects"),
    ACT(20, "person", "P07", "Seán Keane", "Resolved HD-4815: cabinet monitoring link restored", "ticket", "HD-4815", "Helpdesk", [{ field: "Status", before: "In progress", after: "Resolved" }]),
    ACT(22, "person", "P03", "Ciarán Murphy", "Raised recovery proposal CR-2052-02 (€42,000) for approval", "change", "CR-2052-02", "Commercial"),
    ACT(26, "agent", "recovery", "Programme Recovery", "Drafted Hall 4 recovery scenario: 10 days recovered for €42,000", "run", "RUN-R-01", "Agents"),
    ACT(28, "person", "P09", "Eoin Kelly", "Requested approval to escalate PER-DLR-017", "approval", "APR-2063-01", "Permits"),
    ACT(30, "person", "P08", "Niamh Byrne", "Requested Safe Pass renewal training for Ciarán Murphy", "training", "TR-01", "People"),
    ACT(33, "person", "P02", "Gillian Daly", "Requested CI Hub readiness gate approval", "approval", "APR-2059-01", "Projects"),
    ACT(40, "person", "P03", "Ciarán Murphy", "Submitted variation CR-2041-03 (€84,000) with trial hole evidence", "change", "CR-2041-03", "Commercial"),
    ACT(44, "person", "P10", "Sarah Doyle", "Reserved provisional DLR crew window from " + F(3), "event", "EV-DLR-CREW", "Calendar"),
    ACT(50, "system", "google", "Google Calendar (demo sync)", "Synced 38 events for 12 people (simulated)", "integration", "INT-GCAL", "Systems"),
    ACT(52, "agent", "commercial", "Commercial Control", "Weekly commercial control: Hall 4 burn 17 points above progress", "run", "RUN-M-01", "Agents"),
    ACT(70, "person", "P09", "Eoin Kelly", "Logged trial holes TH-07 to TH-09 on Main Street", "task", "T-2041-01", "Projects"),
    ACT(118, "person", "P03", "Ciarán Murphy", "Recorded supplier notice: PO-5521 revised to " + F(14), "po", "PO-5521", "Procurement", [{ field: "Delivery date", before: F(-7), after: F(14) }]),
    ACT(140, "system", "outlook", "Microsoft Outlook (demo sync)", "Synced 21 events (simulated)", "integration", "INT-OUT", "Systems"),
    ACT(160, "person", "P08", "Niamh Byrne", "Closed inspection finding FND-03 barrier gap", "finding", "FND-03", "HSEQ", [{ field: "Status", before: "Open", after: "Closed" }]),
  ];

  const messages = [
    { id: "MSG-1", withId: "P03", fromId: "P03", text: "Rathdrum variation is in your approvals. Council engineer is happy with the revised alignment in principle.", at: inH(-17) },
    { id: "MSG-2", withId: "P03", fromId: "P01", text: "Thanks. I’ll look at it today. Is the night-works traffic plan in the RAMS update?", at: inH(-16.5) },
    { id: "MSG-3", withId: "P03", fromId: "P03", text: "Niamh is finishing it; spoil set-back is the last open item.", at: inH(-16) },
    { id: "MSG-4", withId: "P05", fromId: "P05", text: "On my way into Landing Station 1 for HD-4821. Redundant units are holding.", at: inH(-0.5) },
    { id: "MSG-5", withId: "P06", fromId: "P06", text: "Zone B polarity results are uploaded. Two re-terminations, both done.", at: inH(-20) },
    { id: "MSG-6", withId: "P02", fromId: "P02", text: "Readiness gate pack for the CI Hub is ready when you are.", at: inH(-25) },
  ];

  const workflows = [
    { id: "WF-MOB", name: "Project mobilisation", trigger: "New project created", ownerId: "P10", stages: ["Kick-off and team", "RAMS and permits", "Procurement long-leads", "Site set-up", "First valuation date"],
      example: { type: "project", id: "TRN-2059", label: "CI Hub AI Build Space Upgrade" }, runs: [{ at: atD(-30, 9), by: "Sarah Doyle", result: "5 tasks created" }] },
    { id: "WF-CHG", name: "Change control", trigger: "Change request raised", ownerId: "P12", stages: ["Evidence attached", "Priced", "PM review", "MD approval", "Baseline updated"],
      example: { type: "change", id: "CR-2041-03", label: "CR-2041-03" }, runs: [{ at: atD(-2, 16), by: "Ciarán Murphy", result: "Awaiting MD approval" }] },
    { id: "WF-P1", name: "P1 response", trigger: "P1 ticket opened", ownerId: "P05", stages: ["Triage and assign", "Acknowledge within 60 minutes", "Client update", "Restore", "Evidence and SLA review"],
      example: { type: "ticket", id: "HD-4821", label: "HD-4821" }, runs: [{ at: inH(-0.7), by: "CFM Triage", result: "Assigned to Paul O’Neill" }] },
    { id: "WF-CRED", name: "Credential renewal", trigger: "Credential due within 45 days", ownerId: "P08", stages: ["Flag due item", "Training request", "MD approval", "Course booked", "Evidence uploaded"],
      example: { type: "credential", id: "CERT-03-SP", label: "Ciarán Murphy, Safe Pass" }, runs: [{ at: atD(-1, 14), by: "Niamh Byrne", result: "Training request awaiting approval" }] },
    { id: "WF-HND", name: "Handover", trigger: "Testing phase reaches 80%", ownerId: "P04", stages: ["Test pack QA", "Client evidence review", "Acceptance pack", "Handover meeting", "Final valuation"],
      example: { type: "project", id: "TRN-2048", label: "Kildare FTTH Phase 3" }, runs: [{ at: atD(-3, 10), by: "Aoife Brennan", result: "Evidence review booked" }] },
  ];

  const notifications = [
    { id: "NT-1", at: inH(-0.6), text: "HD-4821 P1 at Landing Station 1 assigned to Paul O’Neill", tone: "bad" as const, sourceType: "ticket", sourceId: "HD-4821" },
    { id: "NT-2", at: inH(-1.5), text: "Ops Watchdog proposed escalating PER-DLR-017", tone: "warn" as const, sourceType: "approval", sourceId: "APR-2063-01" },
    { id: "NT-3", at: inH(-18), text: "Ciarán Murphy mentioned you on “Resolve watermain diversion clash”", tone: "plain" as const, sourceType: "task", sourceId: "T-2041-01" },
    { id: "NT-4", at: inH(-22), text: "Recovery proposal CR-2052-02 (€42,000) is waiting for your approval", tone: "warn" as const, sourceType: "approval", sourceId: "APR-2052-02" },
    { id: "NT-5", at: inH(-hoursSince7), text: "Your morning briefing is ready", tone: "ok" as const, sourceType: "run", sourceId: "RUN-B-02" },
  ];

  const integrations = [
    { id: "INT-GCAL", name: "Google Calendar", kind: "Calendar", status: "Demo connection" as const, lastSync: inH(-0.25), scope: "Calendar read and write, simulated",
      mapping: [{ from: "Calendar event", to: "Turnua OS event" }, { from: "Attendee email", to: "Person" }, { from: "Event colour", to: "Event type" }] },
    { id: "INT-OUT", name: "Microsoft Outlook", kind: "Calendar", status: "Demo connection" as const, lastSync: inH(-0.4), scope: "Calendar read and write, simulated",
      mapping: [{ from: "Outlook appointment", to: "Turnua OS event" }, { from: "Organiser", to: "Calendar owner" }, { from: "Category", to: "Event type" }] },
    { id: "INT-CMMS", name: "Monitoring / CMMS feed", kind: "Monitoring", status: "Proposed, vendor not confirmed" as const, scope: "Alarms, readings and work orders (sample mapping)",
      mapping: [{ from: "Alarm", to: "Helpdesk ticket" }, { from: "Point reading", to: "Asset reading" }, { from: "Work order", to: "Maintenance job" }] },
    { id: "INT-PM", name: "Project and commercial system", kind: "Projects and finance", status: "Proposed, vendor not confirmed" as const, scope: "Programme, cost and commitments (sample mapping)",
      mapping: [{ from: "Programme activity", to: "Task / phase" }, { from: "Cost to date", to: "Project cost" }, { from: "Commitment", to: "Purchase order" }] },
    { id: "INT-DOC", name: "Document repository", kind: "Documents", status: "Proposed, vendor not confirmed" as const, scope: "RAMS, drawings, test packs (sample mapping)",
      mapping: [{ from: "Folder / library", to: "Project documents" }, { from: "Version", to: "Document version" }, { from: "Approver", to: "Document owner" }] },
  ];

  const settings = {
    governance: { commercialApproval: true, recoveryApproval: true, shiftChangeApproval: true, trainingApproval: true, externalCommsApproval: true, agentsCanDraftTasks: true, agentsShowSources: true },
    retentionDays: 2555,
    notifications: { approvals: true, p1: true, mentions: true, credentials: true, agentDigest: false },
    reducedMotion: false, dateFormat: "Irish" as const, rolePreview: "MD", integrations,
  };

  return {
    version: DATA_VERSION, meta: { seedDay: T, seedNow: now, lastOpenDay: T }, org, teams, people, allocations, credentials,
    clients, contacts, suppliers, purchaseOrders, projects, phases, milestones, workAreas, tasks, risks, permits, rams, changes, valuations,
    sites, assets, maintenance, inspections, findings, tickets, sla, runbooks, approvals, events, timesheets, training, docs,
    agents, runs, activity, messages, workflows, notifications, briefings: [], reports: [], settings,
  };
}
