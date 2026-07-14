import type { PrecheckConfig, PrecheckItem, PrecheckState } from "./types.js";
import type { FaceObservation } from "./faceDetector.js";
import type { FrameMetrics } from "./frameAnalysis.js";
import type { NormBox, Oval } from "./geometry.js";

export const DEFAULT_PRECHECKS: PrecheckConfig = {
  // Face box height should fill roughly 55–110% of the oval's height.
  minFaceFill: 0.55,
  maxFaceFill: 1.1,
  // Center must be within 35% of the oval's radius of the oval center.
  centerTolerance: 0.35,
  eyeClosedThreshold: 0.5,
  minBrightness: 60,
  maxBrightness: 235,
  minSharpness: 14,
  countdownSeconds: 3,
};

/**
 * Gating pre-checks, measured against the ON-SCREEN oval (face already
 * projected into stage coords). Order matters: the FIRST failing item supplies
 * the user-facing hint.
 */
export function evaluate(
  obs: FaceObservation,
  face: NormBox | null,
  oval: Oval,
  metrics: FrameMetrics,
  cfg: PrecheckConfig,
): PrecheckState {
  const items: PrecheckItem[] = [];
  const hints: string[] = [];

  // 1. Exactly one face.
  const oneFace = obs.faceCount === 1 && !!face;
  items.push({ id: "single_face", label: "One face in frame", ok: oneFace });
  if (!oneFace) hints.push(obs.faceCount > 1 ? "Only one face should be visible" : "Position your face in the oval");

  // 2. Distance — face height relative to the oval height.
  const ovalH = oval.ry * 2;
  const fill = face ? face.h / ovalH : 0;
  const sizeOk = oneFace && fill >= cfg.minFaceFill && fill <= cfg.maxFaceFill;
  items.push({ id: "distance", label: "Good distance", ok: sizeOk });
  if (oneFace && !sizeOk) hints.push(fill < cfg.minFaceFill ? "Move closer" : "Move back a little");

  // 3. Centered in the oval (offset measured in units of the oval radius).
  const dx = face ? Math.abs(face.cx - oval.cx) / oval.rx : 1;
  const dy = face ? Math.abs(face.cy - oval.cy) / oval.ry : 1;
  const centered = oneFace && dx <= cfg.centerTolerance && dy <= cfg.centerTolerance;
  items.push({ id: "centered", label: "Face centered", ok: centered });
  if (oneFace && sizeOk && !centered) hints.push("Center your face in the oval");

  // 4. Eyes open.
  const eyesOpen = oneFace && !obs.leftEyeClosed && !obs.rightEyeClosed;
  items.push({ id: "eyes_open", label: "Eyes open", ok: eyesOpen });
  if (oneFace && centered && !eyesOpen) hints.push("Keep your eyes open");

  // 5. Lighting.
  const litOk = metrics.brightness >= cfg.minBrightness && metrics.brightness <= cfg.maxBrightness;
  items.push({ id: "lighting", label: "Good lighting", ok: litOk });
  if (!litOk) hints.push(metrics.brightness < cfg.minBrightness ? "Find brighter light" : "Too bright — reduce glare");

  // 6. Sharpness.
  const sharpOk = metrics.sharpness >= cfg.minSharpness;
  items.push({ id: "sharpness", label: "In focus", ok: sharpOk });
  if (!sharpOk) hints.push("Hold steady — image is blurry");

  const ready = items.every((i) => i.ok);
  return { ready, items, hint: ready ? "Hold still…" : (hints[0] ?? "Position your face") };
}
