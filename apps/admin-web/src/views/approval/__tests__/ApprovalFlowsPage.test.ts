import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalFlowsPage from '../ApprovalFlowsPage.vue';
import { bomScene, flowDetail, roles, unconfiguredBomScene, users } from './fixtures';

const { scenes, roleOptions, userOptions, flow, saveFlowDraft, publishFlow, success, error } =
  vi.hoisted(() => ({
    scenes: vi.fn(),
    roleOptions: vi.fn(),
    userOptions: vi.fn(),
    flow: vi.fn(),
    saveFlowDraft: vi.fn(),
    publishFlow: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }));
vi.mock('../../../api/approval', () => ({
  approvalApi: { scenes, roleOptions, userOptions, flow, saveFlowDraft, publishFlow },
}));
vi.mock('../../../utils/message', () => ({ EMessage: { success, error, warning: vi.fn() } }));

const editorStub = {
  name: 'ApprovalFlowEditorDialog',
  props: ['visible', 'detail', 'roleOptions', 'userOptions', 'saving', 'publishing'],
  emits: ['publish', 'save', 'update:visible', 'refresh-roles', 'refresh-users'],
  template: `
    <div v-if="visible" class="flow-editor-stub">
      <span class="editor-state">{{ detail?.draft ? 'draft' : detail?.published ? 'published' : 'empty' }}</span>
      <button class="publish-latest" @click="$emit('publish', {
        name: 'BOM 审批最新草稿',
        draftId: detail?.draft?.id ?? null,
        version: detail?.draft?.version ?? null,
        steps: [
          { nodeCode: 'technical', name: '新技术审核', assigneeType: 'role', roleId: 'role-tech', assigneeUserId: null, assigneeSourceCode: null },
          { name: '新负责人审核', assigneeType: 'role', roleId: 'role-owner', assigneeUserId: null, assigneeSourceCode: null }
        ]
      })">发布最新草稿</button>
    </div>
  `,
};

describe('ApprovalFlowsPage', () => {
  beforeEach(() => {
    scenes.mockReset();
    roleOptions.mockReset();
    userOptions.mockReset();
    flow.mockReset();
    saveFlowDraft.mockReset();
    publishFlow.mockReset();
    success.mockReset();
    error.mockReset();
    scenes.mockResolvedValue([bomScene()]);
    roleOptions.mockResolvedValue(roles());
    userOptions.mockResolvedValue(users());
    flow.mockResolvedValue(flowDetail({ draft: true }));
    saveFlowDraft.mockResolvedValue({
      ...flowDetail({ draft: true }),
      draft: {
        ...flowDetail({ draft: true }).draft!,
        id: 'saved-draft',
        version: 7,
        versionNo: 6,
      },
    });
    publishFlow.mockResolvedValue(flowDetail());
  });

  const mountPage = () =>
    mount(ApprovalFlowsPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { ApprovalFlowEditorDialog: editorStub },
      },
    });

  it('opens a configured scene and saves the latest editor payload before publishing it', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const configure = wrapper.findAll('button').find((button) => button.text() === '配置流程');
    expect(configure).toBeDefined();
    await configure!.trigger('click');
    await flushPromises();

    expect(flow).toHaveBeenCalledWith('product.bom.approve');
    const publish = wrapper.find('.publish-latest');
    expect(publish.exists()).toBe(true);
    await publish.trigger('click');
    await flushPromises();

    expect(saveFlowDraft).toHaveBeenCalledWith('product.bom.approve', {
      name: 'BOM 审批最新草稿',
      draftId: 'draft-3',
      version: 4,
      steps: [
        {
          nodeCode: 'technical',
          name: '新技术审核',
          assigneeType: 'role',
          roleId: 'role-tech',
          assigneeUserId: null,
          assigneeSourceCode: null,
        },
        {
          name: '新负责人审核',
          assigneeType: 'role',
          roleId: 'role-owner',
          assigneeUserId: null,
          assigneeSourceCode: null,
        },
      ],
    });
    expect(publishFlow).toHaveBeenCalledWith('product.bom.approve', {
      draftId: 'saved-draft',
      version: 7,
    });
    expect(success).toHaveBeenCalledWith('审批流程已发布');
  });

  it('keeps an unconfigured registered scene available and opens an empty editor', async () => {
    scenes.mockResolvedValue([unconfiguredBomScene()]);
    flow.mockResolvedValue(flowDetail({ empty: true }));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('未配置');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '配置流程')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.find('.editor-state').text()).toBe('empty');
    expect(error).not.toHaveBeenCalled();
  });
});
