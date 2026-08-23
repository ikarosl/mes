import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import type {
  BatchStepAbnormalDispositionItem,
  ProductionSupplementCandidateItem,
  ProductionScrapSupplementPlanItem,
} from '@company/contracts';
import AbnormalReworkPanel from '../AbnormalReworkPanel.vue';

const disposition: BatchStepAbnormalDispositionItem = {
  dispositionId: '1',
  dispositionNo: 'BAD-1',
  productionBatchId: '2',
  stepRecordId: 's2',
  sourceReportId: '4',
  abnormalOrigin: 'current_step',
  reviewStatus: 'pending_review',
  dispositionType: null,
  remark: null,
  version: 0,
  createdAt: '2026-08-13T08:00:00+08:00',
};
const previousStepDisposition: BatchStepAbnormalDispositionItem = {
  ...disposition,
  dispositionId: '11',
  abnormalOrigin: 'previous_step',
};
const candidateA: ProductionSupplementCandidateItem = {
  originalDemandId: 'd1',
  productionBatchId: '2',
  productMaterialId: 'm1',
  itemId: 'i1',
  itemCode: 'MAT-1',
  itemName: '主料',
  unit: '件',
  normalDemandQuantity: '4.0000',
};
const candidateB: ProductionSupplementCandidateItem = {
  ...candidateA,
  originalDemandId: 'd2',
  itemCode: 'MAT-2',
  itemName: '辅料',
};
const draftPlan = (
  overrides: Partial<ProductionScrapSupplementPlanItem> = {},
): ProductionScrapSupplementPlanItem => ({
  planId: 'p1',
  planNo: 'SP-1',
  dispositionId: '1',
  productionBatchId: '2',
  sourceStepRecordId: 's2',
  sourceReportId: '4',
  materialEndStepRecordId: 's1',
  status: 'draft',
  confirmedSupplementId: null,
  remark: '先补主料',
  version: 5,
  updatedAt: '2026-08-13T08:00:00+08:00',
  lines: [
    {
      originalDemandId: 'd1',
      productMaterialId: 'm1',
      itemId: 'i1',
      itemCode: 'MAT-1',
      itemName: '主料',
      plannedQuantity: '2.0000',
      unit: '件',
    },
  ],
  ...overrides,
});

type PanelVm = {
  supplementVisible: boolean;
  supplementStage: 'edit' | 'review';
  materialEndStepRecordId: string;
  supplementRemark: string;
  supplementError: string;
  canStageSupplement: boolean;
  supplementRows: Array<{
    candidate: ProductionSupplementCandidateItem;
    selected: boolean;
    quantity: number;
  }>;
  stagedSupplement: {
    materialEndStepRecordId: string;
    materialEndStepLabel: string;
    lines: Array<{ originalDemandId: string; quantity: number; unit: string }>;
    remark: string;
  } | null;
  persistedPlan: ProductionScrapSupplementPlanItem | null;
  supplementSaving: boolean;
  stageSupplement: () => Promise<void>;
  submitSupplement: () => void;
};

type PanelProps = InstanceType<typeof AbnormalReworkPanel>['$props'];

