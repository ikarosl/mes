<template>
  <section class="attachments-page">
    <el-form
      inline
      class="query-panel"
      @submit.prevent="list.search"
    >
      <el-form-item label="文件名"
        ><el-input
          v-model="list.query.keyword"
          clearable
          placeholder="搜索文件名"
          @keyup.enter="list.search"
      /></el-form-item>
      <el-form-item label="类型"
        ><el-select
          v-model="list.query.fileType"
          clearable
          placeholder="全部"
          class="filter-select"
          ><el-option
            v-for="type in TECHNICAL_FILE_TYPES"
            :key="type"
            :value="type"
            :label="ATTACHMENT_FILE_TYPE_LABELS[type]" /></el-select
      ></el-form-item>
      <el-form-item label="引用"
        ><el-select
          v-model="list.query.referenceState"
          clearable
          placeholder="全部"
          class="filter-select"
          ><el-option
            v-for="state in ATTACHMENT_REFERENCE_STATES"
            :key="state"
            :value="state"
            :label="ATTACHMENT_REFERENCE_STATE_LABELS[state]" /></el-select
      ></el-form-item>
      <el-form-item label="状态"
        ><el-select
          v-model="list.query.lifecycle"
          clearable
          placeholder="全部"
          class="filter-select"
          ><el-option
            v-for="state in ATTACHMENT_LIFECYCLES"
            :key="state"
            :value="state"
            :label="ATTACHMENT_LIFECYCLE_LABELS[state]" /></el-select
      ></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          :disabled="pending"
          @click="list.search"
          >查询</el-button
        ><el-button
          :disabled="pending"
          @click="list.reset"
          >重置</el-button
        ></el-form-item
      >
    </el-form>
    <div class="table-panel">
      <TableToolbar :total="list.total.value">
        <template #actions>
          <el-button
            :disabled="!canTrashSelection"
            :loading="pending"
            @click="runAction('trash', selected)"
            >移入回收站</el-button
          >
          <el-button
            type="danger"
            plain
            :disabled="!canPurgeSelection"
            :loading="pending"
            @click="runAction('purge', selected)"
            >物理清理</el-button
          >
          <span
            v-if="selected.length"
            class="selection-summary"
            >已选 {{ selected.length }} 个，{{ formatSize(selectedSize) }}</span
          >
        </template>
        <template #tools
          ><el-button
            :icon="Refresh"
            :loading="list.loading.value"
            :disabled="pending"
            @click="list.load"
            >刷新</el-button
          ></template
        >
      </TableToolbar>
      <p class="retention-hint">
        有当前或历史引用的附件不能回收。移入回收站后，可再次确认并物理清理文件内容。
      </p>
      <el-alert
        v-if="list.errorMessage.value"
        :title="list.errorMessage.value"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        ref="table"
        v-loading="list.loading.value"
        :data="list.items.value"
        row-key="id"
        empty-text="暂无附件"
        @selection-change="selectionChanged"
      >
        <el-table-column
          type="selection"
          width="48"
          :selectable="selectable"
        />
        <el-table-column
          prop="fileName"
          label="文件名"
          min-width="210"
          show-overflow-tooltip
        />
        <el-table-column
          label="类型"
          width="110"
          ><template #default="{ row }">{{ typeLabel(row) }}</template></el-table-column
        >
        <el-table-column
          label="大小"
          width="100"
          ><template #default="{ row }">{{ formatSize(row.sizeBytes) }}</template></el-table-column
        >
        <el-table-column
          label="上传人 / 时间"
          min-width="180"
          ><template #default="{ row }"
            ><div>{{ row.createdByName ?? row.createdBy ?? '未记录' }}</div>
            <span class="secondary">{{ formatDateTimeForDisplay(row.createdAt) }}</span></template
          ></el-table-column
        >
        <el-table-column
          label="引用"
          width="95"
          ><template #default="{ row }"
            ><el-button
              v-if="row.referenceCount"
              link
              type="primary"
              @click="showReferences(row)"
              >{{ row.referenceCount }} 处</el-button
            ><span v-else>无引用</span></template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          min-width="175"
          ><template #default="{ row }"
            ><el-tag :type="lifecycleTag(row)">{{ lifecycleLabel(row) }}</el-tag>
            <div
              v-if="row.cleanupErrorCode"
              class="failure-reason"
            >
              {{ cleanupError(row) }}
            </div>
            <div
              v-if="row.cleanupCompletedAt"
              class="secondary"
            >
              {{ formatDateTimeForDisplay(row.cleanupCompletedAt) }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          width="260"
          fixed="right"
          ><template #default="{ row }">
            <el-button
              v-if="canPreviewFile(row.originalName)"
              link
              type="primary"
              :disabled="!row.canDownload || blocked || Boolean(fileActions.pendingAction.value)"
              @click="openFile(row, 'preview')"
              >预览</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="!row.canDownload || blocked || Boolean(fileActions.pendingAction.value)"
              @click="openFile(row, 'download')"
              >下载</el-button
            >
            <el-button
              v-if="row.canTrash"
              link
              type="danger"
              :disabled="blocked"
              @click="runAction('trash', [row])"
              >回收</el-button
            >
            <el-button
              v-if="row.canPurge"
              link
              type="danger"
              :disabled="blocked"
              @click="runAction('purge', [row])"
              >{{ row.cleanupErrorCode ? '重试清理' : '物理清理' }}</el-button
            >
          </template></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="list.total.value"
        :current-page="list.page.value"
        :page-size="list.pageSize.value"
        :disabled="pending || list.loading.value"
        @page-change="list.changePage"
        @update:page-size="list.changePageSize"
      />
    </div>
    <div
      v-if="results.length"
      class="result-panel"
    >
      <div class="result-heading">
        <strong>{{ resultTitle }}</strong
        ><el-button
          v-if="!pending"
          text
          @click="results = []"
          >收起结果</el-button
        >
      </div>
      <el-table
        :data="results"
        size="small"
        ><el-table-column
          prop="fileName"
          label="文件名"
          min-width="210" /><el-table-column
          label="结果"
          width="140"
          ><template #default="{ row }"
            ><el-tag :type="row.success ? 'success' : 'warning'">{{
              row.success ? '已完成' : '失败或待核对'
            }}</el-tag></template
          ></el-table-column
        ><el-table-column
          prop="message"
          label="说明"
          min-width="300"
      /></el-table>
    </div>
    <AttachmentReferencesDialog
      v-model="referencesVisible"
      :attachment-id="referenceFile?.id ?? null"
      :file-name="referenceFile?.fileName ?? ''"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { AttachmentListItem } from '@company/contracts';
import {
  ATTACHMENT_CLEANUP_ERROR_LABELS,
  ATTACHMENT_CLEANUP_STATUS,
  ATTACHMENT_FILE_TYPE_LABELS,
  ATTACHMENT_LIFECYCLE,
  ATTACHMENT_LIFECYCLES,
  ATTACHMENT_LIFECYCLE_LABELS,
  ATTACHMENT_REFERENCE_STATES,
  ATTACHMENT_REFERENCE_STATE_LABELS,
  TECHNICAL_FILE_TYPES,
} from '@company/constants';
import { attachmentsApi } from '../../api/attachments';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useTechnicalFileActions } from '../../composables/useTechnicalFileActions';
import { useTabsStore } from '../../stores/tabs';
import { formatDateTimeForDisplay } from '../../utils/date';
import { canPreviewFile } from '../../utils/file-preview';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import AttachmentReferencesDialog from './AttachmentReferencesDialog.vue';
import { useAttachmentList } from './use-attachment-list';

