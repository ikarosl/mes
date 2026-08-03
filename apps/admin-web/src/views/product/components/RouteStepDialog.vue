<template>
  <el-dialog
    :model-value="visible"
    title="配置工序顺序"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="step-toolbar">
      <div class="toolbar-left">
        <el-button
          :icon="Refresh"
          @click="refreshProcess"
          >刷新工序</el-button
        >
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="addStep"
        >添加路线步骤</el-button
      >
    </div>
    <el-table
      :data="localSteps"
      class="step-table"
    >
      <el-table-column
        label="顺序"
        width="100"
      >
        <template #default="{ row }">
          <el-input-number
            v-model="row.stepOrder"
            :min="1"
            :step="1"
            controls-position="right"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="工序"
        min-width="250"
      >
        <template #default="{ row }">
          <el-select
            v-model="row.processStepId"
            filterable
            placeholder="请选择已有工序"
            @visible-change="(visible: boolean) => visible && refreshProcess()"
          >
            <el-option
              v-for="choice in processChoices(row.processStepId)"
              :key="choice.value"
              :label="
                choice.option
                  ? `${choice.option.stepCode} / ${choice.option.stepName}`
                  : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column
        label="技术文件"
        min-width="180"
      >
        <template #default="{ row }">{{ getProcessSop(row.processStepId) || '-' }}</template>
      </el-table-column>
      <el-table-column
        label="使用BOM明细"
        min-width="240"
      >
        <template #default="{ row }">
          <el-select
            v-model="row.productMaterialIds"
            multiple
            clearable
            collapse-tags
            placeholder="可选"
            @visible-change="(visible: boolean) => visible && refreshMaterials()"
          >
            <el-option
              v-for="choice in materialChoices(row.productMaterialIds)"
              :key="choice.value"
              :label="
                choice.option
                  ? `${choice.option.itemCode} / ${choice.option.productName}`
                  : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column
        label="需报工"
        width="90"
        align="center"
      >
        <template #default="{ row }"><el-switch v-model="row.needRecord" /></template>
      </el-table-column>
      <el-table-column
        label="需检验"
        width="90"
        align="center"
      >
        <template #default="{ row }"><el-switch v-model="row.needInspection" /></template>
      </el-table-column>
      <el-table-column
        label="默认负责人"
        min-width="150"
      >
        <template #default="{ row }">
          <el-select
            v-model="row.defaultOwnerId"
            clearable
            placeholder="请选择"
            @visible-change="(visible: boolean) => visible && refreshUsers()"
          >
            <el-option
              v-for="choice in userChoices(row.defaultOwnerId)"
              :key="choice.value"
              :label="choice.option?.displayName ?? `${choice.value}（已失效）`"
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column
        label="备注"
        min-width="160"
      >
        <template #default="{ row }">
          <el-input
            v-model="row.remark"
            placeholder="可填写路线内备注"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="150"
        fixed="right"
      >
        <template #default="{ $index }">
          <el-button
            link
            type="primary"
            @click="moveStep($index, -1)"
            >上移</el-button
          >
          <el-button
            link
            type="primary"
            @click="moveStep($index, 1)"
            >下移</el-button
          >
          <el-button
            link
            type="danger"
            @click="removeStep($index)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存工序顺序</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { useRouteStepEditor } from '../composables/useRouteStepEditor';

export type StepRow = {
  processStepId: string;
  stepOrder: number;
  defaultOwnerId: string;
  sopFileId: string;
  needInspection: boolean;
  needRecord: boolean;
  status: number;
  remark: string;
  productMaterialIds: string[];
};

const props = defineProps<{
  visible: boolean;
  routeId: string | null;
  productId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', steps: StepRow[]): void;
}>();

const {
  processOptions,
  userOptions,
  routeMaterialOptions,
  stepsStatus,
  loadSteps,
  loadProcessOptions,
  loadUserOptions,
  loadMaterialOptions,
  loadAllOptions,
} = useRouteStepEditor();
const localSteps = ref<StepRow[]>([]);

const setSteps = (initial: StepRow[]): void => {
  localSteps.value = initial;
};

