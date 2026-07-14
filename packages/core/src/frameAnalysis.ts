// Cheap whole-frame quality metrics computed on a downscaled copy so it runs
// every animation frame without choking low-end phones.

export interface FrameMetrics {
  /** Average luminance, 0..255. */
  brightness: number;
  /** Variance of the gradient magnitude — higher = sharper. */
  sharpness: number;
}

const SAMPLE_W = 160;

let scratch: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function getCtx(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  if (!ctx) ctx = scratch.getContext("2d", { willReadFrequently: true });
  return ctx!;
}

export function analyzeFrame(video: HTMLVideoElement): FrameMetrics {
  const vw = video.videoWidth || SAMPLE_W;
  const vh = video.videoHeight || SAMPLE_W;
  if (!vw || !vh) return { brightness: 0, sharpness: 0 };

  const w = SAMPLE_W;
  const h = Math.max(1, Math.round((vh / vw) * SAMPLE_W));
  const c = getCtx(w, h);
  c.drawImage(video, 0, 0, w, h);
  const { data } = c.getImageData(0, 0, w, h);

  // Grayscale luminance buffer.
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = lum;
    sum += lum;
  }
  const brightness = sum / (w * h);

  // Sharpness ≈ variance of a simple Laplacian over the grayscale image.
  let gSum = 0;
  let gSum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap = 4 * gray[idx]! - gray[idx - 1]! - gray[idx + 1]! - gray[idx - w]! - gray[idx + w]!;
      gSum += lap;
      gSum2 += lap * lap;
      n++;
    }
  }
  const mean = gSum / n;
  const variance = gSum2 / n - mean * mean;

  return { brightness, sharpness: Math.sqrt(Math.max(0, variance)) };
}
