<template>
  <el-dialog
    v-model="visible"
    title="到货记录"
    :width="DialogWidth.xl"
  >
    <template v-if="context">
      <el-descriptions
        :column="2"
        border
        class="records-context"
      >
        <el-descriptions-item label="采购单号">{{ context.purchaseNo }}</el-descriptions-item>
        <el-descriptions-item label="采购行 ID">{{ context.lineId }}</el-descriptions-item>
        <el-descriptions-item label="物料 / 精确版本">
          <div>{{ context.itemName }}</div>
          <div>{{ context.materialVariantCode }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="供应商">{{ context.supplierName }}</el-descriptions-item>
        <el-descriptions-item
          label="累计到货"
          :span="2"
        >
          <strong v-if="receivedQuantity !== null"
            >{{ receivedQuantity }} {{ context.unit }}</strong
          >
          <span v-else>{{ loading ? '读取中' : '尚未读取成功' }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <InlineHint class="records-hint">
        仅列登记在本采购行的有效到货；搜索不改变累计总量。
      </InlineHint>
      <el-form
        inline
        class="records-query"
        @submit.prevent="search"
      >
        <el-form-item label="查找到货">
          <el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="到货单号 / 明细 ID / 供应商批号"
            class="records-keyword"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          >
          <el-button
            :disabled="loading"
            @click="reset"
            >重置</el-button
          >
        </el-form-item>
      </el-form>
      <el-alert
        v-if="failed"
        :title="
          receivedQuantity === null
            ? '到货记录读取失败，请刷新重试。'
            : '到货记录刷新失败，当前内容为上次读取结果，请刷新重试。'
        "
        type="error"
        :closable="false"
        class="records-error"
      />
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="receiptLineId"
        class="records-table"
      >
        <template #empty>
          <span>{{
            failed ? '到货记录读取失败' : loading ? '正在读取到货记录' : '暂无到货记录'
          }}</span>
        </template>
        <el-table-column
          label="到货单号"
          min-width="200"
        >
          <template #default="{ row }">
            <strong>{{ row.receiptNo }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          label="到货明细 ID"
          min-width="135"
        >
          <template #default="{ row }">
            <strong>{{ row.receiptLineId }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          label="到货时间"
          width="180"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.receivedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="供应商批号"
          min-width="150"
        >
          <template #default="{ row }">{{ row.supplierBatchCode || '—' }}</template>
        </el-table-column>
        <el-table-column
          label="计入本行数量"
          min-width="150"
          align="right"
        >
          <template #default="{ row }">
            <strong>{{ row.receivedQuantity }} {{ context.unit }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          v-if="canAccessRoute({ name: 'procurement-receipts' })"
          label="操作"
          width="100"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="$emit('source-receipt', row.receiptLineId)"
              >查看到货</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        v-if="receivedQuantity !== null"
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        :disabled="loading"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </template>
    <template #footer>
      <el-button
        :loading="loading"
        @click="load"
        >刷新</el-button
      >
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { usePurchaseOrderLineReceiptRecords } from '../composables/usePurchaseOrderLineReceiptRecords';

defineEmits<{ 'source-receipt': [string] }>();
const { canAccessRoute } = useRouteAccess();
const {
  visible,
  context,
  keyword,
  page,
  pageSize,
  loading,
  failed,
  rows,
  total,
  receivedQuantity,
  open,
  close,
  load,
  search,
  reset,
  changePage,
  changePageSize,
} = usePurchaseOrderLineReceiptRecords();

defineExpose({ open, close, visible });
</script>

<style scoped>
.records-context {
  overflow-wrap: anywhere;
}
.records-context :deep(.el-descriptions__label) {
  width: 120px;
}
.records-context strong,
.records-table strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.records-hint {
  margin-top: 12px;
}
.records-query {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
  margin-top: 16px;
}
.records-query :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 12px;
}
.records-keyword {
  width: 320px;
}
.records-error {
  margin-bottom: 12px;
}
.records-table :deep(.cell) {
  overflow-wrap: anywhere;
}
.records-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
</style>
