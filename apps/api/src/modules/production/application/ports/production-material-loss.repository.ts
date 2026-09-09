import type {
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionMaterialLossRepository {
  abstract listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>>;
  abstract getMaterialLoss(scrapId: string): Promise<MaterialLossItem>;
  abstract listMaterialLossBatchOptions(): Promise<MaterialLossBatchOption[]>;
  abstract listMaterialLossCandidates(batchId: string): Promise<MaterialLossCandidateItem[]>;
  abstract createMaterialLoss(
    payload: CreateMaterialLossPayload,
    context: CommandContext,
  ): Promise<MaterialLossItem>;
  abstract confirmMaterialLoss(
    scrapId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialLossItem>;
  abstract cancelMaterialLoss(
    scrapId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<MaterialLossItem>;
}
