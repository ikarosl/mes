import type {
  ConfirmProcurementReceiptPayload,
  RecordReceiptHandlingPayload,
  ReceiptHandlingItem,
  ConfirmProcurementInboundPayload,
  ProcurementReceiptCommandResult,
  ConfirmProcurementInboundResult,
  VoidProcurementReceiptPayload,
  VoidProcurementReceiptCommandResult,
  QualityIncomingInspectionReportInput,
  QualityIncomingInspectionReportItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProcurementReceiptRepository {
  abstract recordHandling(
    id: string,
    payload: RecordReceiptHandlingPayload,
    context: CommandContext,
  ): Promise<ReceiptHandlingItem>;
  abstract voidReceipt(
    id: string,
    payload: VoidProcurementReceiptPayload,
    context: CommandContext,
  ): Promise<VoidProcurementReceiptCommandResult>;
  abstract confirmReceipt(
    payload: ConfirmProcurementReceiptPayload,
    context: CommandContext,
  ): Promise<ProcurementReceiptCommandResult>;
  abstract inspect(
    id: string,
    payload: QualityIncomingInspectionReportInput,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionReportItem>;
  abstract confirmInbound(
    payload: ConfirmProcurementInboundPayload,
    context: CommandContext,
  ): Promise<ConfirmProcurementInboundResult>;
}
