import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
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
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionInboundService } from '../../application/production-inbound.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  CreatePurchaseInboundDto,
  InboundIdParamDto,
  InventoryBatchIdParamDto,
  InventoryBatchQueryDto,
  PurchaseInboundQueryDto,
} from './dto/production-inbound.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionInboundController {
  constructor(private readonly service: ProductionInboundService) {}
  @Get('purchase-inbounds') @RequirePermission(PERMISSIONS.production.inbounds.view) list(
    @Query() q: PurchaseInboundQueryDto,
  ) {
    return this.service.list({
      page: q.page,
      pageSize: q.pageSize,
      keyword: q.keyword?.trim() || undefined,
      status: q.status,
    });
  }
  @Get('purchase-inbounds/:inboundId') @RequirePermission(PERMISSIONS.production.inbounds.view) get(
    @Param() p: InboundIdParamDto,
  ) {
    return this.service.get(p.inboundId);
  }
  @Post('purchase-inbounds')
  @RequirePermission(PERMISSIONS.production.inbounds.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE })
  create(
    @Body() body: CreatePurchaseInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(body, context);
  }
  @Post('purchase-inbounds/:inboundId/actions/confirm')
  @RequirePermission(PERMISSIONS.production.inbounds.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE })
  confirm(
    @Param() p: InboundIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirm(p.inboundId, body.version, context);
  }
  @Post('purchase-inbounds/:inboundId/actions/cancel')
  @RequirePermission(PERMISSIONS.production.inbounds.cancel)
  @AuditInApplication()
  cancel(
    @Param() p: InboundIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancel(p.inboundId, body.version, context);
  }
  @Get('inventory-batches') @RequirePermission(PERMISSIONS.production.inventory.view) inventory(
    @Query() q: InventoryBatchQueryDto,
  ) {
    return this.service.listInventory({
      page: q.page,
      pageSize: q.pageSize,
      keyword: q.keyword?.trim() || undefined,
      batchCode: q.batchCode?.trim() || undefined,
      batchStatus: q.batchStatus,
    });
  }
  @Get('inventory-batches/:itemBatchId')
  @RequirePermission(PERMISSIONS.production.inventory.view)
  inventoryDetail(@Param() p: InventoryBatchIdParamDto) {
    return this.service.getInventory(p.itemBatchId);
  }
}
