<template>
  <el-dialog
    v-model="visible"
    :title="`${original ? '编辑采购草稿' : '新建采购'} · ${PURCHASE_ORDER_SOURCE_TYPE_LABELS[sourceType]}`"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!command.busy.value"
    :show-close="!command.busy.value"
  >
    <el-alert
      v-if="stale || freshnessError"
      :title="
        stale
          ? '采购草稿已被更新或下单。当前输入已保留，请关闭后重新打开最新记录。'
          : '当前依据核对失败，请刷新后再保存。输入已保留。'
      "
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-alert
      v-if="command.status.value !== 'idle'"
      title="操作结果尚未确认，当前输入已锁定。请重试原操作或核对列表记录。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-alert
      v-if="supplement"
      title="此单为独立补单；供应商沿用原采购主单，物料和需求来源固定，可调整采购数量、金额及备注。"
      type="info"
      :closable="false"
      class="notice"
    />
    <el-form
      v-loading="loading"
      :disabled="command.locked.value"
      label-width="100px"
      @submit.prevent="save"
    >
      <el-form-item
        label="供应商"
        required
      >
        <strong v-if="supplement">{{ supplierName }}</strong>
        <PurchaseSupplierSelect
          v-else
          v-model:supplier-id="supplierId"
          :supplier-name="supplierName"
          :disabled="command.locked.value"
          :refresh-token="supplierRefreshToken"
          class="order-supplier"
          @ready="supplierReady = $event"
        />
      </el-form-item>
      <el-form-item
        v-if="sourceType === 'demand'"
        label="所属工单"
        required
      >
        <strong>{{ workOrderNo || '尚未选择工单' }}</strong>
        <el-button
          v-if="!supplement"
          link
          type="primary"
          @click="workOrderPickerVisible = true"
          >{{ workOrderId ? '切换工单' : '选择工单' }}</el-button
        >
      </el-form-item>
      <el-button
        link
        type="primary"
        @click="refresh"
        >刷新候选与依据</el-button
      >
      <el-form-item label="备注"
        ><el-input
          v-model="remark"
          type="textarea"
          :rows="2"
          maxlength="2000"
          show-word-limit
      /></el-form-item>
      <div class="line-toolbar">
        <strong>
          采购明细 {{ rows.length }} / 100
          <span v-if="sourceType === 'demand'">；关联需求 {{ selectedIds.length }} 条</span>
        </strong>
        <el-button
          v-if="!supplement && sourceType === 'demand'"
          type="primary"
          plain
          :disabled="!workOrderId"
          @click="selectSources()"
          >添加需求（已关联 {{ selectedIds.length }} 条）</el-button
        >
        <el-button
          v-if="!supplement && sourceType === 'stock'"
          type="primary"
          plain
          @click="addRow"
          >添加物料</el-button
        >
      </div>
      <p class="help">
        采购数量独立填写，不分摊到需求；金额填写每条明细的整行总额，正式下单后冻结。
        同物料及精确版本只保留一行，不同供应商请另建采购单。
        <template v-if="supplement">补单来源固定，原采购行或原到货选错须取消草稿后重建。</template>
      </p>
      <el-table
        :data="rows"
        row-key="key"
        empty-text="请选择需求或添加采购物料"
      >
        <el-table-column type="expand"
          ><template #default="{ row }">
            <PurchaseOrderSources :sources="row.sources" />
            <el-descriptions
              v-if="supplement && originalLine(row.key)"
              :column="2"
              border
              size="small"
              title="本行补单来源"
            >
              <el-descriptions-item label="原采购"
                >{{ originalLine(row.key)?.originPurchaseNo }} · 原采购行 ID：
                {{ originalLine(row.key)?.originOrderLineId }}</el-descriptions-item
              >
              <el-descriptions-item label="原到货单号"
                >{{ originalLine(row.key)?.originReceiptNo ?? '未提供' }} · 原到货明细 ID：{{
                  originalLine(row.key)?.originReceiptLineId
                }}</el-descriptions-item
              >
              <el-descriptions-item label="创建时到货行id">{{
                originalLine(row.key)?.supplementEvidence
              }}</el-descriptions-item>
            </el-descriptions>
          </template></el-table-column
        >
        <el-table-column
          label="物料与精确版本"
          min-width="360"
        >
          <template #default="{ row }">
            <PurchaseMaterialSelect
              v-if="sourceType === 'stock' && !supplement"
              :item-id="row.itemId"
              :variant-id="row.materialVariantId"
              :item-label="row.itemCode"
              :variant-label="row.materialVariantCode"
              :disabled="command.locked.value"
              @change="(item, variant) => changeMaterial(row, item, variant)"
              @ready="row.ready = $event"
            />
            <div v-else>
              <strong>{{ row.itemCode }} · {{ row.itemName }}</strong>
              <p>{{ row.materialVariantCode }}</p>
              <el-tag
                v-if="!row.ready"
                type="danger"
                >来源须重新核对</el-tag
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="采购数量"
          width="210"
          ><template #default="{ row }"
            ><el-input-number
              v-model="row.plannedQuantity"
              :min="1"
              :max="PURCHASE_ORDER_MAX_QUANTITY"
              :precision="0"
              :step="1"
              controls-position="right"
              placeholder="独立填写" /></template
        ></el-table-column>
        <el-table-column
          prop="unit"
          label="单位"
          width="75"
        />
        <el-table-column
          label="无税金额"
          min-width="180"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.taxExclusiveAmount"
              :maxlength="PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH"
              placeholder="整行总额（选填）"
              :aria-label="`${row.itemName || '本行'}无税金额`"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="含税金额"
          min-width="180"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.taxInclusiveAmount"
              :maxlength="PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH"
              placeholder="整行总额（选填）"
              :aria-label="`${row.itemName || '本行'}含税金额`"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="关联需求"
          width="105"
          ><template #default="{ row }">
            <el-button
              v-if="sourceType === 'demand' && !supplement"
              link
              type="primary"
              :disabled="command.locked.value"
              @click="selectSources(row)"
              >{{ row.sources.length }} 条需求</el-button
            >
            <span v-else>{{
              row.sources.length ? `${row.sources.length} 条需求` : '独立备料'
            }}</span>
          </template></el-table-column
        >
        <el-table-column
          v-if="!supplement"
          label="操作"
          width="80"
          fixed="right"
          ><template #default="{ $index }"
            ><el-button
              link
              type="danger"
              @click="rows.splice($index, 1)"
              >移除</el-button
            >
          </template></el-table-column
        >
      </el-table>
    </el-form>
    <template #footer>
      <el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      >
      <el-button
        v-else
        type="primary"
        :disabled="!canSave"
        :loading="command.busy.value"
        @click="save"
        >保存采购草稿</el-button
      >
    </template>
  </el-dialog>
  <ProcurementDemandPickerDialog
    v-model:visible="pickerVisible"
    :selected-ids="pickerSelectedIds"
    :already-added-ids="pickerAlreadyAddedIds"
    :other-row-ids="pickerOtherRowIds"
    :disabled="loading || command.locked.value"
    :work-order-id="workOrderId"
    :item-id="sourceRow?.itemId"
    :material-variant-id="sourceRow?.materialVariantId"
    @selected="adoptDemands"
  />
  <ProcurementWorkOrderPickerDialog
    v-model:visible="workOrderPickerVisible"
    @selected="selectWorkOrder"
  />
