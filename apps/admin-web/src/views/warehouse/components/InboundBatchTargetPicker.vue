<template>
  <div class="batch-target">
    <InboundBatchModeSwitch
      :model-value="modelValue.mode"
      :disabled="disabled"
      @update:model-value="setMode"
    />
    <template v-if="modelValue.mode === 'new'">
      <InboundNewBatchSelect
        :model-value="modelValue.clientKey"
        :groups="newBatchGroups ?? []"
        :disabled="disabled"
        @update:model-value="setNewBatchKey"
      />
      <span class="hint">批号在确认入库时生成。</span>
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
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import type { NewBatchGroupChoice } from '../inbound-new-batch-groups';
import InboundBatchModeSwitch from './InboundBatchModeSwitch.vue';
import InboundNewBatchSelect from './InboundNewBatchSelect.vue';

defineOptions({ name: 'InboundBatchTargetPicker' });
const props = defineProps<{
  modelValue: InventoryInboundTarget;
  itemKind: 'material' | 'finished_product';
  materialVariantId?: string;
  productId?: string;
  unit: string;
  identity?: string;
  newBatchGroups?: readonly NewBatchGroupChoice[];
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
const reader = useLatestReadRequest(() => (loading.value = false));
function setMode(value: string | number | boolean | undefined) {
  if (props.disabled || value === props.modelValue.mode) return;
  if (value === 'new') emit('update:modelValue', { mode: 'new', clientKey: crypto.randomUUID() });
  if (value === 'existing') emit('update:modelValue', { mode: 'existing', batchId: '' });
}
function setNewBatchKey(clientKey: string): void {
  if (!props.disabled && props.modelValue.mode === 'new')
    emit('update:modelValue', { mode: 'new', clientKey });
}
function setBatchId(value: string) {
  if (!props.disabled) emit('update:modelValue', { mode: 'existing', batchId: value || '' });
}
async function load() {
  if (props.modelValue.mode !== 'existing' || !reader.isActive()) return;
  const current = reader.begin(() => props.modelValue.mode === 'existing');
  loading.value = true;
  error.value = '';
  try {
    const page = await warehouseApi.listInboundBatchCandidates(
      {
        itemKind: props.itemKind,
        materialVariantId: props.materialVariantId,
        productId: props.productId,
        unit: props.unit,
        keyword: keyword.value.trim() || undefined,
        page: 1,
        pageSize: 50,
      },
      current.signal,
    );
    if (!current.isCurrent()) return;
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
    if (current.isCurrent()) error.value = '批次候选加载失败，请重试';
  } finally {
    if (current.isCurrent()) loading.value = false;
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
  () => props.modelValue.mode,
  (mode) => {
    reader.invalidate();
    error.value = '';
    if (mode === 'existing') void load();
  },
);
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
</style>
