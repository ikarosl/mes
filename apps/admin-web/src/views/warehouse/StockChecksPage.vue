<template>
  <div>
    <div class="page-title">
      <div>
        <h2>盘点管理</h2>
        <p>创建库存盘点单，录入实盘数量并处理差异</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="openCreate"
        >新增盘点单</el-button
      >
    </div>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="盘点单号"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            /><el-option
              label="待盘点"
              value="待盘点"
            />
            <el-option
              label="盘点中"
              value="盘点中"
            /><el-option
              label="已完成"
              value="已完成"
            /><el-option
              label="已取消"
              value="已取消"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          ><el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-panel">
      <div class="table-toolbar">
        <div class="batch-actions">
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增盘点单</el-button
          >
        </div>
        <div class="table-tools">
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="loadRows"
            />
          </el-tooltip>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
      >
        <el-table-column
          prop="checkNo"
          label="盘点单号"
          width="180"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }"
            ><el-tag
              :type="
                row.status === '已完成'
                  ? 'success'
                  : row.status === '盘点中'
                    ? 'warning'
                    : row.status === '已取消'
                      ? 'info'
                      : ''
              "
              effect="light"
              >{{ row.status }}</el-tag
            ></template
          >
        </el-table-column>
        <el-table-column
          label="明细数"
          width="80"
          align="center"
          ><template #default="{ row }">{{ row.detailCount }}</template></el-table-column
        >
        <el-table-column
          label="待处理项"
          width="100"
          align="center"
        >
          <template #default="{ row }"
            ><span :class="{ 'danger-text': row.pendingItems > 0 }">{{
              row.pendingItems
            }}</span></template
          >
        </el-table-column>
        <el-table-column
          label="开始时间"
          width="170"
          ><template #default="{ row }">{{
            row.startedAt ? formatTime(row.startedAt) : '-'
          }}</template></el-table-column
        >
        <el-table-column
          label="完成时间"
          width="170"
          ><template #default="{ row }">{{
            row.completedAt ? formatTime(row.completedAt) : '-'
          }}</template></el-table-column
        >
        <el-table-column
          prop="remark"
          label="备注"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="320"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >详情</el-button
            >
            <el-button
              v-if="row.status === '待盘点'"
              link
              type="primary"
              @click="openEdit(row)"
              >录入实盘</el-button
            >
            <el-button
              v-if="row.status === '盘点中'"
              link
              type="success"
              @click="handleComplete(row)"
              >完成盘点</el-button
            >
            <el-button
              v-if="row.status === '已完成'"
              link
              type="primary"
              @click="handleAdjust(row)"
              >生成调整</el-button
            >
            <el-button
              v-if="['待盘点', '盘点中'].includes(row.status)"
              link
              @click="handleCancel(row)"
              >取消</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
        <el-select
          v-model="pageSize"
          class="page-size-select"
          @change="handlePageSizeChange"
        >
          <el-option
            label="10条/页"
            :value="10"
          /><el-option
            label="20条/页"
            :value="20"
          /><el-option
            label="50条/页"
            :value="50"
          />
        </el-select>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="loadRows"
        />
      </div>
    </div>

    <el-dialog
      v-model="createVisible"
      title="新增盘点单"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="100px"
        :model="createForm"
      >
        <el-form-item label="盘点单号"
          ><el-input
            v-model="createForm.checkNo"
            placeholder="留空自动生成"
        /></el-form-item>
        <el-form-item label="备注"
          ><el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="2"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >创建</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="editVisible"
      title="录入实盘数量"
      :width="DialogWidth.lg"
      :close-on-click-modal="false"
    >
      <el-table
        :data="editDetails"
        max-height="480"
        class="data-table"
      >
        <el-table-column
          prop="itemCode"
          label="对象编码"
          width="130"
        />
        <el-table-column
          prop="itemName"
          label="对象名称"
          width="150"
        />
        <el-table-column
          prop="batchCode"
          label="批次号"
          width="130"
        />
        <el-table-column
          prop="stockStatus"
          label="库存状态"
          width="90"
        />
        <el-table-column
          prop="systemQuantity"
          label="账面数量"
          width="110"
          align="right"
        />
        <el-table-column
          label="实盘数量"
          width="140"
        >
          <template #default="{ row, $index }">
            <el-input-number
              v-model="row.actualQuantity"
              :min="0"
              :precision="4"
              size="small"
              controls-position="right"
              style="width: 120px"
            />
          </template>
        </el-table-column>
      </el-table>
      <template #footer
        ><el-button @click="editVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="submitting"
          @click="submitEdit"
          >保存实盘</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="盘点单详情"
      :width="DialogWidth.xl"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
        style="margin-bottom: 16px"
      >
        <el-descriptions-item label="盘点单号">{{ detailRow.checkNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ detailRow.status }}</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{
          detailRow.startedAt ? formatTime(detailRow.startedAt) : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{
          detailRow.completedAt ? formatTime(detailRow.completedAt) : '-'
        }}</el-descriptions-item>
      </el-descriptions>
      <el-table
        v-if="detailDetails.length"
        :data="detailDetails"
        max-height="400"
        class="data-table"
      >
        <el-table-column
          prop="itemCode"
          label="编码"
          width="120"
        />
        <el-table-column
          prop="itemName"
          label="名称"
          width="140"
        />
        <el-table-column
          prop="batchCode"
          label="批次号"
          width="130"
        />
        <el-table-column
          prop="systemQuantity"
          label="账面"
          width="100"
          align="right"
        />
        <el-table-column
          prop="actualQuantity"
          label="实盘"
          width="100"
          align="right"
        />
        <el-table-column
          prop="differenceQuantity"
          label="差异"
          width="100"
          align="right"
        />
        <el-table-column
          label="结果"
          width="90"
        >
          <template #default="{ row }">
            <el-tag
              :type="
                row.result === '一致' ? 'success' : row.result === '盘盈' ? 'warning' : 'danger'
              "
              size="small"
              >{{ row.result }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          prop="adjusted"
          label="已调整"
          width="80"
        >
          <template #default="{ row }">{{ row.adjusted ? '是' : '否' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'StockChecksPage' });

interface StockCheckItem {
  id: string;
  checkNo: string;
  status: string;
  detailCount: number;
  pendingItems: number;
  startedAt: string;
  completedAt: string;
  remark: string;
}

interface StockCheckDetailItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  batchCode: string;
  batchId: string;
  stockStatus: string;
  systemQuantity: string;
  actualQuantity: number;
  differenceQuantity: string;
  result: string;
  adjusted: boolean;
  remark: string;
}

