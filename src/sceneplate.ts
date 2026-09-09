import Phaser from "phaser";
import { MAPS, WORLD, type MapId } from "../shared/game";
import { POSTER, type PosterPalette } from "./palette";

/**
 * M26 industrial-poster scene plates. Replaces the AI-painted background
 * webps with fully procedural flat-graphic compositions, drawn once per map
 * into two paired canvases:
 *
 *  - albedo: the poster art itself (flat color fields, hard edges);
 *  - height: a grayscale depth map drawn with the same geometry, brighter =
 *    closer. A Sobel pass turns it into a tangent-space normal map, which is
 *    what makes Light2D lighting wrap around beams, arches and stacks.
 *
 * Style rules (docs/ART_DIRECTION.md): the central combat band stays calm,
 * structure lives at the frame edges and the top, and the only loud bright
 * value in the whole world plate is the walkable cap strip (M20 rule) which
 * is baked into a separate non-lit "glow" plate so it never darkens.
 */

export const PLATE_SCALE = 1.3;

export type PlateSet = {
  /** Sky + architecture backdrop, Light2D-lit. Depth -20. */
  background: Phaser.GameObjects.Image;
  /** Static platforms + cover wall, Light2D-lit. Depth -19. */
  world: Phaser.GameObjects.Image;
  /** Cap strips + cover-wall accent marks, never darkened. Depth -18. */
  glow: Phaser.GameObjects.Image;
};

/** Static light anchors baked into the plate art — lighting.ts reads these. */
export type PlateAnchor = {
  x: number;
  y: number;
  color: number;
  radius: number;
  intensity: number;
};

export const PLATE_ANCHORS: Record<MapId, PlateAnchor[]> = {
  canopy: [
    { x: 146, y: 52, color: 0x43d3e0, radius: 90, intensity: 0.8 },
    { x: 176, y: 44, color: 0x43d3e0, radius: 90, intensity: 0.75 },
    { x: 204, y: 58, color: 0x43d3e0, radius: 90, intensity: 0.8 },
    { x: 830, y: 208, color: 0x43d3e0, radius: 85, intensity: 0.6 },
    { x: 955, y: 208, color: 0x43d3e0, radius: 85, intensity: 0.6 },
    { x: 36, y: 302, color: 0xe7c884, radius: 70, intensity: 0.55 },
    { x: 214, y: 302, color: 0xe7c884, radius: 70, intensity: 0.55 },
  ],
  fortress: [
    // Top-truss alarm beacons (the M26 pair).
    { x: 165, y: 64, color: 0xe0455a, radius: 110, intensity: 0.7 },
    { x: 835, y: 64, color: 0xe0455a, radius: 110, intensity: 0.7 },
    // M27: gate-corridor pendant lamps hanging off the top truss — the mid
    // duel lane finally gets standing light instead of only sweeping beams.
    { x: 450, y: 156, color: 0xffd9a8, radius: 125, intensity: 0.62 },
    { x: 550, y: 156, color: 0xffd9a8, radius: 125, intensity: 0.62 },
    // M27: bastion-wall sconces flanking the mid lane entrances.
    { x: 352, y: 296, color: 0xe0455a, radius: 95, intensity: 0.5 },
    { x: 648, y: 296, color: 0xe0455a, radius: 95, intensity: 0.5 },
  ],
  factory: [
    { x: 500, y: 600, color: 0xff9a4a, radius: 260, intensity: 0.9 },
    { x: 170, y: 520, color: 0xff9a4a, radius: 95, intensity: 0.5 },
    { x: 830, y: 520, color: 0xff9a4a, radius: 95, intensity: 0.5 },
  ],
};

type Ctx2D = CanvasRenderingContext2D;

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const cssA = (color: number, alpha: number) => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
};
const gray = (value: number) => {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return `rgb(${v},${v},${v})`;
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement, scale: number): Ctx2D {
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Rect painted into albedo (+ optional alpha) and into the height map. */
function dualRect(ctx: Ctx2D, hctx: Ctx2D, x: number, y: number, w: number, h: number, color: number, height: number, alpha = 1) {
  if (alpha >= 1) {
    ctx.fillStyle = css(color);
  } else {
    ctx.fillStyle = cssA(color, alpha);
  }
  ctx.fillRect(x, y, w, h);
  hctx.fillStyle = gray(height);
  hctx.fillRect(x, y, w, h);
}

/** Albedo-only paint (faint marks that must not pollute the depth field). */
function softRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: number, alpha: number) {
  ctx.fillStyle = cssA(color, alpha);
  ctx.fillRect(x, y, w, h);
}

