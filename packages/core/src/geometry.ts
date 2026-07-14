// The video is shown with `object-fit: cover`, so the displayed image is a
// cropped, scaled view of the camera frame. The face detector returns boxes in
// FULL-FRAME normalized coords, which do NOT line up with the oval the user
// sees. These helpers project a face box into ON-SCREEN (stage) coords so the
// pre-checks measure against the actual oval.

/** A rectangle in stage-normalized coords (0..1 across the visible stage). */
export interface NormBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** The on-screen oval guide, in stage-normalized coords. */
export interface Oval {
  cx: number;
  cy: number;
  rx: number; // half-width
  ry: number; // half-height
}

/**
 * Project a full-frame face box into stage-normalized coords, replicating the
 * `object-fit: cover` transform (scale to fill, center, crop the overflow).
 *
 * The horizontal mirror (`scaleX(-1)`) is intentionally ignored: every check is
 * symmetric about the (centered) oval, so mirroring doesn't change the result.
 */
export function faceBoxToStage(
  box: NormBox,
  videoW: number,
  videoH: number,
  stageW: number,
  stageH: number,
): NormBox {
  const scale = Math.max(stageW / videoW, stageH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  const offX = (stageW - dispW) / 2;
  const offY = (stageH - dispH) / 2;

  return {
    cx: (box.cx * videoW * scale + offX) / stageW,
    cy: (box.cy * videoH * scale + offY) / stageH,
    w: (box.w * videoW * scale) / stageW,
    h: (box.h * videoH * scale) / stageH,
  };
}
