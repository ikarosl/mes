// 由运维脚本挂载到 API 镜像中运行，复用镜像内的 S3 SDK；不启动应用。
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { URLSearchParams } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const require = createRequire('/app/package.json');
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketVersioningCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectTaggingCommand,
} = require('@aws-sdk/client-s3');
const directory = '/backup/minio';
const mode = process.argv[2];
let client;

class BackupError extends Error {}

function check(condition, message) {
  if (!condition) throw new BackupError(message);
}
function status(error) {
  return error?.$metadata?.httpStatusCode;
}
async function bucketExists(bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    if (status(error) === 404) return false;
    throw error;
  }
}
async function digestFile(file) {
  const info = await lstat(file);
  check(info.isFile() && !info.isSymbolicLink(), 'Backup object must be a regular file');
  const hash = createHash('sha256');
  for await (const part of createReadStream(file)) hash.update(part);
  return { size: info.size, sha256: hash.digest('hex') };
}
async function backup(bucket) {
  await mkdir(`${directory}/objects`, { recursive: true, mode: 0o700 });
  const exists = await bucketExists(bucket);
  const manifest = { format: 1, bucket, exists, objects: [] };
  if (exists) {
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    // 当前项目不依赖 S3 历史版本；不能把有历史版本的桶静默当成完整备份。
    check(!versioning.Status, 'Versioned buckets require a version-aware backup plan');
    let token;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: item.Key, IfMatch: item.ETag }),
        );
        check(object.Body, 'Object body is missing');
        const file = `${manifest.objects.length}.bin`;
        const hash = createHash('sha256');
        let size = 0;
        const meter = new Transform({
          transform(chunk, encoding, done) {
            size += chunk.length;
            hash.update(chunk);
            done(null, chunk);
          },
        });
        await pipeline(
          object.Body,
          meter,
          createWriteStream(`${directory}/objects/${file}`, { flags: 'wx', mode: 0o600 }),
        );
        check(size === object.ContentLength, 'Downloaded object size does not match');
        const tags = await client.send(
          new GetObjectTaggingCommand({ Bucket: bucket, Key: item.Key }),
        );
        manifest.objects.push({
          key: item.Key,
          file,
          size,
          sha256: hash.digest('hex'),
          contentType: object.ContentType,
          contentDisposition: object.ContentDisposition,
          contentEncoding: object.ContentEncoding,
          cacheControl: object.CacheControl,
          metadata: object.Metadata,
          tags: tags.TagSet ?? [],
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      check(!page.IsTruncated || token, 'Missing object listing continuation token');
    } while (token);
  }
  // 不与数据库逐项比对。缺失桶如实记录，支持首次空库发布前的备份。
  await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `MinIO export completed: ${manifest.objects.length} objects; bucket existed: ${exists}`,
  );
}
async function restore(bucket, region) {
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
  check(
    manifest.format === 1 && typeof manifest.bucket === 'string' && Array.isArray(manifest.objects),
    'Unsupported MinIO backup',
  );
  check(
    bucket === manifest.bucket,
    'Restore must retain the source bucket name; use an isolated MinIO instance',
  );
  const keys = new Set();
  // 恢复前先检查本地文件，不在发现损坏之后才留下部分远端对象。
  for (const [index, object] of manifest.objects.entries()) {
    check(
      object.file === `${index}.bin` && typeof object.key === 'string' && !keys.has(object.key),
      'Invalid backup object entry',
    );
    keys.add(object.key);
    const actual = await digestFile(`${directory}/objects/${object.file}`);
    check(
      actual.size === object.size && actual.sha256 === object.sha256,
      'Backup object checksum mismatch',
    );
  }
  check(
    !(await bucketExists(bucket)),
    'Restore bucket already exists; existing objects will not be overwritten',
  );
  if (manifest.exists === false) {
    check(manifest.objects.length === 0, 'Absent bucket cannot contain objects');
    console.log('The source bucket did not exist; no bucket created.');
    return;
  }
  check(manifest.exists === true, 'Invalid bucket existence flag');
  await client.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ...(region !== 'us-east-1'
        ? { CreateBucketConfiguration: { LocationConstraint: region } }
        : {}),
    }),
  );
  for (const object of manifest.objects) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: createReadStream(`${directory}/objects/${object.file}`),
        ContentLength: object.size,
        ContentType: object.contentType,
        ContentDisposition: object.contentDisposition,
        ContentEncoding: object.contentEncoding,
        CacheControl: object.cacheControl,
        Metadata: object.metadata,
        Tagging:
          new URLSearchParams(
            (object.tags ?? []).map(({ Key, Value }) => [Key, Value]),
          ).toString() || undefined,
      }),
    );
  }
  console.log(
    `MinIO restore completed: ${manifest.objects.length} objects. Application configuration was not changed.`,
  );
}
try {
  check(mode === 'backup' || mode === 'restore', 'Expected backup or restore');
  const {
    S3_ENDPOINT: endpoint,
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_SESSION_TOKEN: sessionToken,
  } = process.env;
  check(
    endpoint && bucket && accessKeyId && secretAccessKey,
    'S3 connection settings are required',
  );
  const region = process.env.S3_REGION || 'us-east-1';
  client = new S3Client({
    endpoint,
    region,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) },
    maxAttempts: 3,
  });
  if (mode === 'backup') await backup(bucket);
  else await restore(bucket, region);
} catch (error) {
  // SDK 异常可能包含 endpoint／签名请求；只输出状态码，内部检查使用固定说明。
  let message = 'MinIO backup/restore failed; inspect configuration and connectivity';
  if (error instanceof BackupError) message = error.message;
  else if (error?.$metadata) message = `S3 operation failed (HTTP ${status(error) ?? 'unknown'})`;
  console.error(message);
  process.exitCode = 1;
} finally {
  client?.destroy();
}
