import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionTerminationService } from '../../application/production-termination.service.js';
import { TERMINATE_BATCH_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import {
  TerminateProductionBatchDto,
  TerminationBatchParamDto,
} from './dto/production-termination.dto.js';
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

  @Post('batches/:batchId/actions/terminate')
  @RequirePermission(PERMISSIONS.production.tasks.terminate)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: TERMINATE_BATCH_IDEMPOTENCY_SCOPE })
  terminate(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: TerminateProductionBatchDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.terminate(batchId, body, context);
  }
}
