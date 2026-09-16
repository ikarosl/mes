import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveApprovalFlowDraft } from '@company/contracts';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('approvalApi contract mapping', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('maps scene, role, flow and instance reads to the approval endpoints', async () => {
    const { approvalApi } = await import('../approval');

    await approvalApi.scenes();
    await approvalApi.roleOptions();
    await approvalApi.flow('product.bom.approve');
    await approvalApi.instances({
      page: 2,
      pageSize: 25,
      scope: 'all',
      status: 'approved',
      subjectId: 'product-1',
    });
    await approvalApi.instance('instance-1');

    expect(request).toHaveBeenNthCalledWith(1, { url: '/approval/scenes' });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/approval/role-options',
      skipErrorHandling: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/approval/scenes/product.bom.approve/flow',
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/approval/instances',
      params: {
        page: 2,
        pageSize: 25,
        scope: 'all',
        status: 'approved',
        subjectId: 'product-1',
      },
    });
    expect(request).toHaveBeenNthCalledWith(5, { url: '/approval/instances/instance-1' });
  });

  it('sends draft and publish optimistic versions, including the current scene only in the URL', async () => {
    const { approvalApi } = await import('../approval');
    const draft: SaveApprovalFlowDraft = {
      name: 'BOM 审批',
      draftId: 'draft-1',
      version: 4,
      steps: [
        {
          nodeCode: 'technical',
          name: '技术审核',
          assigneeType: 'role',
          roleId: 'role-tech',
          assigneeUserId: null,
          assigneeSourceCode: null,
        },
        {
          name: '负责人审核',
          assigneeType: 'user',
          roleId: null,
          assigneeUserId: 'user-owner',
          assigneeSourceCode: null,
        },
      ],
    };

    await approvalApi.saveFlowDraft('scene/with space', draft);
    await approvalApi.publishFlow('scene/with space', { draftId: 'draft-1', version: 5 });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/approval/scenes/scene%2Fwith%20space/flow/draft',
      method: 'PUT',
      data: draft,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/approval/scenes/scene%2Fwith%20space/flow/publish',
      method: 'POST',
      data: { draftId: 'draft-1', version: 5 },
    });
  });

  it('submits decisions with the shared node identity and application version', async () => {
    const { approvalApi } = await import('../approval');

    await approvalApi.approve('i1', { version: 7, stepId: 'step-1', comment: '通过' });
    await approvalApi.reject('i1', { version: 8, stepId: 'step-2', comment: '请补充证据' });
    await approvalApi.withdraw('i1', { version: 9, comment: '调整 BOM' });
    await approvalApi.submitBom('p1', 11);

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/approval/instances/i1/approve',
      method: 'POST',
      data: { version: 7, stepId: 'step-1', comment: '通过' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/approval/instances/i1/reject',
      method: 'POST',
      data: { version: 8, stepId: 'step-2', comment: '请补充证据' },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/approval/instances/i1/withdraw',
      method: 'POST',
      data: { version: 9, comment: '调整 BOM' },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/approval/bom/p1/submit',
      method: 'POST',
      data: { version: 11 },
    });
  });

  it('loads specified-user options with local candidate error handling', async () => {
    const { approvalApi } = await import('../approval');
    const options = [{ id: '9', displayName: '指定审批人' }];
    request.mockResolvedValue({ data: options });
    await expect(approvalApi.userOptions()).resolves.toEqual(options);
    expect(request).toHaveBeenCalledWith({
      url: '/approval/user-options',
      skipErrorHandling: true,
    });
  });
});
