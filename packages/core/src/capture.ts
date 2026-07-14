// Grab a still from the live video and JPEG-compress it, keeping the face well
// above the API's 224×224 minimum while staying far below the 10 MB cap.

const MAX_JPEG_BYTES = 2.9 * 1024 * 1024;

export interface CaptureConfig {
  /** Cap the long edge (px). Frames bigger than this are downscaled. Default 1920. */
  maxLongEdge: number;
  /** Starting JPEG quality (0..1). Default 0.95. Lowered only if over the size cap. */
  quality: number;
}

export const DEFAULT_CAPTURE: CaptureConfig = {
  maxLongEdge: 1920,
  quality: 0.95,
};

export interface CapturedFrame {
  /** JPEG blob for the multipart submit. */
  blob: Blob;
  width: number;
  height: number;
}

export function captureFrame(
  video: HTMLVideoElement,
  cfg: CaptureConfig = DEFAULT_CAPTURE,
): CapturedFrame {
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (!w || !h) throw new Error("Camera not ready");

  // Only downscale if the frame is larger than the cap — never upscale.
  const scale = Math.min(1, cfg.maxLongEdge / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // High-quality downscale, and draw the TRUE (un-mirrored) frame — the preview
  // is mirrored for UX, but the model should see the real orientation.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, w, h);

  // Start high; step quality down only if we exceed the payload cap. toDataURL
  // is synchronous, which keeps the capture loop simple; the base64 is decoded
  // to a Blob once at the end.
  let quality = cfg.quality;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (base64Bytes(dataUrl) > MAX_JPEG_BYTES && quality > 0.5) {
    quality -= 0.05;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return { blob: dataUrlToBlob(dataUrl), width: w, height: h };
}

function base64Bytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}
