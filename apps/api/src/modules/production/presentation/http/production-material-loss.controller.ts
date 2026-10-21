import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
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
import {
  ReasonedVersionedCommandDto,
  VersionedCommandDto,
} from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionMaterialLossService } from '../../application/production-material-loss.service.js';
import {
  CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
  CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  CreateMaterialLossDto,
  MaterialLossQueryDto,
  ScrapIdParamDto,
  WarehouseBatchIdParamDto,
} from './dto/warehouse.dto.js';

@Controller('warehouse')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionMaterialLossController {
  constructor(private readonly service: ProductionMaterialLossService) {}

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
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelMaterialLoss(scrapId, body.version, body.reason, context);
  }
}
