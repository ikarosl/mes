<template>
  <div class="inbound-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        ><el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="入库单号或供应商" /></el-form-item
        ><el-form-item label="状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
            ><el-option
              v-for="(label, value) in inboundOrderStatusLabels"
              :key="value"
              :label="label"
              :value="value" /></el-select></el-form-item
        ><el-form-item class="query-actions"
          ><el-button
            type="primary"
            :loading="inbounds.loading.value"
            @click="search"
            >查询</el-button
          ><el-button @click="resetQuery">重置</el-button></el-form-item
        ></el-form
      >
    </section>
    <section class="table-panel">
      <TableToolbar
        ><template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增外购物料入库单</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="inbounds.loading.value"
            @click="loadRows" /></template
      ></TableToolbar>
      <el-table
        v-loading="inbounds.loading.value"
        :data="inbounds.rows.value"
        class="data-table"
        empty-text="暂无外购物料入库单"
      >
        <el-table-column
          prop="inboundNo"
          label="入库单号"
          min-width="190"
        /><el-table-column
          prop="provider"
          label="供应方"
          min-width="140"
          ><template #default="{ row }">{{ row.provider || '-' }}</template></el-table-column
        ><el-table-column
          label="状态"
          width="110"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'completed'
                  ? 'success'
                  : row.status === 'cancelled'
                    ? 'info'
                    : 'warning'
              "
              >{{ inboundOrderStatusLabel(row.status) }}</el-tag
            ></template
          ></el-table-column
        ><el-table-column
          prop="detailCount"
          label="明细数"
          width="85"
          align="center"
        /><el-table-column
          label="总入库数量"
          min-width="150"
          ><template #default="{ row }">{{ summary(row) }}</template></el-table-column
        ><el-table-column
          label="确认时间"
          width="175"
          ><template #default="{ row }">{{
            row.inboundAt ? formatDateTimeForDisplay(row.inboundAt) : '-'
          }}</template></el-table-column
        ><el-table-column
          prop="remark"
          label="备注"
          min-width="150"
          show-overflow-tooltip
        /><el-table-column
          label="操作"
          width="220"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openDetail(row.inboundId)"
              >详情</el-button
            ><el-button
              v-if="row.status === 'pending'"
              link
              type="success"
              :loading="pending('confirm', row.inboundId)"
              @click="confirmOrder(row)"
              >确认入库</el-button
            ><el-button
              v-if="row.status === 'pending'"
              link
              type="danger"
              :loading="pending('cancel', row.inboundId)"
              @click="cancelOrder(row)"
              >取消</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <div class="table-footer">
        <span>共 {{ inbounds.total.value }} 条</span
        ><el-select
          v-model="query.pageSize"
          class="page-size-select"
          @change="pageSizeChanged"
          ><el-option
            label="10条/页"
            :value="10" /><el-option
            label="20条/页"
            :value="20" /><el-option
            label="50条/页"
            :value="50" /></el-select
        ><el-pagination
          v-model:current-page="query.page"
          :page-size="query.pageSize"
          :total="inbounds.total.value"
          layout="prev,pager,next,jumper"
          @current-change="loadRows"
        />
      </div>
    </section>
    <el-dialog
      v-model="createVisible"
      title="创建外购物料入库单"
      :width="DialogWidth.xl"
      :before-close="beforeCreateClose"
      :close-on-click-modal="false"
      ><div class="dialog-body">
        <el-alert
          title="保存后仅形成待确认入库单，不增加库存；确认入库前仍可取消。"
          type="info"
          :closable="false"
        /><el-form
          class="create-form"
          label-width="90px"
          ><el-row :gutter="16"
            ><el-col :span="12"
              ><el-form-item label="入库单号"
                ><el-input
                  v-model="form.inboundNo"
                  placeholder="留空由系统生成" /></el-form-item></el-col
            ><el-col :span="12"
              ><el-form-item label="供应方"
                ><el-input
                  v-model="form.provider"
                  maxlength="100" /></el-form-item></el-col></el-row
          ><el-form-item label="备注"
            ><el-input
              v-model="form.remark"
              type="textarea"
              :rows="2"
              maxlength="5000" /></el-form-item
        ></el-form>
        <div class="detail-heading">
          <strong>入库明细</strong
          ><el-button
            type="primary"
            plain
            :icon="Plus"
            @click="addLine"
            >添加明细</el-button
          >
        </div>
        <el-table
          :data="form.details"
          class="detail-table"
          ><el-table-column
            label="物料"
            min-width="230"
            ><template #default="{ row }"
              ><el-select
                v-model="row.itemId"
                filterable
                placeholder="选择有效物料"
                ><el-option
                  v-for="option in materialOptions"
                  :key="option.id"
                  :label="`${option.itemCode} · ${option.productName}`"
                  :value="option.id"
              /></el-select>
              <div
                v-if="row.itemId && !optionById.has(row.itemId)"
                class="invalid-text"
              >
                已失效，请重新选择
              </div></template
            ></el-table-column
          ><el-table-column
            label="单位"
            width="80"
            ><template #default="{ row }">{{
              optionById.get(row.itemId)?.unit || '-'
            }}</template></el-table-column
          ><el-table-column
            label="库存批次号"
            min-width="170"
            ><template #default="{ row }"
              ><el-input
                v-model="row.batchCode"
                maxlength="100"
                placeholder="必填" /></template></el-table-column
          ><el-table-column
            label="入库数量"
            width="170"
            ><template #default="{ row }"
              ><el-input-number
                v-model="row.inboundQuantity"
                :min="0.0001"
                :precision="4" /></template></el-table-column
          ><el-table-column
            label="操作"
            width="70"
            ><template #default="{ $index }"
              ><el-button
                link
                type="danger"
                :icon="Delete"
                @click="removeLine($index)" /></template></el-table-column
        ></el-table>
        <p class="form-hint">
          同一入库单内不可重复填写相同物料与库存批次；当前没有来料质检，确认后库存状态固定为“可用”。
        </p>
      </div>
      <template #footer
        ><el-button @click="requestCreateClose">取消</el-button
        ><el-button
          type="primary"
          :loading="creating"
          :disabled="!canCreate"
          @click="submitCreate"
          >保存待确认单</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="detailVisible"
      title="外购物料入库单详情"
      :width="DialogWidth.xl"
      :close-on-click-modal="false"
      ><div
        v-loading="inbounds.detailLoading.value"
        class="dialog-body"
      >
        <template v-if="inbounds.detail.value"
          ><el-alert
            :title="detailNotice"
            :type="
              inbounds.detail.value.status === 'completed'
                ? 'success'
                : inbounds.detail.value.status === 'cancelled'
                  ? 'info'
                  : 'warning'
            "
            :closable="false"
          /><el-descriptions
            :column="3"
            border
            class="detail-summary"
            ><el-descriptions-item label="入库单号">{{
              inbounds.detail.value.inboundNo
            }}</el-descriptions-item
            ><el-descriptions-item label="状态">{{
              inboundOrderStatusLabel(inbounds.detail.value.status)
            }}</el-descriptions-item
            ><el-descriptions-item label="版本">{{
              inbounds.detail.value.version
            }}</el-descriptions-item
            ><el-descriptions-item label="创建人">{{
              inbounds.detail.value.createdByName || '-'
            }}</el-descriptions-item
            ><el-descriptions-item label="创建时间">{{
              formatDateTimeForDisplay(inbounds.detail.value.createdAt)
            }}</el-descriptions-item
            ><el-descriptions-item label="供应方">{{
              inbounds.detail.value.provider || '-'
            }}</el-descriptions-item
            ><el-descriptions-item label="确认人">{{
              inbounds.detail.value.operatorName || '-'
            }}</el-descriptions-item
            ><el-descriptions-item label="确认时间">{{
              inbounds.detail.value.inboundAt
                ? formatDateTimeForDisplay(inbounds.detail.value.inboundAt)
                : '-'
            }}</el-descriptions-item
            ><el-descriptions-item label="备注">{{
              inbounds.detail.value.remark || '-'
            }}</el-descriptions-item></el-descriptions
          ><el-table :data="inbounds.detail.value.details"
            ><el-table-column
              label="物料"
              min-width="190"
              ><template #default="{ row }"
                >{{ row.itemCode }} · {{ row.itemName }}</template
              ></el-table-column
            ><el-table-column
              prop="batchCode"
              label="库存批次"
              min-width="150"
            /><el-table-column
              label="数量"
              width="140"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.inboundQuantity) }} {{ row.unit }}</template
              ></el-table-column
            ><el-table-column
              label="库存状态"
              width="100"
              ><template #default>可用</template></el-table-column
            ><el-table-column
              label="正库存流水"
              width="130"
              ><template #default="{ row }">{{
                row.inventoryTransactionId ? `#${row.inventoryTransactionId}` : '尚未生成'
              }}</template></el-table-column
            ></el-table
          ></template
        >
      </div></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import type {
  CreatePurchaseInboundPayload,
  ProductOption,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { productApi } from '../../api/product';
import TableToolbar from '../../components/TableToolbar.vue';
import { inboundOrderStatusLabel, inboundOrderStatusLabels } from '../../constants/business-status';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { formatQuantity } from '../production/production-status';
import { usePurchaseInbounds } from '../production/composables/usePurchaseInbounds';
defineOptions({ name: 'InboundOrdersPage' });
const inbounds = usePurchaseInbounds();
const query = reactive<PurchaseInboundOrderQuery>({ page: 1, pageSize: 20 });
const createVisible = ref(false),
  detailVisible = ref(false),
  creating = ref(false),
  options = ref<ProductOption[]>([]);
const form = reactive<CreatePurchaseInboundPayload>({
  inboundNo: null,
  provider: null,
  remark: null,
  details: [],
});
const materialOptions = computed(() => options.value.filter((x) => x.itemKind === 'material'));
const optionById = computed(() => new Map(materialOptions.value.map((x) => [x.id, x])));
const duplicateKeys = computed(() => {
  const seen = new Set<string>(),
    dupes = new Set<string>();
  for (const x of form.details) {
    const key = `${x.itemId}:${x.batchCode.trim()}`;
    if (x.itemId && x.batchCode.trim()) {
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
  }
  return dupes;
});
const canCreate = computed(
  () =>
    form.details.length > 0 &&
    duplicateKeys.value.size === 0 &&
    form.details.every(
      (x) => optionById.value.has(x.itemId) && x.batchCode.trim() && x.inboundQuantity > 0,
    ),
);
const dirty = computed(() =>
  Boolean(form.inboundNo || form.provider || form.remark || form.details.length),
);
const loadRows = () => inbounds.load({ ...query, keyword: query.keyword?.trim() || undefined });
const search = () => {
  query.page = 1;
  return loadRows();
};
const resetQuery = () => {
  query.keyword = undefined;
  query.status = undefined;
  query.page = 1;
  return loadRows();
};
const pageSizeChanged = () => {
  query.page = 1;
  return loadRows();
};
const openCreate = async () => {
  resetForm();
  createVisible.value = true;
  try {
    options.value = await productApi.productOptions();
  } catch (e) {
    EMessage.error(e, '物料候选加载失败');
  }
};
const addLine = () =>
  form.details.push({ itemId: '', batchCode: '', inboundQuantity: 0.0001, remark: null });
const removeLine = (i: number) => form.details.splice(i, 1);
const submitCreate = async () => {
  if (!canCreate.value || creating.value) return;
  creating.value = true;
  try {
    const row = await inbounds.create(form);
    EMessage.success(`待确认入库单 ${row.inboundNo} 已创建，尚未计入库存`);
    createVisible.value = false;
    await loadRows();
    await openDetail(row.inboundId);
  } catch (e) {
    EMessage.error(e, duplicateKeys.value.size ? '同一物料与库存批次不能重复' : '入库单创建失败');
  } finally {
    creating.value = false;
  }
};
const openDetail = async (id: string) => {
  detailVisible.value = true;
  try {
    await inbounds.loadDetail(id);
  } catch (e) {
    EMessage.error(e, '入库单详情加载失败');
  }
};
const confirmOrder = async (row: PurchaseInboundOrderItem) => {
  try {
    await ElMessageBox.confirm(
      `本单共 ${row.detailCount} 条明细，涉及 ${new Set(row.details.map((x) => x.itemBatchId)).size} 个库存批次（${summary(row)}）。确认后立即生成可分配库存；当前没有来料质检，且已确认入库当前不能取消或修改，请先核对数据。`,
      '确认外购物料入库',
      { type: 'warning', confirmButtonText: '确认入库', cancelButtonText: '返回核对' },
    );
    await inbounds.confirm(row);
    EMessage.success('入库已确认，正库存流水已生成');
    await loadRows();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    EMessage.error(e, '确认入库失败');
  }
};
const cancelOrder = async (row: PurchaseInboundOrderItem) => {
  try {
    await ElMessageBox.confirm(
      '取消后不会生成库存；入库单和明细仍作为历史记录保留。',
      '取消待确认入库单',
      { type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '返回' },
    );
    await inbounds.cancel(row);
    EMessage.success('待确认入库单已取消，未产生库存');
    await loadRows();
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    EMessage.error(e, '取消入库单失败');
  }
};
const pending = (action: string, id: string) => inbounds.pendingKeys.value.has(`${action}:${id}`);
const summary = (row: PurchaseInboundOrderItem) =>
  row.quantitySummary.map((x) => `${formatQuantity(x.quantity)} ${x.unit}`).join('；');
const detailNotice = computed(() =>
  inbounds.detail.value?.status === 'completed'
    ? '已确认入库，每条明细均已生成 purchase_inbound 正库存流水。'
    : inbounds.detail.value?.status === 'cancelled'
      ? '已取消，未产生库存；单据和明细保留。'
      : '尚未计入库存，确认前可取消。',
);
const beforeCreateClose = async (done: () => void) => {
  if (await canDiscard()) {
    resetForm();
    done();
  }
};
const requestCreateClose = async () => {
  if (await canDiscard()) {
    resetForm();
    createVisible.value = false;
  }
};
const canDiscard = async () => {
  if (inbounds.getCreateIntentStatus() !== 'idle') {
    try {
      await ElMessageBox.confirm(
        '上次创建结果尚未确认，请先核对列表；放弃安全重试可能造成重复建单。',
        '放弃幂等意图',
        { type: 'warning' },
      );
      inbounds.resetCreateIntent();
      return true;
    } catch {
      return false;
    }
  }
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('表单内容尚未提交，是否放弃？', '放弃创建', { type: 'warning' });
    return true;
  } catch {
    return false;
  }
};
const resetForm = () => {
  form.inboundNo = null;
  form.provider = null;
  form.remark = null;
  form.details = [];
};
onMounted(loadRows);
onActivated(loadRows);
</script>
<style scoped>
.inbound-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 200px;
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
  border-bottom: 1px solid #e5e7eb;
}
.data-table {
  width: 100%;
  font-size: 14px;
}
.data-table :deep(th.el-table__cell) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
}
.data-table :deep(.el-tag) {
  border: 0;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-height: 56px;
  padding: 0 16px;
  color: #6b7280;
}
.page-size-select {
  width: 78px;
}
.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.create-form {
  margin-top: 18px;
}
.create-form :deep(.el-row) {
  margin-right: 0 !important;
  margin-left: 0 !important;
}
.create-form :deep(.el-col:first-child) {
  padding-left: 0 !important;
}
.create-form :deep(.el-col:last-child) {
  padding-right: 0 !important;
}
.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0;
}
.detail-table :deep(.el-select),
.detail-table :deep(.el-input-number) {
  width: 100%;
}
.form-hint {
  color: #6b7280;
  font-size: 12px;
}
.invalid-text {
  color: #ef4444;
  font-size: 12px;
}
.detail-summary {
  margin: 16px 0;
}
@media (max-width: 900px) {
  .query-form {
    display: grid;
    grid-template-columns: 1fr;
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
