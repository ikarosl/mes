import { Controller, Get, Param, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { ProductionTerminationService } from '../../application/production-termination.service.js';
import { TerminationBatchParamDto } from './dto/production-termination.dto.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionTerminationController {
  constructor(private readonly service: ProductionTerminationService) {}
  @Get('batches/:batchId/termination-check')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  getCheck(@Param() { batchId }: TerminationBatchParamDto) {
    return this.service.getCheck(batchId);
  }
}
