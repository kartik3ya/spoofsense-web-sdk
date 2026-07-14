import type {
  MountOptions,
  PrecheckConfig,
  PrecheckState,
  SessionInfo,
  SpoofSenseError,
  SpoofSenseHandle,
} from "./types.js";
import { openCamera, CameraError, type CameraHandle } from "./camera.js";
import { FaceDetector } from "./faceDetector.js";
import { analyzeFrame } from "./frameAnalysis.js";
import { DEFAULT_PRECHECKS, evaluate } from "./prechecks.js";
import { faceBoxToStage } from "./geometry.js";
import { captureFrame, DEFAULT_CAPTURE, type CaptureConfig } from "./capture.js";
import { collectInjectionSignals } from "./injection.js";
import { ApiFailure, getSessionInfo, normalizeBase, submitCapture } from "./apiClient.js";
import { CaptureView } from "./ui/view.js";

export * from "./types.js";
export { VERSION };

const VERSION = __SDK_VERSION__;

// The capture itself was rejected — the user can retake within the session.
const RETRYABLE_CODES = new Set([
  "FACE_NOT_DETECTED",
  "FACE_TOO_SMALL",
  "MULTIPLE_FACES",
  "INVALID_IMAGE",
  "IMAGE_TOO_LARGE",
  "NETWORK_ERROR",
  "BAD_RESPONSE",
  "UPSTREAM_ERROR", // model cold-start/timeouts — the server refunds the attempt
]);

/** Friendlier wording for the retryable rejections the API can return. */
const RETRY_HINTS: Record<string, string> = {
  FACE_NOT_DETECTED:
    "We couldn't find your face. Center it in the oval, avoid strong light behind you, and try again.",
  FACE_TOO_SMALL: "Move a little closer to the camera and try again.",
  MULTIPLE_FACES: "Make sure only your face is in view and try again.",
  INVALID_IMAGE: "The capture didn't come through — try again.",
  IMAGE_TOO_LARGE: "The capture didn't come through — try again.",
  NETWORK_ERROR: "We couldn't reach the verification server. Check your connection and try again.",
  BAD_RESPONSE: "Something went wrong talking to the server. Try again.",
  UPSTREAM_ERROR: "The verification service took too long to respond. Try again in a moment.",
};

class VerificationFlow {
  private readonly opts: MountOptions;
  private readonly cfg: PrecheckConfig;
  private readonly captureCfg: CaptureConfig;
  private readonly apiBase: string;
  private readonly autoCapture: boolean;

  private view: CaptureView | null = null;
  private camera: CameraHandle | null = null;
  private detector: FaceDetector | null = null;
  private session: SessionInfo | null = null;
  private rafId = 0;
  private countdownStart = 0; // ms timestamp the face became/stayed positioned
  private lastReadyAt = 0; // ms timestamp of the most recent ready frame
  private wasAligned = false;
  private busy = false; // capturing/submitting — pause the loop
  private finished = false;

  // Brief tolerance so a 1-frame detection blip doesn't reset the countdown.
  private static readonly READY_GRACE_MS = 300;

  constructor(opts: MountOptions) {
    if (!opts?.sessionToken?.startsWith("sst_")) {
      throw new Error(
        "[SpoofSense] mount() requires the sst_… session token minted by your backend via POST /v1/verification_sessions.",
      );
    }
    if (typeof opts.onComplete !== "function" || typeof opts.onError !== "function") {
      throw new Error("[SpoofSense] mount() requires onComplete and onError callbacks.");
    }
    this.opts = opts;
    this.cfg = { ...DEFAULT_PRECHECKS, ...(opts.prechecks ?? {}) };
    this.captureCfg = { ...DEFAULT_CAPTURE, ...(opts.capture ?? {}) };
    this.apiBase = normalizeBase(opts.apiBase);
    this.autoCapture = opts.autoCapture !== false;
  }

  private resolveContainer(): HTMLElement | undefined {
    const c = this.opts.container;
    if (!c) return undefined;
    const el = typeof c === "string" ? document.querySelector<HTMLElement>(c) : c;
    if (!el) throw new Error(`[SpoofSense] container "${c}" not found.`);
    return el;
  }

