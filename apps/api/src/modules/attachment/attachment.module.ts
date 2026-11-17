import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { loadTechnicalFileStorageConfig } from '../../config/env.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { AttachmentService } from './application/attachment.service.js';
import { AttachmentReferenceService } from './application/attachment-reference.service.js';
import {
  AttachmentLifecycleRepository,
  AttachmentReferenceRepository,
  AttachmentRepository,
} from './application/ports/attachment.repository.js';
import { AttachmentStorage } from './application/ports/attachment.storage.js';
import { MysqlAttachmentRepository } from './infrastructure/mysql-attachment.repository.js';
import { MysqlAttachmentLifecycleRepository } from './infrastructure/mysql-attachment-lifecycle.repository.js';
import { MysqlAttachmentReferenceRepository } from './infrastructure/mysql-attachment-reference.repository.js';
import { S3AttachmentStorage } from './infrastructure/s3-attachment.storage.js';
import { AttachmentController } from './presentation/http/attachment.controller.js';
import { AttachmentExceptionFilter } from './presentation/http/attachment-exception.filter.js';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AttachmentController],
  providers: [
    AttachmentService,
    AttachmentReferenceService,
    { provide: AttachmentRepository, useClass: MysqlAttachmentRepository },
    { provide: AttachmentLifecycleRepository, useClass: MysqlAttachmentLifecycleRepository },
    { provide: AttachmentReferenceRepository, useClass: MysqlAttachmentReferenceRepository },
    {
      provide: AttachmentStorage,
      useFactory: () => new S3AttachmentStorage(loadTechnicalFileStorageConfig()),
    },
    { provide: APP_FILTER, useClass: AttachmentExceptionFilter },
  ],
  exports: [AttachmentService, AttachmentReferenceService],
})
export class AttachmentModule {}
