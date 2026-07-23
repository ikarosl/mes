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
export type BatchStepStatus = 'pending' | 'assigned' | 'doing' | 'completed' | 'abnormal';
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
export type DemandBusinessStatus = 'active' | 'cancelled' | 'closed' | 'frozen' | 'abnormal';
export type AllocationStatus = 'active' | 'released' | 'cancelled' | 'frozen' | 'abnormal';
export type OutboundOrderStatus =
  'pending_picking' | 'picked' | 'partially_outbound' | 'completed' | 'cancelled';
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
