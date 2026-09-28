import type {
  PageResult,
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundCommandResult,
  ConfirmFinishedGoodsInboundPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProductionFinishedInboundRepository {
  abstract list(
    query: FinishedGoodsInboundQuery,
  ): Promise<PageResult<FinishedGoodsInboundOrderItem>>;
  abstract candidates(
    query: FinishedGoodsInboundCandidateQuery,
  ): Promise<PageResult<FinishedGoodsInboundCandidate>>;
  abstract get(id: string): Promise<FinishedGoodsInboundOrderDetail>;
  abstract confirm(
    payload: ConfirmFinishedGoodsInboundPayload,
    context: CommandContext,
  ): Promise<FinishedGoodsInboundCommandResult>;
}
