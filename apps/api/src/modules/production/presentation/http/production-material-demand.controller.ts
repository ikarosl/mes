import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import {
  ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
  CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionMaterialDemandService } from '../../application/production-material-demand.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  AddManualMaterialDemandDto,
  BatchIdParamDto,
  ConfigureMaterialDemandsDto,
  DemandIdParamDto,
  MaterialDemandManagementQueryDto,
} from './dto/production-material.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionMaterialDemandController {
  constructor(private readonly service: ProductionMaterialDemandService) {}

  @Get('material-demands')
  @RequirePermission(PERMISSIONS.production.materialDemands.view)
  list(@Query() query: MaterialDemandManagementQueryDto) {
    return this.service.listManagement({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      productionBatchId: query.productionBatchId,
      status: query.status,
    });
  }

  @Post('batches/:batchId/material-demands/configurations')
  @RequirePermission(PERMISSIONS.production.materialDemands.configure)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE })
  configure(
    @Param() params: BatchIdParamDto,
    @Body() body: ConfigureMaterialDemandsDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.configure(params.batchId, body, context);
  }

  @Post('material-demands/:demandId/additions')
  @RequirePermission(PERMISSIONS.production.materialDemands.addManual)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE })
  addManual(
    @Param() params: DemandIdParamDto,
    @Body() body: AddManualMaterialDemandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.addManual(params.demandId, body, context);
  }
}
