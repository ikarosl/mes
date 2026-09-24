import { Body, Controller, Get, Param, Post, Res, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { ProductionOutputDetail } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ApprovalDomainExceptionFilter } from '../../../approval/public.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { ProductionOutputService } from '../../application/production-output.service.js';
import {
  SAVE_PRODUCTION_OUTPUT_SCOPE,
  REVIEW_OUTPUT_MATERIAL_SCOPE,
  SUBMIT_PRODUCTION_OUTPUT_SCOPE,
  BEGIN_OUTPUT_CORRECTION_SCOPE,
  CANCEL_OUTPUT_CORRECTION_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import {
  SaveProductionOutputDto,
  ReviewProductionOutputMaterialDto,
  SubmitProductionOutputDto,
  BeginProductionOutputCorrectionDto,
} from './dto/production-output.dto.js';
import { TerminationBatchParamDto } from './dto/production-termination.dto.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
@Controller('production/batches/:batchId/output')
@UseFilters(ProductionDomainExceptionFilter, ApprovalDomainExceptionFilter)
export class ProductionOutputController {
  constructor(private readonly service: ProductionOutputService) {}
  @Get()
  @RequirePermission(PERMISSIONS.production.tasks.view)
  async detail(
    @Param() { batchId }: TerminationBatchParamDto,
    @Res() response: { json(body: ProductionOutputDetail | null): void },
  ): Promise<void> {
    response.json(await this.service.detail(batchId));
  }
  @Post('material-review')
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: REVIEW_OUTPUT_MATERIAL_SCOPE })
  reviewMaterial(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: ReviewProductionOutputMaterialDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.reviewMaterial(batchId, body, context);
  }
  @Post('draft')
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: SAVE_PRODUCTION_OUTPUT_SCOPE })
  saveDraft(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: SaveProductionOutputDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.saveDraft(batchId, body, context);
  }
  @Post('submit')
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: SUBMIT_PRODUCTION_OUTPUT_SCOPE })
  submit(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: SubmitProductionOutputDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.submit(batchId, body, context);
  }
  @Post('corrections')
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: BEGIN_OUTPUT_CORRECTION_SCOPE })
  beginCorrection(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: BeginProductionOutputCorrectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.beginCorrection(batchId, body, context);
  }
  @Post('corrections/cancel')
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CANCEL_OUTPUT_CORRECTION_SCOPE })
  cancelCorrection(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.cancelCorrection(batchId, body.version, context);
  }
}
