import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionExecutionService } from '../../application/production-execution.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { AssignProductionStepDto, BatchStepRecordParamDto } from './dto/production.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionExecutionController {
  constructor(private readonly service: ProductionExecutionService) {}

  @Get('worker-tasks')
  @RequirePermission(PERMISSIONS.production.workerTasks.view)
  myTasks(@CurrentCommandContext() context: CommandContext) {
    return this.service.listMyTasks(context);
  }

  @Post('batches/:batchId/step-records/:recordId/actions/assign')
  @RequirePermission(PERMISSIONS.production.steps.assign)
  @AuditInApplication()
  assign(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: AssignProductionStepDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.assignStep(
      batchId,
      recordId,
      body.responsibleUserId,
      body.version,
      context,
    );
  }

  @Post('batches/:batchId/step-records/:recordId/actions/unassign')
  @RequirePermission(PERMISSIONS.production.steps.assign)
  @AuditInApplication()
  unassign(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.unassignStep(batchId, recordId, body.version, context);
  }

  @Post('batches/:batchId/step-records/:recordId/actions/reassign')
  @RequirePermission(PERMISSIONS.production.steps.assign)
  @AuditInApplication()
  reassign(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: AssignProductionStepDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.reassignStep(
      batchId,
      recordId,
      body.responsibleUserId,
      body.version,
      context,
    );
  }

  @Post('batches/:batchId/step-records/:recordId/actions/start')
  @RequirePermission(PERMISSIONS.production.steps.start)
  @AuditInApplication()
  start(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.startStep(batchId, recordId, body.version, context);
  }
}