const mountPanel = (
  overrides: Partial<PanelProps> = {},
  options: { renderBody?: boolean } = {},
) => {
  const planLoader = vi.fn<
    (dispositionId: string) => Promise<ProductionScrapSupplementPlanItem | null>
  >(async () => null);
  const candidateLoader = vi.fn<
    (dispositionId: string, stepId: string) => Promise<ProductionSupplementCandidateItem[]>
  >(async () => [candidateA, candidateB]);
  const planSaver = vi.fn<PanelProps['planSaver']>(async () => draftPlan({ version: 6 }));
  const wrapper = mount(AbnormalReworkPanel, {
    props: {
      dispositions: [disposition],
      reports: [{ reportId: '4', abnormalQuantity: '2.0000', unit: '件' }] as never,
      reworks: [],
      pendingKeys: new Set<string>(),
      unit: '件',
      sourceStep: { stepRecordId: 's2', stepOrder: 2, stepName: '组装' } as never,
      routeSteps: [
        { stepRecordId: 's1', stepOrder: 1, stepName: '切割' },
        { stepRecordId: 's2', stepOrder: 2, stepName: '组装' },
      ] as never,
      candidateLoader,
      planLoader,
      planSaver,
      ...overrides,
    },
    global: {
      stubs: {
        'el-dialog': {
          props: ['modelValue', 'title'],
          template: options.renderBody
            ? '<div v-if="modelValue" class="dialog"><p>{{ title }}</p><slot/><slot name="footer"/></div>'
            : '<div v-if="modelValue" class="dialog"><p>{{ title }}</p></div>',
        },
        'el-button': {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template:
            '<button type="button" :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot/></button>',
        },
        'el-tag': { template: '<span><slot/></span>' },
        'el-alert': { props: ['title'], template: '<p class="alert">{{ title }}</p>' },
        'el-input': true,
        'el-input-number': true,
        'el-checkbox': true,
        'el-form': { template: '<form><slot/></form>' },
        'el-form-item': { template: '<div><slot/></div>' },
        'el-table': { template: '<div><slot/></div>' },
        'el-table-column': true,
        'el-descriptions': { template: '<div><slot/></div>' },
        'el-descriptions-item': { template: '<div><slot/></div>' },
        'el-select': { template: '<div class="select"><slot/></div>' },
        'el-option': {
          props: ['label', 'value'],
          template: '<span class="option">{{ label }}</span>',
        },
      },
      directives: { loading: () => undefined },
    },
  });
  return { wrapper, planLoader, candidateLoader, planSaver };
};

const buttonByText = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((button) => button.text() === text);
const openSupplement = async (wrapper: ReturnType<typeof mount>) => {
  await buttonByText(wrapper, '报废并补料')!.trigger('click');
  await flushPromises();
};
const vmOf = (wrapper: ReturnType<typeof mount>) => wrapper.vm as unknown as PanelVm;
const stageSupplement = async (wrapper: ReturnType<typeof mount>) => {
  await vmOf(wrapper).stageSupplement();
  await flushPromises();
};
const selectRow = async (wrapper: ReturnType<typeof mount>, index: number, quantity: number) => {
  const vm = vmOf(wrapper);
  vm.supplementRows[index].selected = true;
  vm.supplementRows[index].quantity = quantity;
  await nextTick();
};

