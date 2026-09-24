import type {
  ConfirmProcurementReceiptPayload,
  ConfirmReceiptAcceptancePayload,
  CorrectReceiptLinePayload,
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  RejectReceiptLinePayload,
  RevokeReceiptRejectionPayload,
  ConfirmSupplierReturnPayload,
  ConfirmProcurementInboundPayload,
  ProcurementReceiptCommandResult,
  ConfirmProcurementInboundResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProcurementReceiptRepository {
  abstract accept(
    id: string,
    payload: ConfirmReceiptAcceptancePayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract confirmReceipt(
    payload: ConfirmProcurementReceiptPayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract correctReceipt(
    id: string,
    payload: CorrectReceiptLinePayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract startReview(
    id: string,
    payload: StartReceiptReviewPayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract inspect(
    id: string,
    payload: InspectReceiptLinePayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract reject(
    id: string,
    payload: RejectReceiptLinePayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract revokeRejection(
    id: string,
    payload: RevokeReceiptRejectionPayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract confirmReturn(
    id: string,
    payload: ConfirmSupplierReturnPayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract confirmInbound(
    payload: ConfirmProcurementInboundPayload,
    context: CommandContext,
  ): Promise<ConfirmProcurementInboundResult>;
}
