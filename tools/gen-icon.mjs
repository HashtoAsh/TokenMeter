// Generates a 1024x1024 RGBA source icon (usage-meter motif) as a real PNG.
// No dependencies: raw pixel loop + minimal PNG encoder using node zlib.
// Usage: node tools/gen-icon.mjs [out.png]
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

// 输出路径锚定脚本所在目录（.mjs 为 ESM，没有 __dirname；勿用相对 cwd 的裸路径）
const SCRIPT_DIR = import.meta.dirname;
const OUT_ARG = process.argv[2];
const OUT = OUT_ARG
  ? (isAbsolute(OUT_ARG) ? OUT_ARG : join(SCRIPT_DIR, OUT_ARG))
  : join(SCRIPT_DIR, 'icon-source.png');
const S = 1024;                 // canvas size
const R = 190;                  // rounded-corner radius
const M = 96;                   // outer margin of rounded square

const C_TOP = [79, 70, 229];    // indigo #4F46E5
const C_BOT = [37, 99, 235];    // blue   #2563EB
const C_BAR = [255, 255, 255];

// three white usage bars (increasing width), vertically centered block
const bars = [
  { w: 430, h: 110 },  // small
  { w: 635, h: 110 },  // medium
  { w: 840, h: 110 },  // large
];
const gap = 46;
const blockH = bars.reduce((a, b) => a + b.h, 0) + gap * (bars.length - 1);
let rowTop = Math.round((S - blockH) / 2);
const bands = bars.map((b) => {
  const y0 = rowTop; const y1 = rowTop + b.h;
  const x0 = Math.round((S - b.w) / 2); const x1 = x0 + b.w;
  rowTop = y1 + gap;
  return { y0, y1, x0, x1 };
});

const inside = (x, y) => {
  const x0 = M, x1 = S - M, y0 = M, y1 = S - M;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + R, Math.min(x, x1 - R));
  const cy = Math.max(y0 + R, Math.min(y, y1 - R));
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy <= R * R) return true;      // inside corner circle
  return (x >= x0 + R && x <= x1 - R) || (y >= y0 + R && y <= y1 - R);
};

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  const t = y / (S - 1);
  const cr = Math.round(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t);
  const cg = Math.round(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t);
  const cb = Math.round(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t);
  for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4;
    if (!inside(x, y)) { px[o + 3] = 0; continue; } // transparent outside
    let r = cr, g = cg, b = cb;
    for (const band of bands) {
      if (y >= band.y0 && y <= band.y1 && x >= band.x0 && x <= band.x1) {
        r = C_BAR[0]; g = C_BAR[1]; b = C_BAR[2]; break;
      }
    }
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
  }
}

// --- minimal PNG encoder ---
const crcBuf = (buf) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(crc32(buf) >>> 0);
  return out;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  return Buffer.concat([len, t, data, crcBuf(Buffer.concat([t, data]))]);
};

const raw = Buffer.alloc(S * (S * 4 + 1)); // filter byte 0 per scanline
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
try {
  writeFileSync(OUT, png);
  console.log(`wrote ${OUT} (${png.length} bytes)`);
} catch (err) {
  console.error(`failed to write ${OUT}: ${err?.message ?? err}`);
  process.exitCode = 1;
}
