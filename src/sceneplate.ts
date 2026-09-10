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

/**
 * M29: anchors are NATIVE world coordinates, authored together with the
 * 1500×840 backdrop compositions (each entry sits on a drawn fixture).
 * Radii scale with the world so relative light coverage matches the M26/M27
 * look. lighting.ts consumes these directly.
 */
export const PLATE_ANCHORS: Record<MapId, PlateAnchor[]> = {
  canopy: [
    // Triple nav lights on the crane arm (west frame).
    { x: 219, y: 78, color: 0x43d3e0, radius: 135, intensity: 0.8 },
    { x: 264, y: 66, color: 0x43d3e0, radius: 135, intensity: 0.75 },
    { x: 306, y: 87, color: 0x43d3e0, radius: 135, intensity: 0.8 },
    // Mast-grove beacons (east horizon).
    { x: 1245, y: 312, color: 0x43d3e0, radius: 128, intensity: 0.6 },
    { x: 1432, y: 312, color: 0x43d3e0, radius: 128, intensity: 0.6 },
    // Sodium dots on the near pylon flank.
    { x: 54, y: 453, color: 0xe7c884, radius: 105, intensity: 0.55 },
    { x: 321, y: 453, color: 0xe7c884, radius: 105, intensity: 0.55 },
  ],
  fortress: [
    // Top-truss alarm beacons (the M26 pair).
    { x: 248, y: 96, color: 0xe0455a, radius: 165, intensity: 0.7 },
    { x: 1253, y: 96, color: 0xe0455a, radius: 165, intensity: 0.7 },
    // M27 gate-corridor pendant lamps hanging off the top truss — the mid
    // duel lane finally gets standing light instead of only sweeping beams.
    { x: 675, y: 240, color: 0xffd9a8, radius: 188, intensity: 0.62 },
    { x: 825, y: 240, color: 0xffd9a8, radius: 188, intensity: 0.62 },
    // M27 bastion-wall sconces flanking the mid lane entrances.
    { x: 528, y: 445, color: 0xe0455a, radius: 143, intensity: 0.5 },
    { x: 972, y: 445, color: 0xe0455a, radius: 143, intensity: 0.5 },
  ],
  factory: [
    // Furnace glow (the big ambient well) + two side arch lamps.
    { x: 750, y: 820, color: 0xff9a4a, radius: 390, intensity: 0.9 },
    { x: 255, y: 745, color: 0xff9a4a, radius: 143, intensity: 0.5 },
    { x: 1245, y: 745, color: 0xff9a4a, radius: 143, intensity: 0.5 },
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
  // M29: composed natively at 1500×840 (ground line 795). Two-tone storm sky
  // with a hard seam.
  dualRect(ctx, hctx, 0, 0, 1500, 348, p.skyTop, 40);
  dualRect(ctx, hctx, 0, 348, 1500, 492, p.sky, 44);
  softRect(ctx, 0, 347, 1500, 1.5, p.panelLit, 0.22);
  // Haze band.
  softRect(ctx, 0, 387, 1500, 69, p.fog, 0.3);
  heightOnly(hctx, 0, 387, 1500, 69, 48);

  // Left pylon cluster: three overlapping tapered towers, far → near.
  dualPoly(ctx, hctx, [[45, 795], [90, 183], [162, 183], [210, 795]], p.far, 110);
  dualPoly(ctx, hctx, [[143, 795], [195, 93], [285, 93], [342, 795]], p.mid, 150);
  dualPoly(ctx, hctx, [[0, 795], [42, 225], [132, 225], [180, 795]], p.near, 195);
  // Antenna forest on the mid tower.
  for (let i = 0; i < 6; i++) {
    const ax = 213 + i * 17;
    const ah = 39 + ((i * 13) % 51);
    dualRect(ctx, hctx, ax, 93 - ah, 4, ah, p.mid, 150);
  }
  // Crane arm reaching in from the left edge with hanging cables.
  dualRect(ctx, hctx, 0, 126, 588, 15, p.near, 195);
  dualLine(ctx, hctx, 180, 141, 144, 225, 4, p.near, 195, 0.9);
  dualLine(ctx, hctx, 375, 141, 357, 198, 4, p.near, 195, 0.9);
  for (const cx of [225, 393, 528]) {
    dualLine(ctx, hctx, cx, 141, cx, 357, 3, p.near, 195, 0.65);
  }
  // Nav-light anchors (PointLights come from PLATE_ANCHORS).
  for (const [lx, ly] of [[219, 78], [264, 66], [306, 87]]) {
    softRect(ctx, lx - 3, ly - 3, 6, 6, p.accent, 0.95);
  }
  // Sodium dots on the near tower flank.
  for (const [lx, ly] of [[54, 453], [321, 453]]) {
    softRect(ctx, lx - 3, ly - 3, 6, 6, p.glowWarm, 0.8);
  }

  // Right mast grove (far, dim) — the east horizon answer to the west towers.
  for (const mx of [1245, 1308, 1371, 1432]) {
    dualRect(ctx, hctx, mx, 315, 9, 480, p.far, 110);
    dualRect(ctx, hctx, mx - 4, 306, 18, 10, p.far, 110);
  }
  softLine(ctx, 1245, 375, 1371, 495, 3, p.far, 0.5);
  softLine(ctx, 1308, 375, 1432, 495, 3, p.far, 0.5);
  for (const [lx, ly] of [[1245, 312], [1432, 312]]) {
    softRect(ctx, lx - 3, ly - 3, 6, 6, p.accent, 0.8);
  }

  // Cloud sea: two flat blob rows closing the bottom of the frame.
  for (let i = 0; i < 12; i++) {
    const cx = 60 + i * 130;
    const cy = 762 + (i % 2) * 24;
    const r = 138 + (i % 3) * 39;
    ctx.fillStyle = css(p.panelLit);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    hctx.fillStyle = gray(85);
    hctx.beginPath();
    hctx.arc(cx, cy, r, 0, Math.PI * 2);
    hctx.fill();
  }
  for (let i = 0; i < 13; i++) {
    const cx = -30 + i * 122;
    const cy = 854;
    const r = 156 + ((i * 17) % 60);
    ctx.fillStyle = cssA(p.fog, 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    hctx.fillStyle = gray(70);
    hctx.beginPath();
    hctx.arc(cx, cy, r, 0, Math.PI * 2);
    hctx.fill();
  }
  heightOnly(hctx, 0, 810, 1500, 30, 85);
}

function drawFortressBackdrop(ctx: Ctx2D, hctx: Ctx2D, p: PosterPalette) {
  // M29: composed natively at 1500×840 (ground line 795).
  dualRect(ctx, hctx, 0, 0, 1500, 135, p.skyTop, 34);
  dualRect(ctx, hctx, 0, 135, 1500, 705, p.sky, 36);

  // Top truss lattice.
  dualRect(ctx, hctx, 0, 24, 1500, 18, p.mid, 170);
  dualRect(ctx, hctx, 0, 96, 1500, 12, p.mid, 170);
  for (let x = 0; x < 1500; x += 96) {
    dualLine(ctx, hctx, x, 42, x + 96, 96, 4, p.near, 170, 0.85);
    dualLine(ctx, hctx, x + 96, 42, x, 96, 4, p.near, 170, 0.85);
  }

  // Side bastion walls (wide enough to frame the 558..942 mid corridor).
  dualRect(ctx, hctx, 0, 0, 558, 840, p.mid, 200);
  dualRect(ctx, hctx, 942, 0, 558, 840, p.mid, 200);
  for (const wallX of [0, 942]) {
    for (let y = 82; y < 780; y += 141) {
      dualRect(ctx, hctx, wallX + 21, y, 516, 6, p.panelShade, 192);
    }
    for (const jx of [93, 232, 372, 465]) {
      softRect(ctx, wallX + jx, 12, 4, 816, p.near, 0.5);
      heightOnly(hctx, wallX + jx, 12, 4, 816, 188);
    }
    // Beacon anchor + rust stain (PointLights from PLATE_ANCHORS).
    const bx = wallX === 0 ? 248 : 1253;
    softRect(ctx, bx - 4, 92, 8, 8, p.accent, 0.95);
    softRect(ctx, bx - 2, 105, 3, 45, p.near, 0.4);
    heightOnly(hctx, bx - 2, 105, 3, 45, 190);
    // M27 bastion sconce facing the mid lane (PointLight at the same spot).
    const sx = wallX === 0 ? 528 : 972;
    dualRect(ctx, hctx, sx - 10, 435, 21, 6, p.panelShade, 190);
    dualRect(ctx, hctx, sx - 4, 429, 9, 21, p.panelShade, 196);
    softRect(ctx, sx - 4, 441, 8, 8, p.accent, 0.95);
  }

  // Center gate corridor: a deep void with three nested gate rims.
  dualRect(ctx, hctx, 558, 0, 384, 840, p.far, 80);
  for (let i = 0; i < 3; i++) {
    const inset = 51 * i;
    const gx = 558 + inset;
    const gw = 384 - inset * 2;
    const gy = 66 + inset * 1.35;
    softRect(ctx, gx, gy, gw, 4, p.mid, 0.55 - i * 0.12);
    softRect(ctx, gx, gy, 4, 840 - gy, p.mid, 0.55 - i * 0.12);
    softRect(ctx, gx + gw - 4, gy, 4, 840 - gy, p.mid, 0.55 - i * 0.12);
    heightOnly(hctx, gx, gy, gw, 4, 124);
    heightOnly(hctx, gx, gy, 4, 840 - gy, 124);
    heightOnly(hctx, gx + gw - 4, gy, 4, 840 - gy, 124);
  }

  // Recessed floor band (meets the 795 ground line).
  dualRect(ctx, hctx, 0, 765, 1500, 75, p.near, 90);
  for (let y = 774; y < 836; y += 33) {
    softRect(ctx, 0, y, 1500, 3, p.panelShade, 0.45);
  }

  // M27 gate-corridor pendant lamps (PointLights at the same spots): a rod
  // drops from the top truss, a wide flat shade caps a hot warm-white core.
  for (const px of [675, 825]) {
    dualRect(ctx, hctx, px - 2, 108, 4, 111, p.near, 185);
    dualPoly(ctx, hctx, [[px - 21, 213], [px + 21, 213], [px + 14, 237], [px - 14, 237]], p.mid, 200);
    dualRect(ctx, hctx, px - 14, 237, 28, 4, p.panelLit, 215);
    softRect(ctx, px - 6, 237, 12, 6, 0xffd9a8, 0.98);
    softRect(ctx, px - 10, 236, 20, 3, 0xffd9a8, 0.4);
  }
}

function drawFactoryBackdrop(ctx: Ctx2D, hctx: Ctx2D, p: PosterPalette) {
  // M29: composed natively at 1500×840 (ground/furnace line 795).
  dualRect(ctx, hctx, 0, 0, 1500, 111, p.skyTop, 32);
  dualRect(ctx, hctx, 0, 111, 1500, 729, p.sky, 34);

  // Distant machine silhouettes.
  for (const [mx, mw, mh] of [[90, 195, 111], [345, 135, 87], [528, 105, 66], [960, 165, 99], [1185, 90, 60], [1290, 195, 117]] as const) {
    dualRect(ctx, hctx, mx, 198 - mh, mw, mh, p.far, 108);
    dualRect(ctx, hctx, mx + mw * 0.3, 198 - mh - 39, 13, 39, p.far, 108);
  }

  // Two main process pipes with flange rings.
  dualRect(ctx, hctx, 0, 138, 1500, 21, p.mid, 175);
  dualRect(ctx, hctx, 0, 243, 1500, 15, p.mid, 165);
  for (let x = 90; x < 1500; x += 180) {
    dualRect(ctx, hctx, x, 132, 12, 33, p.mid, 182);
    dualRect(ctx, hctx, x + 69, 238, 12, 24, p.mid, 172);
  }
  dualLine(ctx, hctx, 450, 114, 1050, 225, 9, p.mid, 165, 0.7);

  // Petroleum haze.
  softRect(ctx, 0, 285, 1500, 180, p.fog, 0.2);
  heightOnly(hctx, 0, 285, 1500, 180, 40);

  // Corner stacks (near framing) — full-height columns at the frame quarters.
  for (const sx of [38, 285, 1178, 1425]) {
    dualRect(ctx, hctx, sx, 0, 66, 840, p.near, 215);
    dualRect(ctx, hctx, sx - 6, 0, 78, 15, p.near, 220);
    for (let y = 105; y < 810; y += 105) {
      softRect(ctx, sx, y, 66, 4, p.panelShade, 0.55);
      heightOnly(hctx, sx, y, 66, 4, 208);
    }
  }

  // Furnace band: dark brick structure — the GLOW arrives via lighting.
  dualRect(ctx, hctx, 0, 705, 1500, 135, p.near, 70);
  for (let y = 714; y < 834; y += 27) {
    softRect(ctx, 0, y, 1500, 3, p.panelShade, 0.4);
  }
  for (const ax of [165, 660, 1155]) {
    // Arch mouths: dark recess with a lit rim.
    ctx.fillStyle = "#060402";
    ctx.beginPath();
    ctx.moveTo(ax, 840);
    ctx.lineTo(ax, 768);
    ctx.arc(ax + 90, 768, 90, Math.PI, 0);
    ctx.lineTo(ax + 180, 840);
    ctx.closePath();
    ctx.fill();
    hctx.fillStyle = gray(50);
    hctx.beginPath();
    hctx.moveTo(ax, 840);
    hctx.lineTo(ax, 768);
    hctx.arc(ax + 90, 768, 90, Math.PI, 0);
    hctx.lineTo(ax + 180, 840);
    hctx.closePath();
    hctx.fill();
    softRect(ctx, ax - 6, 699, 192, 7, p.mid, 0.6);
    heightOnly(hctx, ax - 6, 699, 192, 7, 150);
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
