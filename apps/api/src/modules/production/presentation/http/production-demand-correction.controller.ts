import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ApprovalDomainExceptionFilter } from '../../../approval/public.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { ProductionDemandCorrectionService } from '../../application/production-demand-correction.service.js';
import { SUBMIT_DEMAND_CORRECTION_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import {
  DemandCorrectionParamDto,
  SubmitDemandCorrectionDto,
} from './dto/production-demand-correction.dto.js';
@Controller('production/material-demands')
@UseFilters(ProductionDomainExceptionFilter, ApprovalDomainExceptionFilter)
export class ProductionDemandCorrectionController {
  constructor(private readonly service: ProductionDemandCorrectionService) {}
  @Get(':demandId/correction-check')
  @RequirePermission([
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.tasks.view,
  ])
  check(@Param() { demandId }: DemandCorrectionParamDto) {
    return this.service.getCheck(demandId);
  }
  @Get(':demandId/corrections')
  @RequirePermission([
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.tasks.view,
  ])
  history(@Param() { demandId }: DemandCorrectionParamDto) {
    return this.service.history(demandId);
  }
  @Post(':demandId/corrections')
  @RequirePermission(PERMISSIONS.production.materials.correctDemand)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: SUBMIT_DEMAND_CORRECTION_SCOPE })
  submit(
    @Param() { demandId }: DemandCorrectionParamDto,
    @Body() body: SubmitDemandCorrectionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.submit(demandId, body, context);
  }
}