</template>

<script setup lang="ts">
import {
  PURCHASE_ORDER_SOURCE_TYPE_LABELS,
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderEditor } from '../composables/usePurchaseOrderEditor';
import ProcurementDemandPickerDialog from './ProcurementDemandPickerDialog.vue';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
import PurchaseMaterialSelect from './PurchaseMaterialSelect.vue';
import PurchaseSupplierSelect from './PurchaseSupplierSelect.vue';
import ProcurementWorkOrderPickerDialog from './ProcurementWorkOrderPickerDialog.vue';
const emit = defineEmits<{ saved: [string] }>();
const {
  visible,
  loading,
  stale,
  freshnessError,
  pickerVisible,
  sourceType,
  workOrderId,
  workOrderNo,
  workOrderPickerVisible,
  sourceRow,
  pickerSelectedIds,
  pickerAlreadyAddedIds,
  pickerOtherRowIds,
  supplierRefreshToken,
  supplierId,
  supplierName,
  supplierReady,
  selectWorkOrder,
  selectSources,
  remark,
  original,
  rows,
  command,
  supplement,
  selectedIds,
  canSave,
  open,
  close,
  save,
  refresh,
  adoptDemands,
  addRow,
  changeMaterial,
} = usePurchaseOrderEditor((id) => emit('saved', id));
const originalLine = (id: string) => original.value?.items.find((line) => line.id === id);
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>

<style scoped>
.notice {
  margin-bottom: 16px;
}
.line-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 22px;
}
.help {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}
.el-input-number {
  width: 180px;
}
.order-supplier {
  width: 360px;
  max-width: 100%;
}
</style>
