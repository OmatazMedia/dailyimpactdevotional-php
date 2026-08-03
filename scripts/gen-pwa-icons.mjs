/**
 * gen-pwa-icons.mjs
 *
 * Generates real PWA icon assets from public/assets/images/dailyimpact.png
 * (a 153x100 black wordmark on transparency) using ONLY Node built-ins —
 * no ImageMagick, no npm deps. Decodes the PNG (zlib + unfilter), composites
 * the logo onto a canvas with a background, and re-encodes a clean PNG.
 *
 * Outputs into public/icons/:
 *   - icon-192.png          white bg, logo fills ~74% (any purpose)
 *   - icon-512.png          white bg, logo fills ~74% (any purpose)
 *   - maskable-512.png      white bg, logo inside safe-zone (~52%) for launchers
 *   - apple-touch-icon.png  180x180 white bg
 *   - logo-white.png        logo only in white on transparency (for the PWA splash)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'public', 'assets', 'images', 'dailyimpact.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

/* ── PNG decode (RGBA8 only) ─────────────────────────────────────────── */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`Unsupported PNG: depth ${bitDepth}, colorType ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = raw[rowStart + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      px[y * stride + x] = v;
    }
  }
  return { width: w, height: h, data: px };
}

/* ── PNG encode (RGBA8, filter 0 rows) ───────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ── Composite the logo (bilinear) onto a square canvas ──────────────── */
function composite(src, size, fillFrac, bg) {
  const out = Buffer.alloc(size * size * 4);
  // Background fill
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255;
  }
  const lw = Math.round(size * fillFrac);
  const lh = Math.round(lw * src.height / src.width);
  const ox = Math.floor((size - lw) / 2);
  const oy = Math.floor((size - lh) / 2);
  const srcW = src.width, srcH = src.height;
  const S = src.data;
  const get = (sx, sy) => {
    const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(sx)));
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(sy)));
    const i = (y0 * srcW + x0) * 4;
    return [S[i], S[i + 1], S[i + 2], S[i + 3]];
  };
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const sx = (x + 0.5) / lw * srcW - 0.5;
      const sy = (y + 0.5) / lh * srcH - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(srcW - 1, x0 + 1), y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const p00 = get(x0, y0), p10 = get(x1, y0), p01 = get(x0, y1), p11 = get(x1, y1);
      const lerp = (k) =>
        p00[k] * (1 - fx) * (1 - fy) + p10[k] * fx * (1 - fy) + p01[k] * (1 - fx) * fy + p11[k] * fx * fy;
      const r = lerp(0), g = lerp(1), b = lerp(2), a = lerp(3);
      const di = ((oy + y) * size + (ox + x)) * 4;
      // Alpha-composite over bg
      const na = a / 255;
      out[di] = Math.round(r * na + bg[0] * (1 - na));
      out[di + 1] = Math.round(g * na + bg[1] * (1 - na));
      out[di + 2] = Math.round(b * na + bg[2] * (1 - na));
      out[di + 3] = 255;
    }
  }
  return out;
}

/* ── White logo on transparency (for dark splash screen) ─────────────── */
function whiteLogo(src, size, fillFrac) {
  const out = Buffer.alloc(size * size * 4); // fully transparent
  const lw = Math.round(size * fillFrac);
  const lh = Math.round(lw * src.height / src.width);
  const ox = Math.floor((size - lw) / 2);
  const oy = Math.floor((size - lh) / 2);
  const srcW = src.width, srcH = src.height;
  const S = src.data;
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const sx = (x + 0.5) / lw * srcW - 0.5;
      const sy = (y + 0.5) / lh * srcH - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(srcW - 1, x0 + 1), y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4, i10 = (y0 * srcW + x1) * 4, i01 = (y1 * srcW + x0) * 4, i11 = (y1 * srcW + x1) * 4;
      const a = S[i00 + 3] * (1 - fx) * (1 - fy) + S[i10 + 3] * fx * (1 - fy) + S[i01 + 3] * (1 - fx) * fy + S[i11 + 3] * fx * fy;
      if (a > 0) {
        const di = ((oy + y) * size + (ox + x)) * 4;
        out[di] = 255; out[di + 1] = 255; out[di + 2] = 255; out[di + 3] = Math.min(255, Math.round(a));
      }
    }
  }
  return out;
}

/* ── Run ─────────────────────────────────────────────────────────────── */
const srcBuf = readFileSync(SRC);
const src = decodePNG(srcBuf);
console.log(`Decoded logo: ${src.width}x${src.height}`);
mkdirSync(OUT_DIR, { recursive: true });

const WHITE = [255, 255, 255];
const jobs = [
  { file: 'icon-192.png', size: 192, fn: () => composite(src, 192, 0.74, WHITE) },
  { file: 'icon-512.png', size: 512, fn: () => composite(src, 512, 0.74, WHITE) },
  { file: 'maskable-512.png', size: 512, fn: () => composite(src, 512, 0.52, WHITE) },
  { file: 'apple-touch-icon.png', size: 180, fn: () => composite(src, 180, 0.8, WHITE) },
  { file: 'logo-white.png', size: 512, fn: () => whiteLogo(src, 512, 0.74) },
];

for (const job of jobs) {
  const rgba = job.fn();
  const png = encodePNG(job.size, job.size, rgba);
  const outPath = path.join(OUT_DIR, job.file);
  writeFileSync(outPath, png);
  console.log(`✅ ${job.file} (${job.size}x${job.size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
console.log('Done.');
