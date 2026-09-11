import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { ApprovalService } from './application/approval.service.js';
import { ApprovalSubjectHandlerRegistry } from './application/approval-subject-handler.registry.js';
import { ApprovalFlowRepository } from './application/ports/approval-flow.repository.js';
import { MysqlApprovalFlowRepository } from './infrastructure/mysql-approval-flow.repository.js';
import { ApprovalRepository } from './application/ports/approval.repository.js';
import { MysqlApprovalRepository } from './infrastructure/mysql-approval.repository.js';
import { ApprovalController } from './presentation/http/approval.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    ApprovalSubjectHandlerRegistry,
    MysqlApprovalRepository,
    MysqlApprovalFlowRepository,
    { provide: ApprovalFlowRepository, useExisting: MysqlApprovalFlowRepository },
    { provide: ApprovalRepository, useExisting: MysqlApprovalRepository },
  ],
  exports: [ApprovalService, ApprovalSubjectHandlerRegistry],
})
export class ApprovalModule {}
