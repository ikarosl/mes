import type { ProcurementSupplierSummary } from './purchase-orders.js';
import type { PageQuery, ReasonedVersionedCommand } from '../common.js';
import type {
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundInspectionInput,
  QualityInboundInspectionItem,
} from '../quality/inbound-inspections.js';

export type ReceiptRoundStatus =
  | 'uninspected'
  | 'reviewing'
  | 'reinspection_required'
  | 'quality_rejected'
  | 'awaiting_acceptance'
  | 'finalized'
  | 'voided'
  | 'superseded';
/** 当前到货行的展示阶段，不改变轮次状态或执行资格。 */
export type ReceiptLineStage =
  | 'uninspected'
  | 'reviewing'
  | 'reinspection_required'
  | 'quality_rejected'
  | 'awaiting_acceptance'
  | 'finalized'
  | 'manual_rejection'
  | 'voided'
  | 'completed';
export type ReceiptRoundTrigger =
  | 'receipt'
  | 'receipt_correction'
  | 'review'
  | 'acceptance_correction'
  | 'manual_rejection'
  | 'rejection_revocation'
  | 'receipt_void';
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
  void: ProcurementReceiptVoidItem | null;
  version: number;
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
  /** 当前有效到货量；作废登记为 0，原核实总量保留于 revision 历史。 */
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
/** 到货行来源、当前轮和处置数量，不携带历史、检验或采购行投影。 */
export interface ProcurementReceiptLineOverview {
  void: ProcurementReceiptVoidItem | null;
  currentRound: ReceiptRoundItem;
  supplierId: string;
  supplierName: string;
  id: string;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  purchaseOrderLineId: string;
  /** 登记来源采购行的持久行号；到货明细以 id 标识。 */
  purchaseOrderLineNo: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  currentReceiptRevisionId: string;
  /** 当前实收修订的原核实总量；登记作废后仍保留。 */
  registeredQuantity: string;
  overReceiptNote: string | null;
  version: number;
  quantities: ReceiptQuantitySummary;
}
/** 当前行处置视图；分配仅含当前 finalized 轮，包含已执行完的行。 */
export interface ProcurementReceiptLine extends ProcurementReceiptLineOverview {
  /** 来源采购行的计划与有效累计到货量；累计含本批及已退回，不含作废登记。 */
  purchaseLineQuantities: {
    plannedQuantity: string;
    receivedQuantity: string;
  };
  allocations: ReceiptAllocationItem[];
}
/** 库管定稿所需的当前明确检验依据及同快照参考，不表示有定稿资格。 */
export interface ProcurementReceiptAcceptanceContext extends ProcurementReceiptLine {
  currentInspectionCase: QualityInboundCaseItem | null;
  inspectionSourceRoundNo: number | null;
  /** 当前引用的同一份检验所关联的真实执行量；没有当前检验时各项为 0。 */
  currentInspectionExecution: ReceiptInspectionExecution;
  /** 原采购行计划量减当前正式已授权履约量，供本批定稿初值参考。 */
  originalRemainingPlannedQuantity: string;
}
/** 整单详情的轻量目录；行操作按 id 读取当前行。 */
export interface ProcurementReceiptLineIndexItem extends Pick<
  ProcurementReceiptLineOverview,
  'id' | 'itemCode' | 'itemName' | 'materialVariantCode' | 'supplierName' | 'supplierBatchCode'
> {
  /** 仅用于目录展示，不代表办理资格；superseded 保留异常当前轮的展示兜底。 */
  stage: ReceiptLineStage | 'superseded';
}
/** 到货与来料工作列表共用的来源展示；分页单位始终为到货明细。 */
export interface ProcurementReceiptListSource {
  void: ProcurementReceiptVoidItem | null;
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierName: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
}
export interface ProcurementReceiptLineListItem
  extends
    ProcurementReceiptListSource,
    Pick<
      ProcurementReceiptLineOverview,
      'id' | 'supplierBatchCode' | 'currentRound' | 'quantities'
    > {
  receivedAt: string;
}
/** 质检详情及录入核对；不携带仓库分配、执行明细或历史预览。 */
export interface ProcurementInboundInspectionDetail extends Pick<
  ProcurementReceiptLineOverview,
  | 'id'
  | 'receiptId'
  | 'receiptNo'
  | 'purchaseNo'
  | 'purchaseOrderLineId'
  | 'itemCode'
  | 'itemName'
  | 'materialVariantCode'
  | 'unit'
  | 'supplierName'
  | 'supplierBatchCode'
  | 'version'
  | 'currentReceiptRevisionId'
  | 'currentRound'
  | 'void'
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
export interface ProcurementReceiptDetail extends Pick<
  ProcurementReceiptItem,
  'void' | 'id' | 'receiptNo' | 'purchaseNo' | 'receivedAt' | 'handoverEvidence' | 'remark'
> {
  items: ProcurementReceiptLineIndexItem[];
}
export interface ProcurementReceiptVoidingDetail extends ProcurementReceiptItem {
  items: ProcurementReceiptLineOverview[];
  /** 整单作废预览；lines 为完整行集合，不受明细或历史分页限制。 */
  voiding: ProcurementReceiptVoiding;
}
export interface ProcurementReceiptVoidItem {
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface ReceiptVoidLineVersion {
  receiptLineId: string;
  version: number;
  roundId: string;
  roundVersion: number;
}
export interface ProcurementReceiptVoiding {
  canVoid: boolean;
  blockedReason: string | null;
  lines: ReceiptVoidLineVersion[];
}
export interface VoidProcurementReceiptPayload extends ReasonedVersionedCommand {
  lines: ReceiptVoidLineVersion[];
}
export interface VoidProcurementReceiptCommandResult {
  receiptId: string;
  version: number;
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
export interface ProcurementInboundInspectionQuery extends PageQuery {
  stage?: ReceiptLineStage;
  keyword?: string;
  supplierId?: string;
  receiptLineIds?: string[];
}
export interface ProcurementInboundInspectionCaseSummary extends Pick<
  QualityInboundCaseItem,
  'id' | 'status'
> {
  inspection: Pick<QualityInboundInspectionItem, 'id' | 'releaseDecision'> | null;
}
/** 每条到货行一项，只含当前轮和当前检验摘要，历史独立分页读取。 */
export interface ProcurementInboundInspectionLineItem extends ProcurementReceiptListSource {
  stage: ReceiptLineStage;
  currentRound: Pick<ReceiptRoundItem, 'roundNo' | 'status' | 'triggerType'>;
  /** 当前剩余实物，仅供展示当前整批阶段，不表示检验记录状态或可执行授权。 */
  quantities: Pick<ReceiptQuantitySummary, 'unprocessedQuantity'>;
  currentCase: ProcurementInboundInspectionCaseSummary | null;
  currentCaseRoundNo: number | null;
  isInherited: boolean;
  receiptLineId: string;
}
/** 按真实 case ID 精确定位历史检验，不包含当前轮或当前实物数量。 */
export interface ProcurementInboundInspectionCaseDetail {
  receiptLineId: string;
  sourceRoundNo: number;
  case: QualityInboundCaseItem;
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
