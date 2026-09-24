import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { FinishedInspectionService } from '../../application/finished-inspection.service.js';
import { FINISHED_INSPECTION_RECORD_SCOPE } from '../../application/idempotency/finished-inspection-idempotency.contract.js';
import {
  FinishedInspectionBatchParamDto,
  FinishedInspectionTaskQueryDto,
  RecordFinishedInspectionDto,
} from './finished-inspection.dto.js';
import { QualityCommandExceptionFilter } from './quality-command-exception.filter.js';
@Controller('quality/finished-inspections')
@UseFilters(QualityCommandExceptionFilter)
export class FinishedInspectionController {
  constructor(private readonly service: FinishedInspectionService) {}
  @Get()
  @RequirePermission(PERMISSIONS.quality.finishedInspections.view)
  list(@Query() query: FinishedInspectionTaskQueryDto) {
    return this.service.listTasks(query);
  }
  @Get(':batchId')
  @RequirePermission(PERMISSIONS.quality.finishedInspections.view)
  detail(@Param() { batchId }: FinishedInspectionBatchParamDto) {
    return this.service.detail(batchId);
  }
  @Get(':batchId/records')
  @RequirePermission(PERMISSIONS.quality.finishedInspections.view)
  records(@Param() { batchId }: FinishedInspectionBatchParamDto, @Query() query: PageQueryDto) {
    return this.service.listRecords(batchId, query);
  }
  @Post(':batchId/actions/record')
  @RequirePermission(PERMISSIONS.quality.finishedInspections.record)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: FINISHED_INSPECTION_RECORD_SCOPE })
  record(
    @Param() { batchId }: FinishedInspectionBatchParamDto,
    @Body() body: RecordFinishedInspectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.record(batchId, body, context);
  }
}
