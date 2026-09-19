import { Injectable } from '@nestjs/common';
import type {
  ConfirmProcurementReceiptPayload,
  CorrectReceiptLinePayload,
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  TerminateReceiptScopePayload,
  ConfirmSupplierReturnPayload,
  ConfirmProcurementInboundPayload,
  ProcurementReceiptCommandResult,
  ConfirmProcurementInboundResult,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProcurementReceiptRepository } from './ports/receipt.repository.js';
import {
  CONFIRM_PROCUREMENT_RECEIPT_SCOPE,
  CORRECT_RECEIPT_SCOPE,
  START_RECEIPT_REVIEW_SCOPE,
  INSPECT_RECEIPT_SCOPE,
  TERMINATE_RECEIPT_RETURN_SCOPE,
  CONFIRM_SUPPLIER_RETURN_SCOPE,
  CONFIRM_PROCUREMENT_INBOUND_SCOPE,
} from './idempotency/procurement-idempotency-scopes.contract.js';
import {
  receiptCommandResultCodec,
  inboundCommandResultCodec,
} from './idempotency/receipt-result.codec.js';
@Injectable()
export class ReceiptService {
  constructor(
    private readonly repository: ProcurementReceiptRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async confirmReceipt(
    payload: ConfirmProcurementReceiptPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = { ...payload, details: payload.details.map((detail) => ({ ...detail })) };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_PROCUREMENT_RECEIPT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.confirmReceipt(body, auditContext(context)),
    });
    return execution.result;
  }
  async correctReceipt(
    id: string,
    payload: CorrectReceiptLinePayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = {
      ...payload,
      adjustments: payload.adjustments.map((adjustment) => ({ ...adjustment })),
    };
    const execution = await this.idempotency.execute({
      scope: CORRECT_RECEIPT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.correctReceipt(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async startReview(
    id: string,
    payload: StartReceiptReviewPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = { ...payload };
    const execution = await this.idempotency.execute({
      scope: START_RECEIPT_REVIEW_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.startReview(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async inspect(
    id: string,
    payload: InspectReceiptLinePayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = { ...payload };
    const execution = await this.idempotency.execute({
      scope: INSPECT_RECEIPT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.inspect(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async terminateReturn(
    id: string,
    payload: TerminateReceiptScopePayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = { ...payload };
    const execution = await this.idempotency.execute({
      scope: TERMINATE_RECEIPT_RETURN_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.terminateReturn(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async confirmReturn(
    id: string,
    payload: ConfirmSupplierReturnPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcurementReceiptCommandResult> {
    const body = { ...payload };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_SUPPLIER_RETURN_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptCommandResultCodec,
      handler: () => this.repository.confirmReturn(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async confirmInbound(
    payload: ConfirmProcurementInboundPayload,
    context: IdempotentCommandContext,
  ): Promise<ConfirmProcurementInboundResult> {
    const body = { ...payload, details: payload.details.map((detail) => ({ ...detail })) };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_PROCUREMENT_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: inboundCommandResultCodec,
      handler: () => this.repository.confirmInbound(body, auditContext(context)),
    });
    return execution.result;
  }
}
const auditContext = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
