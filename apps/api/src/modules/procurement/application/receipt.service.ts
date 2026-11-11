import { Injectable } from '@nestjs/common';
import type {
  ConfirmProcurementReceiptPayload,
  RecordReceiptHandlingPayload,
  ReceiptHandlingItem,
  ConfirmProcurementInboundPayload,
  VoidProcurementReceiptPayload,
  QualityIncomingInspectionReportInput,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import {
  incomingInspectionReportResultCodec,
  normalizeIncomingInspectionDetails,
} from '../../quality/public.js';
import { ProcurementReceiptRepository } from './ports/receipt.repository.js';
import {
  CONFIRM_PROCUREMENT_RECEIPT_SCOPE,
  RECORD_RECEIPT_HANDLING_SCOPE,
  INSPECT_RECEIPT_SCOPE,
  CONFIRM_PROCUREMENT_INBOUND_SCOPE,
  VOID_RECEIPT_SCOPE,
} from './idempotency/procurement-idempotency-scopes.contract.js';
import {
  receiptCommandResultCodec,
  receiptHandlingResultCodec,
  inboundCommandResultCodec,
  voidReceiptCommandResultCodec,
} from './idempotency/receipt-result.codec.js';
const nullableTrim = (value: string | null | undefined) => value?.trim() || null;
@Injectable()
export class ReceiptService {
  constructor(
    private readonly repository: ProcurementReceiptRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async voidReceipt(
    id: string,
    payload: VoidProcurementReceiptPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      reason: payload.reason.trim(),
      lines: [...payload.lines].sort((a, b) =>
        BigInt(a.receiptLineId) < BigInt(b.receiptLineId) ? -1 : 1,
      ),
    };
    const execution = await this.idempotency.execute({
      scope: VOID_RECEIPT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: voidReceiptCommandResultCodec,
      handler: () => this.repository.voidReceipt(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async confirmReceipt(
    payload: ConfirmProcurementReceiptPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      ...payload,
      handoverEvidence: nullableTrim(payload.handoverEvidence),
      remark: nullableTrim(payload.remark),
      details: payload.details.map((row) => ({
        ...row,
        supplierBatchCode: nullableTrim(row.supplierBatchCode),
      })),
    };
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
  async inspect(
    id: string,
    payload: QualityIncomingInspectionReportInput,
    context: IdempotentCommandContext,
  ) {
    const body: QualityIncomingInspectionReportInput = {
      inspectionMethod: payload.inspectionMethod,
      qualifiedQuantity: payload.qualifiedQuantity,
      unqualifiedQuantity: payload.unqualifiedQuantity,
      inspectedAt: payload.inspectedAt,
      specification: nullableTrim(payload.specification),
      expiresOn: payload.expiresOn ?? null,
      remark: nullableTrim(payload.remark),
      evidence: nullableTrim(payload.evidence),
      previousRecordId: payload.previousRecordId ?? null,
      correctionReason: nullableTrim(payload.correctionReason),
      inspectionDetails: normalizeIncomingInspectionDetails(payload.inspectionDetails),
    };
    const execution = await this.idempotency.execute({
      scope: INSPECT_RECEIPT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: incomingInspectionReportResultCodec,
      handler: () => this.repository.inspect(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async recordHandling(
    id: string,
    payload: RecordReceiptHandlingPayload,
    context: IdempotentCommandContext,
  ): Promise<ReceiptHandlingItem> {
    const body = { otherHandlingNote: payload.otherHandlingNote.trim() };
    const execution = await this.idempotency.execute({
      scope: RECORD_RECEIPT_HANDLING_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { id }, body },
      resultCodec: receiptHandlingResultCodec,
      handler: () => this.repository.recordHandling(id, body, auditContext(context)),
    });
    return execution.result;
  }
  async confirmInbound(
    payload: ConfirmProcurementInboundPayload,
    context: IdempotentCommandContext,
  ) {
    const body: ConfirmProcurementInboundPayload = {
      remark: nullableTrim(payload.remark),
      details: payload.details.map((row) => ({
        receiptLineId: row.receiptLineId,
        version: row.version,
        quantity: row.quantity,
        target: normalizeTarget(row.target),
      })),
    };
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

function normalizeTarget(
  target: import('@company/contracts').InventoryInboundTarget,
): import('@company/contracts').InventoryInboundTarget {
  if (target.mode === 'new') return { mode: 'new', clientKey: target.clientKey.trim() };
  return { mode: 'existing', batchId: target.batchId };
}
