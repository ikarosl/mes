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
              @click="loadSteps"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-table
        v-loading="loading"
        :data="steps"
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
          min-width="230"
        >
          <template #default="{ row }">
            <template v-if="row.sopFileName">
              <div class="sop-file-name">{{ row.sopFileName }}</div>
              <div
                v-if="auth.can(PERMISSIONS.product.files.download)"
                class="sop-file-actions"
              >
                <el-button
                  v-if="canPreviewFile(row.sopFileName)"
                  link
                  type="primary"
                  :loading="isFileActionPending(row.id, 'preview')"
                  :disabled="fileActionPending?.id === row.id"
                  @click="previewSop(row)"
                  >预览</el-button
                >
                <el-button
                  link
                  type="primary"
                  :loading="isFileActionPending(row.id, 'download')"
                  :disabled="fileActionPending?.id === row.id"
                  @click="downloadSop(row)"
                  >下载</el-button
                >
              </div>
            </template>
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
              :disabled="isRowPending(row.id)"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationFooter
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="handlePageSizeChange"
        @page-change="handlePageChange"
      />
    </div>

    <ProcessStepFormDialog
      ref="processFormDialogRef"
      :visible="processDialogVisible"
      :editing-process-id="editingProcessId"
      :submitting="submitting"
      @update:visible="processDialogVisible = $event"
      @save="submitProcess"
    />

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

    <ProcessStepDetailDialog
      :visible="detailDialogVisible"
      :detail-row="detailRow"
      @update:visible="detailDialogVisible = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Refresh, UploadFilled } from '@element-plus/icons-vue';
import type { UploadFile, UploadFiles } from 'element-plus';
import { PERMISSIONS } from '@company/constants';
import type { ProcessStepListItem, ProcessStepPayload } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import { useRowPending } from '../../utils/useRowPending';
import { productApi } from '../../api/product';
import { useAuthStore } from '../../stores/auth';
import { useProcessSteps } from './composables/useProcessSteps';
import { canPreviewFile, previewMimeOf } from '../../utils/file-preview';
import ProcessStepDetailDialog from './components/ProcessStepDetailDialog.vue';
import ProcessStepFormDialog from './components/ProcessStepFormDialog.vue';

defineOptions({ name: 'ProcessesPage' });

const auth = useAuthStore();
const {
  steps,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  loadSteps,
  handleSearch,
  resetQuery,
  handlePageSizeChange,
  handlePageChange,
} = useProcessSteps();

/** 行内写操作守卫（启停工序），同一行只允许一个在途（todo 3.5） */
const { isRowPending, beginRow, endRow } = useRowPending();

const processDialogVisible = ref(false);
const uploadDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const editingProcessId = ref<string | null>(null);
const uploadFileList = ref<UploadFile[]>([]);
const selectedFile = ref<File | null>(null);
const uploadProcessId = ref<string | null>(null);
const detailRow = ref<ProcessStepListItem | null>(null);
const submitting = ref(false);
const fileActionPending = ref<{ id: string; action: 'preview' | 'download' } | null>(null);
const processFormDialogRef = ref<InstanceType<typeof ProcessStepFormDialog> | null>(null);

const openCreate = () => {
  editingProcessId.value = null;
  processFormDialogRef.value?.resetForm();
  processDialogVisible.value = true;
};
const openEdit = (row: ProcessStepListItem) => {
  editingProcessId.value = row.id;
  processFormDialogRef.value?.setForm(row);
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

const isFileActionPending = (id: string, action: 'preview' | 'download') =>
  fileActionPending.value?.id === id && fileActionPending.value.action === action;

const fetchSopBlob = (row: ProcessStepListItem) => {
  if (!row.defaultSopFileId) throw new Error('该工序未关联技术文件');
  return productApi.technicalFileContent(row.defaultSopFileId);
};

const createPreviewObjectUrl = (blob: Blob, fileName: string) => {
  const previewMime = previewMimeOf(fileName, blob.type);
  const target =
    previewMime && previewMime !== blob.type ? new Blob([blob], { type: previewMime }) : blob;
  return URL.createObjectURL(target);
};

const previewSop = async (row: ProcessStepListItem) => {
  if (fileActionPending.value) return;
  fileActionPending.value = { id: row.id, action: 'preview' };
  try {
    const blob = await fetchSopBlob(row);
    const url = createPreviewObjectUrl(blob, row.sopFileName ?? '');
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    EMessage.error(error, 'SOP 文件预览失败');
  } finally {
    fileActionPending.value = null;
  }
};

const downloadSop = async (row: ProcessStepListItem) => {
  if (fileActionPending.value) return;
  fileActionPending.value = { id: row.id, action: 'download' };
  try {
    const blob = await fetchSopBlob(row);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = row.sopFileName ?? 'download';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    EMessage.error(error, 'SOP 文件下载失败');
  } finally {
    fileActionPending.value = null;
  }
};

const submitProcess = async (payload: ProcessStepPayload) => {
  submitting.value = true;
  try {
    if (editingProcessId.value) await productApi.updateProcessStep(editingProcessId.value, payload);
    else await productApi.createProcessStep(payload);
    EMessage.success(editingProcessId.value ? '工序已更新' : '工序已新增');
    processDialogVisible.value = false;
    await loadSteps();
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
    await loadSteps();
  } catch (error) {
    EMessage.error(error, '技术文件上传失败');
  } finally {
    submitting.value = false;
  }
};

const toggleStatus = async (row: ProcessStepListItem) => {
  if (!beginRow(row.id)) return;
  const text = row.status === 1 ? '停用' : '启用';
  try {
    await ElMessageBox.confirm(`确定${text}工序“${row.stepName}”吗？`, `${text}工序`, {
      type: row.status === 1 ? 'warning' : 'info',
    });
    await productApi.setProcessStepStatus(row.id, row.status === 1 ? 0 : 1);
    EMessage.success(`工序已${text}`);
    await loadSteps();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, `${text}工序失败`);
  } finally {
    endRow(row.id);
  }
};
onMounted(loadSteps);
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
.sop-file-name {
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sop-file-actions {
  display: flex;
  gap: 12px;
  margin-top: 2px;
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
