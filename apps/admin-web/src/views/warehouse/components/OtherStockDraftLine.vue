<template>
  <section class="draft-line">
    <div class="line-heading">
      <strong>{{ line.lineNo ? `明细 ${line.lineNo}` : '新增明细' }}</strong>
      <el-button
        link
        type="danger"
        :disabled="disabled"
        @click="emit('remove', line.key)"
      >
        移除行
      </el-button>
    </div>
    <div class="line-selectors">
      <el-select
        :model-value="line.itemKind"
        :disabled="disabled"
        @change="changeKind"
      >
        <el-option
          v-for="kind in INVENTORY_ITEM_KINDS"
          :key="kind"
          :value="kind"
          :label="INVENTORY_ITEM_KIND_LABELS[kind]"
        />
      </el-select>
      <el-radio-group
        v-if="direction === 'inbound'"
        :model-value="line.target.mode"
        :disabled="disabled"
        @change="changeTargetMode"
      >
        <el-radio-button
          v-for="targetMode in INVENTORY_TARGET_MODES"
          :key="targetMode"
          :value="targetMode"
          >{{ INVENTORY_TARGET_MODE_LABELS[targetMode] }}</el-radio-button
        >
      </el-radio-group>
    </div>
    <div class="line-fields">
      <div class="identity-field">
        <label>{{
          line.target.mode === 'new' ? '库存对象（精确版本）' : '已有可用库存批次'
        }}</label>
        <RemoteSearchSelect
          v-if="line.target.mode === 'new'"
          :model-value="line.object?.id ?? null"
          :options="options.objectOptions.value"
          :loading="options.objectLoading.value"
          :error="options.objectError.value"
          :has-more="options.objectHasMore.value"
          :disabled="disabled"
          :placeholder="
            line.itemKind === 'material' ? '搜索物料编码、名称或精确版本' : '搜索成品编码或名称'
          "
          :missing-selection-label="
            line.object ? `${otherStockObjectLabel(line.object)}（待核验）` : undefined
          "
          @update:model-value="chooseObject"
          @open="options.refreshObjects"
          @refresh="options.refreshObjects"
          @search="options.searchObjects"
        />
        <RemoteSearchSelect
          v-else
          :model-value="line.target.batchId || null"
          :options="options.batchOptions.value"
          :loading="options.batchLoading.value"
          :error="options.batchError.value"
          :has-more="options.batchHasMore.value"
          :disabled="disabled"
          placeholder="搜索库存批号、对象编码或名称"
          :missing-selection-label="
            line.batch
              ? `${line.batch.batchCode} · ${line.batch.itemCode} · ${line.batch.itemName}`
              : undefined
          "
          @update:model-value="chooseBatch"
          @open="options.refreshBatches"
          @refresh="options.refreshBatches"
          @search="options.searchBatches"
        />
        <p
          v-if="line.object"
          class="line-note"
        >
          {{ otherStockObjectLabel(line.object) }}
        </p>
        <p
          v-if="line.target.mode === 'new' && line.object && !line.objectVerified"
          class="line-error"
        >
          {{
            options.objectError.value
              ? '对象核验失败，请重试候选读取。'
              : options.objectLoading.value
                ? '正在核验已选对象…'
                : options.objectUnavailable.value
                  ? '该对象当前不能新建批次，请重新选择启用对象。'
                  : '已选对象尚未通过当前核验，请刷新候选或重新选择。'
          }}
        </p>
        <p
          v-if="line.target.mode === 'existing' && line.batch"
          class="line-note"
        >
          <template v-if="line.batch.availableQuantity === '-'"
            >库存余额及生产预留在确认时重新核对。</template
          >
          <template v-else>
            可用库存 {{ line.batch.availableQuantity }} {{ line.batch.unit }}
            <template v-if="direction === 'outbound'">
              · 生产预留 {{ line.batch.reservedQuantity }} · 可出 {{ line.batch.usableQuantity }}
            </template>
          </template>
        </p>
      </div>
      <div class="quantity-field">
        <label>本次数量 <span class="required-mark">*</span></label>
        <el-input-number
          :model-value="line.quantity"
          :disabled="disabled"
          :min="1"
          :max="99_999_999"
          :step="1"
          :precision="0"
          @update:model-value="update({ quantity: $event })"
        />
        <span class="unit">{{ line.object?.unit || '单位由对象确定' }}</span>
      </div>
      <div
        v-if="line.target.mode === 'new'"
        class="batch-group-field"
      >
        <label>本单新批次组</label>
        <el-select
          :model-value="line.target.clientKey"
          :disabled="disabled || !line.object"
          @change="changeNewBatchKey"
        >
          <el-option
            v-for="group in newBatchGroups"
            :key="group.value"
            :value="group.value"
            :label="group.label"
          />
        </el-select>
        <el-button
          link
          type="primary"
          :disabled="disabled || !line.object"
          @click="splitNewBatch"
        >
          单独新建批次
        </el-button>
        <p class="line-note">同组明细共建一个批次；实际库存批号在确认时生成。</p>
      </div>
    </div>
    <el-input
      :model-value="line.remark"
      :disabled="disabled"
      maxlength="5000"
      placeholder="行备注（可选）"
      @update:model-value="update({ remark: $event })"
    />
  </section>
