<template>
  <div>
    <div class="page-title">
      <div>
        <h2>出库管理</h2>
        <p>管理生产领料出库等单据</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="openCreate"
        >新增出库单</el-button
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
            placeholder="单号"
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
              label="待确认"
              value="待确认"
            />
            <el-option
              label="已拣货"
              value="已拣货"
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
            >新增出库单</el-button
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
          prop="outboundNo"
          label="出库单号"
          width="180"
        />
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }"
            ><el-tag
              :type="
                row.status === '已完成' ? 'success' : row.status === '已取消' ? 'info' : 'warning'
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
          label="出库数量"
          width="130"
          align="right"
          ><template #default="{ row }">{{
            formatQuantity(row.totalOutboundNumber)
          }}</template></el-table-column
        >
        <el-table-column
          label="出库时间"
          width="170"
          ><template #default="{ row }">{{
            row.outboundAt ? formatTime(row.outboundAt) : '-'
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
          width="300"
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
              v-if="row.status === '待确认'"
              link
              type="warning"
              @click="handlePick(row)"
              >拣货</el-button
            >
            <el-button
              v-if="['待确认', '已拣货'].includes(row.status)"
              link
              type="success"
              @click="handleConfirm(row)"
              >确认出库</el-button
            >
            <el-button
              v-if="row.status !== '已完成'"
              link
              type="danger"
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

    <!-- 创建出库单弹窗 -->
    <el-dialog
      v-model="createVisible"
      title="新增出库单（生产领料）"
      :width="DialogWidth.lg"
    >
      <el-form
        class="dialog-form"
        label-width="100px"
        :model="createForm"
      >
        <el-form-item
          label="生产批次"
          required
        >
          <div class="batch-selector">
            <el-select
              v-model="createForm.selectedBatchId"
              filterable
              clearable
              placeholder="输入批次号搜索"
              style="width: 320px"
            >
              <el-option
                v-for="b in batchOptions"
                :key="b.id"
                :label="`${b.batchNo} — ${b.productName}(${b.productModel})`"
                :value="b.id"
              />
            </el-select>
            <el-button
              :disabled="!createForm.selectedBatchId"
              type="primary"
              size="small"
              style="margin-left: 8px"
              @click="loadAllocations"
            >
              加载分配行
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="工单号">
          <span
            v-if="selectedBatchInfo"
            class="info-text"
            >{{ selectedBatchInfo.workOrderNo || '-' }}</span
          >
          <span
            v-else
            class="muted-text"
            >选择批次后自动显示</span
          >
        </el-form-item>
        <el-form-item label="备注"
          ><el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="2"
        /></el-form-item>
        <el-divider>出库明细（分配行）</el-divider>
        <div
          v-if="createForm.details.length === 0"
          class="empty-hint"
        >
          请先选择生产批次，点击「加载分配行」获取待出库分配
        </div>
        <el-table
          v-else
          :data="createForm.details"
          size="small"
          style="margin-bottom: 8px"
          class="data-table"
        >
          <el-table-column
            label="物料编码"
            prop="itemCode"
            width="130"
          />
          <el-table-column
            label="物料名称"
            prop="itemName"
            min-width="140"
          />
          <el-table-column
            label="批次号"
            prop="batchCode"
            width="130"
          />
          <el-table-column
            label="可出库"
            width="100"
            align="right"
          >
            <template #default="{ row }">{{
              formatQuantity(row.availableOutboundQuantity)
            }}</template>
          </el-table-column>
          <el-table-column
            label="出库数量"
            width="130"
          >
            <template #default="{ row }">
              <el-input-number
                v-model="row.outboundNumber"
                :min="0.0001"
                :max="parseMax(row.availableOutboundQuantity)"
                :precision="4"
                size="small"
                style="width: 120px"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="状态"
            width="100"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.stockStatus"
                size="small"
                style="width: 90px"
              >
                <el-option
                  label="可用"
                  value="可用"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="50"
          >
            <template #default="{ row }">
              <el-button
                link
                type="danger"
                :icon="Delete"
                size="small"
                @click="removeDetail(row)"
              />
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <div
        v-if="createForm.details.length > 0"
        class="dialog-footer-note"
      >
        共 <strong>{{ createForm.details.length }}</strong> 个分配行，合计出库
        <strong>{{ formatQuantity(totalOutboundNumber) }}</strong>
      </div>
      <template #footer
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="submitting"
          :disabled="createForm.details.length === 0"
          @click="submitCreate"
          >保存</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="出库单详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="单号">{{ detailRow.outboundNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"
          ><el-tag :type="detailRow.status === '已完成' ? 'success' : 'info'">{{
            detailRow.status
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="出库时间">{{
          detailRow.outboundAt ? formatTime(detailRow.outboundAt) : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detailRow.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider>明细</el-divider>
      <el-table
        v-if="detailDetails.length > 0"
        :data="detailDetails"
        size="small"
        class="data-table"
      >
        <el-table-column
          label="物料编码"
          prop="itemCode"
          width="130"
        />
        <el-table-column
          label="物料名称"
          prop="itemName"
          width="140"
        />
        <el-table-column
          label="批次号"
          prop="batchCode"
          width="130"
        />
        <el-table-column
          label="出库数量"
          prop="outboundNumber"
          width="100"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.outboundNumber) }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          prop="stockStatus"
          width="80"
        />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'OutboundOrdersPage' });

