// ─────────────────────────────────────────────────────────────────────────────
// Public SDK types for the verification-session flow.
//
// The client is deliberately untrusted: the submit endpoint never returns
// scores or the decision. `onComplete` hands back only the session id — your
// backend reads the result with its secret key via
// GET /v1/verification_sessions/{id}.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpoofSenseError {
  /** Stable machine code, e.g. SESSION_EXPIRED, CAMERA_DENIED, TOO_MANY_ATTEMPTS. */
  code: string;
  message: string;
  /** True when the user can retake the selfie within the same session. */
  recoverable: boolean;
}

export type SdkEventType =
  | "session_ready" // session_info fetched, session is live
  | "camera_ready" // stream playing
  | "face_aligned" // all prechecks green
  | "capturing" // frame grabbed
  | "uploading" // submit in flight
  | "retry"; // user chose to retake

export interface SdkEvent {
  type: SdkEventType;
}

/** A single in-browser pre-check (single face, centered, eyes open, lighting…). */
export interface PrecheckItem {
  id: string;
  label: string;
  ok: boolean;
}

export interface PrecheckState {
  /** All checks passing → ready to capture. */
  ready: boolean;
  items: PrecheckItem[];
  /** A short human hint for the current blocker, e.g. "Move closer". */
  hint: string;
}

/** Tunable pre-check thresholds. Sensible defaults; override per integrator. */
export interface PrecheckConfig {
  /** Min face height as a fraction of the OVAL height (too far if below). */
  minFaceFill: number;
  /** Max face height as a fraction of the OVAL height (too close if above). */
  maxFaceFill: number;
  /** Max face-center offset from the oval center, as a fraction of oval radius. */
  centerTolerance: number;
  /** Eye-blink blendshape score above which an eye is considered closed. */
  eyeClosedThreshold: number;
  /** Min average luminance (0..255) for "adequate lighting". */
  minBrightness: number;
  /** Max average luminance (0..255) before "too bright/overexposed". */
  maxBrightness: number;
  /** Min sharpness (variance-of-gradient) to reject blurry frames. */
  minSharpness: number;
  /** Seconds the face must stay positioned (3→2→1) before auto-capture fires. */
  countdownSeconds: number;
}

export interface SessionInfo {
  id: string;
  status: "created" | "complete" | "failed" | "expired";
  nonce: string;
  products: string[];
  expires_at: string;
}

export interface MountOptions {
  /** The single-use `sst_…` client token minted by YOUR backend via POST /v1/verification_sessions. */
  sessionToken: string;
  /**
   * Element (or selector) to render the capture UI into. When omitted, the SDK
   * opens as a full-screen overlay with its own close button.
   */
  container?: HTMLElement | string;
  /** API origin. Default: https://api.spoofsense.ai */
  apiBase?: string;
  /** Auto-capture when pre-checks stay green, else require a button press. Default true. */
  autoCapture?: boolean;
  /** Light visual theming for the embedded UI. */
  theme?: { accentColor?: string; radius?: string };
  /** Fired once the capture was accepted. Fetch the decision from your backend. */
  onComplete: (result: { verificationSessionId: string }) => void;
  /** Fired on any terminal error (expired/used session, camera denied, attempts exhausted…). */
  onError: (error: SpoofSenseError) => void;
  /** Fired if the user closes the full-screen overlay without finishing. */
  onCancel?: () => void;
  /** Lifecycle events, e.g. to drive your own progress UI or telemetry. */
  onEvent?: (event: SdkEvent) => void;
  /** Fired every frame with live pre-check state (for custom UI/telemetry). */
  onPrecheckUpdate?: (state: PrecheckState) => void;
  /** Override any pre-check thresholds. */
  prechecks?: Partial<PrecheckConfig>;
  /** Capture quality: { maxLongEdge?: px (default 1920), quality?: 0..1 (default 0.95) }. */
  capture?: { maxLongEdge?: number; quality?: number };
  /** Override MediaPipe asset URLs (wasm + model) if self-hosting. */
  mediapipe?: { wasmBase?: string; modelUrl?: string };
}

export interface SpoofSenseHandle {
  /** Tear the UI down and release the camera. */
  unmount(): void;
  /** Resume the capture loop after a recoverable error. */
  retry(): void;
}
