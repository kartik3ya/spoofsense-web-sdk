// Transport for the verification-sessions contract. The sst_ token is the only
// credential the browser ever holds; it is single-use and short-lived.

import type { SessionInfo } from "./types.js";

const DEFAULT_API_BASE = "https://api.spoofsense.ai";

/** Structured failure from the API (or the network). */
export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number | null,
  ) {
    super(message);
  }
}

export interface ClientPayload {
  nonce: string;
  platform: "web";
  sdk_version: string;
  signals: Record<string, unknown>;
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "x-sdk-platform": "web",
    "x-sdk-version": __SDK_VERSION__,
  };
}

async function parse(res: Response): Promise<any> {
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new ApiFailure("BAD_RESPONSE", `Unexpected server response (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiFailure(err.code ?? "API_ERROR", err.message ?? `Request failed (HTTP ${res.status}).`, res.status);
  }
  return body;
}

function networkFailure(err: unknown): ApiFailure {
  return new ApiFailure(
    "NETWORK_ERROR",
    `Could not reach the verification server: ${(err as Error).message}`,
    null,
  );
}

export function normalizeBase(apiBase?: string): string {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

/** Fetch nonce + liveness of the session before opening the camera. */
export async function getSessionInfo(apiBase: string, token: string): Promise<SessionInfo> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/v1/verification_sessions/session_info`, { headers: headers(token) });
  } catch (err) {
    throw networkFailure(err);
  }
  return (await parse(res)) as SessionInfo;
}

/** Submit the captured frame. On success the server returns only { id, status }. */
export async function submitCapture(
  apiBase: string,
  token: string,
  frame: Blob,
  payload: ClientPayload,
): Promise<{ id: string; status: string }> {
  const form = new FormData();
  form.append("file", frame, "selfie.jpg");
  form.append("client_payload", JSON.stringify(payload));

  let res: Response;
  try {
    res = await fetch(`${apiBase}/v1/verification_sessions/submit`, {
      method: "POST",
      headers: headers(token),
      body: form,
    });
  } catch (err) {
    throw networkFailure(err);
  }
  return (await parse(res)) as { id: string; status: string };
}
