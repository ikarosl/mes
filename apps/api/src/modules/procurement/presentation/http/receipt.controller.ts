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
  RECORD_RECEIPT_HANDLING_SCOPE,
  INSPECT_RECEIPT_SCOPE,
  CONFIRM_PROCUREMENT_INBOUND_SCOPE,
  VOID_RECEIPT_SCOPE,
} from '../../application/idempotency/procurement-idempotency-scopes.contract.js';
import { QualityInboundQuery, QualityCommandError } from '../../../quality/public.js';
import { ProcurementDomainExceptionFilter } from './procurement-domain-exception.filter.js';
import { PurchaseOrderIdDto, PurchaseOrderQueryDto } from './purchase-order.dto.js';
import {
  ReceiptQueryDto,
  ReceiptSourceCandidatesQueryDto,
  ReceiptHistoryPathDto,
  InspectionReportPathDto,
  ConfirmProcurementReceiptDto,
  RecordReceiptHandlingDto,
  InspectReceiptDto,
  ConfirmProcurementInboundDto,
  VoidProcurementReceiptDto,
} from './receipt.dto.js';

@Controller('procurement')
@UseFilters(ProcurementDomainExceptionFilter)
export class ProcurementReceiptController {
  constructor(
    private readonly query: ProcurementReceiptQuery,
    private readonly service: ReceiptService,
  ) {}
  @Get('receipts')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  list(@Query() query: ReceiptQueryDto) {
    return this.query.listReceipts(query);
  }
  @Get('receipts/:id/worklist-lines')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  worklistLines(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.receiptWorklistLines(id);
  }
  @Get('receipt-lines/:id/location')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  locateLine(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.locateReceiptLine(id);
  }
  @Get('receipts/:id')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  get(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceipt(id);
  }
  @Get('receipts/:id/voiding')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  voiding(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptVoiding(id);
  }
  @Get('receipt-lines/:id')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  line(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptLine(id);
  }
  @Get('receipt-order-options')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  orders(@Query() query: PurchaseOrderQueryDto) {
    return this.query.listReceiptOrders(query);
  }
  @Get('receipt-order-options/:id')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  order(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptOrder(id);
  }
  @Get('receipt-lines/:id/:historyKind')
  @RequirePermission(PERMISSIONS.warehouse.receipts.view)
  history(@Param() { id, historyKind }: ReceiptHistoryPathDto, @Query() query: PageQueryDto) {
    return this.query.history(id, historyKind, query);
  }
  @Get('inbound-sources')
  @RequirePermission(PERMISSIONS.warehouse.inbound.view)
  sources(@Query() query: ReceiptSourceCandidatesQueryDto) {
    return this.query.listInboundSources(query);
  }
  @Post('receipts/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.receipts.confirm)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CONFIRM_PROCUREMENT_RECEIPT_SCOPE })
  confirm(
    @Body() body: ConfirmProcurementReceiptDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.confirmReceipt(body, context);
  }
  @Post('receipts/:id/actions/void')
  @RequirePermission(PERMISSIONS.warehouse.receipts.void)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: VOID_RECEIPT_SCOPE })
  voidReceipt(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: VoidProcurementReceiptDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.voidReceipt(id, body, context);
  }
  @Post('receipt-lines/:id/inspect')
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
  @Post('receipt-lines/:id/handlings')
  @RequirePermission(PERMISSIONS.warehouse.receipts.handle)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: RECORD_RECEIPT_HANDLING_SCOPE })
  recordHandling(
    @Param() { id }: PurchaseOrderIdDto,
    @Body() body: RecordReceiptHandlingDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.recordHandling(id, body, context);
  }
  @Post('purchase-inbounds/actions/confirm')
  @RequirePermission(PERMISSIONS.warehouse.inbound.confirmPurchase)
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
  constructor(
    private readonly query: ProcurementReceiptQuery,
    private readonly quality: QualityInboundQuery,
  ) {}
  @Get('receipt-lines/:id')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  line(@Param() { id }: PurchaseOrderIdDto) {
    return this.query.getReceiptLine(id);
  }
  @Get('reports/:reportId')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  async report(@Param() { reportId }: InspectionReportPathDto) {
    const item = await this.quality.getReport(reportId);
    if (!item) throw new QualityCommandError('NOT_FOUND', '检验报告不存在');
    return item;
  }
  @Get(':id/reports')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  async reports(@Param() { id }: PurchaseOrderIdDto, @Query() query: PageQueryDto) {
    await this.query.locateReceiptLine(id);
    return this.quality.listReports(id, query);
  }
}
