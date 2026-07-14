# SpoofSense Web SDK

Drop-in selfie capture with **passive liveness + deepfake verification** and
injection-attack protection, built on SpoofSense verification sessions.

- `packages/core` — **`@spoofsense/web-sdk`**: framework-agnostic TypeScript core.
  Zero runtime dependencies, ~23 KB min (ESM/CJS/CDN global). MediaPipe face
  detection is loaded from a CDN at runtime for in-browser prechecks.
- `packages/react` — **`@spoofsense/react`**: thin React wrapper (`<SpoofSenseCapture />`).
- `examples/vanilla` — runnable demo + e2e harness (`?fake=1` simulates the camera).

## How it works

Your secret key never leaves your backend. The browser only ever holds a
single-use, short-lived session token:

```
Your backend ── POST /v1/verification_sessions (sk_live_…) ──► SpoofSense
      ◄── { id: "vs_…", client_token: "sst_…" }
Your frontend ── SpoofSense.mount({ sessionToken }) ──► capture UI
SDK ── submits the selfie with the sst_ token; gets back only { id, status }
Your backend ── GET /v1/verification_sessions/{id} (sk_live_…) ──► decision + risk signals
```

The client is never shown scores or the real/spoof decision — read it
server-side and trust only that.

## Quickstart

```ts
import * as SpoofSense from "@spoofsense/web-sdk";

const handle = SpoofSense.mount({
  sessionToken: clientToken,   // "sst_…" from YOUR backend
  container: "#verify",        // omit for a full-screen overlay
  onComplete: ({ verificationSessionId }) => notifyBackend(verificationSessionId),
  onError: (e) => console.warn(e.code, e.message),
});
```

React:

```tsx
import { SpoofSenseCapture } from "@spoofsense/react";

<SpoofSenseCapture
  sessionToken={clientToken}
  onComplete={({ verificationSessionId }) => notifyBackend(verificationSessionId)}
  onError={(e) => console.warn(e.code, e.message)}
/>
```

CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@spoofsense/web-sdk/dist/index.global.js"></script>
<script>SpoofSense.mount({ … })</script>
```

## What the capture UI does

- Camera preview with an oval face guide and live prechecks (single face,
  distance, centering, eyes open, lighting, sharpness) so users submit a frame
  that will actually pass — bad captures are rejected uncharged, but each
  session has a 3-attempt budget.
- Auto-capture with a 3-2-1 countdown once the prechecks hold (or a manual
  shutter with `autoCapture: false`).
- Shadow-DOM isolation: no style leakage either way; CSP-friendly (no external
  CSS/fonts; MediaPipe assets are configurable via `mediapipe.wasmBase` /
  `mediapipe.modelUrl` for self-hosting).

## Anti-injection

Layered, honest-by-design: the browser can only provide **tripwires** — the
server-side liveness/deepfake models remain the primary defense (and the
Android SDK adds hardware attestation).

- Capture comes straight from the live `MediaStream` — there is no file-upload
  path in the SDK at all.
- Virtual-camera label blocklist (OBS, ManyCam, XSplit, DroidCam, …).
- Native-API tamper detection: `getUserMedia` / `enumerateDevices` /
  `toDataURL` / `toBlob` are compared against pristine copies from a clean
  iframe — catches JS-level stream substitution.
- Automation (`navigator.webdriver`), missing frame-rate, and empty
  device-list heuristics.
- A per-session nonce is echoed in the submit payload; sessions are single-use
  with replay protection server-side.

All signals ride `client_payload.signals`, are stored on the verification
session, and surface to **your backend** under `risk.signals` — the client is
never told what was flagged.

## Development

```bash
npm install
npm run build        # builds core + react
npm run typecheck

# e2e example (uses a local or deployed SpoofSense API):
SPOOFSENSE_API_KEY=sk_live_… SPOOFSENSE_API_BASE=https://api.spoofsense.ai npm run example
# open http://localhost:8787 — add ?fake=1&zoom=1.4 to simulate the camera
# (drop a selfie at examples/vanilla/test-face.jpg [gitignored] or pass ?img=<url>),
# &manual=1 for the shutter button, &minSharp=1&countdown=1 to relax prechecks.
```
