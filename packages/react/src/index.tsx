import { useEffect, useRef, type CSSProperties } from "react";
import { mount, type MountOptions, type SpoofSenseHandle } from "@spoofsense/web-sdk";

export type {
  MountOptions,
  PrecheckState,
  SdkEvent,
  SpoofSenseError,
  SpoofSenseHandle,
} from "@spoofsense/web-sdk";

export interface SpoofSenseCaptureProps
  extends Omit<MountOptions, "container"> {
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders the SpoofSense capture UI inline.
 *
 * ```tsx
 * <SpoofSenseCapture
 *   sessionToken={clientToken}
 *   onComplete={({ verificationSessionId }) => notifyBackend(verificationSessionId)}
 *   onError={(e) => console.warn(e.code, e.message)}
 * />
 * ```
 *
 * The component intentionally remounts only when the session token changes —
 * callback identity changes must not restart the camera, so the latest
 * callbacks are kept in a ref.
 */
export function SpoofSenseCapture({ className, style, ...options }: SpoofSenseCaptureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SpoofSenseHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = mount({
      ...optionsRef.current,
      container: containerRef.current,
      onComplete: (r) => optionsRef.current.onComplete(r),
      onError: (e) => optionsRef.current.onError(e),
      onCancel: () => optionsRef.current.onCancel?.(),
      onEvent: (e) => optionsRef.current.onEvent?.(e),
      onPrecheckUpdate: (s) => optionsRef.current.onPrecheckUpdate?.(s),
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.sessionToken]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", aspectRatio: "3 / 4", maxWidth: 480, ...style }}
    />
  );
}
