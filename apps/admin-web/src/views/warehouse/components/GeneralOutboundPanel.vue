<template>
  <div class="general-outbound-panel">
    <InlineHint
      ><strong>界面预览 · 示例数据</strong>：通用出库只更新本页 mock
      数据，刷新或关闭页面标签后重置。生产领料在独立标签中办理。</InlineHint
    >
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="orders.query"
        @submit.prevent="orders.search"
      >
        <el-form-item label="出库类型">
          <el-select
            v-model="orders.query.itemKind"
            clearable
            placeholder="全部类型"
          >
            <el-option
              v-for="kind in PREVIEW_OUTBOUND_ITEM_KINDS"
              :key="kind"
              :value="kind"
              :label="INVENTORY_ITEM_KIND_LABELS[kind]"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="orders.query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="status in PREVIEW_OUTBOUND_STATUSES"
              :key="status"
              :value="status"
              :label="OUTBOUND_ORDER_STATUS_LABELS[status]"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input
            v-model="orders.query.keyword"
            class="keyword-input"
            clearable
            placeholder="单号、去向、编码、名称、版本或批号"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            @click="orders.search"
            >查询</el-button
          >
          <el-button @click="orders.resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>
    <section class="table-panel">
      <TableToolbar>
        <template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            :disabled="busy"
            @click="openCreate"
            >新建出库单</el-button
          ></template
        >
      </TableToolbar>
      <el-table
        :data="orders.rows.value"
        row-key="id"
        class="preview-table"
        empty-text="当前没有对应的示例出库单，可重置查询或新建出库单"
      >
        <el-table-column
          prop="outboundNo"
          label="出库单号"
          min-width="215"
          ><template #default="{ row }"
            ><strong>{{ row.outboundNo }}</strong></template
          ></el-table-column
        >
        <el-table-column
          label="类型"
          width="80"
          ><template #default="{ row }">{{
            INVENTORY_ITEM_KIND_LABELS[row.itemKind as PreviewOutboundItemKind]
          }}</template></el-table-column
        >
        <el-table-column
          label="状态"
          width="105"
          ><template #default="{ row }"
            ><el-tag :type="previewOutboundStatusTag(row.status)">{{
              OUTBOUND_ORDER_STATUS_LABELS[row.status as PreviewOutboundStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          prop="destination"
          label="出库去向"
          min-width="165"
          show-overflow-tooltip
        />
        <el-table-column
          label="出库内容"
          min-width="205"
          show-overflow-tooltip
          ><template #default="{ row }">{{ itemSummary(row) }}</template></el-table-column
        >
        <el-table-column
          label="明细"
          width="85"
          align="center"
          ><template #default="{ row }">{{ row.details.length }} 批次</template></el-table-column
        >
        <el-table-column
          label="本单数量"
          min-width="140"
          ><template #default="{ row }">{{
            previewOutboundQuantitySummary(row.details)
          }}</template></el-table-column
        >
        <el-table-column
          label="制单人 / 时间"
          min-width="180"
          ><template #default="{ row }"
            ><div>{{ row.createdByName }}</div>
            <div class="secondary-text">
              {{ formatDateTimeForDisplay(row.createdAt) }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="出库时间"
          min-width="175"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.outboundAt, '—')
          }}</template></el-table-column
        >
        <el-table-column
          label="操作"
          width="220"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.id)"
              >详情</el-button
            >
            <template v-if="row.status === 'pending_picking'">
              <el-button
                link
                type="primary"
                :disabled="busy"
                :loading="pendingKey === `confirm:${row.id}`"
                @click="confirmOrder(row)"
                >确认出库</el-button
              >
              <el-button
                link
                type="primary"
                :disabled="busy"
                :loading="pendingKey === `cancel:${row.id}`"
                @click="cancelOrder(row)"
                >取消</el-button
              >
            </template>
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="orders.total.value"
        :current-page="orders.query.page"
        :page-size="orders.query.pageSize"
        @update:page-size="orders.changePageSize"
        @page-change="orders.changePage"
      />
    </section>
    <GeneralOutboundCreateDialog
      v-model="createVisible"
      :active="active"
      :initial-kind="createKind"
      :inventory="orders.inventory.value"
      :submitting="createSubmitting"
      @submit="submitCreate"
    />
    <GeneralOutboundDetailDialog
      v-model="detailVisible"
      :active="active"
      :detail="orders.detail.value"
      :inventory="orders.inventory.value"
      :busy="busy"
      @confirm="confirmOrder"
      @cancel="cancelOrder"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { INVENTORY_ITEM_KIND_LABELS, OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useTabsStore } from '../../../stores/tabs';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useGeneralOutboundPreview } from '../composables/useGeneralOutboundPreview';
