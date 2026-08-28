import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMinioLicenseFile } from './check-minio-license.mjs';

const temporaryPath = async () => mkdtemp(join(tmpdir(), 'easy-mes-minio-license-'));

test('accepts a regular MinIO license file', async () => {
  const directory = await temporaryPath();
  const licensePath = join(directory, 'minio.license');
  await writeFile(licensePath, 'test-license');

  await assertMinioLicenseFile(licensePath);
});

test('rejects a missing MinIO license file', async () => {
  const directory = await temporaryPath();
  const licensePath = join(directory, 'minio.license');

  await assert.rejects(() => assertMinioLicenseFile(licensePath), /MinIO license file is missing/);
});

test('rejects a directory used as the MinIO license path', async () => {
  const directory = await temporaryPath();
  const licensePath = join(directory, 'minio.license');
  await mkdir(licensePath);

  await assert.rejects(() => assertMinioLicenseFile(licensePath), /not a regular file/);
});
