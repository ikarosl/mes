import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyReleaseChanges,
  chooseReleaseBase,
  isUsableReleaseRange,
  RELEASED_TAG,
} from './detect-release-changes.mjs';

test('only the API is released when Turbo marks the API as affected', () => {
  assert.deepEqual(
    classifyReleaseChanges({
      affectedPackages: ['@company/database', '@company/api'],
      changedFiles: [],
    }),
    { apiChanged: true, webChanged: false, controlChanged: false },
  );
});

test('only the web image is released when Turbo marks the admin app as affected', () => {
  assert.deepEqual(
    classifyReleaseChanges({ affectedPackages: ['@company/admin-web'], changedFiles: [] }),
    { apiChanged: false, webChanged: true, controlChanged: false },
  );
});

test('a web Dockerfile or Nginx change only releases the web image', () => {
  assert.deepEqual(
    classifyReleaseChanges({
      affectedPackages: [],
      changedFiles: ['infra\\docker\\web.Dockerfile', 'infra/nginx/default.conf'],
    }),
    { apiChanged: false, webChanged: true, controlChanged: false },
  );
});

test('shared root build inputs release both images', () => {
  assert.deepEqual(
    classifyReleaseChanges({ affectedPackages: [], changedFiles: ['pnpm-lock.yaml'] }),
    { apiChanged: true, webChanged: true, controlChanged: false },
  );
});

test('documentation changes do not release application images', () => {
  assert.deepEqual(
    classifyReleaseChanges({ affectedPackages: [], changedFiles: ['docs/deployment.md'] }),
    { apiChanged: false, webChanged: false, controlChanged: false },
  );
});

test('an unknown base forces a conservative full release', () => {
  assert.deepEqual(
    classifyReleaseChanges({ affectedPackages: [], changedFiles: [], forceAll: true }),
    { apiChanged: true, webChanged: true, controlChanged: true },
  );
});

test('a release range is unusable when either commit is missing or the histories are unrelated', () => {
  const calls = [];
  const missingBase = (command, args) => {
    calls.push([command, args]);
    return false;
  };
  assert.equal(isUsableReleaseRange('old', 'new', missingBase), false);
  assert.deepEqual(calls, [['git', ['cat-file', '-e', 'old^{commit}']]]);

  const unrelated = (_command, args) => args[0] !== 'merge-base';
  assert.equal(isUsableReleaseRange('old', 'new', unrelated), false);

  const related = () => true;
  assert.equal(isUsableReleaseRange('old', 'new', related), true);
});

test('a released tag is the preferred base over the supplied base', () => {
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: 'released-sha',
      baseArg: 'previous-main-sha',
      head: 'head-sha',
      isUsable: (base, head) => base === 'released-sha' && head === 'head-sha',
    }),
    { base: 'released-sha', forceAll: false, reason: 'released-tag' },
  );
});

test('a missing released tag forces a full release by default', () => {
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: null,
      baseArg: 'previous-main-sha',
      head: 'head-sha',
      isUsable: () => true,
    }),
    { base: null, forceAll: true, reason: 'no-released-tag' },
  );
});

test('a missing released tag may fall back to the supplied base only for local debugging', () => {
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: null,
      baseArg: 'previous-main-sha',
      head: 'head-sha',
      allowFallback: true,
      isUsable: (base, head) => base === 'previous-main-sha' && head === 'head-sha',
    }),
    { base: 'previous-main-sha', forceAll: false, reason: 'supplied-base-fallback' },
  );
});

test('an unusable released tag forces a full release', () => {
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: 'released-sha',
      baseArg: 'previous-main-sha',
      head: 'head-sha',
      isUsable: () => false,
    }),
    { base: null, forceAll: true, reason: 'released-tag-unusable' },
  );
});

test('a zero or empty supplied base never becomes the release base', () => {
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: null,
      baseArg: '0000000000000000000000000000000000000000',
      head: 'head-sha',
      allowFallback: true,
      isUsable: () => true,
    }),
    { base: null, forceAll: true, reason: 'no-released-tag' },
  );
  assert.deepEqual(
    chooseReleaseBase({
      releasedBase: null,
      baseArg: '',
      head: 'head-sha',
      allowFallback: true,
      isUsable: () => true,
    }),
    { base: null, forceAll: true, reason: 'no-released-tag' },
  );
});

test('released tag constant keeps the stable ref name', () => {
  assert.equal(RELEASED_TAG, 'released');
});

test('Compose and deployment entry changes request a server control sync', () => {
  assert.deepEqual(
    classifyReleaseChanges({
      affectedPackages: [],
      changedFiles: ['infra/compose/compose.prod.yml', 'ops/scripts/deploy-api.sh'],
    }),
    { apiChanged: false, webChanged: false, controlChanged: true },
  );
});
