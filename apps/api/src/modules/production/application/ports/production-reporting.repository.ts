import type {
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  PageResult,
  ProductionBatchQuery,
  ProductionExecutionBatchSummary,
  ProductionExecutionRecordGroup,
  ReverseBatchStepReportPayload,
  HistoricalBatchStepReportPayload,
  PageQuery,
  BatchStepReportView,
  BatchStepReportDetail,
  BatchStepScrapRecordView,
  BatchReverseStepReportsCommandResult,
  BatchReverseStepReportsPayload,
  PreviewBatchReverseStepReportsPayload,
  BatchReverseStepReportsPreview,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ProductionReportingAccess } from '../../domain/production-reporting.policy.js';

export abstract class ProductionReportingRepository {
  abstract listExecutionBatches(
    query: ProductionBatchQuery,
  ): Promise<PageResult<ProductionExecutionBatchSummary>>;
  abstract getBatchExecution(
    batchId: string,
    access: ProductionReportingAccess,
  ): Promise<ProductionExecutionRecordGroup>;
  abstract listStepReports(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepReportView>>;
  abstract getStepReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportDetail>;
  abstract listStepScraps(
    batchId: string,
    stepRecordId: string,
    query: PageQuery,
    access: ProductionReportingAccess,
  ): Promise<PageResult<BatchStepScrapRecordView>>;
  abstract createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportCommandResult>;
  abstract reverseReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportCommandResult>;
  abstract correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<CorrectBatchStepReportCommandResult>;
  abstract createHistoricalReport(
    batchId: string,
    stepRecordId: string,
    payload: HistoricalBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportCommandResult>;
  abstract reverseHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchStepReportCommandResult>;
  abstract correctHistoricalReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: HistoricalBatchStepReportPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<CorrectBatchStepReportCommandResult>;
  abstract previewBatchReverse(
    batchId: string,
    payload: PreviewBatchReverseStepReportsPayload,
    access: ProductionReportingAccess,
  ): Promise<BatchReverseStepReportsPreview>;
  abstract batchReverse(
    batchId: string,
    payload: BatchReverseStepReportsPayload,
    context: CommandContext,
    access: ProductionReportingAccess,
  ): Promise<BatchReverseStepReportsCommandResult>;
}
