import type {
  ApproveScrapSupplementPayload,
  ApproveScrapSupplementResult,
  ProductionScrapSupplementPlanItem,
  ProductionSupplementCandidateItem,
  SaveProductionScrapSupplementPlanPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionSupplementRepository {
  abstract getPlan(dispositionId: string): Promise<ProductionScrapSupplementPlanItem | null>;
  abstract savePlan(
    dispositionId: string,
    payload: SaveProductionScrapSupplementPlanPayload,
    context: CommandContext,
  ): Promise<ProductionScrapSupplementPlanItem>;
  abstract getCandidateContext(
    dispositionId: string,
    materialEndStepRecordId: string,
  ): Promise<{
    routeStepIds: string[];
    candidates: ProductionSupplementCandidateItem[];
  }>;
  abstract approve(
    dispositionId: string,
    payload: ApproveScrapSupplementPayload,
    context: CommandContext,
    planReference?: { planId: string; version: number },
  ): Promise<ApproveScrapSupplementResult>;
}