describe('AbnormalReworkPanel', () => {
  it('shows actionable pending dispositions and source-bound rework state', () => {
    const { wrapper } = mountPanel({
      reworks: [
        {
          reworkId: '5',
          reworkNo: 'RW-5',
          stepRecordId: 's2',
          responsibleUserId: '7',
          responsibleUserName: '员工',
          reworkQuantity: '2.0000',
          unit: '件',
          status: 'pending',
        } as never,
      ],
    });
    expect(wrapper.text()).toContain('批准返工');
    expect(wrapper.text()).toContain('报废并补料');
    expect(wrapper.text()).toContain('2.0000 件');
    expect(wrapper.text()).toContain('开始返工');
  });

  it('queries the server draft first and shows the default candidate scope with empty quantities when no draft exists', async () => {
    const { wrapper, planLoader, candidateLoader } = mountPanel();
    await openSupplement(wrapper);
    expect(planLoader).toHaveBeenCalledWith('1');
    // 当前工序异常：截止工序默认取来源工序（最后一道允许工序）
    expect(candidateLoader).toHaveBeenCalledWith('1', 's2');
    // 候选物料只展示范围，数量未预填且全部未选中
    expect(vmOf(wrapper).supplementRows).toHaveLength(2);
    expect(vmOf(wrapper).supplementRows.every((row) => !row.selected)).toBe(true);
    expect(vmOf(wrapper).canStageSupplement).toBe(false);
  });

  it('offers a manual candidate scope without any auto-recommended quantity', async () => {
    const { wrapper } = mountPanel({}, { renderBody: true });
    await openSupplement(wrapper);
    const dialogText = wrapper.find('.dialog').text();
    expect(dialogText).toContain('编制报废补料需求');
    // 候选物料截止工序的默认范围覆盖首工序到来源工序
    expect(wrapper.findAll('.option').map((option) => option.text())).toEqual([
      '1. 切割',
      '2. 组装',
    ]);
    // 页面明确声明补料品种和数量必须人工选择，不展示自动推荐数量
    expect(dialogText).toContain('补料品种和数量必须人工选择，不按异常数量自动推算。');
    expect(wrapper.text()).not.toContain('推荐数量');
  });

  it('restricts the candidate scope to upstream steps for a previous-step disposition', async () => {
    const { wrapper, candidateLoader } = mountPanel({
      dispositions: [previousStepDisposition],
    });
    await openSupplement(wrapper);
    expect(candidateLoader).toHaveBeenCalledWith('11', 's1');
    expect(vmOf(wrapper).materialEndStepRecordId).toBe('s1');
  });

  it('restores the staged draft: end step, selection, quantities, remark and plan version', async () => {
    const { wrapper, planLoader, candidateLoader, planSaver } = mountPanel();
    planLoader.mockResolvedValueOnce(draftPlan());
    await openSupplement(wrapper);
    expect(candidateLoader).toHaveBeenCalledWith('1', 's1');
    const vm = vmOf(wrapper);
    expect(vm.materialEndStepRecordId).toBe('s1');
    expect(vm.supplementRemark).toBe('先补主料');
    expect(vm.supplementRows[0]).toMatchObject({ selected: true, quantity: 2 });
    expect(vm.supplementRows[1]).toMatchObject({ selected: false });
    await selectRow(wrapper, 1, 1);
    await stageSupplement(wrapper);
    // 保存时携带恢复的方案版本号
    expect(planSaver).toHaveBeenCalledWith(
      disposition,
      's1',
      [
        { originalDemandId: 'd1', supplementQuantity: 2 },
        { originalDemandId: 'd2', supplementQuantity: 1 },
      ],
      '先补主料',
      5,
    );
  });

  it('stages the demand without confirming the scrap supplement', async () => {
    const { wrapper, planSaver } = mountPanel();
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    vmOf(wrapper).supplementRemark = ' 备注 ';
    await nextTick();
    await stageSupplement(wrapper);
    expect(planSaver).toHaveBeenCalledWith(
      disposition,
      's2',
      [{ originalDemandId: 'd1', supplementQuantity: 2 }],
      ' 备注 ',
      null,
    );
    expect(wrapper.emitted('approveScrap')).toBeUndefined();
  });

  it('enters the read-only review stage after a successful save', async () => {
    const { wrapper, planSaver } = mountPanel();
    planSaver.mockResolvedValueOnce(
      draftPlan({
        version: 6,
        remark: '补料备注',
        lines: [
          { ...draftPlan().lines[0], plannedQuantity: '2.0000' },
          {
            originalDemandId: 'd2',
            productMaterialId: 'm2',
            itemId: 'i2',
            itemCode: 'MAT-2',
            itemName: '辅料',
            plannedQuantity: '1.0000',
            unit: '件',
          },
        ],
      }),
    );
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    await selectRow(wrapper, 1, 1);
    await stageSupplement(wrapper);
    const vm = vmOf(wrapper);
    expect(vm.supplementStage).toBe('review');
    expect(wrapper.find('.dialog').text()).toContain('复核报废补料需求');
    expect(vm.stagedSupplement?.materialEndStepLabel).toBe('2. 组装');
    expect(vm.stagedSupplement?.lines).toEqual([
      { originalDemandId: 'd1', itemCode: 'MAT-1', itemName: '主料', quantity: 2, unit: '件' },
      { originalDemandId: 'd2', itemCode: 'MAT-2', itemName: '辅料', quantity: 1, unit: '件' },
    ]);
    expect(vm.stagedSupplement?.remark).toBe('补料备注');
    expect(vm.persistedPlan?.version).toBe(6);
  });

  it('keeps the staged data when returning to edit', async () => {
    const { wrapper, planSaver } = mountPanel();
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    vmOf(wrapper).supplementRemark = ' 先补主料 ';
    await nextTick();
    await stageSupplement(wrapper);
    vmOf(wrapper).supplementStage = 'edit';
    await nextTick();
    const vm = vmOf(wrapper);
    expect(vm.supplementStage).toBe('edit');
    expect(vm.supplementRows[0]).toMatchObject({ selected: true, quantity: 2 });
    expect(vm.supplementRemark).toBe(' 先补主料 ');
    expect(vm.materialEndStepRecordId).toBe('s2');
    // 再次暂存不清空已选数据，并携带上次保存得到的方案版本号
    planSaver.mockClear();
    await stageSupplement(wrapper);
    expect(planSaver).toHaveBeenCalledWith(
      disposition,
      's2',
      [{ originalDemandId: 'd1', supplementQuantity: 2 }],
      ' 先补主料 ',
      6,
    );
    expect(wrapper.emitted('approveScrap')).toBeUndefined();
  });

  it('re-queries the server draft when closing and reopening the dialog', async () => {
    const { wrapper, planLoader } = mountPanel();
    planLoader.mockResolvedValue(draftPlan());
    await openSupplement(wrapper);
    expect(vmOf(wrapper).materialEndStepRecordId).toBe('s1');
    // 关闭弹窗不丢弃草稿：草稿保存在服务端，重新打开时重新查询
    vmOf(wrapper).supplementVisible = false;
    await nextTick();
    expect(vmOf(wrapper).supplementVisible).toBe(false);
    await openSupplement(wrapper);
    expect(planLoader).toHaveBeenCalledTimes(2);
    expect(planLoader).toHaveBeenLastCalledWith('1');
    // 重新打开后从服务端草稿再次恢复
    expect(vmOf(wrapper).materialEndStepRecordId).toBe('s1');
    expect(vmOf(wrapper).supplementRows[0]).toMatchObject({ selected: true, quantity: 2 });
  });

  it('emits only the plan and disposition versions when confirming the scrap supplement', async () => {
    const { wrapper } = mountPanel();
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    await stageSupplement(wrapper);
    vmOf(wrapper).submitSupplement();
    expect(wrapper.emitted('approveScrap')).toEqual([[disposition, 6]]);
    expect(vmOf(wrapper).supplementVisible).toBe(false);
  });

  it('shows an inline error and stays editable when staging conflicts with another administrator', async () => {
    const { wrapper, planSaver } = mountPanel();
    planSaver.mockRejectedValueOnce(new RequestError('方案已被其他管理员修改', 409));
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    await stageSupplement(wrapper);
    expect(vmOf(wrapper).supplementError).toBe(
      '暂存需求失败，可能已被其他管理员修改，请关闭后重新打开。',
    );
    expect(vmOf(wrapper).supplementStage).toBe('edit');
    expect(wrapper.emitted('approveScrap')).toBeUndefined();
  });

  it('shows an inline error when candidate loading fails', async () => {
    const { wrapper, candidateLoader } = mountPanel();
    candidateLoader.mockRejectedValueOnce(new RequestError('网络断开', 0));
    await openSupplement(wrapper);
    expect(vmOf(wrapper).supplementError).toBe('补料候选加载失败，请关闭后重试。');
  });

  it('shows an inline error when the server draft cannot be loaded', async () => {
    const { wrapper, planLoader } = mountPanel();
    planLoader.mockRejectedValueOnce(new RequestError('网络断开', 0));
    await openSupplement(wrapper);
    expect(vmOf(wrapper).supplementError).toBe('暂存方案加载失败，请关闭后重试。');
  });

  it('disables staging and refuses a second save while a save is in flight', async () => {
    let resolveSave!: (plan: ProductionScrapSupplementPlanItem) => void;
    const { wrapper, planSaver } = mountPanel();
    planSaver.mockReturnValueOnce(new Promise((resolve) => (resolveSave = resolve)));
    await openSupplement(wrapper);
    await selectRow(wrapper, 0, 2);
    const pendingStage = vmOf(wrapper).stageSupplement();
    await nextTick();
    expect(vmOf(wrapper).supplementSaving).toBe(true);
    await vmOf(wrapper).stageSupplement();
    expect(planSaver).toHaveBeenCalledTimes(1);
    resolveSave(draftPlan({ version: 6 }));
    await pendingStage;
    expect(vmOf(wrapper).supplementStage).toBe('review');
  });

  it('cannot stage without selecting a material', async () => {
    const { wrapper, planSaver } = mountPanel();
    await openSupplement(wrapper);
    expect(vmOf(wrapper).canStageSupplement).toBe(false);
    await stageSupplement(wrapper);
    expect(planSaver).not.toHaveBeenCalled();
  });
});
