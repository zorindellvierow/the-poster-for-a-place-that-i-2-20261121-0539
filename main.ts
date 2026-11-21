// VELMARA — "The Poster for a Place That Isn't There"
// A travel poster for a fictional floating-island lagoon, drawn entirely
// in code: flat-design shapes, a hand-made 5x7 bitmap font, and a
// hand-rolled PNG encoder. Node stdlib only, no network, deterministic.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const HORIZON = 640;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32, fixed seed). Never Math.random / Date.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);

// ---------------------------------------------------------------------------
// Canvas: raw RGB buffer.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const buf = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// Multi-stop vertical gradient.
function gradient(stops: Array<[number, RGB]>, y: number, y0: number, y1: number): RGB {
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  for (let s = 0; s < stops.length - 1; s++) {
    const [t0, c0] = stops[s];
    const [t1, c1] = stops[s + 1];
    if (t >= t0 && t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return mix(c0, c1, f);
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const SKY_STOPS: Array<[number, RGB]> = [
  [0.0, [43, 24, 74]], // deep dusk purple
  [0.35, [110, 58, 122]], // violet
  [0.62, [214, 96, 92]], // coral
  [0.85, [247, 168, 88]], // warm gold
  [1.0, [250, 199, 110]], // pale gold at the horizon
];
const SUN_OUTER: RGB = [255, 122, 77];
const SUN_INNER: RGB = [255, 196, 110];
const SUN_C: [number, number] = [512, 430];
const SUN_R = 150;
const CREAM: RGB = [255, 243, 214];
const DEEP_PURPLE: RGB = [38, 18, 58];
const ROCK_TOP: RGB = [96, 62, 96];
const ROCK_BOT: RGB = [40, 22, 46];
const GRASS: RGB = [94, 140, 90];
const SEA_TOP: RGB = [63, 184, 166];
const SEA_BOT: RGB = [16, 74, 70];

function skyColor(x: number, y: number): RGB {
  return gradient(SKY_STOPS, y, 0, HORIZON);
}

function sunColor(x: number, y: number): RGB {
  const dx = x - SUN_C[0];
  const dy = y - SUN_C[1];
  const d = Math.sqrt(dx * dx + dy * dy) / SUN_R;
  return mix(SUN_INNER, SUN_OUTER, Math.min(1, d));
}

function inSun(x: number, y: number): boolean {
  const dx = x - SUN_C[0];
  const dy = y - SUN_C[1];
  return dx * dx + dy * dy <= SUN_R * SUN_R;
}

// What the sky looks like at (x, y) if the island were not there.
function backgroundColor(x: number, y: number): RGB {
  return inSun(x, y) ? sunColor(x, y) : skyColor(x, y);
}

function fillCircle(cx: number, cy: number, r: number, color: (x: number, y: number) => RGB): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(x, y, color(x, y));
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, c);
    }
  }
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setPx(x, y, c);
  }
}

// ---------------------------------------------------------------------------
// Sky, sun, clouds, birds
// ---------------------------------------------------------------------------
for (let y = 0; y < HORIZON; y++) {
  const c = skyColor(0, y);
  for (let x = 0; x < W; x++) setPx(x, y, c);
}
fillCircle(SUN_C[0], SUN_C[1], SUN_R, sunColor);

// Thin sunset clouds (seeded, flat ellipses in pale rose / cream).
const CLOUD: RGB = [255, 205, 178];
const CLOUD2: RGB = [238, 164, 170];
for (let i = 0; i < 7; i++) {
  const cx = 60 + rand() * 900;
  const cy = 120 + rand() * 260;
  const rx = 70 + rand() * 110;
  const ry = 7 + rand() * 9;
  fillEllipse(cx, cy, rx, ry, i % 2 === 0 ? CLOUD : CLOUD2);
  fillEllipse(cx + rx * 0.4, cy - ry * 0.7, rx * 0.55, ry * 0.8, i % 2 === 0 ? CLOUD : CLOUD2);
}

