import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionFinishedInboundService } from '../../application/production-finished-inbound.service.js';
import { CONFIRM_FINISHED_INBOUND_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  FinishedInboundIdParamDto,
  FinishedInboundQueryDto,
  FinishedInboundCandidateQueryDto,
  ConfirmFinishedInboundDto,
} from './dto/production-finished-inbound.dto.js';
@Controller('production/finished-goods-inbounds')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionFinishedInboundController {
  constructor(private readonly service: ProductionFinishedInboundService) {}
  @Get()
  @RequirePermission(PERMISSIONS.warehouse.inbound.view)
  list(@Query() query: FinishedInboundQueryDto) {
    return this.service.list(query);
  }
  @Get('candidates')
  @RequirePermission(PERMISSIONS.warehouse.inbound.view)
  candidates(@Query() query: FinishedInboundCandidateQueryDto) {
    return this.service.candidates(query);
  }
  @Get(':inboundId')
  @RequirePermission(PERMISSIONS.warehouse.inbound.view)
  get(@Param() { inboundId }: FinishedInboundIdParamDto) {
    return this.service.get(inboundId);
  }
  @Post('actions/confirm')
  @RequirePermission(PERMISSIONS.production.inbounds.confirmFinished)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_FINISHED_INBOUND_SCOPE })
  confirm(
    @Body() body: ConfirmFinishedInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirm(body, context);
  }
}
