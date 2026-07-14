// Best-effort, web-limited anti-injection signals. This is a TRIPWIRE, not a
// guarantee — a determined attacker can spoof a "real" camera on the web. The
// server-side liveness + deepfake models are the actual defense. These signals
// ride `client_payload.signals`; the server logs them on the verification
// session and never echoes an evaluation back to the client.

const VIRTUAL_CAM_HINTS = [
  "obs",
  "virtual",
  "manycam",
  "snap camera",
  "snapcamera",
  "xsplit",
  "droidcam",
  "iriun",
  "epoccam",
  "e2esoft",
  "vcam",
  "screen capture",
  "splitcam",
  "mmhmm",
  "camtwist",
];

export interface InjectionSignals {
  virtual_camera_suspected: boolean;
  virtual_camera_installed: boolean;
  webdriver: boolean;
  no_frame_rate: boolean;
  no_video_inputs: boolean;
  gum_tampered: boolean;
  reasons: string[];
  [key: string]: unknown;
}

/** True when a device label matches a known virtual-camera product. */
export function isVirtualCameraLabel(label: string): boolean {
  const l = label.toLowerCase();
  return VIRTUAL_CAM_HINTS.some((h) => l.includes(h));
}

/**
 * Detect JS-level tampering of the capture APIs by comparing their toString()
 * against pristine copies from a fresh same-origin iframe. Catches common
 * getUserMedia monkey-patch injectors; kernel/driver-level feeds are out of
 * reach (that's what the server models + Android attestation are for).
 */
function detectApiTampering(): { tampered: boolean; reasons: string[] } {
  const reasons: string[] = [];
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.documentElement.appendChild(iframe);
    const cleanWin = iframe.contentWindow as any;
    try {
      const pairs: Array<[string, unknown, unknown]> = [
        [
          "getUserMedia",
          (navigator.mediaDevices as any)?.getUserMedia,
          cleanWin?.navigator?.mediaDevices?.getUserMedia,
        ],
        [
          "enumerateDevices",
          (navigator.mediaDevices as any)?.enumerateDevices,
          cleanWin?.navigator?.mediaDevices?.enumerateDevices,
        ],
        [
          "toDataURL",
          (HTMLCanvasElement.prototype as any)?.toDataURL,
          cleanWin?.HTMLCanvasElement?.prototype?.toDataURL,
        ],
        [
          "toBlob",
          (HTMLCanvasElement.prototype as any)?.toBlob,
          cleanWin?.HTMLCanvasElement?.prototype?.toBlob,
        ],
      ];
      for (const [name, current, clean] of pairs) {
        if (typeof current !== "function" || typeof clean !== "function") continue;
        if (Function.prototype.toString.call(current) !== Function.prototype.toString.call(clean)) {
          reasons.push(`${name} looks monkey-patched`);
        }
      }
    } finally {
      iframe.remove();
    }
  } catch {
    /* sandboxed/CSP-restricted pages may block iframes; skip silently */
  }
  return { tampered: reasons.length > 0, reasons };
}

export async function collectInjectionSignals(stream: MediaStream): Promise<InjectionSignals> {
  const reasons: string[] = [];
  let virtualSuspected = false;
  let virtualInstalled = false;
  let noFrameRate = false;
  let noVideoInputs = false;

  const track = stream.getVideoTracks()[0];
  const label = track?.label ?? "";

  if (label && isVirtualCameraLabel(label)) {
    virtualSuspected = true;
    reasons.push(`Camera label looks like a virtual device ("${label}")`);
  }

  // Automation / headless environments.
  const webdriver = Boolean((navigator as any).webdriver);
  if (webdriver) reasons.push("Browser automation flag (navigator.webdriver) is set");

  // A live hardware camera should report a frame rate; many virtual feeds don't.
  try {
    const s = track?.getSettings?.() ?? {};
    if ((s as any).frameRate === undefined) {
      noFrameRate = true;
      reasons.push("Camera reports no frame rate");
    }
  } catch {
    /* ignore */
  }

  // Enumerate devices: if NO real-looking camera exists but we got a stream,
  // or a known virtual cam is present, flag it.
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams.some((c) => isVirtualCameraLabel(c.label))) {
      virtualInstalled = true;
      reasons.push("A virtual camera is installed on this device");
    }
    if (cams.length === 0) {
      noVideoInputs = true;
      reasons.push("No video input devices enumerated");
    }
  } catch {
    /* enumerateDevices may be blocked; ignore */
  }

  const tamper = detectApiTampering();
  reasons.push(...tamper.reasons);

  return {
    virtual_camera_suspected: virtualSuspected,
    virtual_camera_installed: virtualInstalled,
    webdriver,
    no_frame_rate: noFrameRate,
    no_video_inputs: noVideoInputs,
    gum_tampered: tamper.tampered,
    reasons,
  };
}
