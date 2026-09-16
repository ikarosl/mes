import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
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
import { ProductionStockCheckService } from '../../application/production-stock-check.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  CreateStockCheckDto,
  SaveStockCheckCountsDto,
  StockCheckCandidateQueryDto,
  StockCheckIdParamDto,
  StockCheckOrderQueryDto,
} from './dto/warehouse.dto.js';

@Controller('warehouse')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionStockCheckController {
  constructor(private readonly service: ProductionStockCheckService) {}

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
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelStockCheck(stockCheckId, body.version, body.reason, context);
  }
}
