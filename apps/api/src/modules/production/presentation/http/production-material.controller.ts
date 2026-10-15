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
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { ProductionMaterialOutboundService } from '../../application/production-material-outbound.service.js';
import { ProductionMaterialService } from '../../application/production-material.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import {
  AllocationParamDto,
  BatchIdParamDto,
  CreateMaterialAllocationsDto,
  CreateMaterialOutboundDto,
  DemandIdParamDto,
  MaterialOutboundQueryDto,
  OutboundIdParamDto,
} from './dto/production-material.dto.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionMaterialController {
  constructor(
    private readonly service: ProductionMaterialService,
    private readonly outboundService: ProductionMaterialOutboundService,
  ) {}

  @Get('batches/:batchId/material-demands')
  @RequirePermission([
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.materialDemands.view,
  ])
  demands(@Param() { batchId }: BatchIdParamDto) {
    return this.service.listDemands(batchId);
  }

  @Get('material-demands/:demandId/available-item-batches')
  @RequirePermission([PERMISSIONS.production.materials.view, PERMISSIONS.production.tasks.view])
  available(@Param() { demandId }: DemandIdParamDto) {
    return this.service.listAvailableItemBatches(demandId);
  }

  @Post('batches/:batchId/material-allocations')
  @RequirePermission(PERMISSIONS.production.materials.allocate)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE })
  allocate(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: CreateMaterialAllocationsDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.createAllocations(batchId, body, context);
  }

  @Post('batches/:batchId/material-allocations/:allocationId/actions/release')
  @RequirePermission(PERMISSIONS.production.materials.allocate)
  @AuditInApplication()
  release(
    @Param() { batchId, allocationId }: AllocationParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.releaseAllocation(batchId, allocationId, body.version, context);
  }

  @Post('batches/:batchId/material-outbounds')
  @RequirePermission(PERMISSIONS.warehouse.outbound.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE })
  outbound(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: CreateMaterialOutboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.outboundService.createOutbound(batchId, body, context);
  }

  @Get('batches/:batchId/material-outbounds')
  @RequirePermission([PERMISSIONS.production.materials.view, PERMISSIONS.production.tasks.view])
  outbounds(@Param() { batchId }: BatchIdParamDto) {
    return this.outboundService.listOutbounds(batchId);
  }

  @Get('material-outbounds/batch-options')
  @RequirePermission(PERMISSIONS.warehouse.outbound.view)
  outboundBatchOptions() {
    return this.outboundService.listOutboundBatchOptions();
  }

  @Get('batches/:batchId/material-outbound-candidates')
  @RequirePermission(PERMISSIONS.warehouse.outbound.view)
  outboundCandidates(@Param() { batchId }: BatchIdParamDto) {
    return this.outboundService.listOutboundCandidates(batchId);
  }

  @Get('material-outbounds')
  @RequirePermission(PERMISSIONS.warehouse.outbound.view)
  outboundOrders(@Query() query: MaterialOutboundQueryDto) {
    return this.outboundService.listOutboundOrders({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }

  @Get('material-outbounds/:outboundId')
  @RequirePermission(PERMISSIONS.warehouse.outbound.view)
  outboundDetail(@Param() { outboundId }: OutboundIdParamDto) {
    return this.outboundService.getOutbound(outboundId);
  }

  @Post('material-outbounds/:outboundId/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.outbound.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE })
  confirmOutbound(
    @Param() { outboundId }: OutboundIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.outboundService.confirmOutbound(outboundId, body.version, context);
  }

  @Post('material-outbounds/:outboundId/actions/cancel')
  @RequirePermission(PERMISSIONS.warehouse.outbound.cancel)
  @AuditInApplication()
  cancelOutbound(
    @Param() { outboundId }: OutboundIdParamDto,
    @Body() body: ReasonedVersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.outboundService.cancelOutbound(outboundId, body.version, body.reason, context);
  }
}