defineOptions({ name: 'AttachmentsPage' });
const active = ref(true);
const pending = ref(false);
const list = useAttachmentList(() => active.value);
const table = ref<{ clearSelection: () => void }>();
const selected = ref<AttachmentListItem[]>([]);
const blocked = computed(
  () => pending.value || list.loading.value || Boolean(list.errorMessage.value),
);
const canTrashSelection = computed(
  () => !blocked.value && selected.value.length > 0 && selected.value.every((row) => row.canTrash),
);
const canPurgeSelection = computed(
  () => !blocked.value && selected.value.length > 0 && selected.value.every((row) => row.canPurge),
);
const selectedSize = computed(() => selected.value.reduce((sum, row) => sum + row.sizeBytes, 0));
const results = ref<Array<{ fileName: string; success: boolean; message: string }>>([]);
const resultTitle = ref('');
const referencesVisible = ref(false);
const referenceFile = ref<AttachmentListItem | null>(null);
const selectedFile = ref<AttachmentListItem | null>(null);
const fileActions = useTechnicalFileActions(
  () => selectedFile.value,
  () => active.value,
  attachmentsApi.content,
);
onMounted(list.load);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
onScopeDispose(useTabsStore().registerCloseGuard('system-attachments', async () => !pending.value));
watch(list.items, () => {
  selected.value = [];
  table.value?.clearSelection();
});
const selectionChanged = (rows: AttachmentListItem[]): void => {
  selected.value = rows;
};
const selectable = (row: AttachmentListItem): boolean =>
  !blocked.value && (row.canTrash || row.canPurge);
