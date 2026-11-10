import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/pulse.css";
import "./styles/interactions.css";
import "./turnua/turnua.css";

createRoot(document.getElementById("root")!).render(<App />);

// Development only: check the canonical scenario's numbers and foreign keys.
if (import.meta.env.DEV) {
  import("./turnua/validate").then(({ validateFreshSeed }) => {
    const errs = validateFreshSeed();
    if (errs.length) console.error("[Turnua OS fixtures] " + errs.length + " problems:\n" + errs.join("\n"));
    else console.info("[Turnua OS fixtures] scenario checks passed");
  });
}
