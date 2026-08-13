import type {
  ApproveScrapSupplementPayload,
  ApproveScrapSupplementResult,
  ProductionSupplementCandidateItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionSupplementRepository {
  abstract getCandidateContext(dispositionId: string): Promise<{
    routeStepIds: string[];
    candidates: ProductionSupplementCandidateItem[];
  }>;
  abstract approve(
    dispositionId: string,
    payload: ApproveScrapSupplementPayload,
    context: CommandContext,
  ): Promise<ApproveScrapSupplementResult>;
}
