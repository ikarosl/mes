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
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';
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
  constructor(private readonly service: ProductionMaterialService) {}

  @Get('batches/:batchId/material-demands')
  @RequirePermission(PERMISSIONS.production.materials.view)
  demands(@Param() { batchId }: BatchIdParamDto) {
    return this.service.listDemands(batchId);
  }

  @Get('material-demands/:demandId/available-item-batches')
  @RequirePermission(PERMISSIONS.production.materials.view)
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
  @RequirePermission(PERMISSIONS.production.materials.outbound)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE })
  outbound(
    @Param() { batchId }: BatchIdParamDto,
    @Body() body: CreateMaterialOutboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.createOutbound(batchId, body, context);
  }

  @Get('batches/:batchId/material-outbounds')
  @RequirePermission(PERMISSIONS.production.materials.view)
  outbounds(@Param() { batchId }: BatchIdParamDto) {
    return this.service.listOutbounds(batchId);
  }

  @Get('material-outbounds/batch-options')
  @RequirePermission(PERMISSIONS.production.materials.view)
  outboundBatchOptions() {
    return this.service.listOutboundBatchOptions();
  }

  @Get('batches/:batchId/material-outbound-candidates')
  @RequirePermission(PERMISSIONS.production.materials.view)
  outboundCandidates(@Param() { batchId }: BatchIdParamDto) {
    return this.service.listOutboundCandidates(batchId);
  }

  @Get('material-outbounds')
  @RequirePermission(PERMISSIONS.production.materials.view)
  outboundOrders(@Query() query: MaterialOutboundQueryDto) {
    return this.service.listOutboundOrders({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }

  @Get('material-outbounds/:outboundId')
  @RequirePermission(PERMISSIONS.production.materials.view)
  outboundDetail(@Param() { outboundId }: OutboundIdParamDto) {
    return this.service.getOutbound(outboundId);
  }

  @Post('material-outbounds/:outboundId/actions/confirm')
  @RequirePermission(PERMISSIONS.production.materials.confirmOutbound)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE })
  confirmOutbound(
    @Param() { outboundId }: OutboundIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmOutbound(outboundId, body.version, context);
  }

  @Post('material-outbounds/:outboundId/actions/cancel')
  @RequirePermission(PERMISSIONS.production.materials.cancelOutbound)
  @AuditInApplication()
  cancelOutbound(
    @Param() { outboundId }: OutboundIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.cancelOutbound(outboundId, body.version, context);
  }
}
