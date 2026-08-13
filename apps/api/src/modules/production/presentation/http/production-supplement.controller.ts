import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { APPROVE_SCRAP_SUPPLEMENT_IDEMPOTENCY_SCOPE } from '../../application/idempotency/approve-scrap-supplement-idempotency.contract.js';
import { ProductionSupplementService } from '../../application/production-supplement.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { AbnormalDispositionParamDto, ApproveScrapSupplementDto } from './dto/production.dto.js';

@Controller('production/abnormal-dispositions')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionSupplementController {
  constructor(private readonly service: ProductionSupplementService) {}

  @Get(':dispositionId/supplement-candidates')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  candidates(@Param() { dispositionId }: AbnormalDispositionParamDto) {
    return this.service.listCandidates(dispositionId);
  }

  @Post(':dispositionId/actions/approve-scrap-supplement')
  @RequirePermission(PERMISSIONS.production.steps.manageAbnormal)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: APPROVE_SCRAP_SUPPLEMENT_IDEMPOTENCY_SCOPE })
  approve(
    @Param() { dispositionId }: AbnormalDispositionParamDto,
    @Body() body: ApproveScrapSupplementDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.approve(dispositionId, body, context);
  }
}
