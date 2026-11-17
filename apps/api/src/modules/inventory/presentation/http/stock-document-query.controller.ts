import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { STOCK_DOCUMENT_VIEW_PERMISSIONS } from '@company/constants';
import type { PageResult, StockDocumentOrder, UserProfile } from '@company/contracts';
import { CurrentUser, RequirePermission } from '../../../../common/security/auth.decorators.js';
import { StockDocumentQueryService } from '../../application/stock-document-query.service.js';
import { InventoryDomainExceptionFilter } from './inventory-domain-exception.filter.js';
import { StockDocumentIdParamDto, StockDocumentQueryDto } from './dto/stock-document-query.dto.js';

@Controller('warehouse/stock-documents')
@UseFilters(InventoryDomainExceptionFilter)
export class StockDocumentQueryController {
  constructor(private readonly service: StockDocumentQueryService) {}

  @Get()
  @RequirePermission(STOCK_DOCUMENT_VIEW_PERMISSIONS)
  list(
    @Query() query: StockDocumentQueryDto,
    @CurrentUser() user: UserProfile,
  ): Promise<PageResult<StockDocumentOrder>> {
    return this.service.list(query, user.permissions);
  }

  @Get(':direction/:id')
  @RequirePermission(STOCK_DOCUMENT_VIEW_PERMISSIONS)
  get(
    @Param() { direction, id }: StockDocumentIdParamDto,
    @CurrentUser() user: UserProfile,
  ): Promise<StockDocumentOrder> {
    return this.service.get(direction, id, user.permissions);
  }
}
