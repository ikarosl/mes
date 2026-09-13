import type { PageQuery, VersionedCommand } from './common.js';
import type { UserOption } from './system.js';
import type { ProductSpecValue } from './product/product.js';

export type ApprovalFlowVersionStatus = 'draft' | 'published' | 'discarded';
export type ApprovalInstanceStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type ApprovalStepStatus =
  'waiting' | 'pending' | 'blocked' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalAssigneeType = 'role' | 'user';
export interface ApprovalAssignee {
  assigneeType: ApprovalAssigneeType;
  roleId: string | null;
  assigneeUserId: string | null;
}
export interface ApprovalActorEligibility {
  roleIds: string[];
  canDecide: boolean;
}
export type ApprovalActionType =
  'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'assignment_blocked' | 'reassigned';
export type ApprovalListScope = 'todo' | 'mine' | 'all';
export type ApprovalBlockedReason = 'no_eligible_assignee';
export type ApprovalSubjectType = 'product';

export interface ApprovalSceneItem {
  code: string;
  module: string;
  name: string;
  description: string;
  configured: boolean;
  activeFlowVersion: number | null;
}
export interface ApprovalRoleOption {
  id: string;
  name: string;
  code: string;
  eligibleUserCount: number;
}
export interface ApprovalFlowStep extends ApprovalAssignee {
  id: string;
  nodeCode: string;
  stepNo: number;
  name: string;
  roleName: string | null;
  assigneeUserName: string | null;
}
export interface ApprovalFlowVersion {
  id: string;
  versionNo: number;
  version: number;
  status: ApprovalFlowVersionStatus;
  publishedAt: string | null;
  steps: ApprovalFlowStep[];
}
export interface ApprovalFlowDetail {
  sceneCode: string;
  name: string;
  published: ApprovalFlowVersion | null;
  draft: ApprovalFlowVersion | null;
}
export interface SaveApprovalFlowDraft {
  name: string;
  /** 同时核对草稿身份，避免旧草稿请求误改下一份草稿。 */
  draftId: string | null;
  /** null 仅用于尚无草稿；已有草稿须提交其乐观版本。 */
  version: number | null;
  steps: (ApprovalAssignee & { nodeCode?: string; name: string })[];
}
export interface PublishApprovalFlowCommand extends VersionedCommand {
  draftId: string;
}
export interface ApprovalInstanceQuery extends PageQuery {
  scope?: ApprovalListScope;
  status?: ApprovalInstanceStatus;
  subjectId?: string;
}
export interface ApprovalInstanceListItem {
  id: string;
  instanceNo: string;
  sceneCode: string;
  title: string;
  subjectId: string;
  status: ApprovalInstanceStatus;
  applicantId: string;
  applicantName: string;
  currentStepName: string | null;
  blocked: boolean;
  createdAt: string;
  endedAt: string | null;
  version: number;
}
/** 物料名称始终按 materialId 解析当前值，不持久化名称快照。 */
export interface BomApprovalSnapshot {
  productId: string;
  itemCode: string;
  productName: string;
  unit: string;
  specValues: ProductSpecValue[];
  materials: {
    id: string;
    materialId: string;
    itemCode: string;
    quantityPerUnit: string;
    unit: string;
    remark: string | null;
  }[];
}
/** 已接入场景的受审快照联合；新增场景时扩展此类型及对应前端详情展示。 */
export type ApprovalSubjectSnapshot = BomApprovalSnapshot;

export interface ApprovalInstanceStep extends ApprovalAssignee {
  id: string;
  stepNo: number;
  name: string;
  roleName: string | null;
  assigneeUserName: string | null;
  status: ApprovalStepStatus;
  blockedReason: ApprovalBlockedReason | null;
  activatedAt: string | null;
  endedAt: string | null;
  eligibleUsers: UserOption[];
}
export interface ApprovalActionItem {
  id: string;
  actionNo: number;
  actionType: ApprovalActionType;
  stepId: string | null;
  actorId: string;
  actorName: string;
  comment: string | null;
  createdAt: string;
}
export interface ApprovalInstanceDetail extends ApprovalInstanceListItem {
  subjectType: ApprovalSubjectType;
  flowVersionNo: number;
  snapshotSchemaVersion: number;
  subjectSnapshot: ApprovalSubjectSnapshot;
  materialNames: Record<string, string>;
  steps: ApprovalInstanceStep[];
  actions: ApprovalActionItem[];
  currentStepId: string | null;
  canApprove: boolean;
  canWithdraw: boolean;
}
export interface ApprovalDecisionCommand extends VersionedCommand {
  stepId: string;
  comment?: string;
}
export interface ApprovalCommentCommand extends VersionedCommand {
  comment?: string;
}
export const APPROVAL_API = {
  scenes: '/approval/scenes',
  roleOptions: '/approval/role-options',
  userOptions: '/approval/user-options',
  instances: '/approval/instances',
  bom: '/approval/bom',
} as const;
