import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
  OtherStockCandidate,
  OtherStockCandidateQuery,
  PageResult,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class OtherInventoryRepository {
  abstract list(
    direction: OtherInventoryDirection,
    query: OtherInventoryOrderQuery,
  ): Promise<PageResult<OtherInventoryOrder>>;
  abstract get(direction: OtherInventoryDirection, id: string): Promise<OtherInventoryOrder>;
  abstract candidates(query: OtherStockCandidateQuery): Promise<PageResult<OtherStockCandidate>>;
  abstract create(
    direction: OtherInventoryDirection,
    payload: OtherInventoryDraftPayload,
    context: CommandContext,
  ): Promise<OtherInventoryOrder>;
  abstract save(
    direction: OtherInventoryDirection,
    id: string,
    payload: SaveOtherInventoryDraftPayload,
    context: CommandContext,
  ): Promise<OtherInventoryOrder>;
  abstract confirm(
    direction: OtherInventoryDirection,
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<OtherInventoryOrder>;
  abstract cancel(
    direction: OtherInventoryDirection,
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<OtherInventoryOrder>;
}
