import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = [5, 150, 105]; // #059669 — same as rewardsfindr-web favicon field

function readPng(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(buf.subarray(0, 8).equals(sig), `${rel} is a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let hasTrns = false;
  const idat = [];

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'tRNS') {
      hasTrns = true;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  assert.equal(interlace, 0, `${rel} is not interlaced`);
  assert.equal(bitDepth, 8, `${rel} is 8-bit`);
  const channels = { 2: 3, 6: 4 }[colorType];
  assert.ok(channels, `${rel} is RGB or RGBA`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos];
    pos += 1;
    const row = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      if (filter === 0) continue;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
      else throw new Error(`${rel} has unknown filter ${filter}`);
    }
    prev = row;
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      pixels[d] = row[s];
      pixels[d + 1] = row[s + 1];
      pixels[d + 2] = row[s + 2];
      pixels[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
  }

  return { width, height, bitDepth, colorType, hasTrns, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pixel(png, x, y) {
  const i = (png.width * y + x) * 4;
  return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
}

function assertNear(actual, expected, tol, label) {
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tol,
      `${label}: got ${actual}, expected near ${expected}`,
    );
  }
}

test('login and home brand use logo.png; home has no header wordmark', () => {
  const login = fs.readFileSync(path.join(root, 'app/login.js'), 'utf8');
  const brand = fs.readFileSync(path.join(root, 'components/HomeBrand.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'app/index.js'), 'utf8');
  assert.match(login, /require\(\s*['"]\.\.\/assets\/logo\.png['"]\s*\)/);
  assert.match(brand, /require\(\s*['"]\.\.\/assets\/logo\.png['"]\s*\)/);
  assert.match(brand, /RewardsFindr/);
  assert.equal(index.includes('HomeHeader'), false);
  assert.equal(fs.existsSync(path.join(root, 'components/HomeHeader.js')), false);
});

test('android adaptive icon background matches the web brand green', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(app.expo.android.adaptiveIcon.backgroundColor, '#059669');
});

test('icon.png is an opaque 1024 brand-green square with the RF mark', () => {
  const icon = readPng('assets/icon.png');
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.colorType, 2);
  assert.equal(icon.hasTrns, false);
  for (const [x, y] of [
    [0, 0],
    [icon.width - 1, 0],
    [0, icon.height - 1],
    [icon.width - 1, icon.height - 1],
  ]) {
    const [r, g, b, a] = pixel(icon, x, y);
    assertNear([r, g, b], BRAND, 2, `icon.png corner ${x},${y}`);
    assert.equal(a, 255);
  }
  // Center of the RF glyph is white
  assertNear(pixel(icon, 512, 512).slice(0, 3), [255, 255, 255], 20, 'icon.png center');
});

test('logo, adaptive icon, and favicon keep a transparent field and opaque RF disk', () => {
  const marks = [
    ['assets/logo.png', 256, 256],
    ['assets/adaptive-icon.png', 512, 512],
    ['assets/favicon.png', 16, 16],
  ];
  for (const [rel, bodyX, bodyY] of marks) {
    const png = readPng(rel);
    assert.equal(png.colorType, 6, `${rel} has an alpha channel`);
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1],
    ]) {
      assert.deepEqual(pixel(png, x, y), [0, 0, 0, 0], `${rel} corner ${x},${y} is transparent`);
    }
    const body = pixel(png, bodyX, bodyY);
    assert.equal(body[3], 255, `${rel} RF disk stays opaque`);
  }
});
