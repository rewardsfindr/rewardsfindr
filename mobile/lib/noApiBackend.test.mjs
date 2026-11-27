import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'assets') continue;
      out.push(...walk(full));
    } else if (/\.(js|mjs|ts|tsx|json|md|example)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const forbidden = [
  /EXPO_PUBLIC_API_URL/,
  /rewardsfindr-api/,
  /localhost:3001/,
  /api\/lib\//,
];

test('mobile product code does not reference RewardsFindr HTTP API config or hosts', () => {
  const files = [
    ...walk(path.join(root, 'app')),
    ...walk(path.join(root, 'lib')),
    ...walk(path.join(root, 'hooks')),
    ...walk(path.join(root, 'components')),
    path.join(root, '.env.example'),
    path.join(root, 'metro.config.js'),
  ].filter((f) => fs.existsSync(f));

  const hits = [];
  for (const file of files) {
    // Bank WebView scripts may talk to bank hosts; skip fixture JSON noise.
    if (file.includes(`${path.sep}fixtures${path.sep}`)) continue;
    if (file.endsWith('noApiBackend.test.mjs')) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        hits.push(`${path.relative(root, file)} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(hits, []);
});

test('metro does not watch the retired api/ tree', () => {
  const metro = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
  assert.equal(/watchFolders/.test(metro), false);
  assert.equal(/['"]api['"]|[/\\]api/.test(metro), false);
});
