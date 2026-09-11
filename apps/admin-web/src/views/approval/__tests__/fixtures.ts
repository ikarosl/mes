import type {
  ApprovalFlowDetail,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalRoleOption,
  ApprovalSceneItem,
} from '@company/contracts';

export const bomScene = (): ApprovalSceneItem => ({
  code: 'product.bom.approve',
  module: 'Product',
  name: 'BOM 审批',
  description: '成品 BOM 变更审批',
  configured: true,
  activeFlowVersion: 2,
});

export const unconfiguredBomScene = (): ApprovalSceneItem => ({
  ...bomScene(),
  configured: false,
  activeFlowVersion: null,
});

export const roles = (): ApprovalRoleOption[] => [
  { id: 'role-tech', name: '技术审核', code: 'TECH', eligibleUserCount: 2 },
  { id: 'role-owner', name: '负责人审核', code: 'OWNER', eligibleUserCount: 1 },
  { id: 'role-old', name: '已停用角色', code: 'OLD', eligibleUserCount: 0 },
];

export const flowDetail = (
  options: { draft?: boolean; empty?: boolean } = {},
): ApprovalFlowDetail => {
  const steps = options.empty
    ? []
    : [
        {
          id: 'step-1',
          nodeCode: 'technical',
          stepNo: 1,
          name: '技术审核',
          roleId: 'role-tech',
          roleName: '技术审核',
        },
        {
          id: 'step-2',
          nodeCode: 'owner',
          stepNo: 2,
          name: '负责人审核',
          roleId: 'role-owner',
          roleName: '负责人审核',
        },
      ];
  const published = {
    id: 'flow-2',
    versionNo: 2,
    version: 2,
    status: 'published' as const,
    publishedAt: '2026-09-01T10:00:00+08:00',
    steps,
  };
  return {
    sceneCode: 'product.bom.approve',
    name: 'BOM 审批',
    published: options.empty ? null : published,
    draft: options.draft
      ? {
          id: 'draft-3',
          versionNo: 3,
          version: 4,
          status: 'draft',
          publishedAt: null,
          steps,
        }
      : null,
  };
};

export const instanceListItem = (
  overrides: Partial<ApprovalInstanceListItem> = {},
): ApprovalInstanceListItem => ({
  id: 'instance-1',
  instanceNo: 'APR-0001',
  sceneCode: 'product.bom.approve',
  title: '成品 P-001 BOM 审批',
  subjectId: 'product-1',
  status: 'pending',
  applicantId: 'user-1',
  applicantName: '申请人',
  currentStepName: '技术审核',
  blocked: false,
  createdAt: '2026-09-10T10:00:00+08:00',
  endedAt: null,
  version: 6,
  ...overrides,
});

export const instanceDetail = (
  overrides: Partial<ApprovalInstanceDetail> = {},
): ApprovalInstanceDetail => ({
  ...instanceListItem(),
  subjectType: 'product',
  flowVersionNo: 2,
  snapshotSchemaVersion: 2,
  subjectSnapshot: {
    productId: 'product-1',
    itemCode: 'P-001',
    productName: '成品一',
    unit: 'pcs',
    specValues: [{ key: '规格', value: '10', unit: 'mm' }],
    materials: [
      {
        id: 'bom-1',
        materialId: 'material-1',
        itemCode: 'M-001',
        quantityPerUnit: '2',
        unit: 'kg',
        remark: '主材',
      },
    ],
  },
  materialNames: { 'material-1': '物料一' },
  steps: [
    {
      id: 'step-1',
      stepNo: 1,
      name: '技术审核',
      roleId: 'role-tech',
      roleName: '技术审核',
      status: 'pending',
      assignmentRound: 1,
      blockedReason: null,
      activatedAt: '2026-09-10T10:00:00+08:00',
      endedAt: null,
      tasks: [
        {
          id: 'task-1',
          assigneeId: 'user-2',
          assigneeName: '审批人',
          assignmentRound: 1,
          status: 'pending',
          closeReason: null,
          endedAt: null,
        },
      ],
    },
    {
      id: 'step-2',
      stepNo: 2,
      name: '负责人审核',
      roleId: 'role-owner',
      roleName: '负责人审核',
      status: 'waiting',
      assignmentRound: 0,
      blockedReason: null,
      activatedAt: null,
      endedAt: null,
      tasks: [],
    },
  ],
  actions: [
    {
      id: 'action-1',
      actionNo: 1,
      actionType: 'submitted',
      stepId: null,
      actorId: 'user-1',
      actorName: '申请人',
      comment: null,
      createdAt: '2026-09-10T10:00:00+08:00',
    },
  ],
  myTaskId: 'task-1',
  canApprove: true,
  canWithdraw: false,
  canReassign: false,
  ...overrides,
});
