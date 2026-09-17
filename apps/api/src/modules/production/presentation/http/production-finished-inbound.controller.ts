import { Body, Controller, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ReasonedVersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionFinishedInboundService } from '../../application/production-finished-inbound.service.js';
import {
  CREATE_FINISHED_INBOUND_SCOPE,
  UPDATE_FINISHED_INBOUND_SCOPE,
  CONFIRM_FINISHED_INBOUND_SCOPE,
  CANCEL_FINISHED_INBOUND_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  FinishedInboundIdParamDto,
  FinishedInboundQueryDto,
  FinishedInboundCandidateQueryDto,
  CreateFinishedInboundDto,
  UpdateFinishedInboundDto,
  ConfirmFinishedInboundDto,
} from './dto/production-finished-inbound.dto.js';

@Controller('production/finished-goods-inbounds')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionFinishedInboundController {
  constructor(private readonly service: ProductionFinishedInboundService) {}
  @Get()
  @RequirePermission(PERMISSIONS.production.inbounds.view)
  list(@Query() query: FinishedInboundQueryDto) {
    return this.service.list(query);
  }
  @Get('candidates')
  @RequirePermission(PERMISSIONS.production.inbounds.view)
  candidates(@Query() query: FinishedInboundCandidateQueryDto) {
    return this.service.candidates(query);
  }
  @Get(':inboundId')
  @RequirePermission(PERMISSIONS.production.inbounds.view)
  get(@Param() { inboundId }: FinishedInboundIdParamDto) {
    return this.service.get(inboundId);
  }
  @Post()
  @RequirePermission(PERMISSIONS.production.inbounds.createFinished)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_FINISHED_INBOUND_SCOPE })
  create(
    @Body() body: CreateFinishedInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(body, context);
  }
  @Put(':inboundId')
  @RequirePermission(PERMISSIONS.production.inbounds.createFinished)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: UPDATE_FINISHED_INBOUND_SCOPE })
  update(
    @Param() { inboundId }: FinishedInboundIdParamDto,
    @Body() body: UpdateFinishedInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.update(inboundId, body, context);
  }
  @Post(':inboundId/actions/confirm')
  @RequirePermission(PERMISSIONS.production.inbounds.confirmFinished)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_FINISHED_INBOUND_SCOPE })
  confirm(
    @Param() { inboundId }: FinishedInboundIdParamDto,
    @Body() body: ConfirmFinishedInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirm(inboundId, body, context);
  }
  @Post(':inboundId/actions/cancel')
  @RequirePermission(PERMISSIONS.production.inbounds.cancelFinished)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CANCEL_FINISHED_INBOUND_SCOPE })
  cancel(
    @Param() { inboundId }: FinishedInboundIdParamDto,
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.cancel(inboundId, body, context);
  }
}