interface OutboundOrderItem {
  id: string;
  outboundNo: string;
  status: string;
  detailCount: number;
  totalOutboundNumber: string;
  outboundAt: string;
  remark: string;
}

interface OutboundDetailItem {
  itemCode: string;
  itemName: string;
  batchCode: string;
  outboundNumber: string;
  stockStatus: string;
}

interface BatchItem {
  id: string;
  batchNo: string;
  productName: string;
  productModel: string;
  workOrderNo: string;
}

interface CreateDetailRow {
  allocationId: string;
  itemCode: string;
  itemName: string;
  batchCode: string;
  availableOutboundQuantity: string;
  outboundNumber: number;
  stockStatus: string;
  remark: string;
}

interface CreateForm {
  selectedBatchId: string;
  remark: string;
  details: CreateDetailRow[];
}

const demoRows: OutboundOrderItem[] = [
  {
    id: '1',
    outboundNo: 'CK-20260721-001',
    status: '已完成',
    detailCount: 3,
    totalOutboundNumber: '120.0000',
    outboundAt: '2026-07-21T10:30:00',
    remark: '生产领料',
  },
  {
    id: '2',
    outboundNo: 'CK-20260721-002',
    status: '待确认',
    detailCount: 2,
    totalOutboundNumber: '45.0000',
    outboundAt: '',
    remark: '',
  },
  {
    id: '3',
    outboundNo: 'CK-20260720-003',
    status: '已拣货',
    detailCount: 4,
    totalOutboundNumber: '80.0000',
    outboundAt: '',
    remark: '紧急领料',
  },
  {
    id: '4',
    outboundNo: 'CK-20260719-004',
    status: '已完成',
    detailCount: 1,
    totalOutboundNumber: '10.0000',
    outboundAt: '2026-07-19T14:00:00',
    remark: '',
  },
  {
    id: '5',
    outboundNo: 'CK-20260718-005',
    status: '已取消',
    detailCount: 0,
    totalOutboundNumber: '0.0000',
    outboundAt: '',
    remark: '取消',
  },
];

const rows = ref<OutboundOrderItem[]>([...demoRows]);
const detailRow = ref<OutboundOrderItem | null>(null);
const detailDetails = ref<OutboundDetailItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const createVisible = ref(false);
const detailVisible = ref(false);
const query = reactive({ keyword: '', status: '' });

const batchOptions = ref<BatchItem[]>([]);
// TODO(api-integration): 接入批次号搜索 API 后接通此状态与函数
const batchLoading = ref(false);
const loadingAllocations = ref(false);

const searchBatch = () => {
  batchOptions.value = [
    {
      id: 'b1',
      batchNo: 'SC-202607-001',
      productName: '产品A',
      productModel: 'A-100',
      workOrderNo: 'WO-202607-001',
    },
    {
      id: 'b2',
      batchNo: 'SC-202607-002',
      productName: '产品B',
      productModel: 'B-200',
      workOrderNo: 'WO-202607-002',
    },
    {
      id: 'b3',
      batchNo: 'SC-202607-003',
      productName: '产品C',
      productModel: 'C-300',
      workOrderNo: 'WO-202607-003',
    },
  ];
};

