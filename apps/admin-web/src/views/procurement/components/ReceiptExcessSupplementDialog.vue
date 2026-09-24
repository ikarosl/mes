<template>
  <el-dialog
    v-model="visible"
    title="承接本次到货 · 超量补单"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
  >
    <template v-if="line && order">
      <el-alert
        title="采购确认额外购买数量并下单；库管随后在本次到货定稿中关联补单，无需重复登记到货或质检。"
        type="info"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        title="创建结果尚未确认，输入已锁定。请重试原操作或先核对采购单记录。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-descriptions
        :column="2"
        border
        class="notice"
      >
        <el-descriptions-item label="原采购"
          >{{ order.purchaseNo }} · 第 {{ line.lineNo }} 行</el-descriptions-item
        >
        <el-descriptions-item label="供应商">{{ line.supplierName }}</el-descriptions-item>
        <el-descriptions-item label="物料 / 版本"
          >{{ line.itemCode }} · {{ line.itemName }} ·
          {{ line.materialVariantCode }}</el-descriptions-item
        >
        <el-descriptions-item label="原计划量"
          >{{ line.plannedQuantity }} {{ line.unit }}</el-descriptions-item
        >
      </el-descriptions>
      <el-alert
        v-if="readError"
        title="到货依据核对失败，输入已保留。请刷新或重新选择到货后办理。"
        type="error"
        :closable="false"
        class="notice"
      />
      <div
        v-if="!selectedId"
        v-loading="loading"
      >
        <p>选择这次需要承接的到货。不同到货明细分别办理，不能按同一采购行混用。</p>
        <el-table
          :data="rows"
          row-key="id"
          empty-text="当前采购行尚无到货记录"
        >
          <el-table-column
            prop="receiptNo"
            label="到货单"
            min-width="210"
          />
          <el-table-column
            prop="lineNo"
            label="行"
            width="55"
          />
          <el-table-column
            label="到货时间"
            width="165"
          >
            <template #default="{ row }">{{ formatDateTimeForDisplay(row.receivedAt) }}</template>
          </el-table-column>
          <el-table-column
            label="供应商批号"
            min-width="130"
          >
            <template #default="{ row }">{{ row.supplierBatchCode || '未提供' }}</template>
          </el-table-column>
          <el-table-column
            label="本次核实总量"
            width="115"
          >
            <template #default="{ row }">{{ row.receivedQuantity }} {{ line.unit }}</template>
          </el-table-column>
          <el-table-column
            label="当前未处置量"
            width="115"
          >
            <template #default="{ row }">{{ row.unprocessedQuantity }} {{ line.unit }}</template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="85"
            fixed="right"
          >
            <template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="loading || readError"
                @click="select(row)"
                >选择</el-button
              ></template
            >
          </el-table-column>
        </el-table>
        <PaginationFooter
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          @page-change="changePage"
          @update:page-size="changePageSize"
        />
      </div>
      <div
        v-else
        v-loading="loading"
        class="notice"
      >
        <el-descriptions
          v-if="selected"
          :column="2"
          border
        >
          <el-descriptions-item label="所选到货"
            >{{ selected.receiptNo }} · 第 {{ selected.lineNo }} 行（明细
            {{ selected.id }}）</el-descriptions-item
          >
          <el-descriptions-item label="到货时间">{{
            formatDateTimeForDisplay(selected.receivedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="本次核实总量"
            >{{ selected.receivedQuantity }} {{ line.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="当前未处置量"
            >{{ selected.unprocessedQuantity }} {{ line.unit }}</el-descriptions-item
          >
        </el-descriptions>
        <el-button
          :disabled="command.locked.value || loading"
          class="reselect"
          @click="reselect"
          >重新选择到货</el-button
        >
      </div>
      <el-alert
        v-if="selected && Number(selected.unprocessedQuantity) === 0"
        title="本批实物已执行完。创建补单草稿不会增加实物数量或入库资格，后续分配仍须由库管核对。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-form
        v-if="selectedId"
        :disabled="command.locked.value || loading || readError"
        label-width="110px"
        @submit.prevent="save"
        ><el-form-item
          label="承接采购量"
          required
          ><el-input-number
            v-model="quantity"
            :min="1"
            :max="PURCHASE_ORDER_MAX_QUANTITY"
            :precision="0"
            controls-position="right" /></el-form-item
        ><el-form-item
          label="额外购买依据"
          required
          ><el-input
            v-model="evidence"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit /></el-form-item
        ><el-form-item label="补单备注"
          ><el-input
            v-model="remark"
            maxlength="2000" /></el-form-item
      ></el-form>
    </template>
    <template #footer
      ><el-button
        :disabled="command.locked.value"
        :loading="loading"
        @click="load"
        >刷新到货依据</el-button
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
        :disabled="!canSave"
        :loading="command.busy.value"
        @click="save"
        >创建补单草稿</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useReceiptExcessSupplement } from '../composables/useReceiptExcessSupplement';
const emit = defineEmits<{ saved: [string] }>();
const {
  visible,
  order,
  line,
  selected,
  selectedId,
  rows,
  loading,
  readError,
  page,
  pageSize,
  total,
  quantity,
  evidence,
  remark,
  command,
  canSave,
  open,
  close,
  load,
  select,
  reselect,
  save,
  changePage,
  changePageSize,
} = useReceiptExcessSupplement((id) => emit('saved', id));
const beforeClose = (): void => {
  void close();
};
defineExpose({ open, close, visible, locked: command.locked });
</script>
<style scoped>
.reselect {
  margin-top: 12px;
}
.notice {
  margin-bottom: 16px;
}
</style>
