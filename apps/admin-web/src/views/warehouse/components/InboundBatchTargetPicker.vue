<template>
  <div class="batch-target">
    <el-radio-group
      :model-value="modelValue.mode"
      :disabled="disabled"
      @change="setMode"
    >
      <el-radio-button value="new">新建批次</el-radio-button>
      <el-radio-button value="existing">已有批次</el-radio-button>
    </el-radio-group>
    <template v-if="modelValue.mode === 'new'">
      <el-select
        v-if="relatedNewTargets?.length"
        :model-value="modelValue.clientKey"
        :disabled="disabled"
        placeholder="本单新批次归组"
        @update:model-value="joinNewBatch"
      >
        <el-option
          :value="modelValue.clientKey"
          label="当前新批次"
        />
        <el-option
          v-for="target in distinctRelatedTargets"
          :key="target.clientKey"
          :value="target.clientKey"
          :label="target.batchCode ? `与批号 ${target.batchCode} 共建` : `与${target.label}共建`"
        />
      </el-select>
      <el-button
        v-if="isSharedNewTarget"
        size="small"
        :disabled="disabled"
        @click="separateNewBatch"
        >独立新批次</el-button
      >
      <el-input
        :model-value="modelValue.batchCode ?? ''"
        :disabled="disabled || isSharedNewTarget"
        maxlength="100"
        clearable
        placeholder="新批号（留空由系统生成）"
        @update:model-value="setBatchCode"
      />
    </template>
    <template v-else>
      <el-select
        :model-value="modelValue.batchId"
        :disabled="disabled"
        filterable
        remote
        clearable
        :remote-method="search"
        :loading="loading"
        placeholder="搜索并选择可入库批次"
        @visible-change="onVisible"
        @update:model-value="setBatchId"
      >
        <el-option
          v-for="batch in candidates"
          :key="batch.batchId"
          :label="`${batch.batchCode} · 库存 ${batch.availableQuantity} ${batch.unit}`"
          :value="batch.batchId"
        />
      </el-select>
      <span
        v-if="error"
        class="error"
        >{{ error }}</span
      >
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { InventoryInboundBatchCandidate, InventoryInboundTarget } from '@company/contracts';
import { warehouseApi } from '../../../api/warehouse';

defineOptions({ name: 'InboundBatchTargetPicker' });
const props = defineProps<{
  modelValue: InventoryInboundTarget;
  itemKind: 'material' | 'finished_product';
  materialVariantId?: string;
  productId?: string;
  unit: string;
  disabled?: boolean;
  relatedNewTargets?: Array<{ clientKey: string; batchCode?: string; label: string }>;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: InventoryInboundTarget] }>();
const candidates = ref<InventoryInboundBatchCandidate[]>([]);
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const distinctRelatedTargets = computed(() =>
  [
    ...new Map((props.relatedNewTargets ?? []).map((item) => [item.clientKey, item])).values(),
  ].filter(
    (item) =>
      item.clientKey !== (props.modelValue.mode === 'new' ? props.modelValue.clientKey : ''),
  ),
);
const isSharedNewTarget = computed(() => {
  const target = props.modelValue;
  return (
    target.mode === 'new' &&
    (props.relatedNewTargets ?? []).some((item) => item.clientKey === target.clientKey)
  );
});
let requestNo = 0;
function setMode(value: string | number | boolean | undefined) {
  if (value === 'new') emit('update:modelValue', { mode: 'new', clientKey: crypto.randomUUID() });
  if (value === 'existing') {
    emit('update:modelValue', { mode: 'existing', batchId: '' });
    void load();
  }
}
function joinNewBatch(clientKey: string) {
  const shared = (props.relatedNewTargets ?? []).find((item) => item.clientKey === clientKey);
  if (shared) emit('update:modelValue', { mode: 'new', clientKey, batchCode: shared.batchCode });
}
function separateNewBatch() {
  emit('update:modelValue', {
    mode: 'new',
    clientKey: crypto.randomUUID(),
    batchCode: props.modelValue.mode === 'new' ? props.modelValue.batchCode : undefined,
  });
}
function setBatchCode(value: string) {
  if (props.modelValue.mode === 'new')
    emit('update:modelValue', { ...props.modelValue, batchCode: value || undefined });
}
function setBatchId(value: string) {
  emit('update:modelValue', { mode: 'existing', batchId: value || '' });
}
async function load() {
  if (props.modelValue.mode !== 'existing') return;
  const current = ++requestNo;
  loading.value = true;
  error.value = '';
  try {
    const page = await warehouseApi.listInboundBatchCandidates({
      itemKind: props.itemKind,
      materialVariantId: props.materialVariantId,
      productId: props.productId,
      unit: props.unit,
      keyword: keyword.value.trim() || undefined,
      page: 1,
      pageSize: 50,
    });
    if (current !== requestNo) return;
    candidates.value = page.items;
    const selectedId = props.modelValue.mode === 'existing' ? props.modelValue.batchId : '';
    if (selectedId && !page.items.some((item) => item.batchId === selectedId)) {
      // Keep the selected ID visible until the operator explicitly changes it.
      candidates.value = [
        {
          batchId: selectedId,
          batchCode: `已选批次 ${selectedId}（请重核）`,
          unit: '',
          batchStatus: 'available',
          availableQuantity: '-',
        },
        ...page.items,
      ];
    }
  } catch {
    if (current === requestNo) error.value = '批次候选加载失败，请重试';
  } finally {
    if (current === requestNo) loading.value = false;
  }
}
function search(value: string) {
  keyword.value = value;
  void load();
}
function onVisible(visible: boolean) {
  if (visible) void load();
}
watch(
  () => [props.itemKind, props.materialVariantId, props.productId, props.unit],
  () => {
    candidates.value = [];
    if (props.modelValue.mode === 'existing') void load();
  },
);
</script>
<style scoped>
.batch-target {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 240px;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
