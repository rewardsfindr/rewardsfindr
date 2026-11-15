import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const agentsDir = dirname(fileURLToPath(import.meta.url));
const cursorDir = dirname(agentsDir);

function read(path) {
  return readFileSync(path, 'utf8');
}

test('the merge gate stays in the workflow and the reviewer instructions', () => {
  const workflow = read(join(cursorDir, 'agent-workflow.md'));
  const reviewer = read(join(agentsDir, 'reviewer.md'));
  assert.match(
    workflow,
    /A pull request is merged only after `\/reviewer` writes `Approved`\./,
  );
  assert.match(reviewer, /A merge happens only after you write `Approved`\./);
});

test('the planner write-up keeps its required headings', () => {
  const planner = read(join(agentsDir, 'planner.md'));
  for (const heading of [
    '## Slice',
    '## Decision',
    '## Done when',
    '## Out of scope',
    '## Likely files',
    '## Hand off',
  ]) {
    assert.ok(planner.includes(heading), heading);
  }
});

test('the implementer stops after the pull request and waits for reviewer approval', () => {
  const implementer = read(join(agentsDir, 'implementer.md'));
  assert.match(
    implementer,
    /Do not merge\. Tell the user to run `\/reviewer` on the pull request\. A merge waits until that review says `Approved`\. Do not start the next slice\./,
  );
});
