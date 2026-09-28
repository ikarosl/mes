<template>
  <div class="batch-target">
    <el-radio-group
      :model-value="choice"
      :disabled="disabled"
      @change="setMode"
    >
      <el-radio-button value="new">新建批次</el-radio-button>
      <el-radio-button value="existing">已有批次</el-radio-button>
      <el-radio-button
        v-if="relatedNewTargets?.length"
        value="reuse"
        >复用本次新批次</el-radio-button
      >
    </el-radio-group>
    <template v-if="choice === 'new' && modelValue.mode === 'new'">
      <span
        v-if="identity"
        class="hint"
        >新建 {{ identity }} 的独立库存批次</span
      >
      <el-input
        :model-value="modelValue.batchCode ?? ''"
        :disabled="disabled"
        maxlength="100"
        clearable
        placeholder="新批号（留空由系统生成）"
        @update:model-value="setBatchCode"
      />
    </template>
    <template v-else-if="choice === 'reuse'">
      <el-select
        :model-value="modelValue.mode === 'new' ? modelValue.clientKey : ''"
        :disabled="disabled"
        placeholder="明确选择本次共建的批次"
        @update:model-value="joinNewBatch"
      >
        <el-option
          v-for="target in relatedNewTargets"
          :key="target.clientKey"
          :value="target.clientKey"
          :label="
            target.batchCode
              ? `${target.label} · 批号 ${target.batchCode}`
              : `${target.label} · 自动批号`
          "
        />
      </el-select>
      <span class="hint">仅明确选中同一请求内的新批次，才会共用一个批号。</span>
    </template>
    <template v-else>
      <span
        v-if="identity"
        class="hint"
        >查找可接收 {{ identity }} 的已有批次</span
      >
      <el-select
        :model-value="selectedBatchId"
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
          :label="`${batch.batchCode} · ${identity || '当前身份'} · 可用库存 ${batch.availableQuantity} ${batch.unit}`"
          :value="batch.batchId"
        />
      </el-select>
      <span
        v-if="modelValue.mode === 'existing' && modelValue.batchId && selectedBatch"
        class="hint"
        >已选 {{ selectedBatch.batchCode }} · {{ identity || '当前身份' }} ·
        {{ selectedBatch.unit }}</span
      >
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
  identity?: string;
  disabled?: boolean;
  relatedNewTargets?: Array<{ clientKey: string; batchCode?: string; label: string }>;
  newBatchOwner?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: InventoryInboundTarget] }>();
const candidates = ref<InventoryInboundBatchCandidate[]>([]);
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const relatedNewTargets = computed(() => [
  ...new Map(
    (props.relatedNewTargets ?? [])
      .filter((item) => item.clientKey)
      .map((item) => [item.clientKey, item]),
  ).values(),
]);
const isSharedNewTarget = computed(() => {
  const target = props.modelValue;
  return (
    target.mode === 'new' &&
    props.newBatchOwner === false &&
    relatedNewTargets.value.some((item) => item.clientKey === target.clientKey)
  );
});
const choice = computed(() =>
  props.modelValue.mode === 'existing'
    ? 'existing'
    : !props.modelValue.clientKey || isSharedNewTarget.value
      ? 'reuse'
      : 'new',
);
const selectedBatchId = computed(() => {
  const target = props.modelValue;
  return target.mode === 'existing' ? target.batchId : '';
});
const selectedBatch = computed(() =>
  candidates.value.find((item) => item.batchId === selectedBatchId.value),
);
let requestNo = 0;
function setMode(value: string | number | boolean | undefined) {
  if (value === 'new') emit('update:modelValue', { mode: 'new', clientKey: crypto.randomUUID() });
  if (value === 'reuse') emit('update:modelValue', { mode: 'new', clientKey: '' });
  if (value === 'existing') {
    emit('update:modelValue', { mode: 'existing', batchId: '' });
    void load();
  }
}
function joinNewBatch(clientKey: string) {
  const shared = relatedNewTargets.value.find((item) => item.clientKey === clientKey);
  if (shared) emit('update:modelValue', { mode: 'new', clientKey, batchCode: shared.batchCode });
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
watch(
  () => [props.modelValue, props.relatedNewTargets, props.newBatchOwner] as const,
  () => {
    const target = props.modelValue;
    if (target.mode !== 'new' || props.newBatchOwner !== false || !target.clientKey) return;
    const owner = relatedNewTargets.value.find((item) => item.clientKey === target.clientKey);
    if (owner && owner.batchCode !== target.batchCode)
      emit('update:modelValue', { ...target, batchCode: owner.batchCode });
  },
  { deep: true },
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
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