// A few early stars high in the purple dusk.
for (let i = 0; i < 26; i++) {
  const x = Math.floor(rand() * W);
  const y = Math.floor(rand() * 150);
  const s = rand() < 0.25 ? 2 : 1;
  fillRect(x, y, x + s - 1, y + s - 1, CREAM);
}

// Birds: small dark "v" strokes.
function drawBird(cx: number, cy: number, s: number): void {
  for (let i = 0; i < s; i++) {
    setPx(cx - i, cy + i, DEEP_PURPLE);
    setPx(cx + i, cy + i, DEEP_PURPLE);
    setPx(cx - i, cy + i + 1, DEEP_PURPLE);
    setPx(cx + i, cy + i + 1, DEEP_PURPLE);
  }
}
for (let i = 0; i < 9; i++) {
  const bx = 90 + rand() * 840;
  const by = 200 + rand() * 240;
  drawBird(Math.floor(bx), Math.floor(by), 5 + Math.floor(rand() * 5));
}

// ---------------------------------------------------------------------------
// The floating island: ellipse top + tapered rock below, with an arch hole
// through which the sun shines. A tiny lighthouse stands on its grassy top.
// ---------------------------------------------------------------------------
const ISLAND_CX = 512;
const ISLAND_TOP = 285; // top of the ellipse
const ISLAND_CY = 390;
const ISLAND_RX = 250;
const ISLAND_RY = 105;
const ISLAND_POINT_Y = 585; // tip of the hanging rock

function islandHalfWidth(y: number): number {
  if (y < ISLAND_CY) {
    // Upper half of the ellipse.
    const dy = (y - ISLAND_CY) / ISLAND_RY;
    const v = 1 - dy * dy;
    return v <= 0 ? 0 : ISLAND_RX * Math.sqrt(v);
  }
  if (y <= 470) {
    // Lower half of the ellipse.
    const dy = (y - ISLAND_CY) / ISLAND_RY;
    const v = 1 - dy * dy;
    return v <= 0 ? 0 : ISLAND_RX * Math.sqrt(v);
  }
  // Taper from the ellipse waist down to a point.
  const t = (y - 470) / (ISLAND_POINT_Y - 470);
  const waist = islandHalfWidth(470);
  return Math.max(0, waist * (1 - t));
}

function inArchHole(x: number, y: number): boolean {
  const dx = (x - ISLAND_CX) / 95;
  const dy = (y - 420) / 58;
  return dx * dx + dy * dy <= 1;
}

for (let y = ISLAND_TOP; y <= ISLAND_POINT_Y; y++) {
  const hw = islandHalfWidth(y);
  if (hw <= 0) continue;
  const rock = mix(ROCK_TOP, ROCK_BOT, (y - ISLAND_TOP) / (ISLAND_POINT_Y - ISLAND_TOP));
  for (let x = Math.ceil(ISLAND_CX - hw); x <= Math.floor(ISLAND_CX + hw); x++) {
    if (inArchHole(x, y)) {
      // See-through arch: the sun / sky shows through.
      setPx(x, y, backgroundColor(x, y));
    } else if (y <= ISLAND_TOP + 14 && Math.abs(x - ISLAND_CX) < hw - 6) {
      // Grassy plateau on top.
      setPx(x, y, GRASS);
    } else {
      setPx(x, y, rock);
    }
  }
}

// Warm rim light along the island's upper edge.
for (let x = ISLAND_CX - ISLAND_RX; x <= ISLAND_CX + ISLAND_RX; x++) {
  const dx = (x - ISLAND_CX) / ISLAND_RX;
  const v = 1 - dx * dx;
  if (v <= 0) continue;
  const topY = Math.round(ISLAND_CY - ISLAND_RY * Math.sqrt(v));
  setPx(x, topY, [247, 183, 115]);
  setPx(x, topY + 1, [247, 183, 115]);
}

