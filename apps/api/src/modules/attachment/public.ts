export { AttachmentModule } from './attachment.module.js';
export { AttachmentService } from './application/attachment.service.js';
export { AttachmentReferenceService } from './application/attachment-reference.service.js';
export type { AttachmentUpload } from './application/ports/attachment.storage.js';
// 显式部署初始化入口；业务模块只消费上面的应用服务，不接触 S3 SDK。
export { ensureS3Bucket } from './infrastructure/s3-bucket.js';
export { createS3Client } from './infrastructure/s3-attachment.storage.js';
