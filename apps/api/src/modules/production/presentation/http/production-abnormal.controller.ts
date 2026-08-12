import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { COMPLETE_REWORK_IDEMPOTENCY_SCOPE } from '../../application/idempotency/complete-rework-idempotency.contract.js';
import { ProductionAbnormalService } from '../../application/production-abnormal.service.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  AbnormalDispositionParamDto,
  ApproveBatchStepReworkDto,
  CompleteReworkDto,
  RejectBatchStepAbnormalDispositionDto,
  ReworkParamDto,
} from './dto/production.dto.js';
import { BatchIdParamDto } from './dto/production-material.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionAbnormalController {
  constructor(private readonly service: ProductionAbnormalService) {}

  @Get('batches/:batchId/reworks')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  listReworks(@Param() { batchId }: BatchIdParamDto) {
    return this.service.listReworks(batchId);
  }

  @Post('abnormal-dispositions/:dispositionId/actions/approve-rework')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  approveRework(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Body() body: ApproveBatchStepReworkDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.approveRework(dispositionId, body, context);
  }

  @Post('abnormal-dispositions/:dispositionId/actions/reject')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  rejectDisposition(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Body() body: RejectBatchStepAbnormalDispositionDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.rejectDisposition(dispositionId, body, context);
  }

  @Post('reworks/:reworkId/actions/start')
  @RequirePermission(PERMISSIONS.production.rework.execute)
  @AuditInApplication()
  startRework(
    @Param() { reworkId }: ReworkParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.startRework(reworkId, body.version, context);
  }

  @Post('reworks/:reworkId/actions/complete')
  @RequirePermission(PERMISSIONS.production.rework.execute)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: COMPLETE_REWORK_IDEMPOTENCY_SCOPE })
  completeRework(
    @Param() { reworkId }: ReworkParamDto,
    @Body() body: CompleteReworkDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.completeRework(reworkId, body, context);
  }
}
