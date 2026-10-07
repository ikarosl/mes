<template>
  <el-dialog
    :model-value="modelValue"
    title="新建通用出库（界面预览）"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    @update:model-value="updateVisible"
  >
    <div class="create-body">
      <InlineHint>
        同一张单只含<strong>同一类型</strong>。保存后待出库，示例库存不扣减、不占用额度；确认时重新核对整单。
      </InlineHint>
      <el-form
        :model="form"
        label-width="90px"
        class="create-form"
        @submit.prevent="submit"
      >
        <el-form-item
          label="出库类型"
          required
        >
          <el-radio-group
            :model-value="form.itemKind"
            :disabled="submitting"
            @update:model-value="changeKind"
          >
            <el-radio-button
              v-for="kind in PREVIEW_OUTBOUND_ITEM_KINDS"
              :key="kind"
              :value="kind"
            >
              {{ INVENTORY_ITEM_KIND_LABELS[kind] }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          label="出库去向"
          required
          :error="attemptedSubmit && !form.destination.trim() ? '请填写出库去向' : ''"
        >
          <el-input
            v-model="form.destination"
            :disabled="submitting"
            maxlength="200"
            show-word-limit
            placeholder="例如：东区装配车间、设备维护区"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            :disabled="submitting"
            type="textarea"
            :rows="2"
            maxlength="5000"
            placeholder="选填，记录本次出库说明"
          />
        </el-form-item>
      </el-form>

      <section class="candidate-section">
        <div class="section-toolbar">
          <strong>选择库存批次</strong>
          <el-input
            v-model="candidateKeyword"
            class="candidate-search"
            clearable
            placeholder="搜索编码、名称、版本或批号"
            aria-label="搜索示例库存批次"
          />
        </div>
        <InlineHint class="stock-hint">
          {{
            form.itemKind === 'material'
              ? '物料按精确版本选择，可出库量已扣除生产预留。'
              : '成品可出库量取账面可用库存，生产预留不适用。'
          }}
          冻结或无可出库量的批次不可添加。
        </InlineHint>
        <el-table
          :data="candidateRows"
          row-key="itemBatchId"
          class="preview-table"
          empty-text="当前搜索没有对应的示例库存批次"
        >
          <el-table-column
            label="编码 / 名称"
            min-width="160"
          >
            <template #default="{ row }">
              <div>{{ row.itemCode }}</div>
              <div>{{ row.itemName }}</div>
            </template>
          </el-table-column>
          <el-table-column
            v-if="form.itemKind === 'material'"
            prop="materialVariantCode"
            label="精确版本"
            min-width="135"
          />
          <el-table-column
            prop="batchCode"
            label="库存批号"
            min-width="160"
          />
          <el-table-column
            v-if="form.itemKind === 'material'"
            label="生产预留"
            width="85"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.reservedQuantity) }}</template>
          </el-table-column>
          <el-table-column
            label="可出库量"
            width="100"
            align="right"
          >
            <template #default="{ row }"
              ><strong>{{
                formatQuantity(previewOutboundAvailableQuantity(row))
              }}</strong></template
            >
          </el-table-column>
          <el-table-column
            prop="unit"
            label="单位"
            width="55"
          />
          <el-table-column
            label="批次状态 / 资格"
            min-width="145"
          >
            <template #default="{ row }">
              <span :class="{ 'blocked-text': previewOutboundBatchBlockReason(row) }">
                {{
                  previewOutboundBatchBlockReason(row) || inventoryBatchStatusLabel(row.batchStatus)
                }}
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="75"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="
                  submitting ||
                  isSelected(row.itemBatchId) ||
                  Boolean(previewOutboundBatchBlockReason(row))
                "
                @click="addBatch(row)"
              >
                {{ isSelected(row.itemBatchId) ? '已添加' : '添加' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="details-section">
        <div class="section-toolbar">
          <strong>出库明细</strong><span>已添加 {{ form.details.length }} 个批次</span>
        </div>
        <el-table
          :data="selectedRows"
          row-key="itemBatchId"
          class="preview-table"
          empty-text="请从上方添加库存批次，再填写出库数量"
        >
          <el-table-column
            label="编码 / 名称"
            min-width="170"
          >
            <template #default="{ row }"
              ><div>{{ row.batch.itemCode }}</div>
              <div>{{ row.batch.itemName }}</div></template
            >
          </el-table-column>
          <el-table-column
            v-if="form.itemKind === 'material'"
            label="精确版本"
            min-width="135"
          >
            <template #default="{ row }">{{ row.batch.materialVariantCode }}</template>
          </el-table-column>
          <el-table-column
            label="库存批号"
            min-width="160"
          >
            <template #default="{ row }">{{ row.batch.batchCode }}</template>
          </el-table-column>
          <el-table-column
            label="当前可出库量"
            width="120"
            align="right"
          >
            <template #default="{ row }">{{
              formatQuantity(previewOutboundAvailableQuantity(row.batch))
            }}</template>
          </el-table-column>
          <el-table-column
            label="出库数量"
            min-width="200"
          >
            <template #default="{ row }">
              <el-input
                v-model="row.line.quantity"
                :disabled="submitting"
                inputmode="numeric"
                maxlength="20"
                :aria-label="`${row.batch.batchCode} 出库数量`"
                placeholder="请输入正整数"
              />
              <div
                v-if="lineError(row.line, row.batch)"
                class="quantity-error"
                role="alert"
              >
                {{ lineError(row.line, row.batch) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="单位"
            width="55"
            ><template #default="{ row }">{{ row.batch.unit }}</template></el-table-column
          >
          <el-table-column
            label="操作"
            width="75"
            fixed="right"
          >
            <template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="submitting"
                @click="removeBatch(row.itemBatchId)"
                >移除</el-button
              ></template
            >
          </el-table-column>
        </el-table>
        <InlineHint class="quantity-hint"
          >数量只接受<strong>1～{{ formatQuantity(MAX_PERSISTED_INTEGER_QUANTITY) }} 的整数</strong
          >，不能超过当前可出库量；不同单位分别核对。</InlineHint
        >
        <p
          v-if="formError"
          class="quantity-error"
          role="alert"
        >
          {{ formError }}
        </p>
      </section>
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="requestClose"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        @click="submit"
        >保存待出库单</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { InventoryBatchItem } from '@company/contracts';
import { INVENTORY_ITEM_KIND_LABELS } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import InlineHint from '../../../components/InlineHint.vue';
import { inventoryBatchStatusLabel } from '../../../constants/business-status';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../production/production-status';
import {
  PREVIEW_OUTBOUND_ITEM_KINDS,
  previewOutboundAvailableQuantity,
  previewOutboundBatchBlockReason,
  previewOutboundQuantityError,
} from '../general-outbound-preview';
import type {
  PreviewOutboundDraft,
  PreviewOutboundDraftLine,
  PreviewOutboundItemKind,
} from '../general-outbound-preview';

defineOptions({ name: 'GeneralOutboundCreateDialog' });

const props = defineProps<{
  modelValue: boolean;
  active: boolean;
  initialKind: PreviewOutboundItemKind;
  inventory: InventoryBatchItem[];
  submitting: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [draft: PreviewOutboundDraft];
}>();
const form = reactive<PreviewOutboundDraft>({
  itemKind: props.initialKind,
  destination: '',
  remark: '',
  details: [],
});
const candidateKeyword = ref('');
const attemptedSubmit = ref(false);
const formError = ref('');
const dirty = computed(() => Boolean(form.destination || form.remark || form.details.length));
const candidateRows = computed(() => {
  const keyword = candidateKeyword.value.trim().toLocaleLowerCase();
  return props.inventory.filter(
    (batch) =>
      batch.itemKind === form.itemKind &&
      (!keyword ||
        [batch.itemCode, batch.itemName, batch.materialVariantCode ?? '', batch.batchCode].some(
          (value) => value.toLocaleLowerCase().includes(keyword),
        )),
  );
});
const selectedRows = computed(() =>
  form.details.flatMap((line) => {
    const batch = props.inventory.find((item) => item.itemBatchId === line.itemBatchId);
    return batch ? [{ itemBatchId: line.itemBatchId, line, batch }] : [];
  }),
);
const isSelected = (id: string): boolean => form.details.some((line) => line.itemBatchId === id);
const lineError = (line: PreviewOutboundDraftLine, batch: InventoryBatchItem): string | null =>
  previewOutboundBatchBlockReason(batch) ||
  previewOutboundQuantityError(line.quantity, previewOutboundAvailableQuantity(batch));

const reset = (): void => {
  form.itemKind = props.initialKind;
  form.destination = '';
  form.remark = '';
  form.details = [];
  candidateKeyword.value = '';
  attemptedSubmit.value = false;
  formError.value = '';
};
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible || !dirty.value) reset();
  },
);

