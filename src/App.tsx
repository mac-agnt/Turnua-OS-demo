import { LogicHost } from "./runtime/logic";
import PulseLogic from "./logic/PulseLogic";
import AppShell from "./views/AppShell";

/* ── Backgrounds: change these per client ──────────────────────────────────
   Any CSS colour works (#hex, rgb(), oklch()). One colour each; the shading
   is worked out for you. */
const config = {
  /** Abstract background behind the Dashboard's KPI band. Hidden in the light theme. */
  dashboardBackdrop: "#1d6f8a",
  /** Show the Dashboard background at all. Off for Turnua: light KPI cards keep the page in view. */
  kpiBackdropOn: false,
  /** Wash behind the Records hero (Files and Contacts) and the New record dialog.
      Leave as "" to use the current theme's own gradient. */
  recordsBackdrop: "",
};

export default function App() {
  return <LogicHost logic={PulseLogic} view={AppShell} props={config} />;
}
