# Ship It interface

The frontend is a React/TypeScript/Vite app in `apps/web`, authored for the Astra UI handoff. A miniature faceted world occupies the main stage; tiny buildings, trees, flags, warm rocket trails and landing pulses use local procedural geometry. No hosted assets, fonts, analytics, image generation, or paid services are required.

## Run and connect

`pnpm --filter @ship-it/web dev` serves the app at `/Ship-It/`. Without an API origin, it opens the clearly labeled local demo. The invented projects and their simulated history stay in memory and no write API exists in the browser client.

To connect real public data, build with `VITE_DEMO_MODE=false` and `VITE_API_ORIGIN=https://YOUR-WORKER.workers.dev`. Setting demo mode false without an origin shows a configuration error rather than pretending that simulated data is live. API responses are validated against the shared Zod contracts, including HTTPS project links.

The world view reads `/v1/world`, the directory performs debounced server search and cursor pagination, and a selected project fetches its launch history on demand. New launches are polled every 45 seconds only while the page is visible and deduplicated by launch ID. Project and launch query parameters work on GitHub Pages without server rewrites.

## Interaction and motion

Drag the planet to orbit; scroll or pinch to zoom. Selecting a landing marker opens a project card and gently moves the camera to the site. The HTML directory offers the same selection to keyboard and non-WebGL users. Copy controls share either the project or exact launch URL.

The **Try a launch** button replays a local simulated event. The sequence is Queued → LiftOff → Orbit → Approach → Landing → Celebrating → Settled, spanning 12.5 seconds. A curved approach ends at the project's stable shared coordinates. Replays are visual and do not create records or change launch counts. A launch deep link fetches the associated project and plays once for that navigation. Back/forward navigation resolves the query again.

The elapsed-time clock lives in a ref; React rerenders at stage transitions, not every animation frame. The scene is lazy-loaded behind an error boundary. DPR is capped at 1.6, world rendering is capped at 100 sites, and assets use no expensive postprocessing. The paginated directory remains available beyond the current 3D site limit.

Hidden tabs stop the animation clock, rendering and polling. The motion control bypasses the flight animation and disables camera motion and auto-rotation. OS reduced-motion preferences are respected live. A separate pause button controls ambient planet rotation. WebGL failures leave a static planet and the complete HTML explorer.

## 15-second happy path

1. Open `/Ship-It/` in demo mode and select **Try a launch**.
2. Watch the camera find the destination while the rocket approaches the persistent landing site.
3. Touchdown sends three warm rings across the site; the project drawer shows its simulated history.
4. Replay an earlier flight or copy a project/launch link.

The setup dialog includes the production-success trigger, `id-token: write`, and nonblocking job behavior. Release SHA and Worker URL remain explicit placeholders until real infrastructure and an Action release exist. The full setup guide is linked from the repository.

## Checks

`pnpm --filter @ship-it/web typecheck`, `test`, and `build` validate the implementation. Unit tests cover every flight phase, pause/reduced-motion behavior, duplicate arrivals, Pages share links, cursor continuity, read-only API URLs, malformed response rejection, and local demo history. Root integration performs browser acceptance at desktop and 320px, keyboard/reduced-motion checks, no-WebGL fallback, and real API integration.
