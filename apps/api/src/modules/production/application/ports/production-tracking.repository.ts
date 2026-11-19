import type {
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionExecutionStartCheck,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardQuery,
  ProductionTrackingAbnormalityDescriptionQuery,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingOutput,
  ProductionTrackingPersonnelSnapshot,
  ProductionTrackingReportQuery,
  ProductionTrackingScanResult,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface ProductionTrackingCardListQuery extends ProductionTrackingCardQuery {
  exactCardNo?: string;
}

export abstract class ProductionTrackingRepository {
  abstract abnormalityStepReference(
    cardId: string,
    stepRecordId?: string | null,
  ): Promise<{ stepRecordId: string; routeStepId: string } | null>;
  abstract abnormalityDescriptionOptions(
    processStepId: string | null,
    query: ProductionTrackingAbnormalityDescriptionQuery,
  ): Promise<PageResult<string>>;
  abstract list(
    query: ProductionTrackingCardListQuery,
  ): Promise<PageResult<ProductionTrackingCardItem>>;
  abstract get(cardId: string): Promise<ProductionTrackingCardDetail>;
  abstract workbench(batchId: string): Promise<ProductionTrackingWorkbench>;
  abstract reports(
    query: ProductionTrackingReportQuery,
  ): Promise<PageResult<ProductionTrackingVisit>>;
  abstract withBatchTransaction<T>(batchId: string, action: () => Promise<T>): Promise<T>;
  abstract startCheck(batchId: string): Promise<ProductionExecutionStartCheck>;
  abstract withCardTransaction<T>(
    identifier: string,
    byNumber: boolean,
    action: (cardId: string) => Promise<T>,
  ): Promise<T>;
  abstract create(
    batchId: string,
    payload: CreateProductionTrackingCardPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract createBulk(
    batchId: string,
    payload: CreateProductionTrackingCardsPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardsCreatedResult>;
  abstract scan(
    cardId: string,
    payload: ScanProductionTrackingCardPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingScanResult>;
  abstract correctQuantity(
    cardId: string,
    payload: CorrectProductionTrackingQuantityPayload,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract void(
    cardId: string,
    payload: VoidProductionTrackingCardPayload,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract createAbnormality(
    cardId: string,
    payload: CreateProductionTrackingAbnormalityPayload,
    processStepId: string | null,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract handleAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: HandleProductionTrackingAbnormalityPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract confirmOutput(
    cardId: string,
    payload: ConfirmProductionTrackingOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail>;
  abstract confirmResearchOutput(
    batchId: string,
    payload: ConfirmProductionResearchOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingOutput>;
  abstract startTask(
    batchId: string,
    version: number,
    reason: string | null,
    context: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract finishTask(
    batchId: string,
    payload: FinishProductionTrackingTaskPayload,
    context: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract reopenTask(
    batchId: string,
    payload: ReopenProductionTrackingTaskPayload,
    context: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract sopReference(
    batchId: string,
    recordId: string,
  ): Promise<{ fileId: string; fileName: string; objectKey: string; versionNo: string }>;
}
