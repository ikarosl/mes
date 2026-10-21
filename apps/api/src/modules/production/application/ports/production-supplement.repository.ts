import type {
  ApproveScrapSupplementResult,
  ConfirmProductionScrapSupplementPlanPayload,
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
  abstract getCandidateContext(dispositionId: string): Promise<{
    candidates: ProductionSupplementCandidateItem[];
  }>;
  abstract confirmPlan(
    dispositionId: string,
    payload: ConfirmProductionScrapSupplementPlanPayload,
    context: CommandContext,
  ): Promise<ApproveScrapSupplementResult>;
}