import {
  PREVIEW_OUTBOUND_ITEM_KINDS,
  PREVIEW_OUTBOUND_STATUSES,
  previewOutboundQuantitySummary,
  previewOutboundStatusTag,
} from '../general-outbound-preview';
import type {
  PreviewOutboundDraft,
  PreviewOutboundItemKind,
  PreviewOutboundOrder,
  PreviewOutboundStatus,
} from '../general-outbound-preview';
import GeneralOutboundCreateDialog from './GeneralOutboundCreateDialog.vue';
import GeneralOutboundDetailDialog from './GeneralOutboundDetailDialog.vue';

defineOptions({ name: 'GeneralOutboundPanel' });
const props = defineProps<{ active: boolean }>();
const orders = useGeneralOutboundPreview();
const createVisible = ref(false);
const detailVisible = ref(false);
const createSubmitting = ref(false);
const createKind = ref<PreviewOutboundItemKind>('finished_product');
const pendingKey = ref<string | null>(null);
const busy = computed(() => createSubmitting.value || pendingKey.value !== null);
const itemSummary = (order: PreviewOutboundOrder): string =>
  [
    ...new Set(
      order.details.map(
        (line) =>
          `${line.itemCode} ${line.itemName}${line.materialVariantCode ? ` · ${line.materialVariantCode}` : ''}`,
      ),
    ),
  ].join('；');

const openCreate = (): void => {
  createKind.value = orders.query.itemKind || 'finished_product';
  createVisible.value = true;
};
const openDetail = (id: string): void => {
  orders.openDetail(id);
  detailVisible.value = true;
};
const submitCreate = (draft: PreviewOutboundDraft): void => {
  if (busy.value || !props.active) return;
  createSubmitting.value = true;
  try {
    const order = orders.create(draft);
    createVisible.value = false;
    openDetail(order.id);
    EMessage.success('示例单已保存为待出库，mock 库存尚未扣减');
  } catch (error) {
    EMessage.error(error, '示例出库单保存失败');
  } finally {
    createSubmitting.value = false;
  }
};
const confirmOrder = async (order: PreviewOutboundOrder): Promise<void> => {
  if (busy.value || !props.active) return;
  pendingKey.value = `confirm:${order.id}`;
  try {
    await RouteMessageBox.confirm(
      `确认示例单 ${order.outboundNo}，出库去向为“${order.destination}”，本单 ${previewOutboundQuantitySummary(order.details)}，共 ${order.details.length} 个库存批次。确认后将一次扣减整单 mock 库存，单据转为已出库并只读；库存不足时整单不扣减。`,
      '确认通用出库（界面预览）',
      { type: 'warning', confirmButtonText: '确认整单出库', cancelButtonText: '返回核对' },
    );
    if (!props.active) return;
    orders.confirm(order.id);
    EMessage.success('示例出库已确认，mock 库存已扣减');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      EMessage.error(error, '示例出库确认失败，整单未扣减');
  } finally {
    pendingKey.value = null;
  }
};
const cancelOrder = async (order: PreviewOutboundOrder): Promise<void> => {
  if (busy.value || !props.active) return;
  pendingKey.value = `cancel:${order.id}`;
  try {
    const { value } = await RouteMessageBox.prompt(
      `取消示例单 ${order.outboundNo}（去向：${order.destination}，${previewOutboundQuantitySummary(order.details)}）后，保留单据与明细，mock 库存不扣减。请填写取消原因。`,
      '取消通用出库单（界面预览）',
      {
        type: 'warning',
        confirmButtonText: '确认取消',
        cancelButtonText: '返回核对',
        inputType: 'textarea',
        inputPlaceholder: '请填写取消原因',
        inputValidator: (input: string) =>
          input.trim()
            ? input.trim().length <= 5000 || '取消原因不能超过 5000 个字符'
            : '请填写取消原因',
      },
    );
    if (!props.active) return;
    orders.cancel(order.id, value);
    EMessage.success('示例出库单已取消，mock 库存未扣减');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '示例出库单取消失败');
  } finally {
    pendingKey.value = null;
  }
};
onScopeDispose(useTabsStore().registerCloseGuard('warehouse-outbound', async () => !busy.value));
</script>

<style scoped>
.general-outbound-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 18px 18px 2px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0 18px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-select) {
  width: 140px;
}
.query-form :deep(.keyword-input) {
  width: 310px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.preview-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.preview-table :deep(.el-table__row) {
  height: 48px;
}
.secondary-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
