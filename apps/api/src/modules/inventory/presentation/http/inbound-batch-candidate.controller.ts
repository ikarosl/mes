import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { InventoryInboundQuery } from '../../application/inventory-inbound.query.js';
import { InventoryDomainExceptionFilter } from './inventory-domain-exception.filter.js';
import {
  FinishedInboundBatchCandidateQueryDto,
  MaterialInboundBatchCandidateQueryDto,
} from './dto/inbound-batch-candidate.dto.js';

@Controller('warehouse')
@UseFilters(InventoryDomainExceptionFilter)
export class InboundBatchCandidateController {
  constructor(private readonly query: InventoryInboundQuery) {}

  @Get('material-inbound-batch-candidates')
  @RequirePermission(PERMISSIONS.warehouse.inbound.view)
  listMaterial(@Query() query: MaterialInboundBatchCandidateQueryDto) {
    return this.query.listInboundBatchCandidates({
      itemKind: 'material',
      materialVariantId: query.materialVariantId,
      unit: query.unit,
      keyword: query.keyword?.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('finished-inbound-batch-candidates')
  @RequirePermission(PERMISSIONS.production.inbounds.view)
  listFinished(@Query() query: FinishedInboundBatchCandidateQueryDto) {
    return this.query.listInboundBatchCandidates({
      itemKind: 'finished_product',
      productId: query.productId,
      unit: query.unit,
      keyword: query.keyword?.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
