<template>
  <tbody class="draft-line">
    <tr class="draft-line-main">
      <td class="kind-cell">
        <el-select
          :model-value="line.itemKind"
          :disabled="disabled"
          aria-label="明细类型"
          @change="changeKind"
        >
          <el-option
            v-for="kind in INVENTORY_ITEM_KINDS"
            :key="kind"
            :value="kind"
            :label="INVENTORY_ITEM_KIND_LABELS[kind]"
          />
        </el-select>
        <div class="secondary-text">
          第 {{ rowIndex + 1 }} 行<template v-if="line.lineNo">
            · 原明细 {{ line.lineNo }}</template
          >
        </div>
      </td>
      <td class="identity-cell">
        <div
          v-if="line.target.mode === 'new' && line.itemKind === 'material'"
          class="identity-select"
        >
          <RemoteSearchSelect
            :model-value="line.material?.id ?? null"
            :options="options.materialOptions.value"
            :loading="options.materialLoading.value"
            :error="options.materialError.value"
            :has-more="options.materialHasMore.value"
            :disabled="disabled"
            placeholder="搜索物料编码或名称"
            :missing-selection-label="
              line.material ? `${otherStockMaterialLabel(line.material)}（待核验）` : undefined
            "
            @update:model-value="chooseMaterial"
            @open="options.refreshMaterials"
            @refresh="options.refreshMaterials"
            @search="options.searchMaterials"
          />
          <RemoteSearchSelect
            :model-value="line.object?.id ?? null"
            :options="options.objectOptions.value"
            :loading="options.objectLoading.value"
            :error="options.objectError.value"
            :has-more="options.objectHasMore.value"
            :disabled="disabled || !line.material || !line.materialVerified"
            placeholder="选择精确版本"
            :missing-selection-label="
              line.object
                ? `${line.object.materialVariantCode || line.object.id}（待核验）`
                : undefined
            "
            @update:model-value="chooseObject"
            @open="options.refreshObjects"
            @refresh="options.refreshObjects"
            @search="options.searchObjects"
          />
        </div>
        <div
          v-else-if="line.target.mode === 'new'"
          class="identity-select"
        >
          <RemoteSearchSelect
            :model-value="line.object?.id ?? null"
            :options="options.objectOptions.value"
            :loading="options.objectLoading.value"
            :error="options.objectError.value"
            :has-more="options.objectHasMore.value"
            :disabled="disabled"
            placeholder="搜索成品编码或名称"
            :missing-selection-label="
              line.object ? `${line.object.code} · ${line.object.name}（待核验）` : undefined
            "
            @update:model-value="chooseObject"
            @open="options.refreshObjects"
            @refresh="options.refreshObjects"
            @search="options.searchObjects"
          />
          <div class="secondary-text">
            {{ line.object ? `成品编码：${line.object.code}` : '选择成品后显示编码' }}
          </div>
        </div>
        <template v-else>
          <strong>{{ line.object?.name || '从已有批次带入对象' }}</strong>
          <div class="secondary-text">
            <template v-if="line.object">
              {{
                line.itemKind === 'material'
                  ? `精确版本：${line.object.materialVariantCode || '-'}`
                  : `成品编码：${line.object.code}`
              }}
            </template>
            <template v-else>请选择右侧库存批次</template>
          </div>
          <div
            v-if="line.object && line.itemKind === 'material'"
            class="secondary-text"
          >
            物料编码：{{ line.object.code }}
          </div>
        </template>
        <p
          v-if="verificationMessage"
          :class="isVerificationError ? 'line-error' : 'secondary-text'"
          class="verification-note"
        >
          {{ verificationMessage }}
        </p>
      </td>
      <td class="batch-cell">
        <InboundBatchModeSwitch
          v-if="direction === 'inbound'"
          :model-value="line.target.mode"
          :disabled="disabled"
          @update:model-value="changeTargetMode"
        />
        <RemoteSearchSelect
          v-if="line.target.mode === 'existing'"
          class="batch-select"
          :model-value="line.target.batchId || null"
          :options="options.batchOptions.value"
          :loading="options.batchLoading.value"
          :error="options.batchError.value"
          :has-more="options.batchHasMore.value"
          :disabled="disabled"
          placeholder="搜索库存批号、对象编码或名称"
          :missing-selection-label="
            line.batch ? `${line.batch.batchCode} · ${line.batch.itemName}` : undefined
          "
          @update:model-value="chooseBatch"
          @open="options.refreshBatches"
          @refresh="options.refreshBatches"
          @search="options.searchBatches"
        />
        <InboundNewBatchSelect
          v-else
          class="batch-select"
          :model-value="line.object ? line.target.clientKey : ''"
          :groups="newBatchGroups"
          :disabled="disabled || !line.object"
          scope-label="本单"
          @update:model-value="changeNewBatchKey"
        />
        <div
          v-if="line.target.mode === 'new'"
          class="secondary-text batch-summary"
        >
          {{ batchSummary }}
        </div>
        <div
          v-else-if="line.batch"
          class="secondary-text batch-summary"
        >
          <template v-if="line.batch.availableQuantity === '-'">
            库存余额及生产预留在确认时重新核对。
          </template>
          <template v-else>
            可用库存 {{ line.batch.availableQuantity }} {{ line.batch.unit }}
            <template v-if="direction === 'outbound'">
              · 生产预留 {{ line.batch.reservedQuantity }} · 可出
              <strong>{{ line.batch.usableQuantity }} {{ line.batch.unit }}</strong>
            </template>
          </template>
        </div>
      </td>
      <td class="quantity-cell">
        <el-input-number
          :model-value="line.quantity"
          :disabled="disabled"
          :min="1"
          :max="99_999_999"
          :step="1"
          :precision="0"
          controls-position="right"
          aria-label="本次数量"
          @update:model-value="update({ quantity: $event })"
        />
      </td>
      <td class="unit-cell">{{ line.object?.unit || line.material?.unit || '-' }}</td>
      <td class="remark-cell">
        <el-input
          :model-value="line.remark"
          :disabled="disabled"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 3 }"
          maxlength="5000"
          placeholder="可选，补充本行说明"
          aria-label="行备注"
          @update:model-value="update({ remark: $event })"
        />
      </td>
      <td class="actions-cell">
        <el-button
          link
          type="danger"
          :disabled="disabled"
          @click="emit('remove', line.key)"
          >移除</el-button
        >
      </td>
    </tr>
  </tbody>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { INVENTORY_ITEM_KINDS, INVENTORY_ITEM_KIND_LABELS } from '@company/constants';
