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
import { CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionReportingService } from '../../application/production-reporting.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  BatchStepRecordParamDto,
  BatchStepReportParamDto,
  CorrectBatchStepReportDto,
  CreateBatchStepReportDto,
  ReverseBatchStepReportDto,
  ProductionBatchQueryDto,
} from './dto/production.dto.js';
import { BatchIdParamDto } from './dto/production-material.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionReportingController {
  constructor(private readonly service: ProductionReportingService) {}

  @Get('execution-batches')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  listExecutionBatches(@Query() query: ProductionBatchQueryDto) {
    return this.service.listExecutionBatches(query);
  }

  @Get('batches/:batchId/execution-records')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  getBatchExecution(@Param() { batchId }: BatchIdParamDto) {
    return this.service.getBatchExecution(batchId);
  }

  @Post('batches/:batchId/step-records/:recordId/reports')
  @RequirePermission(PERMISSIONS.production.steps.report)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE })
  createReport(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: CreateBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.createReport(batchId, recordId, body, context);
  }

  @Post('batches/:batchId/step-records/:recordId/reports/:reportId/actions/reverse')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  reverseReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: ReverseBatchStepReportDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.reverseReport(
      batchId,
      recordId,
      reportId,
      body.version,
      body.reason,
      context,
    );
  }

  @Post('batches/:batchId/step-records/:recordId/reports/:reportId/actions/correct')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE })
  correctReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: CorrectBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.correctReport(batchId, recordId, reportId, body, context);
  }
}
