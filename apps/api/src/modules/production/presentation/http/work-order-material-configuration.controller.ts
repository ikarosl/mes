import { Body, Controller, Get, Param, Put, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { SAVE_WORK_ORDER_MATERIAL_CONFIGURATION_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { WorkOrderMaterialConfigurationService } from '../../application/work-order-material-configuration.service.js';
import { WorkOrderIdParamDto } from './dto/production.dto.js';
import { SaveWorkOrderMaterialConfigurationDto } from './dto/work-order-material-configuration.dto.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';

@Controller('production/work-orders/:workOrderId/material-configuration')
@UseFilters(ProductionDomainExceptionFilter)
export class WorkOrderMaterialConfigurationController {
  constructor(private readonly service: WorkOrderMaterialConfigurationService) {}

  @Get()
  @RequirePermission(PERMISSIONS.production.orders.view)
  get(@Param() { workOrderId }: WorkOrderIdParamDto) {
    return this.service.get(workOrderId);
  }

  @Put()
  @RequirePermission(PERMISSIONS.production.orders.update)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: SAVE_WORK_ORDER_MATERIAL_CONFIGURATION_SCOPE })
  save(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: SaveWorkOrderMaterialConfigurationDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.save(workOrderId, body, context);
  }
}
