export type AuthTokenKind = 'access' | 'refresh';

export interface LoginRequest {
  username: string;
  password: string;
}
export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}
export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: UserProfile;
}
export interface JwtClaims {
  sub: string;
  username: string;
  kind: AuthTokenKind;
  exp: number;
  iat: number;
  jti?: string;
}
export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  departmentName: string | null;
  status: number;
  roles: string[];
  lastLoginAt: string | null;
}
export interface RoleListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: number;
  permissionIds: string[];
}
export interface PermissionListItem {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  type: PermissionType;
  routePath: string | null;
  status: number;
}
export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  departmentId?: string | null;
  roleIds: string[];
}
export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string | null;
}

/* ====== 分页通用类型 ====== */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** All HTTP failure responses use this shared envelope. */
export interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  path: string;
}

/** Required by future mutable business-document commands. */
export interface VersionedCommand {
  version: number;
}

/* ====== 系统管理模块（移植旧项目 SystemUI 使用） ====== */
/** 系统用户列表项 */
export interface SystemUserListItem {
  id: string;
  username: string;
  displayName: string;
  departmentId: string | null;
  departmentName: string | null;
  email: string | null;
  mobile: string | null;
  roleIds: string[];
  roles: string[];
  status: number;
  lastLoginAt: string | null;
}
export interface SystemRoleListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  permissionCount: number;
  userCount: number;
  status: number;
  updatedAt: string | null;
}
export interface SystemPermissionListItem {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  type: PermissionType;
  routePath: string | null;
  apiMethod: string | null;
  apiPath: string | null;
  status: number;
}
export interface SystemPermissionTreeNode extends SystemPermissionListItem {
  children: SystemPermissionTreeNode[];
}
export interface SystemRolePermissionDetail {
  roleId: string;
  permissionIds: string[];
}
export interface OperationLogListItem {
  id: string;
  logType: string;
  module: string;
  action: string;
  userId: string | null;
  username: string | null;
  targetId: string | null;
  targetType: string | null;
  targetIds: unknown;
  businessKey: string | null;
  result: OperationResult;
  requestId: string | null;
  httpMethod: string | null;
  route: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  requestData: unknown;
  beforeData: unknown;
  afterData: unknown;
  ip: string | null;
  userAgent: string | null;
  errorCode: string | null;
  remark: string | null;
  createdAt: string;
}
export interface SystemDepartmentOption {
  id: string;
  parentId: string;
  name: string;
  code: string;
}
export interface SystemRoleOption {
  id: string;
  name: string;
  code: string;
}

export interface SystemUserQuery extends PageQuery {
  keyword?: string;
  username?: string;
  displayName?: string;
  roleId?: string;
  status?: number;
}

export interface SystemRoleQuery extends PageQuery {
  keyword?: string;
  name?: string;
  code?: string;
  status?: number;
}

/* ====== 系统模块请求体类型 ====== */
export interface CreateSystemUserPayload {
  username: string;
  password: string;
  displayName: string;
  departmentId?: string | null;
  email?: string | null;
  mobile?: string | null;
  status?: number | boolean;
  roleIds?: string[];
}
export interface UpdateSystemUserPayload {
  username?: string;
  displayName?: string;
  departmentId?: string | null;
  email?: string | null;
  mobile?: string | null;
}
export interface UpdateSystemUserStatusPayload {
  status: number | boolean;
}
export interface ResetSystemUserPasswordPayload {
  password: string;
}
export interface AssignSystemUserRolesPayload {
  roleIds: string[];
}
export interface CreateSystemRolePayload {
  name: string;
  code: string;
  description?: string | null;
  status?: number | boolean;
}
export interface UpdateSystemRolePayload {
  name?: string;
  code?: string;
  description?: string | null;
  status?: number | boolean;
}
export interface AssignSystemRolePermissionsPayload {
  permissionIds: string[];
}

