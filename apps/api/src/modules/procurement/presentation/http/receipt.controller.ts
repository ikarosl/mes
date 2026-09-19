import { Body, Controller, Get, Param, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { ProcurementReceiptQuery } from '../../application/ports/receipt-query.js';
import { ReceiptService } from '../../application/receipt.service.js';
import {
  CONFIRM_PROCUREMENT_RECEIPT_SCOPE,
  CORRECT_RECEIPT_SCOPE,
  START_RECEIPT_REVIEW_SCOPE,
  INSPECT_RECEIPT_SCOPE,
  TERMINATE_RECEIPT_RETURN_SCOPE,
  CONFIRM_SUPPLIER_RETURN_SCOPE,
  CONFIRM_PROCUREMENT_INBOUND_SCOPE,
} from '../../application/idempotency/procurement-idempotency-scopes.contract.js';
import { ProcurementDomainExceptionFilter } from './procurement-domain-exception.filter.js';
import { PurchaseOrderIdDto, PurchaseOrderQueryDto } from './purchase-order.dto.js';
import {
  ReceiptListQueryDto,
  ReceiptReleaseQueryDto,
  InboundInspectionQueryDto,
  ReceiptHistoryPathDto,
  ConfirmProcurementReceiptDto,
  CorrectReceiptDto,
  StartReceiptReviewDto,
  InspectReceiptDto,
  TerminateReceiptReturnDto,
  ConfirmSupplierReturnDto,
  ConfirmProcurementInboundDto,
} from './receipt.dto.js';

@Controller('procurement')
@UseFilters(ProcurementDomainExceptionFilter)
export class ProcurementReceiptController {
  constructor(
    private readonly query: ProcurementReceiptQuery,
    private readonly service: ReceiptService,
  ) {}
  @Get('receipts')
  @RequirePermission(PERMISSIONS.procurement.receipts.view)
  list(@Query() query: ReceiptListQueryDto) {
    return this.query.listReceipts(query);
  }
  @Get('receipts/:id')
  @RequirePermission(PERMISSIONS.procurement.receipts.view)
  get(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceipt(id);
  }
  @Get('receipt-lines/:id')
  @RequirePermission(PERMISSIONS.procurement.receipts.view)
  line(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptLine(id);
  }
  @Get('receipt-order-options')
  @RequirePermission(PERMISSIONS.procurement.receipts.view)
  orders(@Query() query: PurchaseOrderQueryDto) {
    return this.query.listReceiptOrders(query);
  }
  @Get('receipt-order-options/:id')
  @RequirePermission(PERMISSIONS.procurement.receipts.view)
  order(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptOrder(id);
  }
  @Get('receipt-lines/:id/:historyKind')
  @RequirePermission([
    PERMISSIONS.procurement.receipts.view,
    PERMISSIONS.quality.inboundInspections.view,
  ])
  history(@Param() { id, historyKind }: ReceiptHistoryPathDto, @Query() query: PageQueryDto) {
    return this.query.history(id, historyKind, query);
  }
  @Get('inbound-releases')
  @RequirePermission(PERMISSIONS.production.inbounds.view)
  releases(@Query() query: ReceiptReleaseQueryDto) {
    return this.query.listInboundReleases(query);
  }
  @Post('receipts/actions/confirm')
  @RequirePermission(PERMISSIONS.procurement.receipts.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_PROCUREMENT_RECEIPT_SCOPE })
  confirm(
    @Body() body: ConfirmProcurementReceiptDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmReceipt(body, context);
  }
  @Post('receipt-lines/:id/actions/correct-receipt')
  @RequirePermission(PERMISSIONS.procurement.receipts.correct)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CORRECT_RECEIPT_SCOPE })
  correct(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: CorrectReceiptDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.correctReceipt(id, body, context);
  }
  @Post('receipt-lines/:id/actions/start-review')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.review)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: START_RECEIPT_REVIEW_SCOPE })
  review(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: StartReceiptReviewDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.startReview(id, body, context);
  }
  @Post('receipt-lines/:id/actions/inspect')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.inspect)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: INSPECT_RECEIPT_SCOPE })
  inspect(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: InspectReceiptDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.inspect(id, body, context);
  }
  @Post('receipt-lines/:id/actions/terminate-return')
  @RequirePermission(PERMISSIONS.procurement.receipts.return)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: TERMINATE_RECEIPT_RETURN_SCOPE })
  terminate(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: TerminateReceiptReturnDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.terminateReturn(id, body, context);
  }
  @Post('receipt-lines/:id/actions/return')
  @RequirePermission(PERMISSIONS.procurement.receipts.return)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_SUPPLIER_RETURN_SCOPE })
  return(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: ConfirmSupplierReturnDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmReturn(id, body, context);
  }
  @Post('purchase-inbounds/actions/confirm')
  @RequirePermission(PERMISSIONS.production.inbounds.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_PROCUREMENT_INBOUND_SCOPE })
  inbound(
    @Body() body: ConfirmProcurementInboundDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmInbound(body, context);
  }
}

@Controller('quality/inbound-inspections')
@UseFilters(ProcurementDomainExceptionFilter)
export class ProcurementInboundInspectionController {
  constructor(private readonly query: ProcurementReceiptQuery) {}
  @Get()
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  list(@Query() query: InboundInspectionQueryDto) {
    return this.query.listInspections(query);
  }
  @Get('receipt-lines/:id')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  line(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptLine(id);
  }
  @Get(':id')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  get(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getInspection(id);
  }
}
