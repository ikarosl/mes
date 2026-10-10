import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS, permissionMatches } from '@company/constants';
import type { UserProfile } from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  CurrentIdempotentCommandContext,
  CurrentUser,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import {
  BATCH_REVERSE_STEP_REPORTS_SCOPE,
  CORRECT_HISTORICAL_STEP_REPORT_SCOPE,
  CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
  CREATE_HISTORICAL_STEP_REPORT_SCOPE,
  CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionReportingService } from '../../application/production-reporting.service.js';
import type { ProductionReportingAccess } from '../../domain/production-reporting.policy.js';
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
import {
  BatchReverseStepReportsDto,
  BatchStepReportReadParamDto,
  BatchStepReportDetailParamDto,
  HistoricalBatchStepReportDto,
  PreviewBatchReverseStepReportsDto,
} from './dto/production-reporting.dto.js';

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
  getBatchExecution(@Param() { batchId }: BatchIdParamDto, @CurrentUser() user: UserProfile) {
    return this.service.getBatchExecution(batchId, reportingAccess(user));
  }

  @Get('batches/:batchId/step-records/:recordId/reports')
  @RequirePermission([
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.trace.view,
    PERMISSIONS.production.workerTasks.view,
  ])
  listStepReports(
    @Param() { batchId, recordId }: BatchStepReportReadParamDto,
    @Query() query: PageQueryDto,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.listStepReports(batchId, recordId, query, reportingAccess(user));
  }

  @Get('batches/:batchId/step-records/:recordId/reports/:reportId')
  @RequirePermission([
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.trace.view,
    PERMISSIONS.production.workerTasks.view,
  ])
  getStepReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportDetailParamDto,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.getStepReport(batchId, recordId, reportId, reportingAccess(user));
  }

  @Get('batches/:batchId/step-records/:recordId/scrap-records')
  @RequirePermission([
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.trace.view,
    PERMISSIONS.production.workerTasks.view,
  ])
  listStepScraps(
    @Param() { batchId, recordId }: BatchStepReportReadParamDto,
    @Query() query: PageQueryDto,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.listStepScraps(batchId, recordId, query, reportingAccess(user));
  }

  @Post('batches/:batchId/step-records/:recordId/reports')
  @RequirePermission([
    PERMISSIONS.production.steps.report,
    PERMISSIONS.production.steps.manageExecution,
  ])
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE })
  createReport(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: CreateBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.createReport(batchId, recordId, body, context, reportingAccess(user));
  }

  @Post('batches/:batchId/step-records/:recordId/reports/:reportId/actions/reverse')
  @RequirePermission([
    PERMISSIONS.production.steps.report,
    PERMISSIONS.production.steps.manageExecution,
  ])
  @AuditInApplication()
  reverseReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: ReverseBatchStepReportDto,
    @CurrentCommandContext() context: CommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.reverseReport(
      batchId,
      recordId,
      reportId,
      body.version,
      body.reason,
      context,
      reportingAccess(user),
    );
  }

  @Post('batches/:batchId/step-records/:recordId/reports/:reportId/actions/correct')
  @RequirePermission([
    PERMISSIONS.production.steps.report,
    PERMISSIONS.production.steps.manageExecution,
  ])
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE })
  correctReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: CorrectBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.correctReport(
      batchId,
      recordId,
      reportId,
      body,
      context,
      reportingAccess(user),
    );
  }

  @Post('batches/:batchId/step-records/:recordId/historical-reports')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_HISTORICAL_STEP_REPORT_SCOPE })
  createHistoricalReport(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: HistoricalBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.createHistoricalReport(
      batchId,
      recordId,
      body,
      context,
      reportingAccess(user),
    );
  }

  @Post('batches/:batchId/step-records/:recordId/historical-reports/:reportId/actions/reverse')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  reverseHistoricalReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: ReverseBatchStepReportDto,
    @CurrentCommandContext() context: CommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.reverseHistoricalReport(
      batchId,
      recordId,
      reportId,
      body.version,
      body.reason,
      context,
      reportingAccess(user),
    );
  }

  @Post('batches/:batchId/step-records/:recordId/historical-reports/:reportId/actions/correct')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CORRECT_HISTORICAL_STEP_REPORT_SCOPE })
  correctHistoricalReport(
    @Param() { batchId, recordId, reportId }: BatchStepReportParamDto,
    @Body() body: HistoricalBatchStepReportDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.correctHistoricalReport(
      batchId,
      recordId,
      reportId,
      body,
      context,
      reportingAccess(user),
    );
  }

  @Post('batches/:batchId/step-reports/actions/preview-reverse')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  previewBatchReverse(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: PreviewBatchReverseStepReportsDto,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.previewBatchReverse(batchId, body, reportingAccess(user));
  }

  @Post('batches/:batchId/step-reports/actions/reverse')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: BATCH_REVERSE_STEP_REPORTS_SCOPE })
  batchReverse(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: BatchReverseStepReportsDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    return this.service.batchReverse(batchId, body, context, reportingAccess(user));
  }
}

/** 只使用 Guard 已认证的权限；客户端不得选择管理员访问模式。 */
const reportingAccess = (user: UserProfile): ProductionReportingAccess => ({
  actorId: user.id,
  canManageExecution: permissionMatches(
    user.permissions,
    PERMISSIONS.production.steps.manageExecution,
  ),
  canReport: permissionMatches(user.permissions, PERMISSIONS.production.steps.report),
  canReadAllReports: permissionMatches(user.permissions, [
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.trace.view,
  ]),
});
