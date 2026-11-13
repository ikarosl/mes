<template>
  <el-dialog
    v-model="visible"
    title="记录到货"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :show-close="!command.busy.value"
  >
    <SubmissionRecoveryNotice
      :status="command.status.value"
      :busy="command.busy.value"
      records-label="到货记录"
      allow-restart
      @retry="command.retry"
      @restart="command.discard"
    />
    <el-alert
      v-if="stale"
      title="采购到货依据已变化或核对失败，输入已保留。请重新选择采购单核对。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <div
      v-if="!order"
      v-loading="loading"
    >
      <el-form
        inline
        @submit.prevent="search"
      >
        <el-form-item label="采购单 / 供应商"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
        /></el-form-item>
        <el-form-item
          ><el-button
            native-type="submit"
            type="primary"
            >查询</el-button
          ></el-form-item
        >
      </el-form>
      <el-table
        :data="orders"
        row-key="id"
        empty-text="没有可登记到货的采购单"
      >
        <el-table-column
          prop="purchaseNo"
          label="采购单号"
          min-width="180"
        />
        <el-table-column
          prop="supplierName"
          label="供应商"
          min-width="210"
        />
        <el-table-column
          prop="lineCount"
          label="物料行"
          width="100"
        />
        <el-table-column
          label="操作"
          width="100"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="selectOrder(row.id)"
              >选择</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <el-form
      v-else
      v-loading="loading"
      :disabled="command.locked.value"
      label-width="110px"
      @submit.prevent="confirm"
    >
      <div class="order-context">
        <div>
          <strong>{{ order.purchaseNo }}</strong
          ><span>供应商 {{ order.supplierName }}</span>
        </div>
        <el-button @click="reselect">更换采购单</el-button>
      </div>
      <div class="receipt-meta-grid">
        <el-form-item
          label="实际到货时间"
          required
          ><el-date-picker
            :model-value="toBeijingDateTimeInputValue(receivedAt)"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            @update:model-value="receivedAt = fromBeijingDateTimeInputValue($event)"
        /></el-form-item>
        <el-form-item
          label="交接凭据（选填）"
          label-width="auto"
          ><el-input
            v-model="handoverEvidence"
            maxlength="2000"
        /></el-form-item>
      </div>
      <el-form-item label="备注（选填）"
        ><el-input
          v-model="remark"
          type="textarea"
          :rows="2"
          maxlength="2000"
      /></el-form-item>
      <InlineHint class="notice"
        >勾选采购单中本次到货的物料；实际入库数量由仓库办理时填写，检验报告可独立补录。历史已入库仅累计本采购行的有效到货，不代表本次到货量或入库上限。</InlineHint
      >
      <el-table
        :data="rows"
        row-key="line.id"
      >
        <el-table-column
          label="本次到货"
          width="100"
          ><template #default="{ row }"
            ><el-checkbox
              v-model="row.selected"
              :aria-label="`登记到货 ${row.line.itemCode}`" /></template
        ></el-table-column>
        <el-table-column
          label="物料 / 精确版本"
          min-width="245"
          ><template #default="{ row }"
            ><strong>{{ row.line.itemName }}</strong>
            <div class="material-meta">
              {{ row.line.itemCode }} · {{ row.line.materialVariantCode }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="采购计划（参考）"
          min-width="150"
          ><template #default="{ row }"
            >{{ Number(row.line.plannedQuantity) }} {{ row.line.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="历史已入库（参考）"
          min-width="180"
          ><template #default="{ row }"
            ><template v-if="row.line.quantities?.inboundQuantity != null"
              >{{ row.line.quantities.inboundQuantity }} {{ row.line.unit }}</template
            ><span v-else>未知</span></template
          ></el-table-column
        >
      </el-table>
    </el-form>
    <template #footer
      ><el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      ><el-button
        v-if="command.status.value === 'idle'"
        type="primary"
        :loading="command.busy.value"
        :disabled="!canConfirm"
        @click="confirm"
        >确认登记到货</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { DialogWidth } from '../../../utils/dialog';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { useReceiptEditor } from '../composables/useReceiptEditor';
const emit = defineEmits<{ saved: [string] }>();
const {
  visible,
  loading,
  stale,
  keyword,
  page,
  pageSize,
  total,
  orders,
  order,
  rows,
  receivedAt,
  handoverEvidence,
  remark,
  command,
  canConfirm,
  open,
  close,
  selectOrder,
  reselect,
  confirm,
  search,
  changePage,
  changePageSize,
} = useReceiptEditor((id) => emit('saved', id));
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.notice {
  margin-bottom: 16px;
}
.order-context,
.order-context > div {
  display: flex;
  align-items: center;
  gap: 20px;
}
.order-context {
  justify-content: space-between;
  margin-bottom: 20px;
}
.receipt-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.material-meta {
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  font-size: 12px;
}
</style>
