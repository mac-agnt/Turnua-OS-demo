/* Picks the Turnua module page for the current route. Home and the Ontology
   stay with the original Pulse views; everything else renders from here. */
import { useRoute } from "../ui";
import { useDB } from "../store";
import DashboardModule from "./dashboard/Dashboard";
import ProjectsModule from "./projects/Projects";
import WorkModule from "./work/Work";
import CalendarModule from "./calendar/Calendar";
import PeopleModule from "./people/People";
import HelpdeskModule from "./helpdesk/Helpdesk";
import SitesModule from "./sites/Sites";
import AgentsModule from "./agents/Agents";
import ActivityModule from "./activity/Activity";
import SettingsModule from "./settings/Settings";
import RecordsModule from "./records/Records";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TurnuaModules({ v }: { v: any }) {
  const r = useRoute();
  useDB();
  void v;
  switch (r.module) {
    case "dashboard": return <DashboardModule tab={r.tab} />;
    case "projects": return <ProjectsModule tab={r.tab} id={r.id} sub={r.sub} />;
    case "work": return <WorkModule tab={r.tab} />;
    case "calendar": return <CalendarModule tab={r.tab} />;
    case "people": return <PeopleModule tab={r.tab} id={r.id} />;
    case "helpdesk": return <HelpdeskModule tab={r.tab} />;
    case "sites": return <SitesModule tab={r.tab} id={r.id} sub={r.sub} />;
    case "agents": return r.tab === "directory" ? null : <AgentsModule tab={r.tab} />;
    case "activity": return <ActivityModule tab={r.tab} />;
    case "settings": return <SettingsModule tab={r.tab} />;
    default: return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TurnuaRecordsTab({ v }: { v: any }) {
  const r = useRoute();
  useDB();
  if (r.module !== "records" || r.tab === "ontology") return null;
  return <RecordsModule tab={r.tab} query={v.recAsk || ""} />;
}
