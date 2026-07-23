<template>
  <div>
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
            placeholder="报废单号或对象"
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
              v-for="(label, value) in scrapStatusLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="场景">
          <el-select
            v-model="query.scrapScene"
            placeholder="全部"
            clearable
          >
            <el-option
              label="全部"
              value=""
            /><el-option
              v-for="(label, value) in scrapSceneLabels"
              :key="value"
              :label="label"
              :value="value"
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
      <TableToolbar>
        <template #actions>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >新增报废单</el-button
          >
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
              :loading="loading"
              @click="loadRows"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
      >
        <el-table-column
          prop="scrapNo"
          label="报废单号"
          width="180"
        />
        <el-table-column
          prop="itemCode"
          label="对象编码"
          width="120"
        />
        <el-table-column
          prop="itemName"
          label="对象名称"
          width="160"
        />
        <el-table-column
          prop="scrapNumber"
          label="报废数量"
          width="120"
          align="right"
        />
        <el-table-column
          label="报废场景"
          width="140"
        >
          <template #default="{ row }">{{ sceneLabel(row.scrapScene) }}</template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'confirmed'
                  ? 'danger'
                  : row.status === 'cancelled'
                    ? 'info'
                    : 'warning'
              "
              effect="light"
              >{{ scrapStatusLabel(row.status) }}</el-tag
            ></template
          >
        </el-table-column>
        <el-table-column
          prop="reason"
          label="原因"
          min-width="140"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="200"
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
              v-if="row.status === 'pending'"
              link
              type="danger"
              @click="handleConfirm(row)"
              >确认报废</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
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
      title="新增报废单"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="100px"
        :model="createForm"
      >
        <el-form-item
          label="库存对象ID"
          required
          ><el-input v-model="createForm.itemId"
        /></el-form-item>
        <el-form-item
          label="报废场景"
          required
        >
          <el-select
            v-model="createForm.scrapScene"
            style="width: 100%"
          >
            <el-option
              v-for="(label, value) in scrapSceneLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="报废数量"
          required
          ><el-input-number
            v-model="createForm.scrapNumber"
            :min="0.0001"
            :precision="4"
            style="width: 100%"
        /></el-form-item>
        <el-form-item label="原因"><el-input v-model="createForm.reason" /></el-form-item>
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
          >保存</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="报废单详情"
      :width="DialogWidth.md"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="报废单号">{{ detailRow.scrapNo }}</el-descriptions-item>
        <el-descriptions-item label="对象"
          >{{ detailRow.itemName }}({{ detailRow.itemCode }})</el-descriptions-item
        >
        <el-descriptions-item label="报废场景">{{
          sceneLabel(detailRow.scrapScene)
        }}</el-descriptions-item>
        <el-descriptions-item label="报废数量">{{ detailRow.scrapNumber }}</el-descriptions-item>
        <el-descriptions-item label="状态"
          ><el-tag :type="detailRow.status === 'confirmed' ? 'danger' : 'info'">{{
            scrapStatusLabels[detailRow.status]
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="原因">{{ detailRow.reason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="确认时间">{{
          detailRow.confirmedAt ? formatTime(detailRow.confirmedAt) : '-'
        }}</el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          >{{ detailRow.remark || '-' }}</el-descriptions-item
        >
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type { ScrapScene, ScrapStatus } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import {
  scrapSceneLabels,
  scrapStatusLabel,
  scrapStatusLabels,
} from '../../constants/business-status';

defineOptions({ name: 'ScrapsPage' });

interface ScrapItem {
  id: string;
  scrapNo: string;
  itemCode: string;
  itemName: string;
  scrapNumber: string;
  scrapScene: ScrapScene;
  status: ScrapStatus;
  reason: string;
  remark: string;
  confirmedAt: string;
}

const demoRows: ScrapItem[] = [
  {
    id: '1',
    scrapNo: 'BF-20260721-001',
    itemCode: 'MAT-001',
    itemName: '原材料A',
    scrapNumber: '10.0000',
    scrapScene: 'in_stock',
    status: 'confirmed',
    reason: '过期变质',
    remark: '',
    confirmedAt: '2026-07-21T10:00:00',
  },
  {
    id: '2',
    scrapNo: 'BF-20260721-002',
    itemCode: 'MAT-002',
    itemName: '原材料B',
    scrapNumber: '5.0000',
    scrapScene: 'production_consumed',
    status: 'pending',
    reason: '生产损耗',
    remark: '',
    confirmedAt: '',
  },
  {
    id: '3',
    scrapNo: 'BF-20260720-003',
    itemCode: 'SEMI-001',
    itemName: '半成品X',
    scrapNumber: '2.0000',
    scrapScene: 'return_after_outbound',
    status: 'pending',
    reason: '退料不良',
    remark: '需质检确认',
    confirmedAt: '',
  },
  {
    id: '4',
    scrapNo: 'BF-20260719-004',
    itemCode: 'MAT-003',
    itemName: '化学品C',
    scrapNumber: '50.0000',
    scrapScene: 'in_stock',
    status: 'confirmed',
    reason: '安全过期',
    remark: '',
    confirmedAt: '2026-07-19T15:00:00',
  },
  {
    id: '5',
    scrapNo: 'BF-20260718-005',
    itemCode: 'MAT-001',
    itemName: '原材料A',
    scrapNumber: '0.0000',
    scrapScene: 'warehouse_allocated',
    status: 'cancelled',
    reason: '',
    remark: '取消报废',
    confirmedAt: '',
  },
];

const rows = ref<ScrapItem[]>([...demoRows]);
const detailRow = ref<ScrapItem | null>(null);
const loading = ref(false);
const submitting = ref(false);
const total = ref(5);
const currentPage = ref(1);
const pageSize = ref(10);
const createVisible = ref(false);
const detailVisible = ref(false);
const query = reactive({ keyword: '', status: '', scrapScene: '' });
const createForm = reactive({
  itemId: '',
  scrapScene: 'in_stock' as ScrapScene,
  scrapNumber: 0,
  reason: '',
  remark: '',
});

const sceneLabel = (scene: ScrapScene) => scrapSceneLabels[scene];

const loadRows = async () => {
  loading.value = true;
  setTimeout(() => {
    const kw = query.keyword.trim().toLowerCase();
    const ss = query.status;
    const sc = query.scrapScene;
    let filtered = [...demoRows];
    if (kw)
      filtered = filtered.filter(
        (r) =>
          r.scrapNo.toLowerCase().includes(kw) ||
          r.itemName.toLowerCase().includes(kw) ||
          r.itemCode.toLowerCase().includes(kw),
      );
    if (ss) filtered = filtered.filter((r) => r.status === ss);
    if (sc) filtered = filtered.filter((r) => r.scrapScene === sc);
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
  query.scrapScene = '';
  currentPage.value = 1;
  await loadRows();
};
const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadRows();
};

const openCreate = () => {
  createForm.itemId = '';
  createForm.scrapScene = 'in_stock';
  createForm.scrapNumber = 0;
  createForm.reason = '';
  createForm.remark = '';
  createVisible.value = true;
};

const submitCreate = async () => {
  if (!createForm.itemId || createForm.scrapNumber <= 0) {
    EMessage.warning('请填写必填字段');
    return;
  }
  submitting.value = true;
  setTimeout(() => {
    EMessage.success('报废单已创建');
    createVisible.value = false;
    submitting.value = false;
    loadRows();
  }, 500);
};

const openDetail = (row: ScrapItem) => {
  detailRow.value = row;
  detailVisible.value = true;
};

const handleConfirm = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认报废后将生成库存流水，是否继续？', '确认报废', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  EMessage.success('报废已确认');
  await loadRows();
};

const handleCancel = async (_row?: any) => {
  try {
    await ElMessageBox.confirm('确认取消该报废单？', '取消报废', {
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
</style>
