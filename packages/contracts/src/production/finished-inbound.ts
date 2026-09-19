import type { PageQuery, ReasonedVersionedCommand, VersionedCommand } from '../common.js';
import type { InboundOrderStatus } from './statuses.js';
import type { ProductionOutputRevision } from './output.js';

export type FinishedGoodsInboundSource = 'self_made' | 'production_extra';

export interface FinishedGoodsInboundQuery extends PageQuery {
  keyword?: string;
  sourceType?: FinishedGoodsInboundSource;
  status?: InboundOrderStatus;
}

export interface FinishedGoodsInboundCandidateQuery extends PageQuery {
  keyword?: string;
  sourceType: FinishedGoodsInboundSource;
}

export interface FinishedGoodsInboundCandidate {
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  sourceType: FinishedGoodsInboundSource;
  outputRevisionId: string;
  revisionNo: number;
  approvedQuantity: string;
  pendingInboundId: string | null;
  completedInboundId: string | null;
  canCreate: boolean;
  blockers: string[];
}

export interface FinishedGoodsInboundOrderItem {
  inboundId: string;
  inboundNo: string;
  sourceType: FinishedGoodsInboundSource;
  status: InboundOrderStatus;
  version: number;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  outputRevisionId: string;
  currentOutputRevisionId: string;
  revisionNo: number;
  inboundQuantity: string;
  batchCode: string;
  itemBatchId: string | null;
  inventoryTransactionId: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  operatorId: string | null;
  operatorName: string | null;
  inboundAt: string | null;
  remark: string | null;
  cancelReason: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  canEdit: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  blockers: string[];
}

export interface FinishedGoodsInboundOrderDetail extends FinishedGoodsInboundOrderItem {
  /** 仓管在入库权限内读取实际采用的批准依据，无需任务管理权限。 */
  approvedOutput: ProductionOutputRevision;
  /** 最新批准依据；明确展示旧单接受新版前后的差额。 */
  currentApprovedOutput: ProductionOutputRevision;
}

export interface CreateFinishedGoodsInboundPayload {
  productionBatchId: string;
  sourceType: FinishedGoodsInboundSource;
  outputRevisionId: string;
  batchCode: string;
  remark?: string | null;
}

export interface UpdateFinishedGoodsInboundPayload extends VersionedCommand {
  outputRevisionId: string;
  batchCode: string;
  remark?: string | null;
}

export interface ConfirmFinishedGoodsInboundPayload extends VersionedCommand {
  outputRevisionId: string;
}

export type CancelFinishedGoodsInboundPayload = ReasonedVersionedCommand;

export interface FinishedGoodsInboundCommandResult {
  inboundId: string;
}
