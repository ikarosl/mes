import type { ProcurementSupplierSummary } from './purchase-orders.js';
import type { PageQuery } from '../common.js';
import type {
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundInspectionInput,
  QualityInboundCaseQuery,
} from '../quality/inbound-inspections.js';

export type ReceiptRoundStatus =
  | 'uninspected'
  | 'reviewing'
  | 'reinspection_required'
  | 'quality_rejected'
  | 'awaiting_acceptance'
  | 'finalized'
  | 'superseded';
export type ReceiptRoundTrigger =
  | 'receipt'
  | 'receipt_correction'
  | 'review'
  | 'acceptance_correction'
  | 'manual_rejection'
  | 'rejection_revocation';
export interface ReceiptRoundItem {
  id: string;
  receiptLineId: string;
  roundNo: number;
  previousRoundId: string | null;
  triggerType: ReceiptRoundTrigger;
  receiptRevisionId: string;
  startingQuantity: string;
  status: ReceiptRoundStatus;
  inspectionId: string | null;
  reason: string;
  version: number;
  createdBy: string;
  createdAt: string;
}
export interface ProcurementReceiptQuery extends PageQuery {
  awaitingAcceptance?: 'yes';
  keyword?: string;
  supplierId?: string;
  purchaseOrderId?: string;
}
export interface ProcurementReceiptItem {
  awaitingAcceptanceCount: number;
  id: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  suppliers: ProcurementSupplierSummary[];
  receivedAt: string;
  handoverEvidence: string;
  remark: string | null;
  createdAt: string;
  lineCount: number;
}
export interface ReceiptQuantitySummary {
  unprocessedQuantity: string;
  receivedQuantity: string;
  undeterminedQuantity: string;
  approvedQuantity: string;
  inboundQuantity: string;
  returnDueQuantity: string;
  returnedQuantity: string;
  qualityReturnedQuantity: string;
  pendingInboundQuantity: string;
  pendingReturnQuantity: string;
  hasOpenReview: boolean;
}
export interface ReceiptRevisionItem {
  id: string;
  receiptLineId: string;
  revisionNo: number;
  previousRevisionId: string | null;
  receivedQuantity: string;
  reason: string;
  physicalIdentityConfirmed: boolean;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptAllocationItem {
  id: string;
  receiptLineId: string;
  roundId: string;
  acceptanceId: string | null;
  purchaseOrderLineId: string | null;
  purchaseNo: string | null;
  receiptRevisionId: string;
  inspectionId: string | null;
  quantity: string;
  inboundQuantity: string;
  returnedQuantity: string;
  remainingQuantity: string;
  isCurrent: boolean;
  disposition: ReceiptAllocationDisposition;
  returnReason: ReceiptReturnReason | null;
  terminationReason: string | null;
  remark: string | null;
  createdBy: string;
  createdAt: string;
}
export interface SupplierReturnItem {
  allocationId: string;
  id: string;
  returnNo: string;
  receiptLineId: string;
  receiptRevisionId: string;
  inspectionId: string | null;
  reasonType: ReceiptReturnReason;
  returnedQuantity: string;
  returnedAt: string;
  handoverEvidence: string;
  remark: string | null;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptInboundHistoryItem {
  allocationId: string;
  inboundId: string;
  inboundNo: string;
  inboundDetailId: string;
  transactionId: string;
  batchId: string;
  batchCode: string;
  inspectionId: string;
  receiptRevisionId: string;
  quantity: string;
  confirmedAt: string;
}
export interface ReceiptInspectionExecution {
  inboundQuantity: string;
  qualityReturnedQuantity: string;
  otherReturnedQuantity: string;
}
export interface ProcurementReceiptLine {
  currentRound: ReceiptRoundItem;
  /** 当前引用的同一份检验所关联的真实执行量；没有当前检验时各项为 0。 */
  currentInspectionExecution: ReceiptInspectionExecution;
  /** 最近未消费执行份额的采购归属，仅作更正和拒收的人工核对来源。 */
  ownershipSources: Array<{ purchaseOrderLineId: string; purchaseNo: string; quantity: string }>;
  ownershipSourceQuantity: string;
  rounds: ReceiptRoundItem[];
  supplierId: string;
  supplierName: string;
  id: string;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  purchaseOrderLineId: string;
  /** 原采购行计划量减当前正式已授权履约量，供本批定稿初值参考。 */
  originalRemainingPlannedQuantity: string;
  /** 登记来源采购行的持久行号，区别于本到货单的 lineNo。 */
  purchaseOrderLineNo: number;
  lineNo: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  currentReceiptRevisionId: string;
  batches: Array<{ batchId: string; batchCode: string }>;
  overReceiptNote: string | null;
  version: number;
  quantities: ReceiptQuantitySummary;
  revisions: ReceiptRevisionItem[];
  allocations: ReceiptAllocationItem[];
  cases: QualityInboundCaseItem[];
  returns: SupplierReturnItem[];
  inbounds: ReceiptInboundHistoryItem[];
  acceptances: ReceiptAcceptanceItem[];
  historyTotals: Record<ReceiptHistoryKind, number>;
}
export interface ProcurementReceiptLineListItem extends Pick<
  ProcurementReceiptLine,
  | 'id'
  | 'receiptId'
  | 'purchaseOrderId'
  | 'purchaseOrderLineId'
  | 'purchaseOrderLineNo'
  | 'lineNo'
  | 'itemId'
  | 'itemCode'
  | 'itemName'
  | 'materialVariantId'
  | 'materialVariantCode'
  | 'unit'
  | 'supplierId'
  | 'supplierName'
  | 'supplierBatchCode'
  | 'currentRound'
  | 'quantities'
> {
  receiptNo: string;
  purchaseNo: string;
  receivedAt: string;
}
/** 质检详情及录入核对；不携带仓库分配、执行明细或历史预览。 */
export interface ProcurementInboundInspectionDetail extends Pick<
  ProcurementReceiptLine,
  | 'id'
  | 'receiptId'
  | 'receiptNo'
  | 'purchaseNo'
  | 'purchaseOrderLineId'
  | 'lineNo'
  | 'itemCode'
  | 'itemName'
  | 'materialVariantCode'
  | 'unit'
  | 'supplierName'
  | 'supplierBatchCode'
  | 'version'
  | 'currentReceiptRevisionId'
  | 'currentRound'
> {
  /** 实物范围；累计量仅供录入时解释剩余范围，不含授权数量。 */
  quantities: Pick<
    ReceiptQuantitySummary,
    'receivedQuantity' | 'inboundQuantity' | 'returnedQuantity' | 'unprocessedQuantity'
  >;
  /** 仅当前轮在途办理和当前明确引用的检验。 */
  cases: QualityInboundCaseItem[];
  /** 仅上述检验的来源轮号，不是历史轮次预览。 */
  rounds: Array<Pick<ReceiptRoundItem, 'id' | 'roundNo'>>;
}
export interface ProcurementReceiptDetail extends ProcurementReceiptItem {
  items: ProcurementReceiptLine[];
}
export interface ConfirmProcurementReceiptPayload {
  purchaseOrderId: string;
  purchaseOrderVersion: number;
  receivedAt: string;
  handoverEvidence: string;
  remark?: string | null;
  details: Array<{
    purchaseOrderLineId: string;
    version: number;
    receivedQuantity: number;
    supplierBatchCode?: string | null;
    overReceiptNote?: string | null;
  }>;
}
/** 拒收时，库管确认剩余实物的既有采购归属。 */
export interface ReceiptOwnershipInput {
  purchaseOrderLineId: string;
  quantity: number;
}
export interface CorrectReceiptLinePayload {
  roundId: string;
  roundVersion: number;
  version: number;
  previousRevisionId: string;
  receivedQuantity: number;
  reason: string;
  physicalIdentityConfirmed: true;
}
export interface StartReceiptReviewPayload {
  version: number;
  roundId: string;
  roundVersion: number;
  caseType: Exclude<QualityInboundCaseType, 'receipt_correction'>;
  reason: string;
}
export interface RejectReceiptLinePayload {
  version: number;
  roundId: string;
  roundVersion: number;
  reason: string;
  ownership?: ReceiptOwnershipInput[];
}
export interface RevokeReceiptRejectionPayload {
  version: number;
  roundId: string;
  roundVersion: number;
  reason: string;
}
export interface InspectReceiptLinePayload extends QualityInboundInspectionInput {
  roundId: string;
  roundVersion: number;
  version: number;
  caseId: string;
  caseVersion: number;
  receiptRevisionId: string;
}
export interface ConfirmSupplierReturnPayload {
  roundId: string;
  roundVersion: number;
  version: number;
  allocationId: string;
  receiptRevisionId: string;
  returnedAt: string;
  handoverEvidence: string;
  remark?: string | null;
}
/** 命令后按 receiptId 重新查询最新详情；整批复检使用当前轮的单个办理。 */
export interface ProcurementReceiptCommandResult {
  roundId?: string | null;
  acceptanceId?: string;
  receiptId: string;
  receiptLineId: string | null;
  caseIds: string[];
  inspectionId: string | null;
  supplierReturnId: string | null;
}
export interface ProcurementInboundInspectionQuery extends Omit<QualityInboundCaseQuery, 'status'> {
  roundStatus?: ReceiptRoundStatus;
  currentRoundStatus?: ReceiptRoundStatus;
  keyword?: string;
  supplierId?: string;
  status?: 'uninspected' | 'reviewing' | 'completed' | 'superseded';
}
export interface ProcurementInboundInspectionItem {
  roundId: string;
  roundVersion: number;
  roundStatus: ReceiptRoundStatus;
  sourceRoundNo: number;
  currentRound: Pick<ReceiptRoundItem, 'id' | 'roundNo' | 'status' | 'inspectionId'>;
  isCurrentlyAdopted: boolean;
  isInherited: boolean;
  taskKey: string;
  taskKind: 'uninspected' | 'case';
  case: QualityInboundCaseItem | null;
  receiptLineId: string;
  receiptLineNo: number;
  receiptLineVersion: number;
  coveredQuantity: string;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
}
export type ReceiptHistoryKind =
  'rounds' | 'revisions' | 'allocations' | 'cases' | 'returns' | 'inbounds' | 'acceptances';
export type ReceiptHistoryItem =
  | ReceiptRoundItem
  | ReceiptRevisionItem
  | ReceiptAllocationItem
  | QualityInboundCaseItem
  | SupplierReturnItem
  | ReceiptInboundHistoryItem
  | ReceiptAcceptanceItem;

export type ReceiptAllocationDisposition = 'inbound' | 'return' | 'pending';
export type ReceiptReturnReason =
  'quality' | 'excess' | 'procurement_termination' | 'manual_rejection';
export interface ReceiptAllocationInput {
  purchaseOrderLineId: string | null;
  disposition: ReceiptAllocationDisposition;
  quantity: number;
  returnReason: ReceiptReturnReason | null;
  remark?: string | null;
}
export interface ConfirmReceiptAcceptancePayload {
  roundId: string;
  roundVersion: number;
  confirmedQuantity: number;
  overrideReason?: string | null;
  version: number;
  receiptRevisionId: string;
  caseId: string;
  inspectionId: string;
  physicalIdentityConfirmed: true;
  remark: string;
  details: ReceiptAllocationInput[];
}
export interface ReceiptAllocationDetailItem {
  id: string;
  purchaseOrderLineId: string | null;
  purchaseNo: string | null;
  disposition: ReceiptAllocationDisposition;
  quantity: string;
  returnReason: ReceiptReturnReason | null;
  remark: string | null;
}
export interface ReceiptAcceptanceItem {
  id: string;
  receiptLineId: string;
  inspectionId: string;
  roundId: string;
  overrideReason: string | null;
  beforeReceiptRevisionId: string;
  afterReceiptRevisionId: string;
  confirmedScopeQuantity: string;
  previousAcceptanceId: string | null;
  remark: string;
  createdBy: string;
  createdAt: string;
  details: ReceiptAllocationDetailItem[];
}
export interface ReceiptAllocationCandidate {
  purchaseOrderLineId: string;
  purchaseOrderId: string;
  purchaseNo: string;
  plannedQuantity: string;
  fulfillmentMode: 'new_arrival' | 'existing_receipt';
  isOriginal: boolean;
  remainingBindingQuantity: string | null;
}
export interface ReceiptAllocationCandidateQuery {
  keyword?: string;
  includeIds?: string[];
}
export interface ReceiptAllocationCandidateResult {
  items: ReceiptAllocationCandidate[];
  resolved: ReceiptAllocationCandidate[];
  hasMore: boolean;
}