// ---------------------------------------------------------------------------
// Lighthouse on the island's plateau.
// ---------------------------------------------------------------------------
const LH_X = 500; // left edge of the tower
const LH_TOP = 218;
const LH_BASE = ISLAND_TOP + 2;
fillRect(LH_X, LH_TOP + 18, LH_X + 24, LH_BASE, [250, 246, 238]); // white tower
fillRect(LH_X, LH_TOP + 30, LH_X + 24, LH_TOP + 38, [214, 72, 62]); // red band
fillRect(LH_X, LH_TOP + 48, LH_X + 24, LH_TOP + 56, [214, 72, 62]); // red band
fillRect(LH_X - 3, LH_TOP + 12, LH_X + 27, LH_TOP + 17, [38, 32, 48]); // gallery
fillRect(LH_X + 2, LH_TOP + 2, LH_X + 22, LH_TOP + 11, [255, 196, 110]); // lamp room
fillRect(LH_X + 4, LH_TOP - 8, LH_X + 20, LH_TOP + 1, [214, 72, 62]); // red dome
setPx(LH_X + 12, LH_TOP - 12, [214, 72, 62]);
setPx(LH_X + 12, LH_TOP - 13, [214, 72, 62]);
// Light beam to the right, pale gold.
for (let i = 0; i < 90; i++) {
  const bx = LH_X + 26 + i;
  const spread = Math.floor(i / 9);
  for (let by = LH_TOP + 4 - spread; by <= LH_TOP + 9 + spread; by++) {
    if ((bx + by) % 2 === 0) setPx(bx, by, [255, 214, 130]);
  }
}
// Two tiny trees on the plateau.
function drawTree(tx: number, ty: number): void {
  fillRect(tx, ty - 8, tx + 3, ty, [58, 48, 40]);
  fillEllipse(tx + 1, ty - 16, 9, 11, [52, 110, 74]);
}
drawTree(330, ISLAND_TOP + 12);
drawTree(676, ISLAND_TOP + 12);

// ---------------------------------------------------------------------------
// Sea: teal gradient, island shadow, sun reflection, wave dashes.
// ---------------------------------------------------------------------------
for (let y = HORIZON; y < H; y++) {
  const c = gradient(
    [
      [0, SEA_TOP],
      [1, SEA_BOT],
    ],
    y,
    HORIZON,
    H,
  );
  for (let x = 0; x < W; x++) setPx(x, y, c);
}

// Island shadow on the water.
for (let y = 648; y <= 690; y++) {
  for (let x = 300; x <= 724; x++) {
    const dx = (x - ISLAND_CX) / 210;
    const dy = (y - 668) / 20;
    if (dx * dx + dy * dy <= 1) setPx(x, y, [14, 58, 56]);
  }
}

// Sun reflection: shimmering gold dashes under the sun, fading with depth.
for (let y = HORIZON + 8; y < H - 30; y += 7) {
  const fade = 1 - (y - HORIZON) / (H - HORIZON);
  const half = Math.floor(110 * fade) + 14;
  for (let x = ISLAND_CX - half; x <= ISLAND_CX + half; x++) {
    if (rand() < 0.55 * fade + 0.08) {
      setPx(x, y, [255, 196, 110]);
      if (rand() < 0.4) setPx(x + 1, y, [255, 196, 110]);
    }
  }
}

// Wave dashes across the lagoon.
for (let i = 0; i < 90; i++) {
  const wx = Math.floor(rand() * W);
  const wy = HORIZON + 24 + Math.floor(rand() * (H - HORIZON - 60));
  const len = 8 + Math.floor(rand() * 22);
  const wc: RGB = rand() < 0.5 ? [120, 210, 196] : [36, 130, 122];
  for (let x = wx; x < wx + len && x < W; x++) setPx(x, wy, wc);
}

// ---------------------------------------------------------------------------
// Vintage frame.
// ---------------------------------------------------------------------------
fillRect(0, 0, W - 1, 15, CREAM);
fillRect(0, H - 16, W - 1, H - 1, CREAM);
fillRect(0, 0, 15, H - 1, CREAM);
fillRect(W - 16, 0, W - 1, H - 1, CREAM);
fillRect(24, 24, W - 25, 26, DEEP_PURPLE);
fillRect(24, H - 27, W - 25, H - 25, DEEP_PURPLE);
fillRect(24, 24, 26, H - 25, DEEP_PURPLE);
fillRect(W - 27, 24, W - 25, H - 25, DEEP_PURPLE);

