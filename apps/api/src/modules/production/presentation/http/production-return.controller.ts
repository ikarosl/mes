import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import {
  ReasonedVersionedCommandDto,
  VersionedCommandDto,
} from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionReturnService } from '../../application/production-return.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  CreateReturnOrderDto,
  ReturnIdParamDto,
  ReturnOrderQueryDto,
  WarehouseBatchIdParamDto,
} from './dto/warehouse.dto.js';

@Controller('warehouse')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionReturnController {
  constructor(private readonly service: ProductionReturnService) {}

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
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelReturnOrder(returnId, body.version, body.reason, context);
  }
}
