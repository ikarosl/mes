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
import { ProcessInspectionService } from '../../application/process-inspection.service.js';
import {
  PROCESS_INSPECTION_CREATE_SCOPE,
  PROCESS_INSPECTION_CORRECT_SCOPE,
  PROCESS_INSPECTION_REVERSE_SCOPE,
} from '../../application/idempotency/process-inspection-idempotency.contract.js';
import {
  CreateProcessInspectionDto,
  CorrectProcessInspectionDto,
  ReverseProcessInspectionDto,
  ProcessInspectionParamDto,
  ProcessInspectionQueryDto,
  ProcessInspectionStepParamDto,
} from './process-inspection.dto.js';
import { QualityCommandExceptionFilter } from './quality-command-exception.filter.js';
@Controller('quality/process-inspections')
@UseFilters(QualityCommandExceptionFilter)
export class ProcessInspectionController {
  constructor(private readonly service: ProcessInspectionService) {}
  @Get()
  @RequirePermission(PERMISSIONS.quality.processInspections.view)
  list(@Query() query: ProcessInspectionQueryDto) {
    return this.service.list(query);
  }
  @Get('steps/:stepId')
  @RequirePermission(PERMISSIONS.quality.processInspections.view)
  step(@Param() { stepId }: ProcessInspectionStepParamDto) {
    return this.service.step(stepId);
  }
  @Get('steps/:stepId/inspections')
  @RequirePermission(PERMISSIONS.quality.processInspections.view)
  entries(@Param() { stepId }: ProcessInspectionStepParamDto, @Query() query: PageQueryDto) {
    return this.service.entries(stepId, query);
  }
  @Get(':inspectionId')
  @RequirePermission(PERMISSIONS.quality.processInspections.view)
  detail(@Param() { inspectionId }: ProcessInspectionParamDto) {
    return this.service.detail(inspectionId);
  }
  @Get(':inspectionId/records')
  @RequirePermission(PERMISSIONS.quality.processInspections.view)
  records(@Param() { inspectionId }: ProcessInspectionParamDto, @Query() query: PageQueryDto) {
    return this.service.records(inspectionId, query);
  }
  @Post()
  @RequirePermission(PERMISSIONS.quality.processInspections.record)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: PROCESS_INSPECTION_CREATE_SCOPE })
  create(
    @Body() body: CreateProcessInspectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(body, context);
  }
  @Post(':inspectionId/actions/correct')
  @RequirePermission(PERMISSIONS.quality.processInspections.record)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: PROCESS_INSPECTION_CORRECT_SCOPE })
  correct(
    @Param() { inspectionId }: ProcessInspectionParamDto,
    @Body() body: CorrectProcessInspectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.correct(inspectionId, body, context);
  }
  @Post(':inspectionId/actions/reverse')
  @RequirePermission(PERMISSIONS.quality.processInspections.record)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: PROCESS_INSPECTION_REVERSE_SCOPE })
  reverse(
    @Param() { inspectionId }: ProcessInspectionParamDto,
    @Body() body: ReverseProcessInspectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.reverse(inspectionId, body, context);
  }
}
