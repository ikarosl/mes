<template>
  <div class="batch-target">
    <el-radio-group
      :model-value="modelValue.mode"
      :disabled="disabled"
      @change="setMode"
    >
      <el-radio-button
        style="margin: 2px"
        value="new"
        >新建批次</el-radio-button
      >
      <el-radio-button
        style="margin: 2px; box-sizing: border-box"
        value="existing"
        >已有批次</el-radio-button
      >
    </el-radio-group>
    <template v-if="modelValue.mode === 'new'">
      <span
        v-if="identity"
        class="hint"
        >新建 {{ identity }} 的独立库存批次</span
      >
      <span class="hint">新库存批号由系统在确认入库时生成。</span>
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
        placeholder="按日期搜索并选择可入库批次"
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
}>();
const emit = defineEmits<{ 'update:modelValue': [value: InventoryInboundTarget] }>();
const candidates = ref<InventoryInboundBatchCandidate[]>([]);
const loading = ref(false);
const error = ref('');
const keyword = ref('');
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
  if (value === 'existing') {
    emit('update:modelValue', { mode: 'existing', batchId: '' });
    void load();
  }
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
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
