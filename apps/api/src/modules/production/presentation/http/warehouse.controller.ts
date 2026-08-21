import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
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
import { ProductionInventoryService } from '../../application/production-inventory.service.js';
import { CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  CreateReturnOrderDto,
  CreateMaterialLossDto,
  MaterialLossQueryDto,
  CreateStockCheckDto,
  ReturnIdParamDto,
  ReturnOrderQueryDto,
  ScrapIdParamDto,
  SaveStockCheckCountsDto,
  StockCheckCandidateQueryDto,
  StockCheckIdParamDto,
  StockCheckOrderQueryDto,
  WarehouseBatchIdParamDto,
} from './dto/warehouse.dto.js';

@Controller('warehouse')
@UseFilters(ProductionDomainExceptionFilter)
export class WarehouseController {
  constructor(private readonly service: ProductionInventoryService) {}

  @Get('scraps')
  @RequirePermission(PERMISSIONS.warehouse.scraps.view)
  listMaterialLosses(@Query() query: MaterialLossQueryDto) {
    return this.service.listMaterialLosses({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('scraps/batch-options')
  @RequirePermission(PERMISSIONS.warehouse.scraps.view)
  materialLossBatchOptions() {
    return this.service.listMaterialLossBatchOptions();
  }
  @Get('scraps/batches/:batchId/candidates')
  @RequirePermission(PERMISSIONS.warehouse.scraps.view)
  materialLossCandidates(@Param() { batchId }: WarehouseBatchIdParamDto) {
    return this.service.listMaterialLossCandidates(batchId);
  }
  @Get('scraps/:scrapId')
  @RequirePermission(PERMISSIONS.warehouse.scraps.view)
  getMaterialLoss(@Param() { scrapId }: ScrapIdParamDto) {
    return this.service.getMaterialLoss(scrapId);
  }
  @Post('scraps')
  @RequirePermission(PERMISSIONS.warehouse.scraps.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE })
  createMaterialLoss(
    @Body() body: CreateMaterialLossDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.createMaterialLoss(body, context);
  }
  @Post('scraps/:scrapId/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.scraps.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE })
  confirmMaterialLoss(
    @Param() { scrapId }: ScrapIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmMaterialLoss(scrapId, body.version, context);
  }
  @Post('scraps/:scrapId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.scraps.cancel)
  @AuditInApplication()
  cancelMaterialLoss(
    @Param() { scrapId }: ScrapIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelMaterialLoss(scrapId, body.version, context);
  }

  @Get('return-orders')
  @RequirePermission(PERMISSIONS.warehouse.returns.view)
  listReturns(@Query() query: ReturnOrderQueryDto) {
    return this.service.listReturnOrders({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('return-orders/batch-options')
  @RequirePermission(PERMISSIONS.warehouse.returns.view)
  returnBatchOptions() {
    return this.service.listReturnBatchOptions();
  }
  @Get('return-orders/batches/:batchId/candidates')
  @RequirePermission(PERMISSIONS.warehouse.returns.view)
  returnCandidates(@Param() { batchId }: WarehouseBatchIdParamDto) {
    return this.service.listReturnCandidates(batchId);
  }
  @Get('return-orders/:returnId')
  @RequirePermission(PERMISSIONS.warehouse.returns.view)
  getReturn(@Param() { returnId }: ReturnIdParamDto) {
    return this.service.getReturnOrder(returnId);
  }
  @Post('return-orders')
  @RequirePermission(PERMISSIONS.warehouse.returns.create)
  @AuditInApplication()
  createReturn(
    @Body() body: CreateReturnOrderDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.createReturnOrder(body, context);
  }
  @Post('return-orders/:returnId/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.returns.confirm)
  @AuditInApplication()
  confirmReturn(
    @Param() { returnId }: ReturnIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.confirmReturnOrder(returnId, body.version, context);
  }
  @Post('return-orders/:returnId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.returns.cancel)
  @AuditInApplication()
  cancelReturn(
    @Param() { returnId }: ReturnIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelReturnOrder(returnId, body.version, context);
  }

  @Get('stock-checks')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.view)
  listStockChecks(@Query() query: StockCheckOrderQueryDto) {
    return this.service.listStockChecks({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('stock-checks/candidates')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.view)
  stockCheckCandidates(@Query() query: StockCheckCandidateQueryDto) {
    return this.service.listStockCheckCandidates({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      stockStatus: query.stockStatus,
    });
  }
  @Get('stock-checks/:stockCheckId')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.view)
  getStockCheck(@Param() { stockCheckId }: StockCheckIdParamDto) {
    return this.service.getStockCheck(stockCheckId);
  }
  @Post('stock-checks')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.create)
  @AuditInApplication()
  createStockCheck(
    @Body() body: CreateStockCheckDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.createStockCheck(body, context);
  }
  @Patch('stock-checks/:stockCheckId')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.count)
  @AuditInApplication()
  saveStockCheckCounts(
    @Param() { stockCheckId }: StockCheckIdParamDto,
    @Body() body: SaveStockCheckCountsDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.saveStockCheckCounts(stockCheckId, body, context);
  }
  @Post('stock-checks/:stockCheckId/actions/complete')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.complete)
  @AuditInApplication()
  completeStockCheck(
    @Param() { stockCheckId }: StockCheckIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.completeStockCheck(stockCheckId, body.version, context);
  }
  @Post('stock-checks/:stockCheckId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.stockChecks.cancel)
  @AuditInApplication()
  cancelStockCheck(
    @Param() { stockCheckId }: StockCheckIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelStockCheck(stockCheckId, body.version, context);
  }
}
