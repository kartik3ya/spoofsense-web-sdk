// MediaPipe FaceLandmarker wrapper. The heavy vision runtime + model are loaded
// from a CDN at runtime so our shipped bundle stays tiny (a few KB, not MBs).

const DEFAULT_MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/vision_bundle.mjs";
const DEFAULT_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const DEFAULT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Normalized (0..1) bounding box of a detected face. */
export interface FaceBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface FaceObservation {
  faceCount: number;
  box: FaceBox | null;
  leftEyeClosed: boolean;
  rightEyeClosed: boolean;
}

export interface DetectorAssets {
  moduleUrl?: string;
  wasmBase?: string;
  modelUrl?: string;
}

export class FaceDetector {
  private landmarker: any = null;

  async init(assets: DetectorAssets = {}): Promise<void> {
    const moduleUrl = assets.moduleUrl ?? DEFAULT_MODULE_URL;
    // Variable specifier → bundler leaves this as a real runtime import.
    const vision: any = await import(/* @vite-ignore */ moduleUrl);
    const { FilesetResolver, FaceLandmarker } = vision;

    const fileset = await FilesetResolver.forVisionTasks(assets.wasmBase ?? DEFAULT_WASM_BASE);

    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: assets.modelUrl ?? DEFAULT_MODEL_URL, delegate },
      runningMode: "VIDEO" as const,
      numFaces: 2, // detect >1 so we can reject multi-face frames
      outputFaceBlendshapes: true, // gives eyeBlink scores for "eyes open"
    });

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
    } catch {
      // Some webviews/old GPUs reject the GPU delegate — fall back to CPU.
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
    }
  }

  /** Run detection on the current video frame. */
  detect(video: HTMLVideoElement, timestampMs: number, eyeClosedThreshold: number): FaceObservation {
    if (!this.landmarker) return { faceCount: 0, box: null, leftEyeClosed: false, rightEyeClosed: false };
    const res = this.landmarker.detectForVideo(video, timestampMs);
    const faces = res?.faceLandmarks ?? [];
    if (faces.length === 0) {
      return { faceCount: 0, box: null, leftEyeClosed: false, rightEyeClosed: false };
    }

    const box = boundingBox(faces[0]);
    const blend = res?.faceBlendshapes?.[0]?.categories ?? [];
    const leftBlink = scoreOf(blend, "eyeBlinkLeft");
    const rightBlink = scoreOf(blend, "eyeBlinkRight");

    return {
      faceCount: faces.length,
      box,
      leftEyeClosed: leftBlink > eyeClosedThreshold,
      rightEyeClosed: rightBlink > eyeClosedThreshold,
    };
  }

  close(): void {
    try {
      this.landmarker?.close?.();
    } catch {
      /* noop */
    }
    this.landmarker = null;
  }
}

function boundingBox(landmarks: Array<{ x: number; y: number }>): FaceBox {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

function scoreOf(categories: Array<{ categoryName: string; score: number }>, name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}
