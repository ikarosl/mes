import { Body, Controller, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
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
import { CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionSupplementService } from '../../application/production-supplement.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  AbnormalDispositionParamDto,
  ConfirmProductionScrapSupplementPlanDto,
  SaveProductionScrapSupplementPlanDto,
  SupplementCandidateQueryDto,
} from './dto/production.dto.js';

@Controller('production/abnormal-dispositions')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionSupplementController {
  constructor(private readonly service: ProductionSupplementService) {}

  @Get(':dispositionId/supplement-candidates')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  candidates(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Query() _query: SupplementCandidateQueryDto,
  ) {
    return this.service.listCandidates(dispositionId);
  }

  @Get(':dispositionId/scrap-supplement-plan')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  getPlan(@Param() { dispositionId }: AbnormalDispositionParamDto) {
    return this.service.getPlan(dispositionId);
  }

  @Put(':dispositionId/scrap-supplement-plan')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  savePlan(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Body() body: SaveProductionScrapSupplementPlanDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.savePlan(dispositionId, body, context);
  }

  @Post(':dispositionId/scrap-supplement-plan/actions/confirm')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE })
  confirmPlan(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Body() body: ConfirmProductionScrapSupplementPlanDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmPlan(dispositionId, body, context);
  }
}
