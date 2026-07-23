<template>
  <section>
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
            placeholder="工序编码或名称"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="启用"
              value="enabled"
            />
            <el-option
              label="停用"
              value="disabled"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            v-if="auth.can(PERMISSIONS.product.processes.create)"
            type="primary"
            @click="handleSearch"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
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
            >新增工序</el-button
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
              @click="loadProcesses"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="pagedProcesses"
        class="data-table"
      >
        <el-table-column
          label="工序编码"
          min-width="130"
        >
          <template #default="{ row }"
            ><span class="process-code">{{ row.stepCode }}</span></template
          >
        </el-table-column>
        <el-table-column
          prop="stepName"
          label="工序名称"
          min-width="140"
        />
        <el-table-column
          prop="description"
          label="工序说明"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column
          label="技术文件"
          min-width="190"
        >
          <template #default="{ row }">
            <el-link
              v-if="row.sopFileName"
              type="primary"
              >{{ row.sopFileName }}</el-link
            >
            <span
              v-else
              class="empty-text"
              >未上传</span
            >
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 ? 'success' : 'info'"
              effect="light"
              >{{ row.status === 1 ? '启用' : '停用' }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="250"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >查看</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.processes.update)"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.processes.uploadSop)"
              link
              type="primary"
              @click="openUpload(row)"
              >上传文件</el-button
            >
            <el-button
              v-if="auth.can(PERMISSIONS.product.processes.changeStatus)"
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="filteredProcesses.length"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="currentPage = $event"
      />
    </div>

    <el-dialog
      v-model="processDialogVisible"
      :title="editingProcessId ? '编辑工序' : '新增工序'"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="96px"
        :model="processForm"
      >
        <el-form-item
          label="工序编码"
          required
        >
          <el-input
            v-model="processForm.processCode"
            placeholder="例如：GX-001"
          />
        </el-form-item>
        <el-form-item
          label="工序名称"
          required
        >
          <el-input
            v-model="processForm.processName"
            placeholder="例如：装配、调试、检验"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="processForm.enabled"
            active-text="启用"
            inactive-text="停用"
          />
        </el-form-item>
        <el-form-item label="工序说明">
          <el-input
            v-model="processForm.description"
            type="textarea"
            :rows="3"
            placeholder="填写操作要求、检验要求或注意事项"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="processForm.remark"
            type="textarea"
            :rows="2"
            placeholder="可填写备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="processDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitProcess"
          >保存工序</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="uploadDialogVisible"
      title="上传工序技术文件"
      :width="DialogWidth.sm"
    >
      <el-upload
        drag
        action=""
        :auto-upload="false"
        :limit="1"
        :file-list="uploadFileList"
        :on-change="handleUploadChange"
        :on-remove="handleUploadRemove"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">将文件拖到这里，或点击选择文件</div>
      </el-upload>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitUpload"
          >上传文件</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      title="工序详情"
      :width="DialogWidth.md"
    >
      <el-descriptions
        v-if="detailRow"
        :column="2"
        border
      >
        <el-descriptions-item label="工序编码">{{ detailRow.stepCode }}</el-descriptions-item>
        <el-descriptions-item label="工序名称">{{ detailRow.stepName }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          detailRow.status === 1 ? '启用' : '停用'
        }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{
          detailRow.updatedAt || '-'
        }}</el-descriptions-item>
        <el-descriptions-item
          label="工序说明"
          :span="2"
          >{{ detailRow.description || '-' }}</el-descriptions-item
        >
        <el-descriptions-item
          label="技术文件"
          :span="2"
        >
          <span v-if="detailRow.sopFileName">{{ detailRow.sopFileName }}</span
          ><span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          >{{ detailRow.remark || '-' }}</el-descriptions-item
        >
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh, UploadFilled } from '@element-plus/icons-vue';
import { ElMessageBox, type UploadFile, type UploadFiles } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { ProcessStepListItem } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'ProcessesPage' });

const auth = useAuthStore();
const processes = ref<ProcessStepListItem[]>([]);

const filteredProcesses = computed(() =>
  processes.value.filter((p) => {
    const kw = query.keyword.trim().toLowerCase();
    return (
      (!kw || p.stepCode.toLowerCase().includes(kw) || p.stepName.toLowerCase().includes(kw)) &&
      (!query.status ||
        (query.status === 'enabled' && p.status === 1) ||
        (query.status === 'disabled' && p.status !== 1))
    );
  }),
);
const pagedProcesses = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredProcesses.value.slice(start, start + pageSize.value);
});