</template>

<script setup lang="ts">
import {
  INVENTORY_ITEM_KINDS,
  INVENTORY_ITEM_KIND_LABELS,
  INVENTORY_TARGET_MODES,
  INVENTORY_TARGET_MODE_LABELS,
} from '@company/constants';
import type {
  OtherInventoryDirection,
  OtherInventoryItemKind,
  OtherStockObject,
} from '@company/contracts';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { newOtherInventoryBatchKey, type OtherInventoryDraftLine } from '../other-inventory-draft';
import { otherStockObjectLabel } from '../other-inventory-presentation';
import { useOtherStockLineOptions } from '../composables/useOtherStockLineOptions';

defineOptions({ name: 'OtherStockDraftLine' });
const props = defineProps<{
  line: OtherInventoryDraftLine;
  direction: OtherInventoryDirection;
  disabled: boolean;
  newBatchGroups: { value: string; label: string }[];
}>();
const emit = defineEmits<{
  updateLine: [line: OtherInventoryDraftLine];
  remove: [key: string];
}>();
const update = (patch: Partial<OtherInventoryDraftLine>): void =>
  emit('updateLine', { ...props.line, ...patch });
const options = useOtherStockLineOptions(() => props.line, props.direction, verifyObject);

function verifyObject(object: OtherStockObject | null): void {
  if (props.line.target.mode !== 'new') return;
  update({ object: object ?? props.line.object, objectVerified: Boolean(object) });
}
function changeKind(value: OtherInventoryItemKind): void {
  if (props.disabled) return;
  update({
    itemKind: value,
    object: null,
    objectVerified: false,
    batch: null,
    target:
      props.line.target.mode === 'new'
        ? { mode: 'new', clientKey: newOtherInventoryBatchKey() }
        : { mode: 'existing', batchId: '' },
  });
}
function changeTargetMode(value: unknown): void {
  if (props.disabled || (value !== 'new' && value !== 'existing')) return;
  update({
    object: null,
    objectVerified: false,
    batch: null,
    target:
      value === 'new'
        ? { mode: 'new', clientKey: newOtherInventoryBatchKey() }
        : { mode: 'existing', batchId: '' },
  });
}
function chooseObject(id: string | null): void {
  if (props.disabled) return;
  const object = options.objects.value.find((item) => item.id === id) ?? null;
  update({
    object,
    objectVerified: Boolean(object),
    target:
      object?.id === props.line.object?.id && props.line.target.mode === 'new'
        ? props.line.target
        : { mode: 'new', clientKey: newOtherInventoryBatchKey() },
  });
}
function chooseBatch(id: string | null): void {
  if (props.disabled) return;
  const batch = options.batches.value.find((item) => item.batchId === id) ?? null;
  update({
    batch,
    object: batch
      ? {
          id: batch.materialVariantId ?? batch.productId ?? '',
          itemKind: batch.itemKind,
          itemId: batch.itemId,
          materialVariantId: batch.materialVariantId,
          productId: batch.productId,
          code: batch.itemCode,
          name: batch.itemName,
          materialVariantCode: batch.materialVariantCode,
          unit: batch.unit,
        }
      : null,
    objectVerified: false,
    target: { mode: 'existing', batchId: batch?.batchId ?? '' },
  });
}
function changeNewBatchKey(clientKey: string): void {
  if (!props.disabled) update({ target: { mode: 'new', clientKey } });
}
function splitNewBatch(): void {
  if (!props.disabled) update({ target: { mode: 'new', clientKey: newOtherInventoryBatchKey() } });
}
</script>

<style scoped>
.draft-line {
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.line-heading,
.line-selectors {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.line-heading {
  margin-bottom: 12px;
}
.line-selectors {
  justify-content: flex-start;
  margin-bottom: 12px;
}
.line-selectors > .el-select {
  width: 140px;
}
.line-fields {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) 240px;
  gap: 12px 20px;
  margin-bottom: 12px;
}
.line-fields label {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.quantity-field .el-input-number {
  width: 180px;
}
.unit {
  display: inline-block;
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.batch-group-field {
  grid-column: 1 / -1;
}
.batch-group-field .el-select {
  width: min(400px, 100%);
}
.line-note,
.line-error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.line-note {
  color: var(--el-text-color-secondary);
}
.line-error,
.required-mark {
  color: var(--el-color-danger);
}
@media (max-width: 1100px) {
  .line-fields {
    grid-template-columns: 1fr;
  }
}
</style>
