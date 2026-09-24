import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
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
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionExecutionService } from '../../application/production-execution.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { AssignProductionStepDto, BatchStepRecordParamDto } from './dto/production.dto.js';
import { BatchIdParamDto } from './dto/production-material.dto.js';
import {
  START_RESEARCH_EXECUTION_SCOPE,
  COMPLETE_RESEARCH_EXECUTION_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionExecutionController {
  constructor(private readonly service: ProductionExecutionService) {}

  @Post('batches/:batchId/actions/start-research')
  @RequirePermission(PERMISSIONS.production.batches.transition)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: START_RESEARCH_EXECUTION_SCOPE })
  startResearch(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.startResearchExecution(batchId, body.version, context);
  }

  @Post('batches/:batchId/actions/complete-research')
  @RequirePermission(PERMISSIONS.production.batches.transition)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: COMPLETE_RESEARCH_EXECUTION_SCOPE })
  completeResearch(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.completeResearchExecution(batchId, body.version, context);
  }

  @Get('batches/:batchId/execution-completion-check')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  completionCheck(@Param() { batchId }: BatchIdParamDto) {
    return this.service.getCompletionCheck(batchId);
  }

  @Post('batches/:batchId/actions/complete-execution')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  completeExecution(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.completeExecution(batchId, body.version, context);
  }

  @Get('worker-tasks')
  @RequirePermission(PERMISSIONS.production.workerTasks.view)
  myTasks(@CurrentCommandContext() context: CommandContext) {
    return this.service.listMyTasks(context);
  }

  @Get('batches/:batchId/step-records/:recordId/sop-content')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  async taskStepSop(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    return this.streamSop(await this.service.getStepSopContent(batchId, recordId), response);
  }

  @Get('worker-tasks/batches/:batchId/step-records/:recordId/sop-content')
  @RequirePermission(PERMISSIONS.production.workerTasks.view)
  async myTaskStepSop(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @CurrentCommandContext() context: CommandContext,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    return this.streamSop(
      await this.service.getMyStepSopContent(batchId, recordId, context),
      response,
    );
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

  private streamSop(
    content: {
      file: { fileName: string; mimeType: string; sizeBytes: number };
      stream: ConstructorParameters<typeof StreamableFile>[0];
    },
    response: ResponseHeaders,
  ) {
    response.setHeader('Content-Type', content.file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(content.file.sizeBytes));
    response.setHeader('Content-Disposition', contentDisposition(content.file.fileName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(content.stream);
  }
}

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

const contentDisposition = (fileName: string): string => {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};
