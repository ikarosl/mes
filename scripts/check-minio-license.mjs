import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultMinioLicensePath = resolve(
  fileURLToPath(new URL('../infra/compose/secrets/minio.license', import.meta.url)),
);

export const assertMinioLicenseFile = async (licensePath = defaultMinioLicensePath) => {
  let metadata;
  try {
    metadata = await stat(licensePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `MinIO license file is missing: ${licensePath}. ` +
          'Create this regular file before running pnpm infra:up.',
        { cause: error },
      );
    }
    throw error;
  }

  if (!metadata.isFile()) {
    throw new Error(
      `MinIO license path is not a regular file: ${licensePath}. ` +
        'A directory at this path causes the container to start without a valid license.',
    );
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await assertMinioLicenseFile();
    console.log(`MinIO license file is ready: ${defaultMinioLicensePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
