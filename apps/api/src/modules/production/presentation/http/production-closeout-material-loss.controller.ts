import { Body, Controller, Param, Post, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionCloseoutMaterialLossService } from '../../application/production-closeout-material-loss.service.js';
import { RECORD_CLOSEOUT_MATERIAL_LOSS_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { TerminationBatchParamDto } from './dto/production-termination.dto.js';
import { RecordCloseoutMaterialLossDto } from './dto/production-closeout-material-loss.dto.js';

@Controller('production/batches/:batchId/closeout/material-losses')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionCloseoutMaterialLossController {
  constructor(private readonly service: ProductionCloseoutMaterialLossService) {}
  @Post()
  @RequirePermission(PERMISSIONS.production.tasks.manageOutput)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: RECORD_CLOSEOUT_MATERIAL_LOSS_SCOPE })
  record(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: RecordCloseoutMaterialLossDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.record(batchId, body, context);
  }
}
