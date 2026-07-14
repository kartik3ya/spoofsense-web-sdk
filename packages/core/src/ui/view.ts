import { STYLES } from "./styles.js";
import type { PrecheckState } from "../types.js";
import type { Oval } from "../geometry.js";

export interface ViewCallbacks {
  onCapture: () => void;
  onClose: () => void;
  onRetry: () => void;
}

export interface ViewConfig {
  /** Render inline inside this element; omit for a full-screen overlay. */
  container?: HTMLElement;
  /** Show the manual shutter button (when auto-capture is off). */
  showShutter: boolean;
  theme?: { accentColor?: string; radius?: string };
}

interface PanelOpts {
  icon?: string;
  spinner?: boolean;
  title: string;
  message?: string;
  retry?: boolean;
  close?: boolean;
}

/** The capture UI. Lives entirely inside a Shadow DOM for style isolation. */
export class CaptureView {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private video!: HTMLVideoElement;
  private oval!: HTMLDivElement;
  private countdownEl!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private checksEl!: HTMLDivElement;
  private shutter!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private footer!: HTMLDivElement;
  private readonly inline: boolean;

  constructor(
    private cb: ViewCallbacks,
    cfg: ViewConfig,
  ) {
    this.inline = Boolean(cfg.container);
    this.host = document.createElement("div");
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template(cfg.showShutter);

    if (cfg.theme?.accentColor) this.host.style.setProperty("--ss-accent", cfg.theme.accentColor);
    if (cfg.theme?.radius) this.host.style.setProperty("--ss-radius", cfg.theme.radius);

    if (cfg.container) {
      // Inline: fill the container. The container anchors positioning.
      const cs = getComputedStyle(cfg.container);
      if (cs.position === "static") cfg.container.style.position = "relative";
      this.host.style.position = "absolute";
      this.host.style.inset = "0";
      (this.root.querySelector(".overlay") as HTMLElement).classList.add("inline");
      cfg.container.appendChild(this.host);
    } else {
      document.body.appendChild(this.host);
    }
    this.bind();
  }

  private template(showShutter: boolean): string {
    return `
      <style>${STYLES}</style>
      <div class="overlay">
        <div class="header">
          <div class="title">Selfie verification</div>
          <div class="brand">Secured by SpoofSense</div>
          ${this.inline ? "" : `<button class="close" aria-label="Close">×</button>`}
        </div>
        <div class="stage">
          <video class="video" autoplay playsinline muted></video>
          <div class="oval"></div>
          <div class="countdown" hidden></div>
          <div class="checks"></div>
          <div class="hint">Starting camera…</div>
          <div class="panel"></div>
        </div>
        <div class="footer">
          ${showShutter ? `<button class="shutter" disabled aria-label="Capture"></button>` : ""}
          <div class="footnote">Keep your face inside the oval. Your selfie is captured from the live camera only.</div>
        </div>
      </div>
    `;
  }

  private bind(): void {
    const q = <T extends Element>(sel: string) => this.root.querySelector(sel) as T;
    this.video = q<HTMLVideoElement>(".video");
    this.oval = q<HTMLDivElement>(".oval");
    this.countdownEl = q<HTMLDivElement>(".countdown");
    this.hintEl = q<HTMLDivElement>(".hint");
    this.checksEl = q<HTMLDivElement>(".checks");
    this.panel = q<HTMLDivElement>(".panel");
    this.footer = q<HTMLDivElement>(".footer");
    this.shutter = q<HTMLButtonElement>(".shutter");

    this.root.querySelector(".close")?.addEventListener("click", () => this.cb.onClose());
    this.shutter?.addEventListener("click", () => this.cb.onCapture());
  }

  getVideo(): HTMLVideoElement {
    return this.video;
  }

  /**
   * Live stage size + oval position, read straight from the rendered elements
   * so the pre-checks always measure against the oval the user actually sees.
   */
  getGeometry(): { stageW: number; stageH: number; oval: Oval } | null {
    const stage = this.video.getBoundingClientRect();
    const ov = this.oval.getBoundingClientRect();
    if (!stage.width || !stage.height) return null;
    return {
      stageW: stage.width,
      stageH: stage.height,
      oval: {
        cx: (ov.left + ov.width / 2 - stage.left) / stage.width,
        cy: (ov.top + ov.height / 2 - stage.top) / stage.height,
        rx: ov.width / 2 / stage.width,
        ry: ov.height / 2 / stage.height,
      },
    };
  }

  /** Push live pre-check state into the ring, hint, and chips. */
  update(state: PrecheckState): void {
    this.oval.classList.toggle("ready", state.ready);
    this.hintEl.textContent = state.hint;
    if (this.shutter) this.shutter.disabled = !state.ready;

    // Render chips (cheap; few items).
    this.checksEl.innerHTML = state.items
      .map(
        (i) =>
          `<span class="chip ${i.ok ? "ok" : ""}"><span class="dot"></span>${escapeHtml(i.label)}</span>`,
      )
      .join("");
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  /** Show the 3→2→1 capture countdown, or pass null to hide it. */
  setCountdown(n: number | null): void {
    if (n === null) {
      this.countdownEl.hidden = true;
      return;
    }
    const text = String(n);
    // Re-trigger the pop animation only when the number actually changes.
    if (this.countdownEl.textContent !== text || this.countdownEl.hidden) {
      this.countdownEl.textContent = text;
      this.countdownEl.hidden = false;
      this.countdownEl.classList.remove("pop");
      void this.countdownEl.offsetWidth; // force reflow so the animation restarts
      this.countdownEl.classList.add("pop");
    }
  }

  /** Show a status panel (loading / verifying / error / done). */
  showPanel(opts: PanelOpts): void {
    this.footer.style.visibility = "hidden";
    this.panel.classList.add("show");
    this.panel.innerHTML = `
      ${opts.spinner ? `<div class="spinner"></div>` : ""}
      ${opts.icon ? `<div class="icon">${opts.icon}</div>` : ""}
      <div class="panel-title">${escapeHtml(opts.title)}</div>
      ${opts.message ? `<div class="panel-msg">${escapeHtml(opts.message)}</div>` : ""}
      <div class="row">
        ${opts.retry ? `<button class="btn" data-act="retry">Try again</button>` : ""}
        ${opts.close && !this.inline ? `<button class="btn secondary" data-act="close">Close</button>` : ""}
      </div>
    `;
    this.panel.querySelector('[data-act="retry"]')?.addEventListener("click", () => this.cb.onRetry());
    this.panel.querySelector('[data-act="close"]')?.addEventListener("click", () => this.cb.onClose());
  }

  hidePanel(): void {
    this.panel.classList.remove("show");
    this.panel.innerHTML = "";
    this.footer.style.visibility = "visible";
  }

  destroy(): void {
    this.host.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
