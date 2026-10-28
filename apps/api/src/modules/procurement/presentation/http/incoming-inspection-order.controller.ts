import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { IncomingInspectionOrderQuery } from '../../application/ports/incoming-inspection-order.query.js';
import { IncomingInspectionOrderService } from '../../application/incoming-inspection-order.service.js';
import {
  CHANGE_INCOMING_INSPECTION_ASSOCIATIONS_SCOPE,
  CREATE_INCOMING_INSPECTION_ORDER_SCOPE,
  UPDATE_INCOMING_INSPECTION_ORDER_SCOPE,
} from '../../application/idempotency/incoming-inspection-order-idempotency.contract.js';
import { ProcurementDomainExceptionFilter } from './procurement-domain-exception.filter.js';
import {
  ChangeIncomingInspectionAssociationsDto,
  CreateIncomingInspectionOrderDto,
  IncomingInspectionOrderIdDto,
  IncomingInspectionOrderQueryDto,
  IncomingInspectionReceiptCandidateQueryDto,
  IncomingInspectionReceiptIdDto,
  IncomingInspectionReceiptLineIdDto,
  IncomingInspectionTargetQueryDto,
  UpdateIncomingInspectionOrderDto,
} from './incoming-inspection-order.dto.js';

@Controller('quality/inbound-inspection-orders')
@UseFilters(ProcurementDomainExceptionFilter)
export class IncomingInspectionOrderController {
  constructor(
    private readonly query: IncomingInspectionOrderQuery,
    private readonly service: IncomingInspectionOrderService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  list(@Query() query: IncomingInspectionOrderQueryDto) {
    return this.query.list(query);
  }

  @Get('targets')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  targets(@Query() query: IncomingInspectionTargetQueryDto) {
    return this.query.targets(query);
  }

  @Get('receipt-candidates')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  candidates(@Query() query: IncomingInspectionReceiptCandidateQueryDto) {
    return this.query.candidates(query);
  }

  @Get('receipts/:receiptId/lines')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  receiptLines(@Param() { receiptId }: IncomingInspectionReceiptIdDto) {
    return this.query.receiptLines(receiptId);
  }

  @Get('receipt-lines/:receiptLineId/location')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  locate(@Param() { receiptLineId }: IncomingInspectionReceiptLineIdDto) {
    return this.query.locate(receiptLineId);
  }

  @Get(':orderId/receipts')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  receipts(@Param() { orderId }: IncomingInspectionOrderIdDto, @Query() query: PageQueryDto) {
    return this.query.receipts(orderId, query);
  }

  @Get(':orderId')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  get(@Param() { orderId }: IncomingInspectionOrderIdDto) {
    return this.query.get(orderId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.quality.inboundInspections.manage)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CREATE_INCOMING_INSPECTION_ORDER_SCOPE })
  create(
    @Body() body: CreateIncomingInspectionOrderDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.create(body, context);
  }

  @Post('associations')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.manage)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: CHANGE_INCOMING_INSPECTION_ASSOCIATIONS_SCOPE })
  change(
    @Body() body: ChangeIncomingInspectionAssociationsDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.changeAssociations(body, context);
  }

  @Patch(':orderId')
  @RequirePermission(PERMISSIONS.quality.inboundInspections.manage)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: UPDATE_INCOMING_INSPECTION_ORDER_SCOPE })
  remark(
    @Param() { orderId }: IncomingInspectionOrderIdDto,
    @Body() body: UpdateIncomingInspectionOrderDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.updateRemark(orderId, body, context);
  }
}
