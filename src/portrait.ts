/**
 * M26 procedural poster portraits. Replaces the four AI-painted webps with
 * flat-vector chest-up busts drawn on a canvas and cached as data URLs —
 * zero network assets, perfect style unity with the in-game pilots.
 */
const SIZE = 512;

// Archetype identity accents (equipment lights, not player colors).
const ACCENTS = ["#e0a43c", "#d4676b", "#c98a3f", "#8a7fd6"];
// Armor value structure shared with the in-game rig.
const ARMOR_DARK = "#20272c";
const ARMOR_BASE = "#313b42";
const ARMOR_MID = "#3f4b54";
const ARMOR_HI = "#5d6d77";

const cache = new Map<number, string>();

function ctxOf(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas.getContext("2d")!;
}

export function portraitDataUrl(archetype: number): string {
  const cached = cache.get(archetype);
  if (cached) return cached;
  const ctx = ctxOf();
  const accent = ACCENTS[archetype] ?? ACCENTS[0];
  const cx = SIZE / 2;

  // Backdrop: two-tone wall + one accent scanline (poster stage).
  ctx.fillStyle = "#1a2026";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#232b32";
  ctx.fillRect(0, 0, SIZE, 214);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.32;
  ctx.fillRect(0, 214, SIZE, 3);
  ctx.globalAlpha = 1;
  // Faint hazard banding behind the figure (breacher anchoring).
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = accent;
  for (let x = -60; x < SIZE + 60; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, SIZE);
    ctx.lineTo(x + 26, SIZE);
    ctx.lineTo(x + 86, 258);
    ctx.lineTo(x + 60, 258);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Torso: slab chest with a lit top face and dark under-edge.
  const shoulderY = 322;
  ctx.fillStyle = ARMOR_DARK;
  ctx.fillRect(cx - 148, shoulderY - 6, 296, 190); // silhouette under-slab
  ctx.fillStyle = ARMOR_BASE;
  ctx.fillRect(cx - 132, shoulderY, 264, 190);
  ctx.fillStyle = ARMOR_MID;
  ctx.fillRect(cx - 104, shoulderY + 10, 208, 120);
  ctx.fillStyle = ARMOR_HI;
  ctx.fillRect(cx - 132, shoulderY, 264, 7);
  // Chest service stripe + hazard chevron per archetype flavor.
  ctx.fillStyle = accent;
  ctx.fillRect(cx - 132, shoulderY + 26, 14, 84);
  if (archetype === 0) {
    // Breacher: hazard chevron plate.
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + 26, shoulderY + 58);
    ctx.lineTo(cx + 96, shoulderY + 92);
    ctx.lineTo(cx + 26, shoulderY + 126);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (archetype === 1) {
    // Warden: twin chest buckles.
    ctx.fillStyle = ARMOR_HI;
    ctx.fillRect(cx + 30, shoulderY + 44, 58, 10);
    ctx.fillRect(cx + 30, shoulderY + 92, 58, 10);
  } else if (archetype === 2) {
    // Rigger: harness strap + tool loop.
    ctx.strokeStyle = "#14191c";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx + 74, shoulderY + 4);
    ctx.lineTo(cx - 46, shoulderY + 168);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 12, shoulderY + 74, 16, 16);
  } else {
    // Hunter: knife sheath hint on the rear hip.
    ctx.fillStyle = ARMOR_DARK;
    ctx.fillRect(cx - 158, shoulderY + 118, 30, 64);
    ctx.fillStyle = ARMOR_HI;
    ctx.fillRect(cx - 152, shoulderY + 176, 18, 6);
  }

  // Helmet: per-archetype silhouette (same language as the game rig).
  const headY = 236;
  ctx.fillStyle = ARMOR_DARK;
  if (archetype === 0) {
    ctx.fillRect(cx - 96, headY - 64, 192, 132); // wide assault dome
  } else if (archetype === 1) {
    ctx.fillRect(cx - 78, headY - 68, 156, 138); // high-collared bastion
    ctx.beginPath();
    ctx.moveTo(cx - 18, headY - 66);
    ctx.lineTo(cx + 18, headY - 66);
    ctx.lineTo(cx + 6, headY - 98);
    ctx.lineTo(cx - 6, headY - 98);
    ctx.closePath();
    ctx.fill();
  } else if (archetype === 2) {
    ctx.fillRect(cx - 80, headY - 66, 160, 138);
    ctx.strokeStyle = ARMOR_MID;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx - 52, headY - 50);
    ctx.lineTo(cx - 82, headY - 100);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx - 82, headY - 100, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath(); // angled scout helm
    ctx.moveTo(cx - 68, headY + 66);
    ctx.lineTo(cx - 54, headY - 54);
    ctx.lineTo(cx + 40, headY - 66);
    ctx.lineTo(cx + 68, headY + 66);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = ARMOR_BASE;
  if (archetype === 0) ctx.fillRect(cx - 90, headY - 56, 180, 122);
  else if (archetype === 1) ctx.fillRect(cx - 72, headY - 60, 144, 126);
  else if (archetype === 2) ctx.fillRect(cx - 74, headY - 58, 148, 128);
  else {
    ctx.beginPath();
    ctx.moveTo(cx - 62, headY + 60);
    ctx.lineTo(cx - 50, headY - 48);
    ctx.lineTo(cx + 38, headY - 58);
    ctx.lineTo(cx + 62, headY + 60);
    ctx.closePath();
    ctx.fill();
  }
  // Crown rim light (key from upper-left, matches scene grading).
  ctx.strokeStyle = ARMOR_HI;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx - 38, headY - 50);
  ctx.lineTo(cx + 30, headY - 54);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Emissive visor band.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.95;
  if (archetype === 0) ctx.fillRect(cx - 8, headY - 14, 74, 26);
  else if (archetype === 1) ctx.fillRect(cx - 48, headY - 14, 96, 22);
  else if (archetype === 2) ctx.fillRect(cx - 48, headY - 18, 96, 28);
  else ctx.fillRect(cx - 6, headY - 8, 66, 20);
  ctx.globalAlpha = 0.4;
  ctx.fillRect(cx - 60, headY - 8, 20, 8); // ambient bounce of the visor
  ctx.globalAlpha = 1;
  if (archetype === 2) {
    // Rigger goggles: amber lenses.
    ctx.fillStyle = "#f0a24a";
    ctx.beginPath();
    ctx.arc(cx - 26, headY - 4, 15, 0, Math.PI * 2);
    ctx.arc(cx + 26, headY - 4, 15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rim light stroke along the left silhouette (poster key light side).
  ctx.strokeStyle = "#cfe4ea";
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 96, headY + 40);
  ctx.lineTo(cx - 132, shoulderY - 2);
  ctx.lineTo(cx - 132, shoulderY + 180);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const url = ctx.canvas.toDataURL("image/png");
  cache.set(archetype, url);
  return url;
}
