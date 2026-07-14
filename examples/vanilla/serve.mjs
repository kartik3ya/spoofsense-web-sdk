// Tiny demo server: serves the example page and plays the INTEGRATOR BACKEND
// role — it holds the secret key, mints verification sessions, and reads
// results. Never do the session mint from the browser.
//
//   SPOOFSENSE_API_KEY=sk_live_… SPOOFSENSE_API_BASE=http://127.0.0.1:8055 node serve.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, "..", "..");
const PORT = Number(process.env.PORT ?? 8787);
const API_BASE = (process.env.SPOOFSENSE_API_BASE ?? "https://api.spoofsense.ai").replace(/\/$/, "");
const API_KEY = process.env.SPOOFSENSE_API_KEY;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".map": "application/json",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Integrator-backend endpoints ──────────────────────────────────────────
  if (url.pathname === "/session" && req.method === "POST") {
    if (!API_KEY) return json(res, 500, { error: "Set SPOOFSENSE_API_KEY" });
    const r = await fetch(`${API_BASE}/v1/verification_sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ reference_id: "example-vanilla" }),
    });
    const session = await r.json();
    if (!r.ok) return json(res, r.status, session);
    // Only the client token leaves the backend; the id stays in our "DB"
    // (here: we just hand both back for demo visibility).
    return json(res, 200, { clientToken: session.client_token, sessionId: session.id });
  }

  if (url.pathname === "/result" && req.method === "GET") {
    if (!API_KEY) return json(res, 500, { error: "Set SPOOFSENSE_API_KEY" });
    const id = url.searchParams.get("id");
    const r = await fetch(`${API_BASE}/v1/verification_sessions/${id}`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    return json(res, r.status, await r.json());
  }

  // ── Static files ──────────────────────────────────────────────────────────
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.startsWith("/dist/")
    ? join(REPO, "packages", "core", path)
    : join(ROOT, path);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store", // dev server — always serve the fresh build
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`example: http://localhost:${PORT}  (api: ${API_BASE}, key: ${API_KEY ? "set" : "MISSING"})`);
});