// ---------------------------------------------------------------------------
// 5x7 bitmap font (hand-drawn), A-Z 0-9 and basic punctuation.
// Each glyph: 7 rows of 5 bits, "#" = on.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
};

function textWidth(text: string, scale: number): number {
  // 5 px glyph + 1 px gap, scaled.
  return text.length * 6 * scale - scale;
}

function drawText(text: string, cx: number, y: number, scale: number, color: RGB): void {
  const w = textWidth(text, scale);
  let x = Math.round(cx - w / 2);
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === "1") {
          fillRect(x + c * scale, y + r * scale, x + c * scale + scale - 1, y + r * scale + scale - 1, color);
        }
      }
    }
    x += 6 * scale;
  }
}

// ---------------------------------------------------------------------------
// Title + tagline. Shadow first (offset, deep purple), then cream on top.
// ---------------------------------------------------------------------------
const TITLE_SCALE = 17;
const TITLE_Y = 66;
drawText("VELMARA", 512 + 7, TITLE_Y + 7, TITLE_SCALE, DEEP_PURPLE);
drawText("VELMARA", 512, TITLE_Y, TITLE_SCALE, CREAM);

const TAG_SCALE = 4;
const TAG_Y = 872;
drawText("WHERE THE SEA HANGS IN THE SKY", 512 + 2, TAG_Y + 2, TAG_SCALE, DEEP_PURPLE);
drawText("WHERE THE SEA HANGS IN THE SKY", 512, TAG_Y, TAG_SCALE, CREAM);

// Small diamond dividers flanking the tagline.
function drawDiamond(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const hw = r - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) setPx(cx + dx, cy + dy, c);
  }
}
drawDiamond(512 - 392, TAG_Y + 14, 7, CREAM);
drawDiamond(512 + 392, TAG_Y + 14, 7, CREAM);

// ---------------------------------------------------------------------------
// PNG encoder: raw RGB scanlines, best of 5 filters per row, zlib + CRC32.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32be(data.length), 0);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(typeBytes, 0);
  crcData.set(data, 4);
  out.set(u32be(crc32(crcData)), 8 + data.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function encodePNG(): Uint8Array {
  const stride = W * 3;
  const raw = new Uint8Array((stride + 1) * H);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < H; y++) {
    const row = buf.subarray(y * stride, (y + 1) * stride);
    let best: Uint8Array | null = null;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const filtered = new Uint8Array(stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? row[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let v: number;
        if (f === 0) v = row[i];
        else if (f === 1) v = row[i] - a;
        else if (f === 2) v = row[i] - b;
        else if (f === 3) v = row[i] - ((a + b) >> 1);
        else v = row[i] - paeth(a, b, c);
        filtered[i] = v & 0xff;
      }
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const s = filtered[i] < 128 ? filtered[i] : filtered[i] - 256;
        score += Math.abs(s);
      }
      if (score < bestScore) {
        bestScore = score;
        best = filtered;
      }
    }
    // Recompute the winning filter id by matching the chosen buffer.
    let filterId = 0;
    for (let f = 0; f < 5; f++) {
      const probe = new Uint8Array(stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? row[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let v: number;
        if (f === 0) v = row[i];
        else if (f === 1) v = row[i] - a;
        else if (f === 2) v = row[i] - b;
        else if (f === 3) v = row[i] - ((a + b) >> 1);
        else v = row[i] - paeth(a, b, c);
        probe[i] = v & 0xff;
      }
      let same = true;
      for (let i = 0; i < stride; i++) {
        if (probe[i] !== best![i]) {
          same = false;
          break;
        }
      }
      if (same) {
        filterId = f;
        break;
      }
    }
    raw[y * (stride + 1)] = filterId;
    raw.set(best!, y * (stride + 1) + 1);
    prev.set(row);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(W), 0);
  ihdr.set(u32be(H), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const outDir = process.env.OUTPUT_DIR ?? "/output";
const outPath = path.join(outDir, "entry.png");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, encodePNG());
console.log(`Wrote ${outPath}`);
