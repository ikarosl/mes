import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { ProductionTraceService } from '../../application/production-trace.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { BatchIdParamDto } from './dto/production-material.dto.js';
import { ProductionTraceQueryDto } from './dto/production-trace.dto.js';

@Controller('production/trace')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionTraceController {
  constructor(private readonly service: ProductionTraceService) {}

  @Get()
  @RequirePermission(PERMISSIONS.production.trace.view)
  search(@Query() query: ProductionTraceQueryDto) {
    return this.service.search(query);
  }

  @Get('batches/:batchId')
  @RequirePermission(PERMISSIONS.production.trace.view)
  detail(@Param() { batchId }: BatchIdParamDto) {
    return this.service.getDetail(batchId);
  }
}