const currentPage = ref(1);
const pageSize = ref(10);
const processDialogVisible = ref(false);
const uploadDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingProcessId = ref<string | null>(null);
const uploadFileList = ref<UploadFile[]>([]);
const selectedFile = ref<File | null>(null);
const uploadProcessId = ref<string | null>(null);
const detailRow = ref<ProcessStepListItem | null>(null);
const loading = ref(false);
const submitting = ref(false);
const query = reactive({ keyword: '', status: '' });
const processForm = reactive({
  processCode: '',
  processName: '',
  description: '',
  enabled: true,
  remark: '',
});

const handleSearch = () => {
  currentPage.value = 1;
};
const resetQuery = () => {
  Object.assign(query, { keyword: '', status: '' });
  currentPage.value = 1;
};
const handlePageSizeChange = (val: number) => {
  pageSize.value = val;
  currentPage.value = 1;
};

const resetProcessForm = () => {
  Object.assign(processForm, {
    processCode: '',
    processName: '',
    description: '',
    enabled: true,
    remark: '',
  });
};
const openCreate = () => {
  editingProcessId.value = null;
  resetProcessForm();
  processDialogVisible.value = true;
};
const openEdit = (row: ProcessStepListItem) => {
  editingProcessId.value = row.id;
  Object.assign(processForm, {
    processCode: row.stepCode,
    processName: row.stepName,
    description: row.description ?? '',
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
  processDialogVisible.value = true;
};
const openUpload = (row: ProcessStepListItem) => {
  uploadFileList.value = [];
  selectedFile.value = null;
  uploadProcessId.value = row.id;
  uploadDialogVisible.value = true;
};
const openDetail = (row: ProcessStepListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const loadProcesses = async () => {
  loading.value = true;
  try {
    processes.value = await productApi.processSteps();
  } catch (error) {
    EMessage.error(error, '标准工序加载失败');
  } finally {
    loading.value = false;
  }
};
const submitProcess = async () => {
  if (!processForm.processCode.trim() || !processForm.processName.trim()) {
    EMessage.warning('请填写工序编码和工序名称');
    return;
  }
  submitting.value = true;
  const payload = {
    stepCode: processForm.processCode,
    stepName: processForm.processName,
    description: processForm.description || null,
    status: processForm.enabled ? 1 : 0,
    remark: processForm.remark || null,
  };
  try {
    if (editingProcessId.value) await productApi.updateProcessStep(editingProcessId.value, payload);
    else await productApi.createProcessStep(payload);
    EMessage.success(editingProcessId.value ? '工序已更新' : '工序已新增');
    processDialogVisible.value = false;
    await loadProcesses();
  } catch (error) {
    EMessage.error(error, '工序保存失败');
  } finally {
    submitting.value = false;
  }
};

const handleUploadChange = (_uploadFile: UploadFile, uploadFiles: UploadFiles) => {
  uploadFileList.value = uploadFiles.slice(-1);
  selectedFile.value = uploadFiles.at(-1)?.raw ?? null;
};
const handleUploadRemove = () => {
  uploadFileList.value = [];
  selectedFile.value = null;
};
const submitUpload = async () => {
  if (!selectedFile.value || !uploadProcessId.value) {
    EMessage.warning('请选择要上传的技术文件');
    return;
  }
  submitting.value = true;
  try {
    await productApi.uploadProcessStepSop(uploadProcessId.value, selectedFile.value);
    EMessage.success('技术文件已上传');
    uploadDialogVisible.value = false;
    await loadProcesses();
  } catch (error) {
    EMessage.error(error, '技术文件上传失败');
  } finally {
    submitting.value = false;
  }
};

const toggleStatus = async (row: ProcessStepListItem) => {
  const text = row.status === 1 ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}工序“${row.stepName}”吗？`, `${text}工序`, {
      type: row.status === 1 ? 'warning' : 'info',
    });
    await productApi.setProcessStepStatus(row.id, row.status === 1 ? 0 : 1);
    EMessage.success(`工序已${text}`);
    await loadProcesses();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}工序失败`);
  }
};
onMounted(loadProcesses);
</script>

<style scoped>
.query-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  padding: 20px 20px 4px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 12px 24px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 190px;
}
.query-form :deep(.el-select) {
  width: 140px;
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
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
.data-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.process-code {
  font-weight: 600;
}
.empty-text {
  color: #9ca3af;
}

.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}

.upload-icon {
  color: #6b7280;
  font-size: 36px;
}
.upload-text {
  color: #1f2937;
}

@media (max-width: 1120px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