import type {
  OtherInventoryDirection,
  OtherInventoryItemKind,
  OtherStockMaterial,
  OtherStockObject,
} from '@company/contracts';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import {
  newOtherInventoryBatchKey,
  type OtherInventoryDraftLine,
  type OtherInventoryDraftLineUpdate,
} from '../other-inventory-draft';
import { otherStockMaterialLabel } from '../other-inventory-presentation';
import { useOtherStockLineOptions } from '../composables/useOtherStockLineOptions';
import type { NewBatchGroupChoice } from '../inbound-new-batch-groups';
import InboundBatchModeSwitch from './InboundBatchModeSwitch.vue';
import InboundNewBatchSelect from './InboundNewBatchSelect.vue';

defineOptions({ name: 'OtherStockDraftLine' });
const props = defineProps<{
  line: OtherInventoryDraftLine;
  direction: OtherInventoryDirection;
  rowIndex: number;
  disabled: boolean;
  newBatchGroups: readonly NewBatchGroupChoice[];
  batchSummary: string;
}>();
const emit = defineEmits<{
  updateLine: [update: OtherInventoryDraftLineUpdate];
  remove: [key: string];
}>();
const update = (patch: OtherInventoryDraftLineUpdate['patch']): void =>
  emit('updateLine', { key: props.line.key, patch });
const options = useOtherStockLineOptions(
  () => props.line,
  props.direction,
  verifyMaterial,
  verifyObject,
);
const isVerificationError = computed(
  () =>
    options.materialError.value ||
    options.materialUnavailable.value ||
    options.objectError.value ||
    options.objectUnavailable.value,
);
const verificationMessage = computed((): string => {
  if (props.line.target.mode !== 'new') return '';
  if (props.line.itemKind === 'material' && props.line.material && !props.line.materialVerified) {
    if (options.materialError.value) return '物料核验失败，请重试。';
    if (options.materialLoading.value) return '正在核验已选物料…';
    if (options.materialUnavailable.value) return '该物料当前不能新建批次，请重新选择。';
    return '已选物料待核验，请刷新候选。';
  }
  if (!props.line.object || props.line.objectVerified) return '';
  if (options.objectError.value) return '对象核验失败，请重试。';
  if (options.objectLoading.value) return '正在核验已选对象…';
  if (options.objectUnavailable.value) return '该对象当前不能新建批次，请重新选择。';
  return '已选对象待核验，请刷新候选。';
});

