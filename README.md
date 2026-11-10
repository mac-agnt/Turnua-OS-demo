# Turnua OS · Operations Platform (demo)

A client-specific sales demo built inside the Pulse v4 Glass template, showing how Pulse could run Turnua's project delivery, critical-site service, people, compliance and commercial decisions as one connected operating picture.

Frontend only. All records are fictional demo data seeded relative to today (Europe/Dublin) and kept in this browser's local storage. Integrations are simulated; nothing is sent anywhere.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (the Claude preview uses 5176)
npm run typecheck
npm run build
```

Settings → Experience → Reset demo restores the canonical scenario.

## Where things live

| Area | Where |
| --- | --- |
| Canonical records, IDs and relationships | `src/turnua/types.ts`, `src/turnua/seed.ts` |
| Store, persistence, day migration | `src/turnua/store.ts` |
| Derived totals (every number on screen) | `src/turnua/selectors.ts` |
| Mutations, activity and audit | `src/turnua/actions.ts` |
| Agents (8) and Home chat answers | `src/turnua/agents.ts`, `src/turnua/assistant.ts` |
| Routes, overlays, toasts, prefs | `src/turnua/ui.ts`, `src/turnua/Overlays.tsx` |
| Modules | `src/turnua/modules/*` |
| Shared drawers (task, approval, records) | `src/turnua/drawers/*` |
| Brand themes and components | `src/turnua/turnua.css`, `src/turnua/kit.tsx` |
| Pulse shell (Home chat, Ontology, rail, top bar) | `src/views/*`, `src/logic/PulseLogic.js` via `src/turnua/bridge.ts` |

Read `CLAUDE.md` before customising: Agents stays under Home, Ontology stays first in Records, and the Home centre column stays clean.

Do not run `npm run import-design` on this copy; it overwrites the customised shell.
