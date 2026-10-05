// Generates demo branding image assets (logo, stamp, signature) as PNGs with a
// tiny dependency-free RGBA encoder, and writes them into the uploads folder.
// Run:  node scripts/gen-branding.js
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(OUT, { recursive: true });

// ── tiny canvas (RGBA, premultiplied-over compositing) ──────────────────────
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  px(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4, ia = a / 255, na = 1 - ia, o = this.d;
    o[i] = r * ia + o[i] * na; o[i + 1] = g * ia + o[i + 1] * na;
    o[i + 2] = b * ia + o[i + 2] * na; o[i + 3] = Math.min(255, o[i + 3] + a * (1 - o[i + 3] / 255));
  }
  // anti-aliased disc with optional inner radius (annulus)
  disc(cx, cy, rOut, [r, g, b], rIn = 0) {
    for (let y = Math.floor(cy - rOut - 1); y <= cy + rOut + 1; y++)
      for (let x = Math.floor(cx - rOut - 1); x <= cx + rOut + 1; x++) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const aOut = Math.max(0, Math.min(1, rOut - dist + 0.5));
        const aIn = rIn ? Math.max(0, Math.min(1, dist - rIn + 0.5)) : 1;
        const a = Math.min(aOut, aIn) * 255;
        if (a > 0) this.px(x, y, r, g, b, a);
      }
  }
  roundRect(x0, y0, w, h, rad, [r, g, b]) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const dx = Math.max(x0 + rad - x, 0, x - (x0 + w - 1 - rad));
        const dy = Math.max(y0 + rad - y, 0, y - (y0 + h - 1 - rad));
        const d = Math.hypot(dx, dy), a = Math.max(0, Math.min(1, rad - d + 0.5)) * 255;
        this.px(x, y, r, g, b, a);
      }
  }
  stroke(pts, width, [r, g, b]) {           // thick anti-aliased polyline
    const hw = width / 2;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
      const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len * 2) + 1;
      for (let t = 0; t <= steps; t++) {
        const cx = ax + (bx - ax) * t / steps, cy = ay + (by - ay) * t / steps;
        this.disc(cx, cy, hw, [r, g, b]);
      }
    }
  }
  star(cx, cy, rOut, rIn, points, [r, g, b]) {
    const verts = [];
    for (let i = 0; i < points * 2; i++) {
      const ang = (Math.PI / points) * i - Math.PI / 2, rad = i % 2 ? rIn : rOut;
      verts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
    }
    // scanline fill
    const ys = verts.map((v) => v[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
      const xs = [];
      for (let i = 0; i < verts.length; i++) {
        const [x1, y1] = verts[i], [x2, y2] = verts[(i + 1) % verts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b2) => a - b2);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) this.px(x, y, r, g, b, 255);
    }
  }
  png() {
    const { w, h, d } = this;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; d.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + i] = v; }); }
    const idat = zlib.deflateSync(raw, { level: 9 });
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  }
}

const BRAND = [37, 99, 235], DEEP = [29, 58, 138], INK = [15, 35, 75], WHITE = [255, 255, 255];

// ── LOGO: blue badge + white solar sun emblem ───────────────────────────────
function logo() {
  const c = new Canvas(256, 256);
  c.roundRect(8, 8, 240, 240, 52, DEEP);
  c.roundRect(14, 14, 228, 228, 48, BRAND);
  const cx = 128, cy = 118;
  for (let i = 0; i < 12; i++) {                      // 12 sun rays
    const a = (Math.PI / 6) * i;
    c.stroke([[cx + Math.cos(a) * 58, cy + Math.sin(a) * 58], [cx + Math.cos(a) * 84, cy + Math.sin(a) * 84]], 9, WHITE);
  }
  c.disc(cx, cy, 46, WHITE);
  c.disc(cx, cy, 30, BRAND);
  c.stroke([[44, 196], [212, 196]], 8, WHITE);        // horizon line
  return c.png();
}

// ── STAMP: round official rubber stamp ──────────────────────────────────────
function stamp() {
  const c = new Canvas(260, 260);
  c.disc(130, 130, 124, DEEP, 116);                   // outer ring
  c.disc(130, 130, 96, DEEP, 92);                     // inner ring
  c.star(130, 130, 46, 19, 5, DEEP);                  // central star
  for (let i = 0; i < 36; i++) {                      // dotted bezel
    const a = (Math.PI / 18) * i;
    c.disc(130 + Math.cos(a) * 106, 130 + Math.sin(a) * 106, 2.4, DEEP);
  }
  return c.png();
}

// ── SIGNATURE: flowing ink stroke ───────────────────────────────────────────
function signature() {
  const c = new Canvas(360, 130);
  const pts = [];
  for (let t = 0; t <= 1; t += 0.01) {
    const x = 28 + t * 300;
    const y = 78 + Math.sin(t * Math.PI * 3) * 26 * (1 - t * 0.3) - t * 18 + Math.sin(t * 22) * 4;
    pts.push([x, y]);
  }
  c.stroke(pts, 3.4, INK);
  c.stroke([[24, 104], [320, 96]], 2.2, INK);          // underline flourish
  return c.png();
}

export function generateBrandingAssets({ silent = false } = {}) {
  const files = { 'demo-logo.png': logo(), 'demo-stamp.png': stamp(), 'demo-signature.png': signature() };
  for (const [name, buf] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT, name), buf);
    if (!silent) console.log(`✓ ${name.padEnd(20)} ${(buf.length / 1024).toFixed(1)} KB`);
  }
  if (!silent) console.log(`\nWrote ${Object.keys(files).length} branding assets → ${OUT}`);
  return Object.keys(files);
}

// Run directly:  node scripts/gen-branding.js
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) generateBrandingAssets();