/** 打开弹窗时并发加载路线步骤明细与候选；关键明细失败不覆盖为可编辑空明细 */
watch(
  () => [props.visible, props.routeId, props.productId] as const,
  async ([visible, routeId, productId]) => {
    if (!visible || !routeId) return;
    const [, steps] = await Promise.all([loadAllOptions(productId, false), loadSteps(routeId)]);
    // 响应写入前核对当前路线与加载结果（last-request-wins）：已切换到其他路线或未加载成功则丢弃
    if (props.routeId !== routeId || stepsStatus.value !== 'success') return;
    setSteps(
      steps.map((step) => ({
        processStepId: step.processStepId,
        stepOrder: step.stepOrder,
        defaultOwnerId: step.defaultOwnerId ?? '',
        sopFileId: step.sopFileId ?? '',
        needInspection: step.needInspection,
        needRecord: step.needRecord,
        status: step.status,
        remark: step.remark ?? '',
        productMaterialIds: step.productMaterialIds,
      })),
    );
  },
);

/** 页面激活时刷新候选数据（由页面 onActivated 调用），不重载步骤行 */
const refresh = (): void => {
  if (props.productId) void loadAllOptions(props.productId, true);
};
const refreshProcess = (): void => {
  void loadProcessOptions(true);
};
const refreshMaterials = (): void => {
  if (props.productId) void loadMaterialOptions(props.productId, true);
};
const refreshUsers = (): void => {
  void loadUserOptions(true);
};

const addStep = (): void => {
  localSteps.value.push({
    processStepId: '',
    stepOrder: localSteps.value.length + 1,
    defaultOwnerId: '',
    sopFileId: '',
    needInspection: false,
    needRecord: true,
    status: 1,
    productMaterialIds: [],
    remark: '',
  });
};

const removeStep = (index: number): void => {
  localSteps.value.splice(index, 1);
  normalizeStepOrders();
};

const moveStep = (index: number, offset: number): void => {
  const ni = index + offset;
  if (ni < 0 || ni >= localSteps.value.length) return;
  const [s] = localSteps.value.splice(index, 1);
  if (s) {
    localSteps.value.splice(ni, 0, s);
  }
  normalizeStepOrders();
};

const normalizeStepOrders = (): void => {
  localSteps.value.forEach((s, i) => {
    s.stepOrder = i + 1;
  });
};

const getProcessSop = (processId: string): string | undefined =>
  processOptions.value.find((p) => p.id === processId)?.sopFileName ?? undefined;

const processChoices = (selectedValue: string) =>
  buildLiveOptions(processOptions.value, selectedValue ? [selectedValue] : [], (item) => item.id);

const materialChoices = (selectedValues: string[]) =>
  buildLiveOptions(routeMaterialOptions.value, selectedValues, (item) => item.id);

const userChoices = (selectedValue: string) =>
  buildLiveOptions(userOptions.value, selectedValue ? [selectedValue] : [], (item) => item.id);

const handleSubmit = (): void => {
  // 加载中/失败/未加载时禁止保存，避免把旧路线步骤保存到新路线
  if (stepsStatus.value !== 'success') {
    EMessage.warning(
      stepsStatus.value === 'error'
        ? '路线步骤加载失败，请刷新后重试'
        : '路线步骤加载中，请稍后再试',
    );
    return;
  }
  if (!localSteps.value.length || localSteps.value.some((s) => !s.processStepId)) {
    EMessage.warning('请选择每一道路线步骤对应的工序');
    return;
  }
  if (
    localSteps.value.some(
      (step) =>
        hasUnavailableSelection(
          processOptions.value,
          step.processStepId ? [step.processStepId] : [],
          (item) => item.id,
        ) ||
        hasUnavailableSelection(
          routeMaterialOptions.value,
          step.productMaterialIds,
          (item) => item.id,
        ) ||
        hasUnavailableSelection(
          userOptions.value,
          step.defaultOwnerId ? [step.defaultOwnerId] : [],
          (item) => item.id,
        ),
    )
  ) {
    EMessage.warning('工序、物料或负责人候选项已失效，请重新选择');
    return;
  }
  normalizeStepOrders();
  emit('save', localSteps.value);
};

defineExpose({ setSteps, refresh });
</script>

<style scoped>
.step-toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.toolbar-left {
  display: flex;
  gap: 8px;
}
.step-table {
  width: 100%;
}
.step-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.step-table :deep(.el-input),
.step-table :deep(.el-select),
.step-table :deep(.el-input-number) {
  width: 100%;
}
</style>