const demoRows: StockCheckItem[] = [
  {
    id: '1',
    checkNo: 'PD-20260721-001',
    status: '已完成',
    detailCount: 10,
    pendingItems: 0,
    startedAt: '2026-07-21T08:00:00',
    completedAt: '2026-07-21T12:00:00',
    remark: '月度盘点A区',
  },
  {
    id: '2',
    checkNo: 'PD-20260721-002',
    status: '盘点中',
    detailCount: 8,
    pendingItems: 3,
    startedAt: '2026-07-21T09:00:00',
    completedAt: '',
    remark: '月度盘点B区',
  },
  {
    id: '3',
    checkNo: 'PD-20260720-003',
    status: '待盘点',
    detailCount: 5,
    pendingItems: 5,
    startedAt: '',
    completedAt: '',
    remark: '随机抽盘',
  },
  {
    id: '4',
    checkNo: 'PD-20260719-004',
    status: '已完成',
    detailCount: 15,
    pendingItems: 0,
    startedAt: '2026-07-19T08:00:00',
    completedAt: '2026-07-19T17:00:00',
    remark: '全库盘点',
  },
  {
    id: '5',
    checkNo: 'PD-20260718-005',
    status: '已取消',
    detailCount: 0,
    pendingItems: 0,
    startedAt: '',
    completedAt: '',
    remark: '取消',
  },
];

const rows = ref<StockCheckItem[]>([...demoRows]);
const detailRow = ref<StockCheckItem | null>(null);
const detailDetails = ref<StockCheckDetailItem[]>([]);
const editDetails = ref<StockCheckDetailItem[]>([]);
const editingId = ref<string | null>(null);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const createVisible = ref(false);
const detailVisible = ref(false);
const editVisible = ref(false);
const query = reactive({ keyword: '', status: '' });
const createForm = reactive({ checkNo: '', remark: '' });

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const ss = query.status;
    let filtered = [...demoRows];
    if (kw) filtered = filtered.filter((r) => r.checkNo.toLowerCase().includes(kw));
    if (ss) filtered = filtered.filter((r) => r.status === ss);
    rows.value = filtered;
    total.value = filtered.length;
    loading.value = false;
  }, 300);
};
const search = async () => {
  currentPage.value = 1;
  await loadRows();
};
const resetQuery = async () => {
  query.keyword = '';
  query.status = '';
  currentPage.value = 1;
  await loadRows();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadRows();
};

