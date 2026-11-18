/* Demo scenario for the Field App, Sales and Marketing modules.
   Seeded relative to "now" like the rest of the workspace. All names, buyers,
   values and figures are fictional demo data. */
import type { Bid, Campaign, Clocking, ContentItem, Deal, FieldIssue, KeyAccount, Lead, SocialPost } from "./types";
import { addDays, at, endOfDay, keyOf } from "./time";

export function buildGrowthSeed(now: number) {
  const T = keyOf(now);
  const D = (n: number) => addDays(T, n);
  const atD = (n: number, h: number, m = 0) => at(D(n), h, m);
  const eod = (n: number) => endOfDay(D(n));
  const minsAgo = (m: number) => new Date(now - m * 60000).toISOString();
  const ck = (id: string, personId: string, siteId: string, projectId: string | null, inAt: string, outAt?: string, method: Clocking["method"] = "App"): Clocking =>
    ({ id, personId, siteId, projectId, inAt, outAt, method, origin: "seed" });

  /* ── Field App ─────────────────────────────────────────────────── */
  const clockings: Clocking[] = [
    // on site right now
    ck("CLK-101", "P03", "S-RTH", "TRN-2041", minsAgo(205), undefined, "Geofence"),
    ck("CLK-102", "P06", "S-H4", "TRN-2052", minsAgo(241)),
    ck("CLK-103", "P07", "S-KLD", "TRN-2048", minsAgo(262), undefined, "Geofence"),
    ck("CLK-104", "P09", "S-RTH", "TRN-2041", minsAgo(198), undefined, "Geofence"),
    ck("CLK-105", "P08", "S-RTH", "TRN-2041", minsAgo(96)),
    ck("CLK-106", "P04", "S-KLD", "TRN-2048", minsAgo(150)),
    // earlier this week
    ...[-1, -2, -3].flatMap((d, i) => [
      ck("CLK-2" + i + "1", "P03", "S-RTH", "TRN-2041", atD(d, 7, 32), atD(d, 17, 5), "Geofence"),
      ck("CLK-2" + i + "2", "P06", "S-H4", "TRN-2052", atD(d, 7, 10), atD(d, 16, 48)),
      ck("CLK-2" + i + "3", "P07", "S-KLD", "TRN-2048", atD(d, 7, 0), atD(d, 17, 30), "Geofence"),
      ck("CLK-2" + i + "4", "P09", "S-RTH", "TRN-2041", atD(d, 7, 40), atD(d, 16, 55), "Geofence"),
      ck("CLK-2" + i + "5", "P05", d === -2 ? "S-LS2" : "S-LS1", "TRN-2035", atD(d, 8, 5), atD(d, 18, 20)),
    ]),
  ];

  const fieldIssues: FieldIssue[] = [
    { id: "FI-301", title: "Trench edge protection missing at chainage 140", description: "Barrier section removed overnight at the Main Street crossing. Pedestrian route now runs within 1 m of an open trench.",
      siteId: "S-RTH", projectId: "TRN-2041", category: "Safety", severity: "Critical", reportedById: "P09", reportedAt: minsAgo(38), status: "Reported", assigneeId: null, photos: 3, location: "Main Street, ch. 140", origin: "seed" },
    { id: "FI-302", title: "Cable tray bracket spacing out of tolerance, Zone B", description: "Brackets at 1.8 m centres on the north run against 1.5 m on the drawing. Roughly 22 m affected.",
      siteId: "S-H4", projectId: "TRN-2052", category: "Defect", severity: "High", reportedById: "P06", reportedAt: minsAgo(140), status: "Assigned", assigneeId: "P06", photos: 2, location: "Zone B, north run", origin: "seed" },
    { id: "FI-303", title: "Cabinet C09 key safe code changed by landowner", description: "Crew can't access C09. Landowner says the code was changed after a break in. Need the new code before Thursday splicing.",
      siteId: "S-KLD", projectId: "TRN-2048", category: "Access", severity: "Medium", reportedById: "P07", reportedAt: minsAgo(310), status: "In progress", assigneeId: "P04", photos: 1, location: "Cabinet C09", origin: "seed" },
    { id: "FI-304", title: "Short delivery: 40 chamber frames, 36 received", description: "Docket shows 40 but 4 frames missing from the pallet. Supplier notified on site.",
      siteId: "S-RTH", projectId: "TRN-2041", category: "Materials", severity: "Medium", reportedById: "P03", reportedAt: atD(-1, 11, 20), status: "Assigned", assigneeId: "P10", photos: 1, origin: "seed" },
    { id: "FI-305", title: "Generator 2 coolant level low on walkround", description: "Coolant at minimum mark during the weekly walkround. Topped up, needs a check for a leak.",
      siteId: "S-LS1", projectId: "TRN-2035", category: "Plant", severity: "High", reportedById: "P05", reportedAt: atD(-2, 9, 45), status: "Closed", assigneeId: "P05", photos: 2, closedAt: atD(-1, 15, 10), origin: "seed" },
    { id: "FI-306", title: "Client asked for extra patch panel in rack R-14", description: "Client delivery lead asked on the walk round for a 24 port panel added to R-14. Needs a variation check before work starts.",
      siteId: "S-H4", projectId: "TRN-2052", category: "Client request", severity: "Low", reportedById: "P06", reportedAt: atD(-1, 14, 5), status: "Reported", assigneeId: null, photos: 0, location: "Rack R-14", origin: "seed" },
  ];

  /* ── Sales: key accounts ───────────────────────────────────────── */
  const accounts: KeyAccount[] = [
    { id: "KA-HYP", name: "Confidential hyperscale client", sector: "Hyperscale", tier: "Strategic", clientId: "CL-HYP", ownerId: "P01", sponsorId: "P01",
      revenueTTM: 6200000, potential: 24000000, relationship: "Strong", lastTouchAt: atD(-3, 15), nextMeeting: atD(6, 10),
      decisionMakers: ["Regional construction director", "Head of critical facilities", "Procurement category lead"],
      whitespace: ["Halls 5 and 6 fit out", "Campus fibre backbone", "Post handover FM"], notes: "Hall 4 performance is the reference point for Halls 5 and 6. Programme recovery on Hall 4 matters to this conversation." },
    { id: "KA-AQC", name: "AquaComms", sector: "Subsea", tier: "Strategic", clientId: "CL-AQC", ownerId: "P05", sponsorId: "P01",
      revenueTTM: 1450000, potential: 4200000, relationship: "Strong", lastTouchAt: atD(-6, 11), nextMeeting: atD(9, 14),
      decisionMakers: ["Operations Manager, Landing Stations", "VP Network Operations"],
      whitespace: ["Third landing station", "UPS battery replacement programme", "Remote monitoring upgrade"], notes: "Quarterly service review is the moment to table the battery programme." },
    { id: "KA-NBI", name: "National Broadband Ireland", sector: "Telecoms", tier: "Growth", clientId: "CL-NBI", ownerId: "P04", sponsorId: "P02",
      revenueTTM: 3100000, potential: 9500000, relationship: "Developing", lastTouchAt: atD(-9, 10),
      decisionMakers: ["Build Programme Manager", "Head of Delivery Partners"],
      whitespace: ["Phase 4 Kildare", "Laois and Offaly clusters"], notes: "Phase 3 acceptance on time is the gate to Phase 4 award." },
    { id: "KA-ESB", name: "National grid operator (demo)", sector: "Energy", tier: "Target", ownerId: "P02", sponsorId: "P01",
      revenueTTM: 0, potential: 12000000, relationship: "Cold", lastTouchAt: atD(-34, 9),
      decisionMakers: ["Head of Telecoms Infrastructure", "Substation programme director"],
      whitespace: ["Substation fibre and LV works", "Control room critical IT"], notes: "Framework opens next year. Need a warm introduction and a relevant case study." },
    { id: "KA-COLO", name: "Dublin colocation operator (demo)", sector: "Colocation", tier: "Target", ownerId: "P01", sponsorId: "P01",
      revenueTTM: 0, potential: 7500000, relationship: "Developing", lastTouchAt: atD(-12, 16), nextMeeting: atD(3, 9, 30),
      decisionMakers: ["CTO", "Director of Construction"],
      whitespace: ["Campus 2 white space", "24/7 CFM managed service"], notes: "Met at Datacloud. Interested in a single partner for fit out and FM." },
    { id: "KA-DLR", name: "Dún Laoghaire–Rathdown County Council", sector: "Public sector", tier: "Growth", clientId: "CL-DLR", ownerId: "P03", sponsorId: "P02",
      revenueTTM: 980000, potential: 3000000, relationship: "Developing", lastTouchAt: atD(-5, 12),
      decisionMakers: ["Senior Engineer, Roads", "Active Travel programme lead"],
      whitespace: ["Active travel duct network", "Public lighting upgrade"], notes: "Permit PER-DLR-017 is the live friction point." },
  ];

  /* ── Sales: pipeline ───────────────────────────────────────────── */
  const deal = (id: string, name: string, accountId: string, service: string, value: number, stage: Deal["stage"], ownerId: string,
    closeN: number, nextStep: string, nextN: number, source: string, contact: string, createdN: number): Deal =>
    ({ id, name, accountId, service, value, stage, ownerId, closeAt: eod(closeN), nextStep, nextStepAt: atD(nextN, 10), source, contact,
      createdAt: atD(createdN, 9), origin: "seed", history: [{ at: atD(createdN, 9), text: "Opportunity created" }] });
  const deals: Deal[] = [
    deal("OPP-118", "Halls 5 and 6 white space fit out", "KA-HYP", "Fibre & Low-Voltage Cabling", 14800000, "Negotiation", "P01", 38, "Commercial clarifications call with procurement", 2, "Existing client", "Regional construction director", -120),
    deal("OPP-121", "Campus fibre backbone, Dublin 15", "KA-HYP", "Fibre & Telecoms", 2650000, "Proposal", "P04", 55, "Submit technical proposal v2", 4, "Existing client", "Head of critical facilities", -48),
    deal("OPP-124", "Third landing station CFM", "KA-AQC", "Critical Facilities Management", 1900000, "Qualified", "P05", 90, "Site survey at proposed station", 9, "Existing client", "VP Network Operations", -30),
    deal("OPP-125", "UPS battery replacement programme", "KA-AQC", "Critical Facilities Management", 640000, "Proposal", "P05", 28, "Present at quarterly service review", 9, "Account plan", "Operations Manager, Landing Stations", -21),
    deal("OPP-127", "Kildare FTTH Phase 4", "KA-NBI", "Fibre & Telecoms", 5400000, "Qualified", "P04", 75, "Phase 3 acceptance evidence pack", 7, "Existing client", "Build Programme Manager", -40),
    deal("OPP-130", "Campus 2 white space and CFM", "KA-COLO", "Critical IT Infrastructure", 6900000, "Proposal", "P01", 62, "Exec lunch with CTO and Director of Construction", 3, "Datacloud Global Congress", "CTO", -26),
    deal("OPP-132", "Substation fibre and LV framework", "KA-ESB", "Fibre & Low-Voltage Cabling", 8000000, "Lead", "P02", 160, "Warm intro via industry board member", 12, "Outbound, ABM", "Head of Telecoms Infrastructure", -14),
    deal("OPP-134", "Active travel duct network", "KA-DLR", "Construction & Building Fabric", 1350000, "Negotiation", "P03", 21, "Agree rates for reinstatement", 1, "Tender", "Senior Engineer, Roads", -65),
    deal("OPP-136", "Pharma campus critical power upgrade", "KA-COLO", "Critical Facilities Management", 1150000, "Lead", "P02", 110, "Qualification call", 5, "LinkedIn campaign", "Facilities director", -6),
    deal("OPP-112", "Hall 4 fit out, Zone E extension", "KA-HYP", "Fibre & Low-Voltage Cabling", 1240000, "Won", "P01", -12, "Mobilise crew", -10, "Existing client", "Regional construction director", -90),
    deal("OPP-109", "Regional council public lighting", "KA-DLR", "Construction & Building Fabric", 720000, "Lost", "P03", -20, "Debrief requested", -15, "Tender", "Senior Engineer, Roads", -110),
  ];
  deals.find((d) => d.id === "OPP-109")!.lostReason = "Price: 7% above winning bid";

  const bids: Bid[] = [
    { id: "BID-041", title: "OPW data centre critical facilities framework", buyer: "Office of Public Works (demo)", value: 9500000, dueAt: atD(16, 12), portal: "eTenders", status: "Writing", ownerId: "P02", score: 78, origin: "seed" },
    { id: "BID-042", title: "Active travel duct network, Lot 2", buyer: "Dún Laoghaire–Rathdown County Council", value: 1350000, dueAt: atD(-8, 12), portal: "eTenders", status: "Submitted", ownerId: "P03", score: 71, dealId: "OPP-134", origin: "seed" },
    { id: "BID-043", title: "University campus fibre renewal", buyer: "Dublin university (demo)", value: 2100000, dueAt: atD(27, 15), portal: "eTenders", status: "Qualifying", ownerId: "P04", score: 62, origin: "seed" },
    { id: "BID-044", title: "HSE regional hospital UPS maintenance", buyer: "Health service (demo)", value: 860000, dueAt: atD(9, 12), portal: "eTenders", status: "Go", ownerId: "P05", score: 74, origin: "seed" },
    { id: "BID-045", title: "Motorway ITS duct and chamber works", buyer: "Transport authority (demo)", value: 4300000, dueAt: atD(21, 12), portal: "eTenders", status: "No-go", ownerId: "P03", score: 41, origin: "seed" },
  ];

  /* ── Marketing ─────────────────────────────────────────────────── */
  const campaigns: Campaign[] = [
    { id: "CMP-01", name: "Hyperscale delivery partner, ABM", channel: "LinkedIn", audience: "Construction and FM leaders at data centre operators, IE and UK", status: "Live", ownerId: "P02",
      start: D(-42), end: D(48), budget: 18000, spend: 9840, impressions: 214000, clicks: 3120, leads: 41, sqls: 9, pipeline: 8050000, origin: "seed" },
    { id: "CMP-02", name: "Critical facilities 24/7 search", channel: "Google Ads", audience: "UPS maintenance, data centre FM, generator service, Ireland", status: "Live", ownerId: "P02",
      start: D(-75), end: D(15), budget: 9000, spend: 7120, impressions: 61000, clicks: 2240, leads: 58, sqls: 7, pipeline: 1790000, origin: "seed" },
    { id: "CMP-03", name: "Datacloud Global Congress", channel: "Events", audience: "Hyperscale and colocation decision makers", status: "Completed", ownerId: "P01",
      start: D(-160), end: D(-157), budget: 24000, spend: 23400, impressions: 0, clicks: 0, leads: 64, sqls: 11, pipeline: 6900000, origin: "seed" },
    { id: "CMP-04", name: "Public sector framework nurture", channel: "Email", audience: "Council engineers and OPW buyers", status: "Live", ownerId: "P02",
      start: D(-30), end: D(60), budget: 2500, spend: 900, impressions: 9400, clicks: 640, leads: 17, sqls: 3, pipeline: 1350000, origin: "seed" },
    { id: "CMP-05", name: "CI Hub open day for engineers", channel: "Events", audience: "Client engineers, consultants and graduates", status: "Planned", ownerId: "P02",
      start: D(24), end: D(24), budget: 6000, spend: 0, impressions: 0, clicks: 0, leads: 0, sqls: 0, pipeline: 0, origin: "seed" },
    { id: "CMP-06", name: "Subsea and landing station PR", channel: "PR", audience: "Trade press: telecoms and subsea", status: "Paused", ownerId: "P02",
      start: D(-20), end: D(40), budget: 4000, spend: 1100, impressions: 38000, clicks: 410, leads: 4, sqls: 1, pipeline: 640000, origin: "seed" },
  ];

  const lead = (id: string, name: string, company: string, role: string, sector: string, campaignId: string | null, source: string, score: number,
    status: Lead["status"], ownerId: string | null, hoursAgo: number, interest: string, estValue: number): Lead =>
    ({ id, name, company, role, email: name.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".") + "@" + company.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14) + ".example",
      sector, campaignId, source, score, status, ownerId, createdAt: new Date(now - hoursAgo * 3600000).toISOString(), interest, estValue, origin: "seed" });
  const leads: Lead[] = [
    lead("LD-501", "Gráinne Ó Súilleabháin", "Northlake Data Centres (demo)", "Director of Construction", "Colocation", "CMP-01", "LinkedIn lead form", 88, "New", null, 3, "Fit out partner for a 24 MW campus", 4200000),
    lead("LD-502", "Mark Henderson", "Atlas Pharma Ireland (demo)", "Facilities Director", "Pharma", "CMP-02", "Google Ads, UPS maintenance", 74, "New", null, 7, "UPS and generator maintenance across 2 sites", 380000),
    lead("LD-503", "Ruth Keogh", "Western Health Group (demo)", "Estates Engineer", "Healthcare", "CMP-04", "Email nurture, framework guide", 52, "Contacted", "P05", 30, "Hospital critical power review", 260000),
    lead("LD-504", "Tomás Brady", "Midlands County Council (demo)", "Senior Engineer", "Public sector", "CMP-04", "Email nurture, case study", 61, "Qualified", "P03", 52, "Active travel ducting, 3 towns", 900000),
    lead("LD-505", "Priya Nair", "Cloudway Hosting (demo)", "Head of Infrastructure", "Colocation", "CMP-01", "LinkedIn, webinar", 69, "Contacted", "P01", 76, "Structured cabling for a 2 MW expansion", 650000),
    lead("LD-506", "Joe Phelan", "Phelan Electrical (demo)", "Owner", "Contractor", "CMP-02", "Google Ads, generator service", 18, "Disqualified", null, 98, "Looking for subcontract work", 0),
    lead("LD-507", "Aisling Rooney", "Subsea Connect (demo)", "Network Operations Lead", "Subsea", "CMP-06", "Trade press article", 66, "New", null, 20, "Landing station FM benchmarking", 520000),
    lead("LD-508", "Daniel Walsh", "Fintech Systems Ireland (demo)", "IT Infrastructure Manager", "Enterprise", null, "Website contact form", 45, "New", null, 1.5, "Comms room rebuild in Dublin office", 140000),
  ];

  const content: ContentItem[] = [
    { id: "CNT-01", title: "Case study: AquaComms landing stations, 99.2% SLA", kind: "Case study", ownerId: "P02", dueAt: atD(4, 12), status: "In review", campaignId: "CMP-06", channel: "Website, LinkedIn", origin: "seed" },
    { id: "CNT-02", title: "Hall 4: how we sequence containment in a live campus", kind: "Article", ownerId: "P06", dueAt: atD(9, 12), status: "Drafting", campaignId: "CMP-01", channel: "LinkedIn, website", origin: "seed" },
    { id: "CNT-03", title: "Crew spotlight: Kildare splicing team", kind: "Video", ownerId: "P02", dueAt: atD(2, 9), status: "Scheduled", channel: "LinkedIn, Instagram", origin: "seed" },
    { id: "CNT-04", title: "Monthly client newsletter", kind: "Newsletter", ownerId: "P02", dueAt: atD(12, 9), status: "Idea", campaignId: "CMP-04", channel: "Email", origin: "seed" },
    { id: "CNT-05", title: "CI Hub open day", kind: "Event", ownerId: "P02", dueAt: atD(24, 14), status: "Scheduled", campaignId: "CMP-05", channel: "Event, LinkedIn", origin: "seed" },
    { id: "CNT-06", title: "Safety week: zero lost time on Rathdrum", kind: "LinkedIn post", ownerId: "P08", dueAt: atD(-2, 9), status: "Published", channel: "LinkedIn", origin: "seed" },
  ];

  const posts: SocialPost[] = [
    { id: "PST-11", title: "Safety week, Rathdrum", mediaKind: "none", mediaName: "", format: "4:5", headline: "ZERO LOST TIME", topic: "Safety",
      captions: { LinkedIn: "Safety week on the Rathdrum public realm scheme: zero lost time incidents and 14 toolbox talks this month. Thanks to every crew member who keeps the site safe for the town and for each other.", Instagram: "Zero lost time on Rathdrum. 14 toolbox talks this month. Safe sites are built by people who look out for each other." },
      hashtags: ["#SafetyFirst", "#Construction", "#Turnua"], platforms: ["LinkedIn", "Instagram"], scheduledAt: atD(-2, 9), publishedAt: atD(-2, 9), status: "Published", ownerId: "P08", createdAt: atD(-4, 14), origin: "seed",
      stats: { reach: 6840, engagement: 412, clicks: 96 } },
    { id: "PST-12", title: "Crew spotlight: Kildare splicing team", mediaKind: "none", mediaName: "", format: "9:16", headline: "SPLICED RIGHT", topic: "Crew spotlight",
      captions: { LinkedIn: "Meet the Kildare splicing team. 1,248 premises passed on Phase 3 and counting, with every splice record checked before it leaves site.", Instagram: "Meet the crew behind 1,248 premises passed in Kildare." },
      hashtags: ["#Fibre", "#FTTH", "#Turnua"], platforms: ["LinkedIn", "Instagram", "TikTok"], scheduledAt: atD(2, 9, 0), status: "Scheduled", ownerId: "P02", createdAt: atD(-1, 11), origin: "seed" },
    { id: "PST-13", title: "AquaComms case study teaser", mediaKind: "none", mediaName: "", format: "1.91:1", headline: "99.2% SLA", topic: "Case study", campaignId: "CMP-06",
      captions: { LinkedIn: "Two subsea landing stations, 24/7 cover, 1,274 of 1,284 response targets met over 90 days. Full case study next week." },
      hashtags: ["#Subsea", "#CriticalFacilities"], platforms: ["LinkedIn"], status: "Draft", ownerId: "P02", createdAt: atD(0, 9), origin: "seed" },
  ];

  return { posts, clockings, fieldIssues, accounts, deals, bids, campaigns, leads, content };
}
