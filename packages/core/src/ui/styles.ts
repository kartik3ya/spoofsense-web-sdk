export const STYLES = /* css */ `
:host { all: initial; --ss-accent: #25d366; --ss-radius: 0px; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

.overlay {
  position: fixed; inset: 0; z-index: 2147483000;
  background: #0b0d12; color: #fff;
  display: flex; flex-direction: column; align-items: center;
  overflow: hidden;
}

/* Inline mode: fill the integrator's container instead of the viewport. */
.overlay.inline {
  position: absolute; z-index: 1;
  border-radius: var(--ss-radius);
}
.header {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; gap: 12px;
}
.title { font-size: 15px; font-weight: 600; letter-spacing: .2px; opacity: .95; }
.brand { font-size: 11px; opacity: .55; }
.close {
  appearance: none; border: 0; background: rgba(255,255,255,.1); color: #fff;
  width: 34px; height: 34px; border-radius: 50%; font-size: 18px; cursor: pointer; line-height: 1;
}
.close:hover { background: rgba(255,255,255,.18); }

.stage {
  position: relative; flex: 1; width: 100%; max-width: 480px; align-self: center;
  display: flex; align-items: center; justify-content: center;
}
.video {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; transform: scaleX(-1); /* mirror for natural selfie feel */
  background: #000;
}

/* Oval guide: a centered ellipse whose huge box-shadow dims everything
   outside it. The border is the status ring (red → green when ready). */
.oval {
  position: absolute; top: 44%; left: 50%; transform: translate(-50%, -50%);
  width: 74%; aspect-ratio: 0.78; border-radius: 50%;
  border: 4px solid #ff5a5f; transition: border-color .25s ease;
  box-shadow: 0 0 0 9999px rgba(11,13,18,.58);
  pointer-events: none;
}
.oval.ready { border-color: var(--ss-accent); }

/* One instruction at a time, never over the face: a single pill anchored
   near the bottom of the stage carries the current hint OR the countdown. */
.hint {
  position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%);
  background: rgba(0,0,0,.6); padding: 10px 18px; border-radius: 999px;
  font-size: 14px; font-weight: 500; white-space: nowrap; backdrop-filter: blur(6px);
  font-variant-numeric: tabular-nums; transition: background-color .2s ease;
}
.hint.counting { background: rgba(37,211,102,.28); }
.hint.pop { animation: hint-pop .35s ease-out; }
@keyframes hint-pop {
  0% { transform: translateX(-50%) scale(1.12); }
  100% { transform: translateX(-50%) scale(1); }
}

.footer {
  width: 100%; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.shutter {
  appearance: none; border: 0; cursor: pointer;
  width: 72px; height: 72px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,.25);
  transition: transform .1s ease, opacity .2s ease;
}
.shutter:active { transform: scale(.94); }
.shutter:disabled { opacity: .35; cursor: not-allowed; }

/* Status panel (loading / verifying / error / result). */
.panel {
  position: absolute; inset: 0; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 24px; text-align: center; background: #0b0d12;
}
.panel.show { display: flex; }
.spinner {
  width: 46px; height: 46px; border-radius: 50%;
  border: 4px solid rgba(255,255,255,.15); border-top-color: #fff;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.panel-title { font-size: 17px; font-weight: 600; }
.panel-msg { font-size: 14px; opacity: .7; max-width: 320px; line-height: 1.5; }
.btn {
  appearance: none; border: 0; cursor: pointer; margin-top: 4px;
  padding: 12px 22px; border-radius: 12px; font-size: 14px; font-weight: 600;
  background: #fff; color: #0b0d12;
}
.btn.secondary { background: rgba(255,255,255,.12); color: #fff; }
.icon { font-size: 40px; line-height: 1; }
.row { display: flex; gap: 10px; }
`;
