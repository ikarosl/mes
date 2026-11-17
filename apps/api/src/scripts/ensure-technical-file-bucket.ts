import { loadTechnicalFileStorageConfig } from '../config/env.js';
import { createS3Client, ensureS3Bucket } from '../modules/attachment/public.js';

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
