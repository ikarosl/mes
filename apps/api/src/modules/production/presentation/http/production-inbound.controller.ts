import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { ProductionInboundService } from '../../application/production-inbound.service.js';
import { ProductionSupplyDemandService } from '../../application/production-supply-demand.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  InboundIdParamDto,
  InventoryBatchIdParamDto,
  InventoryBatchQueryDto,
  InventoryItemIdParamDto,
  InventoryMaterialDemandTraceQueryDto,
  InventoryMaterialSupplyDemandQueryDto,
  PurchaseInboundQueryDto,
} from './dto/production-inbound.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionInboundController {
  constructor(
    private readonly service: ProductionInboundService,
    private readonly supplyDemand: ProductionSupplyDemandService,
  ) {}
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
  @Get('inventory-batches') @RequirePermission(PERMISSIONS.production.inventory.view) inventory(
    @Query() q: InventoryBatchQueryDto,
  ) {
    return this.service.listInventory({
      page: q.page,
      pageSize: q.pageSize,
      keyword: q.keyword?.trim() || undefined,
      batchCode: q.batchCode?.trim() || undefined,
      batchStatus: q.batchStatus,
      itemKind: q.itemKind,
      sourceType: q.sourceType,
    });
  }
  @Get('inventory-batches/:itemBatchId')
  @RequirePermission(PERMISSIONS.production.inventory.view)
  inventoryDetail(@Param() p: InventoryBatchIdParamDto) {
    return this.service.getInventory(p.itemBatchId);
  }
  @Get('inventory-material-supply-demand')
  @RequirePermission(PERMISSIONS.production.inventory.view)
  materialSupplyDemand(@Query() q: InventoryMaterialSupplyDemandQueryDto) {
    return this.supplyDemand.list({
      page: q.page,
      pageSize: q.pageSize,
      keyword: q.keyword?.trim() || undefined,
    });
  }
  @Get('inventory-material-supply-demand/:itemId/demands')
  @RequirePermission(PERMISSIONS.production.inventory.view)
  materialDemandTrace(
    @Param() p: InventoryItemIdParamDto,
    @Query() q: InventoryMaterialDemandTraceQueryDto,
  ) {
    return this.supplyDemand.listDemandTrace(p.itemId, {
      materialVariantId: q.materialVariantId,
      page: q.page,
      pageSize: q.pageSize,
    });
  }
}
