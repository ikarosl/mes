import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PurchaseOrderService } from '../../application/purchase-order.service.js';
import {
  CREATE_PURCHASE_ORDER_SCOPE,
  UPDATE_PURCHASE_ORDER_SCOPE,
  PLACE_PURCHASE_ORDER_SCOPE,
  CANCEL_PURCHASE_ORDER_SCOPE,
  CLOSE_PURCHASE_ORDER_LINE_SCOPE,
  CREATE_PURCHASE_ORDER_SUPPLEMENT_SCOPE,
} from '../../application/idempotency/procurement-idempotency-scopes.contract.js';
import { ProcurementDomainExceptionFilter } from './procurement-domain-exception.filter.js';
import {
  PurchaseOrderIdDto,
  PurchaseOrderQueryDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderVersionDto,
  CancelPurchaseOrderDto,
  ClosePurchaseOrderLineDto,
  CreatePurchaseOrderSupplementDto,
  ProcurementDemandCandidateQueryDto,
  ResolveProcurementDemandsDto,
  RelatedPurchasesQueryDto,
  ProcurementMaterialOptionsDto,
  ProcurementMaterialVariantsDto,
} from './purchase-order.dto.js';

@Controller('procurement')
@UseFilters(ProcurementDomainExceptionFilter)
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}
  @Get('purchase-orders')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  list(@Query() query: PurchaseOrderQueryDto) {
    return this.service.list(query);
  }
  @Get('purchase-orders/:id')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  get(@Param() { id }: PurchaseOrderIdDto) {
    return this.service.get(id);
  }
  @Get('demand-candidates')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  candidates(@Query() query: ProcurementDemandCandidateQueryDto) {
    return this.service.candidates(query);
  }
  @Post('demand-candidates/resolve')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  resolve(@Body() body: ResolveProcurementDemandsDto) {
    return this.service.resolve(body.demandIds);
  }
  @Get('related-purchases')
  @RequirePermission([
    PERMISSIONS.procurement.orders.view,
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.production.materials.view,
  ])
  related(@Query() query: RelatedPurchasesQueryDto) {
    return this.service.related(query);
  }
  @Get('material-options')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  materialOptions(@Query() query: ProcurementMaterialOptionsDto) {
    return this.service.materialOptions(query);
  }
  @Get('material-variants/options')
  @RequirePermission(PERMISSIONS.procurement.orders.view)
  variantOptions(@Query() { materialId }: ProcurementMaterialVariantsDto) {
    return this.service.variantOptions(materialId);
  }
  @Post('purchase-orders')
  @RequirePermission(PERMISSIONS.procurement.orders.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_PURCHASE_ORDER_SCOPE })
  create(
    @Body() body: CreatePurchaseOrderDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(body, context);
  }
  @Patch('purchase-orders/:id')
  @RequirePermission(PERMISSIONS.procurement.orders.update)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: UPDATE_PURCHASE_ORDER_SCOPE })
  update(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: UpdatePurchaseOrderDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.update(id, body, context);
  }
  @Post('purchase-orders/:id/actions/place')
  @RequirePermission(PERMISSIONS.procurement.orders.place)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: PLACE_PURCHASE_ORDER_SCOPE })
  place(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: PurchaseOrderVersionDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.place(id, body, context);
  }
  @Post('purchase-orders/:id/actions/cancel')
  @RequirePermission(PERMISSIONS.procurement.orders.cancel)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CANCEL_PURCHASE_ORDER_SCOPE })
  cancel(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: CancelPurchaseOrderDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.cancel(id, body, context);
  }
  @Post('purchase-order-lines/:id/actions/close')
  @RequirePermission(PERMISSIONS.procurement.orders.close)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CLOSE_PURCHASE_ORDER_LINE_SCOPE })
  closeLine(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: ClosePurchaseOrderLineDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.closeLine(id, body, context);
  }
  @Post('purchase-order-lines/:id/supplements')
  @RequirePermission(PERMISSIONS.procurement.orders.create)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_PURCHASE_ORDER_SUPPLEMENT_SCOPE })
  supplement(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: CreatePurchaseOrderSupplementDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.supplement(id, body, context);
  }
}