  async start(): Promise<void> {
    this.finished = false;
    this.view = new CaptureView(
      {
        onCapture: () => void this.capture(),
        onClose: () => this.cancel(),
        onRetry: () => this.resume(),
      },
      {
        container: this.resolveContainer(),
        showShutter: !this.autoCapture,
        theme: this.opts.theme,
      },
    );

    // Confirm the session is live (and fetch its nonce) BEFORE asking for the
    // camera — a dead token shouldn't cost the user a permission prompt.
    this.view.showPanel({ spinner: true, title: "Checking session…" });
    try {
      this.session = await getSessionInfo(this.apiBase, this.opts.sessionToken);
    } catch (err) {
      return this.terminalError(toSdkError(err));
    }
    if (this.session.status !== "created") {
      const expired = this.session.status === "expired";
      return this.terminalError({
        code: expired ? "SESSION_EXPIRED" : "SESSION_NOT_PENDING",
        message: expired
          ? "This verification session has expired. Ask your app for a new one."
          : "This verification session was already used.",
        recoverable: false,
      });
    }
    this.emit("session_ready");

    this.view.showPanel({ spinner: true, title: "Starting camera…" });
    try {
      this.camera = await openCamera();
    } catch (err) {
      const e = err as CameraError;
      return this.terminalError({
        code: e.code ?? "CAMERA_ERROR",
        message: e.message,
        recoverable: false,
      });
    }

    const video = this.view.getVideo();
    video.srcObject = this.camera.stream;
    // play() resolves only once the first frame arrives; don't let a stalled
    // stream hang the flow — the precheck loop tolerates a late video anyway.
    await Promise.race([
      video.play().catch(() => undefined),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    this.emit("camera_ready");

    this.view.showPanel({ spinner: true, title: "Loading face detection…" });
    try {
      this.detector = new FaceDetector();
      await this.detector.init({
        wasmBase: this.opts.mediapipe?.wasmBase,
        modelUrl: this.opts.mediapipe?.modelUrl,
      });
    } catch (err) {
      return this.terminalError({
        code: "DETECTOR_LOAD_FAILED",
        message: `Could not load the face detector: ${(err as Error).message}`,
        recoverable: false,
      });
    }

    this.view.hidePanel();
    this.loop();
  }

  private loop = (): void => {
    if (this.finished) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (this.busy || !this.view || !this.detector) return;

    const video = this.view.getVideo();
    if (video.readyState < 2 || !video.videoWidth) return;

    const geo = this.view.getGeometry();
    if (!geo) return; // layout not ready yet

    const ts = performance.now();
    let state: PrecheckState;
    try {
      const obs = this.detector.detect(video, ts, this.cfg.eyeClosedThreshold);
      const metrics = analyzeFrame(video);
      // Project the full-frame face box onto the on-screen oval before checking.
      const stageBox = obs.box
        ? faceBoxToStage(obs.box, video.videoWidth, video.videoHeight, geo.stageW, geo.stageH)
        : null;
      state = evaluate(obs, stageBox, geo.oval, metrics, this.cfg);
    } catch {
      return; // transient detector hiccup; try next frame
    }

    this.view.update(state);
    this.opts.onPrecheckUpdate?.(state);
    if (state.ready && !this.wasAligned) this.emit("face_aligned");
    this.wasAligned = state.ready;

    if (!this.autoCapture) return; // manual shutter handles capture

    const now = ts;
    if (state.ready) {
      this.lastReadyAt = now;
      if (this.countdownStart === 0) this.countdownStart = now; // start the 3..2..1
    } else if (this.countdownStart !== 0 && now - this.lastReadyAt > VerificationFlow.READY_GRACE_MS) {
      // Lost the pose for longer than the grace window — reset the countdown.
      this.countdownStart = 0;
    }

    if (this.countdownStart === 0) {
      this.view.setCountdown(null);
      return;
    }

    const remainingMs = this.cfg.countdownSeconds * 1000 - (now - this.countdownStart);
    if (remainingMs <= 0) {
      this.view.setCountdown(null);
      void this.capture();
    } else {
      this.view.setCountdown(Math.ceil(remainingMs / 1000));
    }
  };

  private async capture(): Promise<void> {
    if (this.busy || this.finished || !this.view || !this.camera || !this.session) return;
    this.busy = true;
    this.countdownStart = 0;
    this.view.setCountdown(null);
    this.emit("capturing");

    let frame;
    try {
      frame = captureFrame(this.view.getVideo(), this.captureCfg);
    } catch (err) {
      this.busy = false;
      this.view.setHint(`Capture failed: ${(err as Error).message}`);
      return;
    }

    this.view.showPanel({ spinner: true, title: "Verifying…", message: "Checking liveness & authenticity." });
    this.emit("uploading");

    const signals = await collectInjectionSignals(this.camera.stream).catch(() => ({}));

    try {
      const result = await submitCapture(this.apiBase, this.opts.sessionToken, frame.blob, {
        nonce: this.session.nonce,
        platform: "web",
        sdk_version: VERSION,
        signals,
      });
      this.handleAccepted(result.id);
    } catch (err) {
      this.handleSubmitError(toSdkError(err));
    }
  }

  private handleAccepted(verificationSessionId: string): void {
    this.finished = true;
    this.stopMedia();
    // Deliberately neutral: the client is never told real/spoof. The
    // integrator's backend reads the decision with its secret key.
    this.view?.showPanel({
      icon: "✅",
      title: "All done",
      message: "Your selfie was submitted for verification.",
      close: true,
    });
    this.opts.onComplete({ verificationSessionId });
  }

  private handleSubmitError(err: SpoofSenseError): void {
    if (err.recoverable) {
      this.busy = false;
      this.view?.showPanel({
        icon: "🔄",
        title: "Let's try that again",
        message: RETRY_HINTS[err.code] ?? err.message,
        retry: true,
        close: true,
      });
      return;
    }
    this.terminalError(err);
  }

  private terminalError(err: SpoofSenseError): void {
    this.finished = true;
    this.stopMedia();
    this.opts.onError(err);
    this.view?.showPanel({
      icon: "⚠️",
      title: "Verification unavailable",
      message: err.message,
      close: true,
    });
  }

  /** Resume the detection loop after a retryable failure. */
  resume(): void {
    if (this.finished || !this.camera) return;
    this.busy = false;
    this.countdownStart = 0;
    this.emit("retry");
    this.view?.setCountdown(null);
    this.view?.hidePanel();
  }

  private cancel(): void {
    const wasFinished = this.finished;
    this.destroy();
    if (!wasFinished) this.opts.onCancel?.();
  }

  private stopMedia(): void {
    cancelAnimationFrame(this.rafId);
    this.detector?.close();
    this.detector = null;
    this.camera?.stop();
    this.camera = null;
  }

  destroy(): void {
    this.finished = true;
    this.stopMedia();
    this.view?.destroy();
    this.view = null;
  }

  private emit(type: Parameters<NonNullable<MountOptions["onEvent"]>>[0]["type"]): void {
    this.opts.onEvent?.({ type });
  }
}

function toSdkError(err: unknown): SpoofSenseError {
  if (err instanceof ApiFailure) {
    return {
      code: err.code,
      message: err.message,
      recoverable: RETRYABLE_CODES.has(err.code),
    };
  }
  return { code: "UNEXPECTED", message: (err as Error)?.message ?? String(err), recoverable: false };
}

/**
 * Mount the SpoofSense capture UI.
 *
 * ```ts
 * const handle = SpoofSense.mount({
 *   sessionToken: "sst_…",           // from YOUR backend
 *   container: "#verify",            // omit for a full-screen overlay
 *   onComplete: ({ verificationSessionId }) => notifyBackend(verificationSessionId),
 *   onError: (e) => console.warn(e.code, e.message),
 * });
 * ```
 */
export function mount(options: MountOptions): SpoofSenseHandle {
  const flow = new VerificationFlow(options);
  void flow.start();
  return {
    unmount: () => flow.destroy(),
    retry: () => flow.resume(),
  };
}

export default { mount, VERSION };
