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
      title="此单为独立补单；供应商、物料和需求来源沿用原采购行，草稿只可调整采购数量及备注。"
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
        <el-select
          v-model="supplierId"
          class="supplier-field"
          filterable
          remote
          reserve-keyword
          :remote-method="suppliers.search"
          :loading="suppliers.loading.value"
          :disabled="supplement"
          placeholder="搜索供应商名称"
          @visible-change="supplierVisible"
        >
          <el-option
            v-for="supplier in suppliers.options.value"
            :key="supplier.id"
            :value="supplier.id"
            :label="supplier.supplierName"
          />
          <el-option
            v-if="supplierId && !supplierExists"
            :value="supplierId"
            :label="`${original?.supplierName ?? supplierId}（当前不可选）`"
            disabled
          />
        </el-select>
        <el-button
          link
          type="primary"
          @click="refresh"
          >刷新候选与依据</el-button
        >
      </el-form-item>
      <el-form-item label="备注"
        ><el-input
          v-model="remark"
          type="textarea"
          :rows="2"
          maxlength="2000"
          show-word-limit
      /></el-form-item>
      <div class="line-toolbar">
        <strong>采购明细</strong>
        <el-button
          v-if="!supplement && sourceType === 'demand'"
          type="primary"
          plain
          @click="pickerVisible = true"
          >选择需求（已选 {{ selectedIds.length }} 条）</el-button
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
        采购数量独立填写，不分摊到需求；正式下单后供应商、物料、数量和来源均不可编辑。
      </p>
      <el-table
        :data="rows"
        row-key="key"
        empty-text="请选择需求或添加采购物料"
      >
        <el-table-column type="expand"
          ><template #default="{ row }"><PurchaseOrderSources :sources="row.sources" /></template
        ></el-table-column>
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
          label="来源"
          width="105"
          ><template #default="{ row }">{{
            row.sources.length ? `${row.sources.length} 条需求` : '独立备料'
          }}</template></el-table-column
        >
        <el-table-column
          v-if="!supplement"
          label="操作"
          width="80"
          ><template #default="{ $index }"
            ><el-button
              link
              type="danger"
              @click="rows.splice($index, 1)"
              >移除</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <p
        v-if="supplement"
        class="help"
      >
        原补单依据：{{ original?.items[0]?.supplementEvidence }}
      </p>
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
    :selected-ids="selectedIds"
    @selected="adoptDemands"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PURCHASE_ORDER_SOURCE_TYPE_LABELS, PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderEditor } from '../composables/usePurchaseOrderEditor';
import ProcurementDemandPickerDialog from './ProcurementDemandPickerDialog.vue';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
import PurchaseMaterialSelect from './PurchaseMaterialSelect.vue';
const emit = defineEmits<{ saved: [string] }>();
const {
  visible,
  loading,
  stale,
  freshnessError,
  pickerVisible,
  sourceType,
  supplierId,
  remark,
  original,
  rows,
  suppliers,
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
const supplierExists = computed(() =>
  suppliers.options.value.some((supplier) => supplier.id === supplierId.value),
);
const supplierVisible = (open: boolean): void => {
  if (open) void suppliers.refresh();
};
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>

<style scoped>
.notice {
  margin-bottom: 16px;
}
.supplier-field {
  width: 380px;
  margin-right: 12px;
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
</style>
