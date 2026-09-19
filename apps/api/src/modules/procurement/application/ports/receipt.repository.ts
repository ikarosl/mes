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
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProcurementReceiptRepository {
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
  abstract terminateReturn(
    id: string,
    payload: TerminateReceiptScopePayload,
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
