import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { OtherStockMaterials } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import {
  ReasonedVersionedCommandDto,
  VersionedCommandDto,
} from '../../../../presentation/http/dto/versioned-command.dto.js';
import { OtherInventoryService } from '../../application/other-inventory.service.js';
import { OTHER_INVENTORY_SCOPES } from '../../application/idempotency/other-inventory-idempotency-scopes.contract.js';
import { InventoryDomainExceptionFilter } from './inventory-domain-exception.filter.js';
import {
  OtherInventoryIdParamDto,
  OtherInventoryOrderQueryDto,
  OtherInventoryDraftDto,
  SaveOtherInventoryDraftDto,
  OtherStockCandidateQueryDto,
  OtherStockMaterialQueryDto,
  OtherStockObjectQueryDto,
} from './dto/other-inventory.dto.js';

@Controller('warehouse/other-inbounds')
@UseFilters(InventoryDomainExceptionFilter)
export class OtherInboundController {
  constructor(private readonly service: OtherInventoryService) {}
  @Get()
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.view)
  list(@Query() query: OtherInventoryOrderQueryDto) {
    return this.service.list('inbound', query);
  }
  @Get(':orderId')
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.view)
  get(@Param() { orderId }: OtherInventoryIdParamDto) {
    return this.service.get('inbound', orderId);
  }
  @Post()
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.inbound.create })
  create(
    @Body() body: OtherInventoryDraftDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create('inbound', body, context);
  }
  @Patch(':orderId')
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.update)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.inbound.save })
  save(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: SaveOtherInventoryDraftDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.save('inbound', orderId, body, context);
  }
  @Post(':orderId/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.inbound.confirm })
  confirm(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirm('inbound', orderId, body.version, context);
  }
  @Post(':orderId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.otherInbounds.cancel)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.inbound.cancel })
  cancel(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.cancel('inbound', orderId, body.version, body.reason, context);
  }
}

@Controller('warehouse/other-outbounds')
@UseFilters(InventoryDomainExceptionFilter)
export class OtherOutboundController {
  constructor(private readonly service: OtherInventoryService) {}
  @Get()
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.view)
  list(@Query() query: OtherInventoryOrderQueryDto) {
    return this.service.list('outbound', query);
  }
  @Get(':orderId')
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.view)
  get(@Param() { orderId }: OtherInventoryIdParamDto) {
    return this.service.get('outbound', orderId);
  }
  @Post()
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.outbound.create })
  create(
    @Body() body: OtherInventoryDraftDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create('outbound', body, context);
  }
  @Patch(':orderId')
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.update)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.outbound.save })
  save(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: SaveOtherInventoryDraftDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.save('outbound', orderId, body, context);
  }
  @Post(':orderId/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.outbound.confirm })
  confirm(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirm('outbound', orderId, body.version, context);
  }
  @Post(':orderId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.otherOutbounds.cancel)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: OTHER_INVENTORY_SCOPES.outbound.cancel })
  cancel(
    @Param() { orderId }: OtherInventoryIdParamDto,
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.cancel('outbound', orderId, body.version, body.reason, context);
  }
}

@Controller('warehouse')
@UseFilters(InventoryDomainExceptionFilter)
export class OtherStockCandidateController {
  constructor(private readonly service: OtherInventoryService) {}
  @Get('other-stock-candidates')
  @RequirePermission([
    PERMISSIONS.warehouse.otherInbounds.view,
    PERMISSIONS.warehouse.otherOutbounds.view,
  ])
  candidates(@Query() query: OtherStockCandidateQueryDto) {
    return this.service.candidates(query);
  }
  @Get('other-stock-materials')
  @RequirePermission([
    PERMISSIONS.warehouse.otherInbounds.view,
    PERMISSIONS.warehouse.otherOutbounds.view,
  ])
  materials(@Query() query: OtherStockMaterialQueryDto): Promise<OtherStockMaterials> {
    return this.service.stockMaterials(query);
  }
  @Get('other-stock-objects')
  @RequirePermission([
    PERMISSIONS.warehouse.otherInbounds.view,
    PERMISSIONS.warehouse.otherOutbounds.view,
  ])
  objects(@Query() query: OtherStockObjectQueryDto) {
    return this.service.stockObjects(query);
  }
}
