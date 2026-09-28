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
      <div class="order-context">
        <div>
          <strong>{{ order.purchaseNo }}</strong>
          <span>{{ supplierSummary(order.suppliers) }}</span>
        </div>
        <div class="toolbar">
          <el-button
            :disabled="loading"
            @click="refreshQuantities"
            >刷新参考量</el-button
          >
          <el-button @click="reselect">更换采购单</el-button>
        </div>
      </div>
      <div class="receipt-meta-grid">
        <el-form-item
          label="实际到货时间"
          required
        >
          <el-date-picker
            v-model="receivedAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
          />
        </el-form-item>
        <el-form-item
          label="交接凭据"
          required
        >
          <el-input
            v-model="handoverEvidence"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
      </div>
      <el-collapse
        v-model="expandedDetails"
        class="optional-details"
      >
        <el-collapse-item
          name="remark"
          title="选填备注"
        >
          <el-input
            v-model="remark"
            type="textarea"
            :rows="2"
            maxlength="2000"
          />
        </el-collapse-item>
        <el-collapse-item
          name="help"
          title="登记口径与累计量说明"
        >
          <p>
            本次只登记实际收到的实物。未填写数量的行不收货；同一采购行不同供应商批号分成不同明细。
          </p>
          <p>
            累计量按采购行归属统计，不含本次输入；已到货包含已退回，已入库不代表当前库存。补单承接已到货实物时无需重复登记。
          </p>
        </el-collapse-item>
      </el-collapse>
      <div class="entry-heading">
        <strong>本次到货明细</strong>
        <span>只填写本次实收数量；计划与累计量仅供核对</span>
      </div>
      <el-table
        :data="rows"
        row-key="key"
      >
        <el-table-column
          label="物料 / 版本 / 供应商"
          min-width="245"
          ><template #default="{ row }">
            <strong>{{ row.line.itemName }}</strong>
            <div class="material-meta">
              {{ row.line.itemCode }} · {{ row.line.materialVariantCode }}
            </div>
            <div class="material-meta">{{ row.line.supplierName }}</div>
          </template></el-table-column
        >
        <el-table-column
          label="采购行参考"
          min-width="170"
          ><template #default="{ row }">
            <div>计划 {{ Number(row.line.plannedQuantity) }} {{ row.line.unit }}</div>
            <div class="material-meta">
              此前已到 {{ Number(row.line.quantities.receivedQuantity) }} · 已入
              {{ Number(row.line.quantities.inboundQuantity) }} {{ row.line.unit }}
            </div>
          </template></el-table-column
        >
        <el-table-column
          label="本次实收 / 差异依据"
          min-width="205"
          ><template #default="{ row }">
            <el-input-number
              v-model="row.receivedQuantity"
              :precision="0"
              :min="1"
              :max="PURCHASE_ORDER_MAX_QUANTITY"
              controls-position="right"
              placeholder="未收货留空"
            />
            <el-input
              v-if="needsOverReceiptNote(row.line.id) || row.overReceiptNote"
              v-model="row.overReceiptNote"
              maxlength="2000"
              placeholder="超过原计划，请填写接受依据"
              class="over-note"
            /> </template
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
      <div
        v-if="splitTotals.length"
        class="split-totals"
      >
        <strong>本次同采购行合计</strong>
        <span
          v-for="item in splitTotals"
          :key="item.lineId"
        >
          {{ item.materialName }} · {{ item.materialVariantCode }}：{{ item.quantity ?? '未填写' }}
          {{ item.quantity === null ? '' : item.unit }}（已填 {{ item.enteredCount }} 批 / 草稿
          {{ item.draftCount }} 行）
        </span>
      </div>
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
import { computed, ref } from 'vue';
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
const expandedDetails = ref<string[]>([]);
const lineSummaries = computed(() => {
  const summaries = new Map<
    string,
    {
      lineId: string;
      materialName: string;
      materialVariantCode: string;
      unit: string;
      draftCount: number;
      enteredCount: number;
      quantity: number | null;
      plannedQuantity: number;
      previousReceived: number;
    }
  >();
  for (const row of rows.value) {
    const lineId = row.line.id;
    const summary = summaries.get(lineId) ?? {
      lineId,
      materialName: row.line.itemName,
      materialVariantCode: row.line.materialVariantCode,
      unit: row.line.unit,
      draftCount: 0,
      enteredCount: 0,
      quantity: null,
      plannedQuantity: Number(row.line.plannedQuantity),
      previousReceived: Number(row.line.quantities.receivedQuantity),
    };
    summary.draftCount += 1;
    if (row.receivedQuantity !== undefined) {
      summary.enteredCount += 1;
      summary.quantity = (summary.quantity ?? 0) + Number(row.receivedQuantity);
    }
    summaries.set(lineId, summary);
  }
  return [...summaries.values()];
});
const splitTotals = computed(() => lineSummaries.value.filter((item) => item.draftCount > 1));
const needsOverReceiptNote = (lineId: string): boolean => {
  const summary = lineSummaries.value.find((item) => item.lineId === lineId);
  return Boolean(
    summary &&
    summary.quantity !== null &&
    summary.previousReceived + summary.quantity > summary.plannedQuantity,
  );
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
.toolbar {
  display: flex;
  gap: 8px;
}
.order-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.order-context > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.order-context span,
.material-meta,
.entry-heading span {
  color: #6b7280;
  font-size: 13px;
}
.receipt-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.optional-details {
  margin: 0 0 16px;
}
.optional-details p {
  margin: 8px 0;
  color: #6b7280;
}
.entry-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 8px 0 10px;
}
.over-note {
  margin-top: 8px;
}
.split-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 12px 0;
}
.split-totals span {
  color: #1f2937;
}
.el-input-number {
  width: 160px;
}
@media (max-width: 900px) {
  .receipt-meta-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
