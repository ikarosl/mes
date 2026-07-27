import { loadTechnicalFileStorageConfig } from '../config/env.js';
import { ensureS3Bucket } from '../modules/product/infrastructure/s3-bucket.js';
import { createS3Client } from '../modules/product/infrastructure/s3-technical-file.storage.js';

const config = loadTechnicalFileStorageConfig();
const client = createS3Client(config);

try {
  const result = await ensureS3Bucket(config, client);
  console.info(
    result.created
      ? `Created private S3 bucket: ${config.bucket}`
      : `S3 bucket is ready: ${config.bucket}`,
  );
} finally {
  client.destroy();
}