function verifyMaterial(material: OtherStockMaterial | null): void {
  if (props.line.target.mode !== 'new' || props.line.itemKind !== 'material') return;
  update({ material: material ?? props.line.material, materialVerified: Boolean(material) });
}
function verifyObject(object: OtherStockObject | null): void {
  if (props.line.target.mode !== 'new') return;
  update({ object: object ?? props.line.object, objectVerified: Boolean(object) });
}
function changeKind(value: OtherInventoryItemKind): void {
  if (props.disabled || value === props.line.itemKind) return;
  update({
    itemKind: value,
    material: null,
    materialVerified: false,
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
  if (
    props.disabled ||
    (value !== 'new' && value !== 'existing') ||
    value === props.line.target.mode
  )
    return;
  update({
    material: null,
    materialVerified: false,
    object: null,
    objectVerified: false,
    batch: null,
    target:
      value === 'new'
        ? { mode: 'new', clientKey: newOtherInventoryBatchKey() }
        : { mode: 'existing', batchId: '' },
  });
}
function chooseMaterial(id: string | null): void {
  if (props.disabled || props.line.target.mode !== 'new') return;
  const material = options.materials.value.find((item) => item.id === id) ?? null;
  if (id && !material) return;
  if (id === props.line.material?.id) {
    update({ material, materialVerified: Boolean(material) });
    return;
  }
  update({
    material,
    materialVerified: Boolean(material),
    object: null,
    objectVerified: false,
    target: { mode: 'new', clientKey: newOtherInventoryBatchKey() },
  });
}
function chooseObject(id: string | null): void {
  if (props.disabled || props.line.target.mode !== 'new') return;
  const object = options.objects.value.find((item) => item.id === id) ?? null;
  if (id && !object) return;
  if (
    object &&
    (object.itemKind !== props.line.itemKind ||
      (props.line.itemKind === 'material' && object.itemId !== props.line.material?.id))
  )
    return;
  update({
    object,
    objectVerified: Boolean(object),
    target:
      object?.id === props.line.object?.id
        ? props.line.target
        : { mode: 'new', clientKey: newOtherInventoryBatchKey() },
  });
}
function chooseBatch(id: string | null): void {
  if (props.disabled || props.line.target.mode !== 'existing') return;
  const batch = options.batches.value.find((item) => item.batchId === id) ?? null;
  if (id && (!batch || batch.itemKind !== props.line.itemKind)) return;
  update({
    batch,
    material:
      batch?.itemKind === 'material' && batch.itemId
        ? {
            id: batch.itemId,
            code: batch.itemCode,
            name: batch.itemName,
            unit: batch.unit,
          }
        : null,
    materialVerified: false,
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
  if (props.disabled || props.line.target.mode !== 'new' || !props.line.object || !clientKey.trim())
    return;
  update({ target: { mode: 'new', clientKey } });
}
</script>

<style scoped>
td {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.draft-line-main:hover > td {
  background: var(--el-fill-color);
}
.identity-cell > strong {
  color: var(--el-text-color-primary);
}
.identity-select {
  display: grid;
  gap: 8px;
}
.kind-cell .el-select,
.quantity-cell .el-input-number {
  width: 100%;
}
.batch-select {
  margin-top: 8px;
  width: 100%;
}
.batch-summary {
  line-height: 1.6;
}
.secondary-text,
.line-error {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
}
.secondary-text {
  color: var(--el-text-color-secondary);
}
.secondary-text strong {
  color: var(--el-text-color-primary);
}
.line-error {
  color: var(--el-color-danger);
}
.verification-note {
  margin-bottom: 0;
}
.actions-cell {
  position: sticky;
  right: 0;
  z-index: 1;
  box-shadow: -1px 0 0 var(--el-border-color-lighter);
}
</style>
