import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  // ESM + CJS for npm consumers, IIFE (global) for the single CDN <script> drop-in.
  format: ["esm", "cjs", "iife"],
  globalName: "SpoofSense",
  dts: true,
  sourcemap: true,
  minify: true,
  clean: true,
  // MediaPipe is loaded from a CDN at runtime (keeps our bundle tiny), so there
  // are no heavy deps to bundle here.
  platform: "browser",
  target: "es2020",
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
