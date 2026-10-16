import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
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
import {
  AcceptProcessInspectionDto,
  ProductionProcessInspectionParamDto,
} from './dto/production-process-inspection.dto.js';
import { BatchStepReportReadParamDto } from './dto/production-reporting.dto.js';
import {
  ACCEPT_PROCESS_INSPECTION_SCOPE,
  COMPLETE_REWORK_IDEMPOTENCY_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionAbnormalService } from '../../application/production-abnormal.service.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
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

  @Get('batches/:batchId/step-records/:recordId/process-inspections')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  listPendingInspections(
    @Param() { batchId, recordId }: BatchStepReportReadParamDto,
    @Query() query: PageQueryDto,
  ) {
    return this.service.listPendingInspections(batchId, recordId, query);
  }

  @Get('batches/:batchId/step-records/:recordId/process-inspections/:inspectionId')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  getInspection(@Param() { batchId, recordId, inspectionId }: ProductionProcessInspectionParamDto) {
    return this.service.getInspection(batchId, recordId, inspectionId);
  }

  @Post('batches/:batchId/step-records/:recordId/inspection-dispositions')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: ACCEPT_PROCESS_INSPECTION_SCOPE })
  acceptInspection(
    @Param() { batchId, recordId }: BatchStepReportReadParamDto,
    @Body() body: AcceptProcessInspectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.acceptInspection(batchId, recordId, body, context);
  }

  @Get('batches/:batchId/step-records/:recordId/inspection-dispositions')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  listInspectionDispositions(
    @Param() { batchId, recordId }: BatchStepReportReadParamDto,
    @Query() query: PageQueryDto,
  ) {
    return this.service.listInspectionDispositions(batchId, recordId, query);
  }

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
