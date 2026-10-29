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
            <TechnicalFileCell
              :file-name="row.sopFileName"
              :pending-action="fileActionStepId === row.id ? fileActions.pendingAction.value : null"
              :disabled="!row.defaultSopFileId || Boolean(fileActions.pendingAction.value)"
              @preview="viewSop(row, 'preview')"
              @download="viewSop(row, 'download')"
            />
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
      :close-on-click-modal="false"
      :close-on-press-escape="!uploading"
      :show-close="!uploading"
    >
      <el-upload
        drag
        action=""
        :auto-upload="false"
        :limit="1"
        :accept="UPLOAD_ACCEPT"
        :file-list="uploadFileList"
        :disabled="uploading"
        :on-change="handleUploadChange"
        :on-remove="handleUploadRemove"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div>将文件拖到这里，或点击选择文件</div>
      </el-upload>
      <p class="upload-hint">
        支持图片、PDF、Word、Excel 和 PowerPoint，单个文件不超过
        {{ TECHNICAL_FILE_MAX_SIZE_MIB }} MiB。
      </p>
      <el-progress
        v-if="uploading"
        :percentage="uploadProgress"
      />
      <template #footer>
        <el-button
          v-if="uploading"
          @click="cancelUpload"
          >取消上传</el-button
        >
        <el-button
          v-else
          @click="uploadDialogVisible = false"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="uploading"
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
import { onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue';
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
import TechnicalFileCell from '../../components/TechnicalFileCell.vue';
import { useTechnicalFileActions } from '../../composables/useTechnicalFileActions';
import {
  TECHNICAL_FILE_MAX_SIZE_MIB,
  UPLOAD_ACCEPT,
  validateTechnicalFileUpload,
} from '../../utils/file-validation';
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
const uploadProcessId = ref<string | null>(null);
const detailRow = ref<ProcessStepListItem | null>(null);
const submitting = ref(false);
const fileActionStepId = ref<string | null>(null);
const processFormDialogRef = ref<InstanceType<typeof ProcessStepFormDialog> | null>(null);
const uploadFileList = ref<UploadFile[]>([]);
const uploading = ref(false);
const uploadProgress = ref(0);
let uploadController: AbortController | undefined;
const stopUpload = (): void => {
  uploadController?.abort();
  uploadController = undefined;
  uploading.value = false;
};
const handleUploadChange = (file: UploadFile, list: UploadFiles): void => {
  if (uploading.value) return;
  const message = file.raw ? validateTechnicalFileUpload(file.raw) : '无法读取所选文件';
  if (message) {
    EMessage.warning(message);
    uploadFileList.value = list.filter((item) => item.uid !== file.uid).slice(-1);
    return;
  }
  uploadFileList.value = [file];
  uploadProgress.value = 0;
};
const handleUploadRemove = (): void => {
  if (!uploading.value) uploadFileList.value = [];
};
const cancelUpload = (): void => {
  stopUpload();
  EMessage.info('上传已取消，请确认后手动重新上传');
};
const submitUpload = async (): Promise<void> => {
  if (uploading.value || !uploadDialogVisible.value) return;
  const file = uploadFileList.value[0]?.raw;
  const processId = uploadProcessId.value;
  if (!file || !processId) {
    EMessage.warning('请选择要上传的技术文件');
    return;
  }
  const message = validateTechnicalFileUpload(file);
  if (message) {
    EMessage.warning(message);
    return;
  }
  const controller = new AbortController();
  uploadController = controller;
  uploading.value = true;
  uploadProgress.value = 0;
  try {
    await productApi.uploadProcessStepSop(processId, file, {
      signal: controller.signal,
      onUploadProgress: (percentage) => {
        if (uploadController === controller) uploadProgress.value = percentage;
      },
    });
    if (uploadController !== controller) return;
    uploadFileList.value = [];
    EMessage.success('技术文件已上传');
    uploadDialogVisible.value = false;
    void loadSteps();
  } catch (error) {
    if (uploadController !== controller) return;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED')
      EMessage.info('上传已取消，请确认后手动重新上传');
    else EMessage.error(error, '技术文件上传失败');
  } finally {
    if (uploadController === controller) stopUpload();
  }
};
watch([uploadDialogVisible, uploadProcessId], stopUpload, { flush: 'sync' });
onDeactivated(stopUpload);
onScopeDispose(stopUpload);

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
  stopUpload();
  uploadFileList.value = [];
  uploadProgress.value = 0;
  uploadProcessId.value = row.id;
  uploadDialogVisible.value = true;
};
const openDetail = (row: ProcessStepListItem) => {
  detailRow.value = row;
  detailDialogVisible.value = true;
};

const fileActions = useTechnicalFileActions(() => {
  const step = steps.value.find((row) => row.id === fileActionStepId.value);
  return step?.defaultSopFileId && step.sopFileName
    ? { id: step.defaultSopFileId, originalName: step.sopFileName }
    : null;
});
const viewSop = (step: ProcessStepListItem, action: 'preview' | 'download'): void => {
  fileActionStepId.value = step.id;
  void fileActions[action]();
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
.upload-icon {
  font-size: 32px;
  color: var(--el-text-color-secondary);
}
.upload-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