export interface OperationLogQuery extends PageQuery {
  keyword?: string;
  logType?: string;
  module?: string;
  result?: OperationResult;
  userId?: string;
  requestId?: string;
  targetType?: string;
  targetId?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export type ProductItemKind = 'material' | 'semi_finished' | 'finished_product';
export type ProductAcquireMethod = 'self_made' | 'outsourced' | 'purchased';
export type ProcessRouteStatus = 'draft' | 'enabled' | 'disabled' | 'archived';
export type TechnicalFileStorageProvider = 's3';
export type TechnicalFileType = 'sop';

export interface ProductListQuery extends PageQuery {
  keyword?: string;
  categoryId?: string;
  acquireMethod?: ProductAcquireMethod;
  status?: number;
}

export interface ProcessRouteQuery extends PageQuery {
  keyword?: string;
  status?: ProcessRouteStatus;
}

export interface ProductCategoryQuery extends PageQuery {
  categoryCode?: string;
  categoryName?: string;
  status?: number;
}

export interface ProcessStepQuery extends PageQuery {
  keyword?: string;
  status?: number;
}

export interface TechnicalFileQuery extends PageQuery {
  keyword?: string;
  status?: number;
  storageProvider?: TechnicalFileStorageProvider;
}

export interface TechnicalFileListItem {
  id: string;
  fileName: string;
  originalName: string;
  storageProvider: TechnicalFileStorageProvider;
  bucket: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: TechnicalFileType;
  versionNo: string;
  status: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SetDefaultSopPayload {
  fileId: string | null;
}

export interface ProductCategoryListItem {
  id: string;
  parentId: string | null;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  status: number;
  remark: string | null;
  updatedAt: string | null;
}

/** 分类表单下拉选项；默认排除停用、删除记录。 */
export interface ProductCategoryOption {
  id: string;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
}

export interface ProductCategoryPayload {
  parentId?: string | null;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  status: number;
  remark?: string | null;
}

export interface ProductSpecValue {
  key: string;
  value: string;
  unit?: string;
}

export interface ProductListItem {
  id: string;
  itemCode: string;
  productName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  defaultRouteId: string | null;
  defaultRouteName: string | null;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues: ProductSpecValue[];
  status: number;
  materialCount: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProductPayload {
  itemCode: string;
  productName: string;
  categoryId: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues?: ProductSpecValue[];
  status: number;
  remark?: string | null;
}

export interface ProductOption {
  id: string;
  itemCode: string;
  productName: string;
  itemKind: ProductItemKind;
  acquireMethod: ProductAcquireMethod;
  unit: string;
  defaultRouteId: string | null;
}

export interface ProductMaterialItem {
  id: string;
  materialProductId: string;
  itemCode: string;
  productName: string;
  itemKind: ProductItemKind;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  status: number;
  remark: string | null;
}

export interface ProductMaterialPayload {
  materialProductId: string;
  quantityPerUnit: number;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  status?: number;
  remark?: string | null;
}

export interface ProcessStepListItem {
  id: string;
  stepCode: string;
  stepName: string;
  description: string | null;
  defaultSopFileId: string | null;
  sopFileName: string | null;
  status: number;
  remark: string | null;
  updatedAt: string | null;
}

/** 标准工序表单下拉选项；默认排除停用、删除记录。 */
export interface ProcessStepOption {
  id: string;
  stepCode: string;
  stepName: string;
  sopFileName: string | null;
}

export interface ProcessStepPayload {
  stepCode: string;
  stepName: string;
  description?: string | null;
  status: number;
  remark?: string | null;
}

export interface ProcessRouteListItem {
  id: string;
  routeCode: string;
  routeName: string;
  productId: string;
  itemCode: string;
  productName: string;
  versionNo: string;
  status: ProcessRouteStatus;
  processSummary: string | null;
  stepCount: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProcessRouteOption {
  id: string;
  routeCode: string;
  routeName: string;
  productId: string;
  versionNo: string;
  status: ProcessRouteStatus;
}

export interface ProcessRoutePayload {
  routeCode: string;
  routeName: string;
  productId: string;
  versionNo: string;
  remark?: string | null;
}

export interface ProcessRouteStepItem {
  id: string;
  processStepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  description: string | null;
  defaultOwnerId: string | null;
  defaultOwnerName: string | null;
  sopFileId: string | null;
  sopFileName: string | null;
  needInspection: boolean;
  needRecord: boolean;
  status: number;
  remark: string | null;
  productMaterialIds: string[];
}

export interface ProcessRouteStepPayload {
  processStepId: string;
  stepOrder: number;
  defaultOwnerId?: string | null;
  sopFileId?: string | null;
  needInspection: boolean;
  needRecord: boolean;
  status?: number;
  remark?: string | null;
  productMaterialIds?: string[];
}

export interface UserOption {
  id: string;
  displayName: string;
}

export interface WorkOrderQuery extends PageQuery {
  keyword?: string;
  productId?: string;
  status?: WorkOrderStatus;
}

/** 任务表单已下达工单候选（/production/work-orders/options）：仅已下达且仍有余量的工单。 */
export interface WorkOrderOption {
  id: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  /** 剩余可分配数量 = 计划数量 - 已分配数量 */
  remainingQuantity: string;
}

export interface ProductionBatchQuery extends PageQuery {
  keyword?: string;
  workOrderId?: string;
  status?: ProductionBatchStatus;
  ownerId?: string;
}

export interface WorkOrderItem {
  id: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  plannedQuantity: string;
  customerName: string | null;
  qualityLevel: string | null;
  workOrderOwnerId: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
  assignedQuantity: string;
  status: WorkOrderStatus;
  releasedAt: string | null;
  externalOrderNo: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionBatchItem {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  routeId: string | null;
  routeCode: string | null;
  routeVersion: string | null;
  plannedQuantity: string;
  completedQuantity: string;
  qualifiedQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
  startedAt: string | null;
  status: ProductionBatchStatus;
  ownerId: string | null;
  ownerName: string | null;
  completedAt: string | null;
  completedBy: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchStepRecordItem {
  id: string;
  productionBatchId: string;
  routeStepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  defaultSopFileId: string | null;
  defaultSopFileName: string | null;
  defaultSopVersionNo: string | null;
  actualSopFileId: string | null;
  actualSopFileName: string | null;
  actualSopVersionNo: string | null;
  defaultResponsibleUserId: string | null;
  defaultResponsibleUserName: string | null;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  needRecord: boolean;
  needInspection: boolean;
  status: BatchStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  outputQuantity: string;
  qualifiedQuantity: string;
  abnormalQuantity: string;
  reworkQuantity: string;
  unit: string;
  remark: string | null;
  version: number;
}

export interface WorkOrderDetail extends WorkOrderItem {
  batches: ProductionBatchItem[];
}

export interface ProductionBatchDetail extends ProductionBatchItem {
  stepRecords: BatchStepRecordItem[];
}

export interface ProductionItemDemandItem {
  id: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  plannedOutputQuantity: string;
  needNumber: string;
  demandType: DemandType;
  businessStatus: DemandBusinessStatus;
  version: number;
}

export type MaterialDemandProgressStatus =
  | 'pending_allocation'
  | 'partially_allocated'
  | 'allocated'
  | 'shortage'
  | 'partially_outbound'
  | 'outbound'
  | 'unknown'
  | DemandBusinessStatus;

export interface ProductionMaterialAllocationItem {
  allocationId: string;
  demandId: string;
  productionBatchId: string;
  itemId: string;
  itemBatchId: string;
  batchCode: string;
  assignedQuantity: string;
  outboundQuantity: string;
  pendingOutboundQuantity: string;
  availableToOrderQuantity: string;
  remainingOutboundQuantity: string;
  unit: string;
  allocationStatus: AllocationStatus;
  version: number;
  remark: string | null;
  createdAt: string;
}

export interface ProductionMaterialDemandItem {
  demandId: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  demandQuantity: string;
  allocatedQuantity: string;
  outboundQuantity: string;
  remainingQuantity: string;
  demandType: DemandType;
  businessStatus: DemandBusinessStatus;
  progressStatus: MaterialDemandProgressStatus;
  version: number;
  allocations: ProductionMaterialAllocationItem[];
}

export interface AvailableItemBatchItem {
  itemBatchId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchCode: string;
  unit: string;
  sourceType: InventorySourceType;
  provider: string | null;
  productionDate: string | null;
  onHandAvailableQuantity: string;
  reservedQuantity: string;
  availableToAllocateQuantity: string;
}

export interface CreateMaterialAllocationLinePayload {
  demandId: string;
  itemBatchId: string;
  assignedQuantity: number;
  remark?: string | null;
}

export interface CreateMaterialAllocationsPayload {
  allocations: CreateMaterialAllocationLinePayload[];
}

export interface MaterialAllocationCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  allocations: ProductionMaterialAllocationItem[];
}

export type ReleaseMaterialAllocationPayload = VersionedCommand;

export interface CreateMaterialOutboundDetailPayload {
  allocationId: string;
  outboundQuantity: number;
}

export interface CreateMaterialOutboundPayload {
  details: CreateMaterialOutboundDetailPayload[];
  remark?: string | null;
}

export interface MaterialOutboundDetailItem {
  id: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  itemBatchId: string;
  batchCode: string;
  itemCode: string;
  itemName: string;
  outboundQuantity: string;
  unit: string;
  inventoryTransactionId: string | null;
}

export interface MaterialOutboundQuantitySummary {
  unit: string;
  quantity: string;
}

export interface MaterialOutboundItem {
  outboundId: string;
  outboundNo: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  status: OutboundOrderStatus;
  outboundAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  quantitySummary: MaterialOutboundQuantitySummary[];
  details: MaterialOutboundDetailItem[];
}

export interface MaterialOutboundCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  outbound: MaterialOutboundItem;
}

export interface MaterialOutboundQuery extends PageQuery {
  keyword?: string;
  status?: OutboundOrderStatus;
}

export interface MaterialOutboundBatchOption {
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  batchStatus: ProductionBatchStatus;
}

export interface MaterialOutboundCandidateItem {
  allocationId: string;
  demandId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  assignedQuantity: string;
  confirmedOutboundQuantity: string;
  pendingOutboundQuantity: string;
  availableToOrderQuantity: string;
  remainingActualOutboundQuantity: string;
  unit: string;
}

export type ConfirmMaterialOutboundPayload = VersionedCommand;
export type CancelMaterialOutboundPayload = VersionedCommand;

export interface CreateWorkOrderPayload {
  workOrderNo: string;
  productId: string;
  plannedQuantity: number;
  customerName?: string | null;
  qualityLevel?: string | null;
  workOrderOwnerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  externalOrderNo?: string | null;
  remark?: string | null;
}

export interface UpdateWorkOrderPayload extends VersionedCommand {
  productId?: string;
  plannedQuantity?: number;
  customerName?: string | null;
  qualityLevel?: string | null;
  workOrderOwnerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  externalOrderNo?: string | null;
  remark?: string | null;
}

export interface CreateProductionBatchPayload {
  batchNo?: string | null;
  routeId?: string | null;
  plannedQuantity: number;
  ownerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
  stepOverrides?: CreateBatchStepOverridePayload[];
}

/** Only overrides execution parameters on route-generated steps; it never changes the route step set. */
export interface CreateBatchStepOverridePayload {
  routeStepId: string;
  actualSopFileId?: string | null;
}

export interface UpdateProductionBatchPayload extends VersionedCommand {
  ownerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
}

export interface UpdateBatchStepExecutionPayload extends VersionedCommand {
  actualSopFileId?: string | null;
}

export interface AssignProductionStepPayload extends VersionedCommand {
  responsibleUserId: string;
}

export interface ProductionStepCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  responsibleUserId: string | null;
  startedAt: string | null;
  version: number;
}

export interface ProductionWorkerTaskItem {
  stepRecordId: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  status: BatchStepStatus;
  needRecord: boolean;
  unit: string;
  plannedQuantity: string;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  startedAt: string | null;
  version: number;
  canStart: boolean;
  startBlockedReason: string | null;
}

export interface CreateBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  remark?: string | null;
}

export interface CorrectBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  reason: string;
}

export interface ReverseBatchStepReportPayload extends VersionedCommand {
  reason: string;
}

export interface BatchStepReportItem {
  reportId: string;
  reportNo: string;
  productionBatchId: string;
  stepRecordId: string;
  reportType: BatchStepReportType;
  reversalOfReportId: string | null;
  correctionOfReportId: string | null;
  reportedQuantity: string;
  normalQuantity: string;
  abnormalQuantity: string;
  unit: string;
  remark: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  isEffective: boolean;
}

export interface BatchStepAbnormalDispositionItem {
  dispositionId: string;
  dispositionNo: string;
  productionBatchId: string;
  stepRecordId: string;
  sourceReportId: string;
  reviewStatus: BatchStepAbnormalReviewStatus;
  dispositionType: 'rework' | 'scrap' | null;
  remark: string | null;
  version: number;
  createdAt: string;
}

export interface BatchStepExecutionRecordItem {
  stepRecordId: string;
  productionBatchId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  status: BatchStepStatus;
  needRecord: boolean;
  unit: string;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  reports: BatchStepReportItem[];
  abnormalDispositions: BatchStepAbnormalDispositionItem[];
}

export interface ProductionExecutionRecordGroup {
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  batchStatus: ProductionBatchStatus;
  plannedQuantity: string;
  steps: BatchStepExecutionRecordItem[];
}

export interface BatchStepReportCommandResult {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  report: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export interface CorrectBatchStepReportCommandResult {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  reversal: BatchStepReportItem;
  replacement: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export type ProductionExecutionCompletionBlocker =
  | 'batch_not_doing'
  | 'no_required_reporting_step'
  | 'required_step_incomplete'
  | 'final_step_quantity_insufficient';

export interface ProductionExecutionCompletionCheck {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  plannedQuantity: string;
  requiredStepCount: number;
  completedRequiredStepCount: number;
  finalRequiredStepId: string | null;
  finalRequiredStepName: string | null;
  finalEffectiveNormalQuantity: string;
  canComplete: boolean;
  blockers: ProductionExecutionCompletionBlocker[];
}

export type CompleteProductionExecutionPayload = VersionedCommand;

export interface ProductionExecutionCompletionResult {
  productionBatchId: string;
  batchStatus: 'completed';
  completedQuantity: string;
  completedAt: string;
  completedById: string;
  version: number;
}

export interface ProductionTraceQuery extends PageQuery {
  keyword?: string;
}

export interface ProductionTraceBatchSummary {
  productionBatchId: string;
  batchNo: string;
  batchStatus: ProductionBatchStatus;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  completedQuantity: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProductionTraceWorkOrderGroup {
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  batches: ProductionTraceBatchSummary[];
}

export interface ProductionTraceInventoryTransaction {
  transactionId: string;
  outboundDetailId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  quantity: string;
  unit: string;
  transactionAt: string;
}

export interface ProductionTraceDetail {
  summary: ProductionTraceBatchSummary;
  materialDemands: ProductionMaterialDemandItem[];
  materialOutbounds: MaterialOutboundItem[];
  inventoryTransactions: ProductionTraceInventoryTransaction[];
  materialInboundSources: Array<{
    itemBatchId: string;
    batchCode: string;
    itemCode: string;
    itemName: string;
    sourceLabel: 'purchase_inbound' | 'initial_stock';
    inboundNo: string | null;
    provider: string | null;
    confirmedAt: string | null;
    inboundQuantity: string;
    inventoryTransactionId: string;
  }>;
  steps: BatchStepExecutionRecordItem[];
}

/** 日志模块枚举值 */
export const OPERATION_LOG_MODULE_OPTIONS = [
  { label: '认证登录', value: 'auth' },
  { label: '系统管理', value: 'system' },
  { label: '产品资料', value: 'product' },
  { label: '生产管理', value: 'production' },
  { label: '生产物料分配', value: 'material-allocation' },
  { label: '仓储管理', value: 'warehouse' },
  { label: '质量管理', value: 'quality' },
  { label: '未知模块', value: 'unknown' },
] as const;

export const AUTH_API = {
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
} as const;
export const SYSTEM_API = {
  users: '/system/users',
  departmentOptions: '/system/departments/options',
  roleOptions: '/system/roles/options',
  roles: '/system/roles',
  permissions: '/system/permissions',
  logs: '/system/logs',
} as const;

/** 生产、库存与质量模块持久化代码类型。中文名称只在前端展示层映射。 */
export type PermissionType = 'menu' | 'page' | 'button' | 'api';
export type OperationResult = 'success' | 'failed';
export type WorkOrderStatus = 'draft' | 'released' | 'doing' | 'completed' | 'cancelled' | 'closed';
export type ProductionBatchStatus =
  | 'pending'
  | 'material_pending'
  | 'material_assigned'
  | 'material_outbound'
  | 'doing'
  | 'completed'
  | 'cancelled';
export type BatchStepStatus = 'pending' | 'assigned' | 'doing' | 'completed';
export type BatchStepAbnormalDispositionType = 'rework' | 'scrap';
export type InventorySourceType =
  'self_made' | 'purchased' | 'outsourced' | 'return_inbound' | 'stock_check_generated' | 'other';
export type InventoryBatchStatus = 'available' | 'frozen' | 'disabled';
export type StockStatus = 'available' | 'pending_inspection' | 'frozen' | 'defective';
export type InventoryTransactionType =
  | 'purchase_inbound'
  | 'production_inbound'
  | 'outsourced_inbound'
  | 'production_material_outbound'
  | 'sales_outbound'
  | 'material_return_inbound'
  | 'scrap_outbound'
  | 'stock_check_adjustment'
  | 'status_transfer_in'
  | 'status_transfer_out';
export type InventoryReferenceType =
  | 'inbound_detail'
  | 'outbound_detail'
  | 'return_detail'
  | 'scrap'
  | 'stock_check_detail'
  | 'inspection_record'
  | 'manual';
export type InboundOrderStatus = 'pending' | 'completed' | 'cancelled';

export interface PurchaseInboundDetailItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
  unit: string;
  stockStatus: 'available';
  inventoryTransactionId: string | null;
}
export interface PurchaseInboundOrderItem {
  inboundId: string;
  inboundNo: string;
  sourceType: 'purchased';
  provider: string | null;
  status: InboundOrderStatus;
  inboundAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  detailCount: number;
  totalInboundQuantity: string;
  quantitySummary: Array<{ unit: string; quantity: string }>;
  details: PurchaseInboundDetailItem[];
}
export interface PurchaseInboundOrderQuery extends PageQuery {
  keyword?: string;
  status?: InboundOrderStatus;
}
export interface CreatePurchaseInboundPayload {
  inboundNo?: string | null;
  provider?: string | null;
  remark?: string | null;
  details: Array<{
    itemId: string;
    batchCode: string;
    inboundQuantity: number;
    remark?: string | null;
  }>;
}
export interface InventoryBatchQuery extends PageQuery {
  keyword?: string;
  batchCode?: string;
  batchStatus?: InventoryBatchStatus;
}
export interface InventoryBatchItem {
  itemBatchId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  batchCode: string;
  sourceType: InventorySourceType;
  provider: string | null;
  batchStatus: InventoryBatchStatus;
  onHandAvailableQuantity: string;
  reservedQuantity: string;
  availableToAllocateQuantity: string;
  inboundSources: Array<{
    inboundId: string;
    inboundNo: string;
    provider: string | null;
    inboundAt: string;
    inboundQuantity: string;
    inventoryTransactionId: string;
  }>;
}
export type DemandType = 'normal' | 'manual_additional';
export type DemandBusinessStatus = 'active' | 'cancelled' | 'closed' | 'frozen' | 'abnormal';
export type AllocationStatus = 'active' | 'released' | 'cancelled' | 'frozen' | 'abnormal';
export type OutboundOrderStatus =
  'pending_picking' | 'picked' | 'partially_outbound' | 'completed' | 'cancelled';
export type BatchStepReportType = 'normal' | 'reversal';
export type BatchStepAbnormalReviewStatus =
  'pending_review' | 'approved' | 'rejected' | 'cancelled';
export type ReturnOrderStatus = 'pending' | 'returned' | 'scrapped' | 'cancelled';
export type ScrapScene =
  'warehouse_allocated' | 'return_after_outbound' | 'production_consumed' | 'in_stock';
export type ScrapStatus = 'pending' | 'confirmed' | 'cancelled';
export type StockCheckStatus = 'pending' | 'counting' | 'completed' | 'cancelled';
export type StockCheckResult = 'surplus' | 'shortage' | 'matched';
export type InspectionType = 'process' | 'final';
export type InspectionResult = 'pending' | 'passed' | 'failed' | 'conditional';
export type ReworkStatus = 'pending' | 'doing' | 'completed' | 'cancelled';
export type ReworkResult = 'pending' | 'passed' | 'failed';
export type FinishedFlowType =
  'warehouse_inbound' | 'quality_release' | 'warehouse_outbound' | 'other';
export type FinishedFlowStatus = 'confirmed' | 'cancelled';
