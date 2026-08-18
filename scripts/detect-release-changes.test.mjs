import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReleaseChanges } from './detect-release-changes.mjs';

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

test('Compose and deployment entry changes request a server control sync', () => {
  assert.deepEqual(
    classifyReleaseChanges({
      affectedPackages: [],
      changedFiles: ['infra/compose/compose.prod.yml', 'ops/scripts/deploy-api.sh'],
    }),
    { apiChanged: false, webChanged: false, controlChanged: true },
  );
});