const typeLabel = (row: AttachmentListItem) => ATTACHMENT_FILE_TYPE_LABELS[row.fileType];
const lifecycleLabel = (row: AttachmentListItem) => ATTACHMENT_LIFECYCLE_LABELS[row.lifecycle];
const cleanupError = (row: AttachmentListItem) =>
  row.cleanupErrorCode ? ATTACHMENT_CLEANUP_ERROR_LABELS[row.cleanupErrorCode] : '';
const lifecycleTag = (row: AttachmentListItem): 'info' | 'success' | 'warning' | 'danger' => {
  if (row.lifecycle === ATTACHMENT_LIFECYCLE.failed) return 'danger';
  if (row.lifecycle === ATTACHMENT_LIFECYCLE.processing) return 'warning';
  return row.lifecycle === ATTACHMENT_LIFECYCLE.active ? 'success' : 'info';
};
const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
};
const showReferences = (row: AttachmentListItem): void => {
  referenceFile.value = row;
  referencesVisible.value = true;
};
const openFile = (row: AttachmentListItem, action: 'preview' | 'download'): void => {
  selectedFile.value = row;
  void fileActions[action]();
};
const runAction = async (action: 'trash' | 'purge', rows: AttachmentListItem[]): Promise<void> => {
  if (blocked.value || !rows.length || !active.value) return;
  const snapshot = rows.map((row) => ({ ...row }));
  if (!snapshot.every((row) => (action === 'trash' ? row.canTrash : row.canPurge))) return;
  const count = snapshot.length;
  const size = formatSize(snapshot.reduce((sum, row) => sum + row.sizeBytes, 0));
  const title = action === 'trash' ? '移入回收站' : '物理清理附件';
  try {
    await RouteMessageBox.confirm(
      action === 'trash'
        ? `将 ${count} 个附件（${size}）移入回收站？之后不能再关联到业务记录，文件内容暂时保留。`
        : `永久删除 ${count} 个附件（${size}）的文件内容？此操作无法恢复，元数据及操作记录仍保留。`,
      title,
      { type: 'warning', confirmButtonText: action === 'trash' ? '移入回收站' : '确认永久清理' },
    );
  } catch {
    return;
  }
  if (!active.value || blocked.value) return;
  pending.value = true;
  results.value = [];
  resultTitle.value = `${title}：正在处理 ${count} 个附件`;
  try {
    for (const row of snapshot) {
      try {
        const result = await attachmentsApi[action](row.id, { version: row.version });
        const succeeded =
          action === 'trash'
            ? result.lifecycle === ATTACHMENT_LIFECYCLE.trashed
            : result.cleanupStatus === ATTACHMENT_CLEANUP_STATUS.completed;
        let message = '尚未确认完成，请刷新后核对当前状态';
        if (succeeded) message = action === 'trash' ? '已移入回收站' : '文件内容已清理';
        else if (result.cleanupErrorCode)
          message = ATTACHMENT_CLEANUP_ERROR_LABELS[result.cleanupErrorCode];
        results.value.push({
          fileName: row.fileName,
          success: succeeded,
          message,
        });
      } catch (error) {
        results.value.push({
          fileName: row.fileName,
          success: false,
          message: `${error instanceof Error ? error.message : '请求失败'}；请刷新后核对当前状态`,
        });
      }
    }
    const succeeded = results.value.filter((result) => result.success).length;
    resultTitle.value = `${title}：${succeeded} 个完成，${count - succeeded} 个失败或待核对`;
    if (active.value) {
      if (succeeded === count) EMessage.success(resultTitle.value);
      else EMessage.warning(resultTitle.value);
    }
    await list.refreshAfterWrite();
  } finally {
    pending.value = false;
  }
};
</script>

<style scoped>
.attachments-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel,
.result-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}
.query-panel {
  padding: 18px 20px 0;
}
.filter-select {
  width: 155px;
}
.table-panel {
  padding-top: 8px;
  overflow: hidden;
}
.retention-hint {
  margin: 8px 16px 12px;
  color: var(--el-text-color-regular);
}
.selection-summary,
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.failure-reason {
  margin-top: 5px;
  font-size: 12px;
  color: var(--el-color-danger);
}
.result-panel {
  padding: 12px 16px;
}
.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
</style>
