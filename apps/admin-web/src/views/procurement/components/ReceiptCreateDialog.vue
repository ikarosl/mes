<template>
  <el-dialog
    v-model="visible"
    title="确认实际到货"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <el-alert
      v-if="command.status.value !== 'idle'"
      title="上次到货确认结果尚未确定，请重试原操作或先核对到货记录。当前输入已锁定。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-alert
      v-if="stale"
      title="采购收货依据已变化或核对失败，当前输入已保留。请重新选择采购单核对。"
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
        ><el-form-item label="采购单 / 供应商"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100" /></el-form-item
        ><el-form-item
          ><el-button
            native-type="submit"
            type="primary"
            >查询</el-button
          ></el-form-item
        ></el-form
      >
      <el-table
        :data="orders"
        row-key="id"
        empty-text="没有可继续收货的采购单"
        ><el-table-column
          prop="purchaseNo"
          label="采购单号"
          min-width="180"
        /><el-table-column
          label="供应商"
          min-width="210"
          show-overflow-tooltip
          ><template #default="{ row }">{{
            supplierSummary(row.suppliers)
          }}</template></el-table-column
        ><el-table-column
          prop="lineCount"
          label="物料行"
          width="100"
        /><el-table-column
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
        ></el-table
      >
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
      <el-descriptions
        :column="2"
        border
        ><el-descriptions-item label="采购单">{{ order.purchaseNo }}</el-descriptions-item
        ><el-descriptions-item label="供应商">{{
          supplierSummary(order.suppliers)
        }}</el-descriptions-item></el-descriptions
      >
      <div class="toolbar">
        <el-button
          :disabled="loading"
          @click="refreshQuantities"
          >刷新数量</el-button
        >
        <el-button @click="reselect">重新选择采购</el-button>
      </div>
      <el-form-item
        label="实际到货时间"
        required
        ><el-date-picker
          v-model="receivedAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
      /></el-form-item>
      <el-form-item
        label="交接凭据"
        required
        ><el-input
          v-model="handoverEvidence"
          maxlength="2000"
          show-word-limit
      /></el-form-item>
      <el-form-item label="备注"
        ><el-input
          v-model="remark"
          maxlength="2000"
      /></el-form-item>
      <el-alert
        title="按本次实物总量登记，暂不按原单、补单或待退拆分。质检后再核对数量与分配；承接已到货的补单无需重复登记到货。"
        type="info"
        :closable="false"
        class="notice"
      />
      <p class="help">未填写数量的行本次不收货。不同供应商批号拆成不同到货明细。</p>
      <p class="help">
        累计量按本采购行归属统计，不含本次输入；转由补单承接的数量计入补单。累计已到货包含已退回数量，累计已入库不代表当前库存。
      </p>
      <el-table
        :data="rows"
        row-key="key"
      >
        <el-table-column
          prop="line.supplierName"
          label="实际供应商"
          min-width="160"
        />
        <el-table-column
          label="物料 / 版本"
          min-width="260"
          ><template #default="{ row }"
            >{{ row.line.itemCode }} · {{ row.line.itemName }}
            <p>{{ row.line.materialVariantCode }}</p></template
          ></el-table-column
        >
        <el-table-column
          label="原计划量"
          width="120"
          ><template #default="{ row }"
            >{{ Number(row.line.plannedQuantity) }} {{ row.line.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="累计已到货"
          width="130"
          ><template #default="{ row }"
            >{{ Number(row.line.quantities.receivedQuantity) }} {{ row.line.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="累计已入库"
          width="130"
          ><template #default="{ row }"
            >{{ Number(row.line.quantities.inboundQuantity) }} {{ row.line.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="本次实收"
          width="185"
          ><template #default="{ row }"
            ><el-input-number
              v-model="row.receivedQuantity"
              :precision="0"
              :min="1"
              :max="PURCHASE_ORDER_MAX_QUANTITY"
              controls-position="right"
              placeholder="未收货留空" /></template
        ></el-table-column>
        <el-table-column
          label="供应商批号"
          min-width="160"
          ><template #default="{ row }"
            ><el-input
              v-model="row.supplierBatchCode"
              maxlength="100"
              placeholder="如有请填写" /></template
        ></el-table-column>
        <el-table-column
          label="超量说明"
          min-width="170"
          ><template #default="{ row }"
            ><el-input
              v-model="row.overReceiptNote"
              maxlength="2000"
              placeholder="超量接受依据" /></template
        ></el-table-column>
        <el-table-column
          label="操作"
          width="145"
          fixed="right"
          ><template #default="{ row, $index }"
            ><el-button
              link
              type="primary"
              @click="split(row)"
              >添加另一来料批次</el-button
            ><el-button
              link
              type="danger"
              @click="rows.splice($index, 1)"
              >移除</el-button
            ></template
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
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试原操作</el-button
      ><el-button
        v-else
        type="primary"
        :loading="command.busy.value"
        :disabled="!canConfirm"
        @click="confirm"
        >确认已实际接收</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { supplierSummary } from '../supplier-summary';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import PaginationFooter from '../../../components/PaginationFooter.vue';
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
  refreshQuantities,
  reselect,
  split,
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
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin: 16px 0;
}
.help {
  color: #6b7280;
  font-size: 13px;
}
.el-input-number {
  width: 160px;
}
</style>
