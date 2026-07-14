export interface CameraHandle {
  stream: MediaStream;
  stop: () => void;
}

export class CameraError extends Error {
  constructor(
    message: string,
    public code: "PERMISSION_DENIED" | "NO_CAMERA" | "UNSUPPORTED" | "UNKNOWN",
  ) {
    super(message);
    this.name = "CameraError";
  }
}

/**
 * Open the front camera. Prefers a portrait-ish resolution good enough for the
 * 224×224 face-size floor the API needs, without producing huge payloads.
 */
export async function openCamera(): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("Camera API not available in this browser.", "UNSUPPORTED");
  }

  // Ask for the camera's full resolution. Webcams are landscape-native, so we
  // request 1080p (the browser hands back the closest supported mode); the
  // display crops to the portrait oval, but we CAPTURE the full-res frame.
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return {
      stream,
      stop: () => stream.getTracks().forEach((t) => t.stop()),
    };
  } catch (err) {
    const e = err as DOMException;
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      throw new CameraError("Camera permission was denied.", "PERMISSION_DENIED");
    }
    if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
      throw new CameraError("No usable camera found.", "NO_CAMERA");
    }
    throw new CameraError(`Could not open camera: ${e.message}`, "UNKNOWN");
  }
}
