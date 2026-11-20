/**
 * Derive mobile icon assets from the rewardsfindr-web G3 RF circle mark.
 * Source: ../rewardsfindr-web/public/logo512.png (+ favicon-32 for web favicon).
 */
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const webPublic = path.resolve(mobileRoot, '..', '..', 'rewardsfindr-web', 'public');
const assets = path.join(mobileRoot, 'assets');

const BRAND = [5, 150, 105]; // #059669

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (~c) >>> 0;
}

function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`${filePath}: unsupported color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let prev = Buffer.alloc(stride);
  let pos = 0;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        row[i] = (row[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`${filePath}: unknown filter ${filter}`);
      }
    }
    prev = Buffer.from(row);
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      pixels[d] = row[s];
      pixels[d + 1] = row[s + 1];
      pixels[d + 2] = row[s + 2];
      pixels[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
  }
  return { width, height, pixels };
}

function writeChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, width, height, pixels, { alpha }) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = rowStart + 1 + x * channels;
      raw[d] = pixels[s];
      raw[d + 1] = pixels[s + 1];
      raw[d + 2] = pixels[s + 2];
      if (alpha) raw[d + 3] = pixels[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const out = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', deflateSync(raw, { level: 9 })),
    writeChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, out);
}

function nearBrand(r, g, b) {
  return Math.abs(r - BRAND[0]) < 18 && Math.abs(g - BRAND[1]) < 18 && Math.abs(b - BRAND[2]) < 18;
}

function isWhite(r, g, b) {
  return r > 230 && g > 230 && b > 230;
}

function maxWhiteRadius(img) {
  const cx = (img.width - 1) / 2;
  const cy = (img.height - 1) / 2;
  let max = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (isWhite(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2])) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > max) max = r;
      }
    }
  }
  return max;
}

function scaleNearest(img, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / size));
      const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / size));
      const s = (sy * img.width + sx) * 4;
      const d = (y * size + x) * 4;
      out[d] = img.pixels[s];
      out[d + 1] = img.pixels[s + 1];
      out[d + 2] = img.pixels[s + 2];
      out[d + 3] = img.pixels[s + 3];
    }
  }
  return { width: size, height: size, pixels: out };
}

function punchOutsideCircle(img, radiusPad = 2) {
  const cx = (img.width - 1) / 2;
  const cy = (img.height - 1) / 2;
  const radius = maxWhiteRadius(img) + radiusPad;
  const out = Buffer.from(img.pixels);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      } else if (nearBrand(out[i], out[i + 1], out[i + 2]) === false && !isWhite(out[i], out[i + 1], out[i + 2])) {
        // keep antialiased edge pixels as-is
      }
    }
  }
  return { width: img.width, height: img.height, pixels: out };
}

const src = readPng(path.join(webPublic, 'logo512.png'));
const fav32 = path.join(webPublic, 'favicon-32x32.png');

const icon1024 = scaleNearest(src, 1024);
writePng(path.join(assets, 'icon.png'), 1024, 1024, icon1024.pixels, { alpha: false });

const mark512 = punchOutsideCircle(src, 3);
const mark1024 = scaleNearest(mark512, 1024);
writePng(path.join(assets, 'logo.png'), 512, 512, mark512.pixels, { alpha: true });
writePng(path.join(assets, 'adaptive-icon.png'), 1024, 1024, mark1024.pixels, { alpha: true });
fs.copyFileSync(fav32, path.join(assets, 'favicon.png'));

console.log('Wrote icon.png, logo.png, adaptive-icon.png, favicon.png from web G3 RF mark');
console.log('circle radius ~', maxWhiteRadius(src).toFixed(1));