const addBatch = (batch: InventoryBatchItem): void => {
  if (props.submitting || isSelected(batch.itemBatchId) || previewOutboundBatchBlockReason(batch))
    return;
  form.details.push({ itemBatchId: batch.itemBatchId, quantity: '1' });
  formError.value = '';
};
const removeBatch = (id: string): void => {
  if (props.submitting) return;
  form.details = form.details.filter((line) => line.itemBatchId !== id);
  formError.value = '';
};
const changeKind = async (value: string | number | boolean | undefined): Promise<void> => {
  const kind = PREVIEW_OUTBOUND_ITEM_KINDS.find((item) => item === value);
  if (!kind || kind === form.itemKind || props.submitting) return;
  if (form.details.length) {
    try {
      await RouteMessageBox.confirm(
        '切换出库类型会清空已添加的批次与数量，去向和备注会保留。',
        '切换出库类型',
        { type: 'warning', confirmButtonText: '切换并清空明细', cancelButtonText: '保留当前类型' },
      );
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') EMessage.error(error, '切换出库类型失败');
      return;
    }
  }
  form.itemKind = kind;
  form.details = [];
  candidateKeyword.value = '';
  formError.value = '';
};
const submit = (): void => {
  if (props.submitting || !props.active) return;
  attemptedSubmit.value = true;
  formError.value = '';
  if (!form.destination.trim()) return;
  if (!form.details.length) {
    formError.value = '请至少添加一条出库明细';
    return;
  }
  if (selectedRows.value.length !== form.details.length) {
    formError.value = '已选库存批次不存在，请重新选择';
    return;
  }
  if (selectedRows.value.some((row) => lineError(row.line, row.batch))) {
    formError.value = '请修正明细中的数量或库存资格问题';
    return;
  }
  emit('submit', {
    itemKind: form.itemKind,
    destination: form.destination,
    remark: form.remark,
    details: form.details.map((line) => ({ ...line })),
  });
};
const canDiscard = async (): Promise<boolean> => {
  if (props.submitting) return false;
  if (!props.modelValue || !dirty.value) return true;
  try {
    await RouteMessageBox.confirm(
      '已填写的去向、备注和出库明细尚未保存，是否放弃？',
      '放弃新建出库单',
      { type: 'warning', confirmButtonText: '放弃草稿', cancelButtonText: '继续填写' },
    );
    return true;
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '关闭草稿失败');
    return false;
  }
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (await canDiscard()) done();
};
const requestClose = async (): Promise<void> => {
  if (await canDiscard()) emit('update:modelValue', false);
};
const updateVisible = (visible: boolean): void => {
  emit('update:modelValue', visible);
};
onScopeDispose(useTabsStore().registerCloseGuard('warehouse-outbound', canDiscard));
</script>

<style scoped>
.create-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.create-form {
  margin-top: 4px;
}
.create-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}
.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}
.section-toolbar > span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.candidate-search {
  width: 310px;
}
.stock-hint {
  margin-bottom: 10px;
}
.quantity-hint {
  margin-top: 10px;
}
.preview-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.preview-table :deep(.el-table__row) {
  height: 48px;
}
.blocked-text {
  color: var(--el-text-color-secondary);
}
.quantity-error {
  margin: 4px 0 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.5;
}
</style>