/** Height-only paint (shape exists in depth but matches a neighboring tone). */
function heightOnly(hctx: Ctx2D, x: number, y: number, w: number, h: number, height: number) {
  hctx.fillStyle = gray(height);
  hctx.fillRect(x, y, w, h);
}

function softLine(ctx: Ctx2D, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number) {
  ctx.strokeStyle = cssA(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dualLine(ctx: Ctx2D, hctx: Ctx2D, x1: number, y1: number, x2: number, y2: number, width: number, color: number, height: number, alpha = 1) {
  softLine(ctx, x1, y1, x2, y2, width, color, alpha);
  hctx.strokeStyle = gray(height);
  hctx.lineWidth = width;
  hctx.beginPath();
  hctx.moveTo(x1, y1);
  hctx.lineTo(x2, y2);
  hctx.stroke();
}

function softPoly(ctx: Ctx2D, points: Array<[number, number]>, color: number, alpha = 1) {
  ctx.fillStyle = cssA(color, alpha);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function dualPoly(ctx: Ctx2D, hctx: Ctx2D, points: Array<[number, number]>, color: number, height: number, alpha = 1) {
  softPoly(ctx, points, color, alpha);
  hctx.fillStyle = gray(height);
  hctx.beginPath();
  hctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) hctx.lineTo(points[i][0], points[i][1]);
  hctx.closePath();
  hctx.fill();
}

/** Sobel of the height field → tangent-space normal canvas (y-up convention). */
function buildNormalCanvas(height: HTMLCanvasElement, w: number, h: number, strength: number): HTMLCanvasElement {
  const hctx = height.getContext("2d", { willReadFrequently: true })!;
  const src = hctx.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => src[(Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4];
  const normal = makeCanvas(w, h);
  const nctx = normal.getContext("2d")!;
  const dst = nctx.createImageData(w, h);
  const out = dst.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dhdx = at(x + 1, y) - at(x - 1, y);
      const dhdy = at(x, y + 1) - at(x, y - 1); // canvas-down positive
      // y-up space flips the canvas-y gradient; nz = 255/255 keeps relief shallow.
      let nx = -dhdx * strength;
      let ny = dhdy * strength;
      const nz = 255;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * w + x) * 4;
      out[i] = Math.round(127.5 + (nx / len) * 127.5);
      out[i + 1] = Math.round(127.5 + (ny / len) * 127.5);
      out[i + 2] = Math.round(127.5 + (nz / len) * 127.5);
      out[i + 3] = 255;
    }
  }
  nctx.putImageData(dst, 0, 0);
  return normal;
}

function registerPlate(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, normalKey?: string, normalCanvas?: HTMLCanvasElement) {
  const textures = scene.textures;
  if (textures.exists(key)) textures.remove(key);
  if (normalKey && textures.exists(normalKey)) textures.remove(normalKey);
  if (normalKey && normalCanvas) textures.addCanvas(normalKey, normalCanvas);
  textures.addCanvas(key, canvas);
  if (normalKey && normalCanvas) {
    const texture = textures.get(key);
    if (texture) texture.setDataSource(normalCanvas);
  }
}

// ---------------------------------------------------------------------------
// Backdrop compositions (structure at the frame edges + top; the central
// combat band stays a calm field — the M15 readability rule).
// ---------------------------------------------------------------------------

