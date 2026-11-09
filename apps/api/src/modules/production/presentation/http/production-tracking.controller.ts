import { PRODUCTION_TRACKING_SCOPES } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionTrackingService } from '../../application/production-tracking.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { BatchStepRecordParamDto } from './dto/production.dto.js';
import {
  ConfirmProductionTrackingOutputDto,
  CorrectProductionTrackingQuantityDto,
  CreateProductionTrackingAbnormalityDto,
  CreateProductionTrackingCardDto,
  FinishProductionTrackingTaskDto,
  HandleProductionTrackingAbnormalityDto,
  ProductionTrackingCardQueryDto,
  ProductionTrackingReportQueryDto,
  ScanProductionTrackingCardDto,
  StartProductionTrackingTaskDto,
  TrackingAbnormalityParamDto,
  TrackingBatchParamDto,
  TrackingCardParamDto,
  VoidProductionTrackingCardDto,
} from './dto/production-tracking.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionTrackingController {
  constructor(private readonly service: ProductionTrackingService) {}
  @Get('tracking-cards')
  @RequirePermission([PERMISSIONS.production.tracking.view, PERMISSIONS.production.workbench.view])
  list(@Query() query: ProductionTrackingCardQueryDto) {
    return this.service.list(query);
  }
  @Get('tracking-reports')
  @RequirePermission([PERMISSIONS.production.tracking.view, PERMISSIONS.production.workbench.view])
  reports(@Query() query: ProductionTrackingReportQueryDto) {
    return this.service.reports(query);
  }
  @Get('batches/:batchId/tracking-workbench')
  @RequirePermission([
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.workbench.view,
    PERMISSIONS.production.tracking.view,
  ])
  workbench(@Param() { batchId }: TrackingBatchParamDto) {
    return this.service.workbench(batchId);
  }
  @Get('tracking-cards/:cardId')
  @RequirePermission([PERMISSIONS.production.tracking.view, PERMISSIONS.production.workbench.view])
  get(@Param() { cardId }: TrackingCardParamDto) {
    return this.service.get(cardId);
  }
  @Post('batches/:batchId/tracking-cards')
  @RequirePermission(PERMISSIONS.production.tracking.manage)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['create'] })
  @AuditInApplication()
  create(
    @Param() { batchId }: TrackingBatchParamDto,
    @Body() body: CreateProductionTrackingCardDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(batchId, body, context);
  }
  @Post('tracking-cards/scan')
  @RequirePermission(PERMISSIONS.production.workbench.operate)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['scan'] })
  @AuditInApplication()
  scan(
    @Body() body: ScanProductionTrackingCardDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.scan(body, context);
  }
  @Patch('tracking-cards/:cardId/quantity')
  @RequirePermission(PERMISSIONS.production.tracking.manage)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['correct-quantity'] })
  @AuditInApplication()
  quantity(
    @Param() { cardId }: TrackingCardParamDto,
    @Body() body: CorrectProductionTrackingQuantityDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.correctQuantity(cardId, body, context);
  }
  @Post('tracking-cards/:cardId/actions/void')
  @RequirePermission(PERMISSIONS.production.tracking.manage)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['void'] })
  @AuditInApplication()
  void(
    @Param() { cardId }: TrackingCardParamDto,
    @Body() body: VoidProductionTrackingCardDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.void(cardId, body, context);
  }
  @Post('tracking-cards/:cardId/abnormalities')
  @RequirePermission(PERMISSIONS.production.workbench.operate)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['abnormality.create'] })
  @AuditInApplication()
  abnormality(
    @Param() { cardId }: TrackingCardParamDto,
    @Body() body: CreateProductionTrackingAbnormalityDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.createAbnormality(cardId, body, context);
  }
  @Post('tracking-cards/:cardId/abnormalities/:abnormalityId/handlings')
  @RequirePermission(PERMISSIONS.production.workbench.operate)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['abnormality.handle'] })
  @AuditInApplication()
  handling(
    @Param() { cardId, abnormalityId }: TrackingAbnormalityParamDto,
    @Body() body: HandleProductionTrackingAbnormalityDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.handleAbnormality(cardId, abnormalityId, body, context);
  }
  @Post('tracking-cards/:cardId/actions/confirm-output')
  @RequirePermission(PERMISSIONS.production.tracking.confirmOutput)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['confirm-output'] })
  @AuditInApplication()
  output(
    @Param() { cardId }: TrackingCardParamDto,
    @Body() body: ConfirmProductionTrackingOutputDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmOutput(cardId, body, context);
  }
  @Post('batches/:batchId/actions/confirm-research-output')
  @RequirePermission(PERMISSIONS.production.tracking.confirmOutput)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['confirm-research-output'] })
  @AuditInApplication()
  researchOutput(
    @Param() { batchId }: TrackingBatchParamDto,
    @Body() body: ConfirmProductionTrackingOutputDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmResearchOutput(batchId, body, context);
  }
  @Post('batches/:batchId/actions/start')
  @RequirePermission(PERMISSIONS.production.batches.transition)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['task.start'] })
  @AuditInApplication()
  start(
    @Param() { batchId }: TrackingBatchParamDto,
    @Body() body: StartProductionTrackingTaskDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.startTask(batchId, body, context);
  }
  @Post('batches/:batchId/actions/finish')
  @RequirePermission(PERMISSIONS.production.batches.transition)
  @IdempotentEndpoint({ scope: PRODUCTION_TRACKING_SCOPES['task.finish'] })
  @AuditInApplication()
  finish(
    @Param() { batchId }: TrackingBatchParamDto,
    @Body() body: FinishProductionTrackingTaskDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.finishTask(batchId, body, context);
  }
  @Get('batches/:batchId/step-records/:recordId/sop')
  @RequirePermission([
    PERMISSIONS.production.workbench.view,
    PERMISSIONS.production.tracking.view,
    PERMISSIONS.production.tasks.view,
  ])
  async sop(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const content = await this.service.sop(batchId, recordId);
    response.setHeader('Content-Type', content.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(content.stream);
  }
}
