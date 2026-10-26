<template>
  <div class="other-inventory-page">
    <section class="query-panel">
      <el-form
        :inline="true"
        :model="orders.query"
        class="query-form"
        @submit.prevent="orders.search"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="orders.query.keyword"
            clearable
            placeholder="单号、办理原因或备注"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="orders.query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="status in statuses"
              :key="status"
              :value="status"
              :label="OTHER_INVENTORY_STATUS_LABELS[status]"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="orders.loading.value"
            @click="orders.search"
            >查询</el-button
          >
          <el-button @click="orders.reset">重置</el-button>
        </el-form-item>
      </el-form>
    </section>
    <section class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="editor.open('create')"
            >创建{{ title }}单</el-button
          >
          <span class="independent-note">{{
            direction === 'inbound' ? '用于采购收货、生产入库以外的入库' : '用于生产领料以外的出库'
          }}</span>
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="orders.loading.value"
              @click="orders.load"
            />
          </el-tooltip>
        </template>
      </TableToolbar>
      <el-alert
        v-if="orders.error.value"
        type="error"
        :closable="false"
        title="列表读取失败；已显示的数据是上次成功结果，请刷新后核对。"
      />
      <OtherInboundHistoryGroups
        v-if="direction === 'inbound'"
        :rows="orders.rows.value"
        :loading="orders.loading.value"
        @detail="editor.open('detail', $event)"
        @edit="editor.open('edit', $event)"
        @confirm="editor.open('confirm', $event)"
        @cancel="editor.open('cancel', $event)"
        @batch="goBatch"
      />
      <el-table
        v-else
        v-loading="orders.loading.value"
        :data="orders.rows.value"
        row-key="id"
        class="data-table"
        :empty-text="`暂无${title}单`"
      >
        <el-table-column
          prop="orderNo"
          label="单号"
          min-width="190"
        >
          <template #default="{ row }"
            ><strong>{{ row.orderNo }}</strong></template
          >
        </el-table-column>
        <el-table-column
          label="状态"
          width="140"
        >
          <template #default="{ row }">
            <el-tag :type="otherInventoryStatusTag(row.status)">{{
              OTHER_INVENTORY_STATUS_LABELS[row.status as OtherInventoryStatus]
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="库存对象"
          min-width="210"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ otherInventoryObjectSummary(row) }}</template>
        </el-table-column>
        <el-table-column
          label="明细"
          width="75"
          align="center"
        >
          <template #default="{ row }">{{ activeOtherInventoryLines(row).length }} 条</template>
        </el-table-column>
        <el-table-column
          label="本单数量"
          min-width="145"
        >
          <template #default="{ row }">{{ otherInventoryQuantitySummary(row) }}</template>
        </el-table-column>
        <el-table-column
          prop="reason"
          label="办理原因"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column
          label="制单人 / 时间"
          min-width="185"
        >
          <template #default="{ row }">
            <div>{{ row.createdByName || '-' }}</div>
            <div class="secondary-text">{{ formatDateTimeForDisplay(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="确认人 / 时间"
          min-width="185"
        >
          <template #default="{ row }">
            <div>{{ row.operatorName || '-' }}</div>
            <div class="secondary-text">
              {{ confirmationTimeText(row) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="275"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="editor.open('detail', row.id)"
              >详情</el-button
            >
            <template v-if="row.status === pendingStatus">
              <el-button
                link
                type="primary"
                @click="editor.open('edit', row.id)"
                >编辑草稿</el-button
              >
              <el-button
                link
                type="warning"
                @click="editor.open('confirm', row.id)"
                >确认</el-button
              >
              <el-button
                link
                type="danger"
                @click="editor.open('cancel', row.id)"
                >取消</el-button
              >
            </template>
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="orders.total.value"
        :current-page="orders.query.page ?? 1"
        :page-size="orders.query.pageSize ?? 10"
        @update:page-size="orders.changePageSize"
        @page-change="orders.changePage"
      />
    </section>
    <OtherInventoryOrderDialog
      :direction="direction"
      :editor="editor"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import {
  OTHER_INVENTORY_DIRECTION_LABELS,
  OTHER_INVENTORY_STATUS_LABELS,
} from '@company/constants';
import type {
  OtherInventoryDirection,
  OtherInventoryOrder,
  OtherInventoryStatus,
} from '@company/contracts';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { useOtherInventoryOrdersList } from '../composables/useOtherInventoryOrdersList';
import { useOtherInventoryOrderEditor } from '../composables/useOtherInventoryOrderEditor';
import {
  activeOtherInventoryLines,
  otherInventoryObjectSummary,
  otherInventoryPendingStatus,
  otherInventoryQuantitySummary,
  otherInventoryStatuses,
  otherInventoryStatusTag,
} from '../other-inventory-presentation';
import OtherInventoryOrderDialog from './OtherInventoryOrderDialog.vue';
import OtherInboundHistoryGroups from './OtherInboundHistoryGroups.vue';

defineOptions({ name: 'OtherInventoryOrdersPanel' });
const props = defineProps<{ direction: OtherInventoryDirection; routeName: string }>();
const title = OTHER_INVENTORY_DIRECTION_LABELS[props.direction];
const pendingStatus = otherInventoryPendingStatus(props.direction);
const statuses = otherInventoryStatuses(props.direction);
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const orders = useOtherInventoryOrdersList(props.direction);
const editor = useOtherInventoryOrderEditor(props.direction, props.routeName, orders.load);
onMounted(orders.load);
function confirmationTimeText(row: OtherInventoryOrder): string {
  if (row.confirmedAt) return formatDateTimeForDisplay(row.confirmedAt);
  if (row.status === 'cancelled') return '已取消，库存未变动';
  return '等待整单确认';
}

async function goBatch(itemBatchId: string): Promise<void> {
  if (!canAccessRoute({ name: 'warehouse-inventory' })) return;
  if (editor.controlsLocked.value) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({ name: 'warehouse-inventory', query: { itemBatchId } });
}
</script>

<style scoped>
.other-inventory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 16px 16px 0;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 280px;
}
.query-form :deep(.el-select) {
  width: 170px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.data-table :deep(th.el-table__cell) {
  height: 48px;
  background: var(--el-fill-color-light);
}
.independent-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.secondary-text {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