function drawCanopyBackdrop(ctx: Ctx2D, hctx: Ctx2D, p: PosterPalette) {
  // Two-tone storm sky with a hard seam.
  dualRect(ctx, hctx, 0, 0, 1000, 232, p.skyTop, 40);
  dualRect(ctx, hctx, 0, 232, 1000, 328, p.sky, 44);
  softRect(ctx, 0, 231, 1000, 1.5, p.panelLit, 0.22);
  // Haze band.
  softRect(ctx, 0, 258, 1000, 46, p.fog, 0.3);
  heightOnly(hctx, 0, 258, 1000, 46, 48);

  // Left pylon cluster: three overlapping tapered towers, far → near.
  dualPoly(ctx, hctx, [[30, 560], [60, 122], [108, 122], [140, 560]], p.far, 110);
  dualPoly(ctx, hctx, [[95, 560], [130, 62], [190, 62], [228, 560]], p.mid, 150);
  dualPoly(ctx, hctx, [[0, 560], [28, 150], [88, 150], [120, 560]], p.near, 195);
  // Antenna forest on the mid tower.
  for (let i = 0; i < 6; i++) {
    const ax = 142 + i * 11;
    const ah = 26 + ((i * 13) % 34);
    dualRect(ctx, hctx, ax, 62 - ah, 2.5, ah, p.mid, 150);
  }
  // Crane arm reaching in from the left edge with hanging cables.
  dualRect(ctx, hctx, 0, 84, 392, 10, p.near, 195);
  dualLine(ctx, hctx, 120, 94, 96, 150, 3, p.near, 195, 0.9);
  dualLine(ctx, hctx, 250, 94, 238, 132, 3, p.near, 195, 0.9);
  for (const cx of [150, 262, 352]) {
    dualLine(ctx, hctx, cx, 94, cx, 238, 2, p.near, 195, 0.65);
  }
  // Nav-light anchors (PointLights come from PLATE_ANCHORS).
  for (const [lx, ly] of [[146, 52], [176, 44], [204, 58]]) {
    softRect(ctx, lx - 2, ly - 2, 4, 4, p.accent, 0.95);
  }
  // Sodium dots on the near tower flank.
  for (const [lx, ly] of [[36, 302], [214, 302]]) {
    softRect(ctx, lx - 2, ly - 2, 4, 4, p.glowWarm, 0.8);
  }

  // Right mast grove (far, dim).
  for (const mx of [830, 872, 914, 955]) {
    dualRect(ctx, hctx, mx, 210, 6, 350, p.far, 110);
    dualRect(ctx, hctx, mx - 3, 204, 12, 7, p.far, 110);
  }
  softLine(ctx, 830, 250, 914, 330, 2, p.far, 0.5);
  softLine(ctx, 872, 250, 955, 330, 2, p.far, 0.5);
  for (const [lx, ly] of [[830, 208], [955, 208]]) {
    softRect(ctx, lx - 2, ly - 2, 4, 4, p.accent, 0.8);
  }

  // Cloud sea: two flat blob rows closing the bottom of the frame.
  for (let i = 0; i < 8; i++) {
    const cx = 40 + i * 138;
    const cy = 508 + (i % 2) * 16;
    const r = 92 + (i % 3) * 26;
    ctx.fillStyle = css(p.panelLit);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    hctx.fillStyle = gray(85);
    hctx.beginPath();
    hctx.arc(cx, cy, r, 0, Math.PI * 2);
    hctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const cx = -20 + i * 128;
    const cy = 560 + 14;
    const r = 104 + ((i * 17) % 40);
    ctx.fillStyle = cssA(p.fog, 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    hctx.fillStyle = gray(70);
    hctx.beginPath();
    hctx.arc(cx, cy, r, 0, Math.PI * 2);
    hctx.fill();
  }
  heightOnly(hctx, 0, 540, 1000, 20, 85);
}

function drawFortressBackdrop(ctx: Ctx2D, hctx: Ctx2D, p: PosterPalette) {
  dualRect(ctx, hctx, 0, 0, 1000, 90, p.skyTop, 34);
  dualRect(ctx, hctx, 0, 90, 1000, 470, p.sky, 36);

  // Top truss lattice.
  dualRect(ctx, hctx, 0, 16, 1000, 12, p.mid, 170);
  dualRect(ctx, hctx, 0, 64, 1000, 8, p.mid, 170);
  for (let x = 0; x < 1000; x += 64) {
    dualLine(ctx, hctx, x, 28, x + 64, 64, 3, p.near, 170, 0.85);
    dualLine(ctx, hctx, x + 64, 28, x, 64, 3, p.near, 170, 0.85);
  }

  // Side bastion walls.
  dualRect(ctx, hctx, 0, 0, 372, 560, p.mid, 200);
  dualRect(ctx, hctx, 628, 0, 372, 560, p.mid, 200);
  for (const wallX of [0, 628]) {
    for (let y = 55; y < 520; y += 94) {
      dualRect(ctx, hctx, wallX + 14, y, 344, 4, p.panelShade, 192);
    }
    for (const jx of [62, 155, 248, 310]) {
      softRect(ctx, wallX + jx, 8, 3, 544, p.near, 0.5);
      heightOnly(hctx, wallX + jx, 8, 3, 544, 188);
    }
    // Beacon anchor + rust stain (PointLights from PLATE_ANCHORS).
    const bx = wallX === 0 ? 165 : 835;
    softRect(ctx, bx - 3, 61, 6, 6, p.accent, 0.95);
    softRect(ctx, bx - 1, 70, 2, 30, p.near, 0.4);
    heightOnly(hctx, bx - 1, 70, 2, 30, 190);
    // M27 bastion sconce facing the mid lane (PointLight at the same spot).
    const sx = wallX === 0 ? 352 : 648;
    dualRect(ctx, hctx, sx - 7, 290, 14, 4, p.panelShade, 190);
    dualRect(ctx, hctx, sx - 3, 286, 6, 14, p.panelShade, 196);
    softRect(ctx, sx - 2.5, 294, 5, 5, p.accent, 0.95);
  }

  // Center gate corridor: a deep void with three nested gate rims.
  dualRect(ctx, hctx, 372, 0, 256, 560, p.far, 80);
  for (let i = 0; i < 3; i++) {
    const inset = 34 * i;
    const gx = 372 + inset;
    const gw = 256 - inset * 2;
    const gy = 44 + inset * 0.9;
    softRect(ctx, gx, gy, gw, 3, p.mid, 0.55 - i * 0.12);
    softRect(ctx, gx, gy, 3, 560 - gy, p.mid, 0.55 - i * 0.12);
    softRect(ctx, gx + gw - 3, gy, 3, 560 - gy, p.mid, 0.55 - i * 0.12);
    heightOnly(hctx, gx, gy, gw, 3, 124);
    heightOnly(hctx, gx, gy, 3, 560 - gy, 124);
    heightOnly(hctx, gx + gw - 3, gy, 3, 560 - gy, 124);
  }

  // Recessed floor band.
  dualRect(ctx, hctx, 0, 516, 1000, 44, p.near, 90);
  for (let y = 522; y < 556; y += 22) {
    softRect(ctx, 0, y, 1000, 2, p.panelShade, 0.45);
  }

  // M27 gate-corridor pendant lamps (PointLights at the same spots): a rod
  // drops from the top truss, a wide flat shade caps a hot warm-white core.
  for (const px of [450, 550]) {
    dualRect(ctx, hctx, px - 1.5, 72, 3, 74, p.near, 185);
    dualPoly(ctx, hctx, [[px - 14, 142], [px + 14, 142], [px + 9, 158], [px - 9, 158]], p.mid, 200);
    dualRect(ctx, hctx, px - 9, 158, 18, 3, p.panelLit, 215);
    softRect(ctx, px - 4, 158, 8, 4, 0xffd9a8, 0.98);
    softRect(ctx, px - 7, 157, 14, 2, 0xffd9a8, 0.4);
  }
}

function drawFactoryBackdrop(ctx: Ctx2D, hctx: Ctx2D, p: PosterPalette) {
  dualRect(ctx, hctx, 0, 0, 1000, 74, p.skyTop, 32);
  dualRect(ctx, hctx, 0, 74, 1000, 486, p.sky, 34);

  // Distant machine silhouettes.
  for (const [mx, mw, mh] of [[60, 130, 74], [230, 90, 58], [352, 70, 44], [640, 110, 66], [790, 60, 40], [860, 130, 78]] as const) {
    dualRect(ctx, hctx, mx, 132 - mh, mw, mh, p.far, 108);
    dualRect(ctx, hctx, mx + mw * 0.3, 132 - mh - 26, 9, 26, p.far, 108);
  }

  // Two main process pipes with flange rings.
  dualRect(ctx, hctx, 0, 92, 1000, 14, p.mid, 175);
  dualRect(ctx, hctx, 0, 162, 1000, 10, p.mid, 165);
  for (let x = 60; x < 1000; x += 120) {
    dualRect(ctx, hctx, x, 88, 8, 22, p.mid, 182);
    dualRect(ctx, hctx, x + 46, 159, 8, 16, p.mid, 172);
  }
  dualLine(ctx, hctx, 300, 76, 700, 150, 6, p.mid, 165, 0.7);

  // Petroleum haze.
  softRect(ctx, 0, 190, 1000, 120, p.fog, 0.2);
  heightOnly(hctx, 0, 190, 1000, 120, 40);

  // Corner stacks (near framing).
  for (const sx of [25, 190, 785, 950]) {
    dualRect(ctx, hctx, sx, 0, 44, 560, p.near, 215);
    dualRect(ctx, hctx, sx - 4, 0, 52, 10, p.near, 220);
    for (let y = 70; y < 540; y += 70) {
      softRect(ctx, sx, y, 44, 3, p.panelShade, 0.55);
      heightOnly(hctx, sx, y, 44, 3, 208);
    }
  }

  // Furnace band: dark brick structure — the GLOW arrives via lighting.
  dualRect(ctx, hctx, 0, 470, 1000, 90, p.near, 70);
  for (let y = 476; y < 556; y += 18) {
    softRect(ctx, 0, y, 1000, 2, p.panelShade, 0.4);
  }
  for (const ax of [110, 440, 770]) {
    // Arch mouths: dark recess with a lit rim.
    ctx.fillStyle = "#060402";
    ctx.beginPath();
    ctx.moveTo(ax, 560);
    ctx.lineTo(ax, 512);
    ctx.arc(ax + 60, 512, 60, Math.PI, 0);
    ctx.lineTo(ax + 120, 560);
    ctx.closePath();
    ctx.fill();
    hctx.fillStyle = gray(50);
    hctx.beginPath();
    hctx.moveTo(ax, 560);
    hctx.lineTo(ax, 512);
    hctx.arc(ax + 60, 512, 60, Math.PI, 0);
    hctx.lineTo(ax + 120, 560);
    hctx.closePath();
    hctx.fill();
    softRect(ctx, ax - 4, 466, 128, 5, p.mid, 0.6);
    heightOnly(hctx, ax - 4, 466, 128, 5, 150);
  }
}

// ---------------------------------------------------------------------------
// World plate: platforms + cover wall. Cap strips go to the separate glow
// plate so the M20 "walkable here" signal can never be darkened by lighting.
// ---------------------------------------------------------------------------

function drawWorldPlates(mapId: MapId, p: PosterPalette, worldCtx: Ctx2D, whctx: Ctx2D, glowCtx: Ctx2D) {
  const map = MAPS[mapId];
  for (const platform of map.platforms) {
    // Contact shadow.
    worldCtx.fillStyle = cssA(p.near, 0.45);
    worldCtx.fillRect(platform.x + 5, platform.y + 8, platform.width - 10, Math.max(8, platform.height + 12));

    if (platform.solid) {
      // Cover wall: armored slab with a darker inset + rivet bands.
      dualRect(worldCtx, whctx, platform.x, platform.y, platform.width, platform.height, p.panelBase, 150);
      dualRect(worldCtx, whctx, platform.x + platform.width * 0.18, platform.y + 4, platform.width * 0.64, Math.max(2, platform.height - 8), p.panelShade, 118);
      for (let y = platform.y + 10; y < platform.y + platform.height - 6; y += 16) {
        softRect(worldCtx, platform.x + 4, y, platform.width - 8, 3, p.panelShade, 0.8);
        heightOnly(whctx, platform.x + 4, y, platform.width - 8, 3, 132);
      }
      // Edge bevels.
      dualRect(worldCtx, whctx, platform.x, platform.y, 2, platform.height, p.panelLit, 205);
      dualRect(worldCtx, whctx, platform.x + platform.width - 2, platform.y, 2, platform.height, p.panelShade, 120);
      // Emissive accent language (blocks shots).
      glowCtx.strokeStyle = css(p.accent);
      glowCtx.lineWidth = 2;
      glowCtx.strokeRect(platform.x + 1, platform.y + 1, platform.width - 2, platform.height - 2);
      glowCtx.lineWidth = 3;
      glowCtx.strokeStyle = cssA(p.accent, 0.95);
      const bx = platform.x;
      const by = platform.y;
      const bw = platform.width;
      const bh = platform.height;
      for (const [x1, y1, x2, y2] of [
        [bx - 3, by - 3, bx + 7, by - 3], [bx - 3, by - 3, bx - 3, by + 7],
        [bx + bw + 3, by - 3, bx + bw - 7, by - 3], [bx + bw + 3, by - 3, bx + bw + 3, by + 7],
        [bx - 3, by + bh + 3, bx + 7, by + bh + 3], [bx - 3, by + bh + 3, bx - 3, by + bh - 7],
        [bx + bw + 3, by + bh + 3, bx + bw - 7, by + bh + 3], [bx + bw + 3, by + bh + 3, bx + bw + 3, by + bh - 7],
      ]) {
        glowCtx.beginPath();
        glowCtx.moveTo(x1, y1);
        glowCtx.lineTo(x2, y2);
        glowCtx.stroke();
      }
      glowCtx.fillStyle = cssA(0xf2f5f2, 0.5);
      glowCtx.fillRect(platform.x, platform.y, platform.width, 2);
      continue;
    }

    // Platform body: base + lit top face + shaded underside + side bevels.
    dualRect(worldCtx, whctx, platform.x, platform.y, platform.width, platform.height, p.panelBase, 160);
    dualRect(worldCtx, whctx, platform.x, platform.y, platform.width, 3, p.panelLit, 235);
    dualRect(worldCtx, whctx, platform.x, platform.y + platform.height - 2, platform.width, 2, p.panelShade, 120);
    dualRect(worldCtx, whctx, platform.x, platform.y, 1.5, platform.height, p.panelLit, 200);
    dualRect(worldCtx, whctx, platform.x + platform.width - 1.5, platform.y, 1.5, platform.height, p.panelShade, 140);
    for (let x = platform.x + 13; x < platform.x + platform.width - 8; x += 38) {
      worldCtx.fillStyle = cssA(p.panelShade, 0.8);
      worldCtx.beginPath();
      worldCtx.arc(x, platform.y + platform.height - 4, 2, 0, Math.PI * 2);
      worldCtx.fill();
    }
    // Walkable cap: the loudest bright line in the world (M20 rule).
    glowCtx.fillStyle = cssA(p.cap, platform.oneWay ? 1 : 0.95);
    glowCtx.fillRect(platform.x, platform.y, platform.width, 4.5);
    glowCtx.fillStyle = cssA(p.capCore, platform.oneWay ? 0.35 : 0.2);
    glowCtx.fillRect(platform.x, platform.y, platform.width, 1.2);
    glowCtx.strokeStyle = cssA(0x93a0a4, 0.4);
    glowCtx.lineWidth = 1;
    glowCtx.beginPath();
    glowCtx.moveTo(platform.x + 8, platform.y + 7);
    glowCtx.lineTo(platform.x + platform.width - 8, platform.y + 7);
    glowCtx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Public build API
// ---------------------------------------------------------------------------

function buildMapPlates(scene: Phaser.Scene, mapId: MapId): [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image] {
  const p = POSTER[mapId];
  const w = Math.round(WORLD.width * PLATE_SCALE);
  const h = Math.round(WORLD.height * PLATE_SCALE);

  const bgCanvas = makeCanvas(w, h);
  const bgHeight = makeCanvas(w, h);
  const bgCtx = ctx2d(bgCanvas, PLATE_SCALE);
  const bgHCtx = ctx2d(bgHeight, PLATE_SCALE);
  if (mapId === "canopy") drawCanopyBackdrop(bgCtx, bgHCtx, p);
  else if (mapId === "fortress") drawFortressBackdrop(bgCtx, bgHCtx, p);
  else drawFactoryBackdrop(bgCtx, bgHCtx, p);

  const worldCanvas = makeCanvas(w, h);
  const worldHeight = makeCanvas(w, h);
  const glowCanvas = makeCanvas(w, h);
  drawWorldPlates(
    mapId, p,
    ctx2d(worldCanvas, PLATE_SCALE),
    ctx2d(worldHeight, PLATE_SCALE),
    ctx2d(glowCanvas, PLATE_SCALE),
  );

  const bgNormal = buildNormalCanvas(bgHeight, w, h, 0.9);
  const worldNormal = buildNormalCanvas(worldHeight, w, h, 1.15);

  registerPlate(scene, `plate-bg-${mapId}`, bgCanvas, `plate-bg-${mapId}-n`, bgNormal);
  registerPlate(scene, `plate-world-${mapId}`, worldCanvas, `plate-world-${mapId}-n`, worldNormal);
  registerPlate(scene, `plate-glow-${mapId}`, glowCanvas);

  const background = scene.add.image(0, 0, `plate-bg-${mapId}`).setOrigin(0, 0).setDisplaySize(WORLD.width, WORLD.height).setDepth(-20);
  const world = scene.add.image(0, 0, `plate-world-${mapId}`).setOrigin(0, 0).setDisplaySize(WORLD.width, WORLD.height).setDepth(-19);
  const glow = scene.add.image(0, 0, `plate-glow-${mapId}`).setOrigin(0, 0).setDisplaySize(WORLD.width, WORLD.height).setDepth(-18);
  return [background, world, glow];
}

/** Builds plates for every map. Returns keyed image sets for visibility/pipeline control. */
export function buildAllPlates(scene: Phaser.Scene): Record<MapId, PlateSet> {
  const result = {} as Record<MapId, PlateSet>;
  for (const mapId of Object.keys(MAPS) as MapId[]) {
    const [background, world, glow] = buildMapPlates(scene, mapId);
    result[mapId] = { background, world, glow };
  }
  return result;
}
