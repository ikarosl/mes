import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionOutputService } from '../../application/production-output.service.js';
import { PRODUCTION_OUTPUT_SCOPES } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { TrackingBatchParamDto } from './dto/production-tracking.dto.js';
import {
  CreateProductionOutputInboundDto,
  ProductionOutputParamDto,
  ProductionOutputQueryDto,
  RevokeProductionOutputDto,
} from './dto/production-output.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionOutputController {
  constructor(private readonly service: ProductionOutputService) {}

  @Get('outputs')
  @RequirePermission([
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.tracking.view,
    PERMISSIONS.production.workbench.view,
    PERMISSIONS.warehouse.inbound.view,
  ])
  list(@Query() query: ProductionOutputQueryDto) {
    return this.service.list(query);
  }

  @Post('outputs/:outputId/actions/revoke')
  @RequirePermission(PERMISSIONS.production.tracking.confirmOutput)
  @IdempotentEndpoint({ scope: PRODUCTION_OUTPUT_SCOPES.revoke })
  @AuditInApplication()
  revoke(
    @Param() { outputId }: ProductionOutputParamDto,
    @Body() payload: RevokeProductionOutputDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.revoke(outputId, payload, context);
  }

  @Post('batches/:batchId/output-inbounds')
  @RequirePermission(PERMISSIONS.warehouse.inbound.confirmFinished)
  @IdempotentEndpoint({ scope: PRODUCTION_OUTPUT_SCOPES.inbound })
  @AuditInApplication()
  inbound(
    @Param() { batchId }: TrackingBatchParamDto,
    @Body() payload: CreateProductionOutputInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.inbound(batchId, payload, context);
  }
}