const openCreate = () => {
  createForm.checkNo = '';
  createForm.remark = '';
  createVisible.value = true;
};

const submitCreate = async () => {
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('盘点单已创建');
    createVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const openDetail = (row: StockCheckItem) => {
  detailRow.value = row;
  detailDetails.value = [
    {
      itemId: 'i1',
      itemCode: 'MAT-001',
      itemName: '原材料A',
      batchCode: 'BATCH-A1',
      batchId: 'b1',
      stockStatus: '可用',
      systemQuantity: '100.0000',
      actualQuantity: 95,
      differenceQuantity: '-5.0000',
      result: '盘亏',
      adjusted: false,
      remark: '',
    },
    {
      itemId: 'i2',
      itemCode: 'MAT-002',
      itemName: '原材料B',
      batchCode: 'BATCH-B1',
      batchId: 'b2',
      stockStatus: '可用',
      systemQuantity: '50.0000',
      actualQuantity: 52,
      differenceQuantity: '2.0000',
      result: '盘盈',
      adjusted: false,
      remark: '',
    },
    {
      itemId: 'i3',
      itemCode: 'MAT-003',
      itemName: '原材料C',
      batchCode: 'BATCH-C1',
      batchId: 'b3',
      stockStatus: '可用',
      systemQuantity: '200.0000',
      actualQuantity: 200,
      differenceQuantity: '0.0000',
      result: '一致',
      adjusted: true,
      remark: '',
    },
  ];
  detailVisible.value = true;
};

const openEdit = (row: StockCheckItem) => {
  editingId.value = row.id;
  editDetails.value = [
    {
      itemId: 'i1',
      itemCode: 'MAT-001',
      itemName: '原材料A',
      batchCode: 'BATCH-A1',
      batchId: 'b1',
      stockStatus: '可用',
      systemQuantity: '100.0000',
      actualQuantity: 95,
      differenceQuantity: '-5.0000',
      result: '盘亏',
      adjusted: false,
      remark: '',
    },
    {
      itemId: 'i2',
      itemCode: 'MAT-002',
      itemName: '原材料B',
      batchCode: 'BATCH-B1',
      batchId: 'b2',
      stockStatus: '可用',
      systemQuantity: '50.0000',
      actualQuantity: 52,
      differenceQuantity: '2.0000',
      result: '盘盈',
      adjusted: false,
      remark: '',
    },
  ];
  editVisible.value = true;
};

const submitEdit = async () => {
  if (!editingId.value) return;
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('实盘数量已保存');
    editVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const handleComplete = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认完成盘点？完成后明细将被锁定。', '完成盘点', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('盘点已完成');
  await loadRows();
};

const handleAdjust = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认生成盘点调整流水？将自动处理盘盈盘亏。', '生成调整', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('盘点调整流水已生成');
  await loadRows();
};

const handleCancel = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认取消该盘点单？', '取消盘点', {
      confirmButtonText: '确认取消',
      cancelButtonText: '不取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('已取消');
  await loadRows();
};

const formatTime = (v: string) => v.replace('T', ' ').slice(0, 19);

onMounted(loadRows);
</script>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title h2 {
  margin: 0;
  color: #283a50;
  font-size: 20px;
  font-weight: 600;
}
.page-title p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.query-panel {
  padding: 20px 20px 8px;
  margin-bottom: 16px;
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
.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 142px;
}
.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.query-actions {
  margin-left: auto;
}
.query-actions :deep(.el-button) {
  min-width: 67px;
  height: 32px;
  border-radius: 6px;
}
.query-actions :deep(.el-button + .el-button) {
  margin-left: 12px;
}

.table-panel {
  overflow: hidden;
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}
.batch-actions {
  display: flex;
  gap: 8px;
}
.batch-actions :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.table-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6b7280;
}
.table-tools :deep(.el-button) {
  width: 20px;
  height: 20px;
  color: #6b7280;
}

.data-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.data-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.data-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.data-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.data-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.data-table :deep(.el-tag--warning) {
  background: #fef3c7;
  color: #f59e0b;
}
.data-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.danger-text {
  color: #ef4444;
  font-weight: 600;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
}
.total-text {
  color: #6b7280;
  font-size: 14px;
}
.page-size-select {
  width: 78px;
}
.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
}
.table-footer :deep(.el-pagination) {
  gap: 4px;
}
.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.table-footer :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
}

.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input) {
  width: 100%;
}
</style>
