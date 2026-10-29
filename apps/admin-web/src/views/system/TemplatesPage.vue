<template>
  <section class="templates-page">
    <el-form
      inline
      class="query-panel"
      @submit.prevent="list.search"
    >
      <el-form-item label="模板名称"
        ><el-input
          v-model="list.query.keyword"
          clearable
          placeholder="搜索模板名称"
          @keyup.enter="list.search"
      /></el-form-item>
      <el-form-item label="状态"
        ><el-select
          v-model="list.query.status"
          clearable
          placeholder="全部"
          class="status-select"
          ><el-option
            v-for="status in BUSINESS_TEMPLATE_STATUSES"
            :key="status"
            :value="status"
            :label="BUSINESS_TEMPLATE_STATUS_LABELS[status]" /></el-select
      ></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          @click="list.search"
          >查询</el-button
        ><el-button @click="resetQuery">重置</el-button></el-form-item
      >
    </el-form>
    <div class="table-panel">
      <TableToolbar :total="list.total.value"
        ><template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="createTemplate"
            >创建模板</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            :loading="list.loading.value"
            @click="list.load"
            >刷新</el-button
          ></template
        ></TableToolbar
      >
      <el-alert
        v-if="list.errorMessage.value"
        :title="list.errorMessage.value"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="list.loading.value || detailLoading"
        :data="list.items.value"
        empty-text="暂无模板"
      >
        <el-table-column
          prop="name"
          label="模板名称"
          min-width="180"
        />
        <el-table-column
          label="列配置"
          min-width="250"
          show-overflow-tooltip
          ><template #default="{ row }">{{
            row.content.columns.map((column: JsonTableColumn) => column.label).join(' / ')
          }}</template></el-table-column
        >
        <el-table-column
          label="预设行"
          width="90"
          ><template #default="{ row }">{{ row.content.rows.length }}</template></el-table-column
        >
        <el-table-column
          label="状态"
          width="100"
          ><template #default="{ row }"
            ><el-tag :type="row.status === BUSINESS_TEMPLATE_STATUS.enabled ? 'success' : 'info'">{{
              BUSINESS_TEMPLATE_STATUS_LABELS[row.status as BusinessTemplateStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="更新时间"
          min-width="170"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.updatedAt)
          }}</template></el-table-column
        >
        <el-table-column
          label="操作"
          width="140"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              :disabled="
                Boolean(pendingId) ||
                detailLoading ||
                list.loading.value ||
                Boolean(list.errorMessage.value)
              "
              @click="editTemplate(row)"
              >编辑</el-button
            ><el-button
              link
              :type="row.status === BUSINESS_TEMPLATE_STATUS.enabled ? 'danger' : 'success'"
              :loading="pendingId === row.id"
              :disabled="
                Boolean(pendingId) || list.loading.value || Boolean(list.errorMessage.value)
              "
              @click="toggleStatus(row)"
              >{{ row.status === BUSINESS_TEMPLATE_STATUS.enabled ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="list.total.value"
        :current-page="list.page.value"
        :page-size="list.pageSize.value"
        :disabled="list.loading.value"
        @page-change="list.changePage"
        @update:page-size="list.changePageSize"
      />
    </div>
    <TemplateEditorDialog
      v-model:visible="editorVisible"
      :item="editingItem"
      @saved="list.load"
    />
  </section>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import {
  BUSINESS_TEMPLATE_STATUS,
  BUSINESS_TEMPLATE_STATUSES,
  BUSINESS_TEMPLATE_STATUS_LABELS,
} from '@company/constants';
import type {
  BusinessTemplateItem,
  BusinessTemplateStatus,
  JsonTableColumn,
} from '@company/contracts';
import { businessTemplatesApi } from '../../api/templates';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useBusinessTemplateList } from '../../composables/useBusinessTemplateList';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import TemplateEditorDialog from './components/TemplateEditorDialog.vue';
defineOptions({ name: 'TemplatesPage' });
const active = ref(true);
const list = useBusinessTemplateList(() => active.value);
const editorVisible = ref(false);
const editingItem = ref<BusinessTemplateItem | null>(null);
const detailLoading = ref(false);
const pendingId = ref<string | null>(null);
const reads = useLatestReadRequest(() => (detailLoading.value = false));
onMounted(list.load);
onActivated(() => (active.value = true));
onDeactivated(() => (active.value = false));
const resetQuery = (): void => {
  list.query.keyword = '';
  list.query.status = '';
  void list.search();
};
const createTemplate = (): void => {
  reads.invalidate();
  editingItem.value = null;
  editorVisible.value = true;
};
const editTemplate = async (item: BusinessTemplateItem): Promise<void> => {
  const { isCurrent, signal } = reads.begin(() => active.value);
  detailLoading.value = true;
  try {
    const latest = await businessTemplatesApi.detail(item.id, signal);
    if (!isCurrent()) return;
    editingItem.value = latest;
    editorVisible.value = true;
  } catch (error) {
    if (isCurrent()) EMessage.error(error, '模板读取失败');
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
};
const toggleStatus = async (item: BusinessTemplateItem): Promise<void> => {
  if (pendingId.value) return;
  const enabled = item.status !== BUSINESS_TEMPLATE_STATUS.enabled;
  try {
    await RouteMessageBox.confirm(`确认${enabled ? '启用' : '停用'}“${item.name}”？`, '模板状态', {
      type: 'warning',
    });
  } catch {
    return;
  }
  if (!active.value || pendingId.value) return;
  pendingId.value = item.id;
  try {
    await businessTemplatesApi.update(item.id, {
      version: item.version,
      status: enabled ? BUSINESS_TEMPLATE_STATUS.enabled : BUSINESS_TEMPLATE_STATUS.disabled,
    });
    EMessage.success(enabled ? '模板已启用' : '模板已停用');
    await list.load();
  } catch (error) {
    EMessage.error(error, '状态修改失败，请刷新后核对');
  } finally {
    pendingId.value = null;
  }
};
</script>

<style scoped>
.templates-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}
.query-panel {
  padding: 18px 20px 0;
}
.status-select {
  width: 150px;
}
.table-panel {
  padding: 8px 0 0;
  overflow: hidden;
}
</style>
