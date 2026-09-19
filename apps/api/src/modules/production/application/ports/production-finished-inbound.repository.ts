import type {
  PageResult,
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundCommandResult,
  CreateFinishedGoodsInboundPayload,
  UpdateFinishedGoodsInboundPayload,
  ConfirmFinishedGoodsInboundPayload,
  CancelFinishedGoodsInboundPayload,
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
  abstract create(
    payload: CreateFinishedGoodsInboundPayload,
    context: CommandContext,
  ): Promise<FinishedGoodsInboundCommandResult>;
  abstract update(
    id: string,
    payload: UpdateFinishedGoodsInboundPayload,
    context: CommandContext,
  ): Promise<FinishedGoodsInboundCommandResult>;
  abstract confirm(
    id: string,
    payload: ConfirmFinishedGoodsInboundPayload,
    context: CommandContext,
  ): Promise<FinishedGoodsInboundCommandResult>;
  abstract cancel(
    id: string,
    payload: CancelFinishedGoodsInboundPayload,
    context: CommandContext,
  ): Promise<FinishedGoodsInboundCommandResult>;
}