const selectedBatchInfo = computed(() => {
  if (!createForm.selectedBatchId) return null;
  return batchOptions.value.find((b) => b.id === createForm.selectedBatchId) ?? null;
});

const createForm = reactive<CreateForm>({
  selectedBatchId: '',
  remark: '',
  details: [],
});

const totalOutboundNumber = computed(() => {
  const sum = createForm.details.reduce((acc, d) => acc + (Number(d.outboundNumber) || 0), 0);
  return String(sum);
});

const parseMax = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 999999;
};

const addDetail = (d: {
  allocationId: string;
  itemCode: string;
  itemName: string;
  batchCode: string;
  availableOutboundQuantity: string;
}) => {
  createForm.details.push({
    allocationId: d.allocationId,
    itemCode: d.itemCode,
    itemName: d.itemName,
    batchCode: d.batchCode,
    availableOutboundQuantity: d.availableOutboundQuantity,
    outboundNumber: Number(d.availableOutboundQuantity),
    stockStatus: '可用',
    remark: '',
  });
};

const removeDetail = (row: CreateDetailRow) => {
  const idx = createForm.details.indexOf(row);
  if (idx !== -1) createForm.details.splice(idx, 1);
};

const loadAllocations = () => {
  if (!createForm.selectedBatchId) {
    EMessage.warning('请先选择生产批次');
    return;
  }
  loadingAllocations.value = true;
  setTimeout(() => {
    const items: Array<{
      allocationId: string;
      itemCode: string;
      itemName: string;
      batchCode: string;
      availableOutboundQuantity: string;
    }> = [
      {
        allocationId: 'a1',
        itemCode: 'MAT-001',
        itemName: '原材料A',
        batchCode: 'BATCH-A1',
        availableOutboundQuantity: '50.0000',
      },
      {
        allocationId: 'a2',
        itemCode: 'MAT-002',
        itemName: '原材料B',
        batchCode: 'BATCH-B1',
        availableOutboundQuantity: '30.0000',
      },
    ];
    createForm.details = [];
    items.forEach((item) => {
      const qty = Number(item.availableOutboundQuantity);
      if (qty > 0) {
        addDetail(item);
      }
    });
    if (createForm.details.length === 0) {
      EMessage.info('该批次暂无待出库分配行');
    } else {
      EMessage.success(`已加载 ${createForm.details.length} 个分配行`);
    }
    loadingAllocations.value = false;
  }, 500);
};

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const ss = query.status;
    let filtered = [...demoRows];
    if (kw) filtered = filtered.filter((r) => r.outboundNo.toLowerCase().includes(kw));
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
  createForm.selectedBatchId = '';
  createForm.remark = '';
  createForm.details = [];
  batchOptions.value = [];
  createVisible.value = true;
};

const submitCreate = async () => {
  if (!createForm.selectedBatchId) {
    EMessage.warning('请选择生产批次');
    return;
  }
  if (createForm.details.length === 0) {
    EMessage.warning('请添加出库明细');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('出库单已创建');
    createVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const openDetail = (row: OutboundOrderItem) => {
  detailRow.value = row;
  detailDetails.value = [
    {
      itemCode: 'MAT-001',
      itemName: '原材料A',
      batchCode: 'BATCH-A1',
      outboundNumber: '80.0000',
      stockStatus: '可用',
    },
    {
      itemCode: 'MAT-002',
      itemName: '原材料B',
      batchCode: 'BATCH-B1',
      outboundNumber: '40.0000',
      stockStatus: '可用',
    },
  ];
  detailVisible.value = true;
};

const handlePick = (_row?: any) => {
  EMessage.success('已拣货');
  loadRows();
};

const handleConfirm = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认出库后将生成库存流水，是否继续？', '确认出库', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('已确认出库');
  await loadRows();
};

const handleCancel = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认取消该出库单？', '取消出库', {
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

const formatQuantity = (v: string | number | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '-';
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
.batch-selector {
  display: flex;
  align-items: center;
}
.info-text {
  color: #1f2937;
  font-size: 14px;
}
.muted-text {
  color: #9ca3af;
  font-size: 14px;
}
.empty-hint {
  color: #9ca3af;
  text-align: center;
  padding: 24px 0;
  font-size: 14px;
}
.dialog-footer-note {
  text-align: right;
  padding: 0 20px 12px;
  color: #6b7280;
  font-size: 13px;
}
</style>
