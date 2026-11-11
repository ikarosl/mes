<template>
  <div class="personnel-page">
    <section class="panel query-panel">
      <el-form
        :inline="true"
        :model="query"
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="人员编号 / 姓名"
            @keyup.enter="search"
        /></el-form-item>
        <el-form-item label="状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部"
            ><el-option
              v-for="item in PERSONNEL_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <InlineHint>现场人员用于到站、交接和终检登记；操作账号保留为审计人。</InlineHint>
    </section>
    <section class="panel">
      <TableToolbar
        ><template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="openEditor()"
            >新增现场人员</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            :loading="loading"
            @click="load"
            >刷新</el-button
          ></template
        ></TableToolbar
      >
      <el-alert
        v-if="listError"
        :title="listError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
      >
        <el-table-column
          prop="code"
          label="人员编号"
          min-width="140"
        />
        <el-table-column
          prop="name"
          label="姓名"
          min-width="180"
        />
        <el-table-column
          label="状态"
          width="120"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{
              PERSONNEL_STATUS_LABELS[row.status as PersonnelStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          width="120"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openEditor(row)"
              >编辑</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </section>
    <el-dialog
      :model-value="editorVisible"
      :title="editing ? '编辑现场人员' : '新增现场人员'"
      :width="DialogWidth.md"
      :before-close="beforeClose"
      @update:model-value="editorVisible = $event"
    >
      <el-form
        :model="form"
        label-width="90px"
        :disabled="saving"
      >
        <el-form-item
          label="人员编号"
          required
          ><el-input
            v-model="form.code"
            maxlength="50"
            :disabled="Boolean(editing)"
        /></el-form-item>
        <el-form-item
          label="姓名"
          required
          ><el-input
            v-model="form.name"
            maxlength="100"
        /></el-form-item>
        <el-form-item
          label="状态"
          required
          ><el-radio-group v-model="form.status"
            ><el-radio
              v-for="item in PERSONNEL_STATUS_OPTIONS"
              :key="item.value"
              :value="item.value"
              >{{ item.label }}</el-radio
            ></el-radio-group
          ></el-form-item
        >
      </el-form>
      <template #footer
        ><el-button
          :disabled="saving"
          @click="closeEditor(false)"
          >取消</el-button
        ><el-button
          type="primary"
          :loading="saving"
          @click="save"
          >保存</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERSONNEL_STATUS_LABELS, PERSONNEL_STATUS_OPTIONS } from '@company/constants';
import type { PersonnelItem, PersonnelStatus, SavePersonnelInput } from '@company/contracts';
import { personnelApi } from '../../api/personnel';
import InlineHint from '../../components/InlineHint.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../composables/requests/usePageInitialLoad';
import { useTabsStore } from '../../stores/tabs';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';

defineOptions({ name: 'PersonnelPage' });
const items = ref<PersonnelItem[]>([]),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10);
const loading = ref(false),
  listError = ref('');
const query = reactive<{
  keyword: string;
  status: PersonnelStatus | '';
}>({ keyword: '', status: '' });
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
async function load(): Promise<void> {
  if (!reads.isActive()) return;
  const read = reads.begin();
  loading.value = true;
  listError.value = '';
  try {
    const result = await personnelApi.list(
      {
        page: page.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        status: query.status || undefined,
      },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (!read.isCurrent()) return;
    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    if (read.isCurrent())
      listError.value = error instanceof Error ? error.message : '现场人员加载失败，请重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  page.value = 1;
  await load();
}
async function reset(): Promise<void> {
  Object.assign(query, { keyword: '', status: '' });
  await search();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
async function changePageSize(value: number): Promise<void> {
  pageSize.value = value;
  await search();
}

const editorVisible = ref(false),
  saving = ref(false),
  editing = ref<PersonnelItem | null>(null);
const emptyForm = (): SavePersonnelInput => ({
  code: '',
  name: '',
  status: 'active',
});
const form = reactive(emptyForm());
let initialSignature = '';
function openEditor(item?: PersonnelItem): void {
  if (editorVisible.value) return;
  editing.value = item ? { ...item } : null;
  Object.assign(
    form,
    item ? { code: item.code, name: item.name, status: item.status } : emptyForm(),
  );
  initialSignature = JSON.stringify(form);
  editorVisible.value = true;
}
async function allowClose(): Promise<boolean> {
  if (saving.value) return false;
  if (!editorVisible.value || JSON.stringify(form) === initialSignature) return true;
  try {
    await RouteMessageBox.confirm('现场人员信息尚未保存，确认放弃本次修改？', '关闭确认', {
      type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
}
async function closeEditor(visible: boolean): Promise<void> {
  if (!visible && (await allowClose())) editorVisible.value = false;
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) done();
}
async function save(): Promise<void> {
  if (saving.value) return;
  if (!form.code.trim() || !form.name.trim()) {
    EMessage.warning('请填写人员编号和姓名');
    return;
  }
  saving.value = true;
  try {
    const data = { ...form, code: form.code.trim(), name: form.name.trim() };
    if (editing.value)
      await personnelApi.update(editing.value.id, { ...data, version: editing.value.version });
    else await personnelApi.create(data);
    EMessage.success('现场人员已保存');
    editorVisible.value = false;
    await load();
  } catch (error) {
    EMessage.error(error, '现场人员保存失败');
  } finally {
    saving.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard('system-personnel', allowClose);
onScopeDispose(unregister);
usePageInitialLoad(load);
</script>

<style scoped>
.personnel-page {
  display: grid;
  gap: 16px;
}
.panel {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 20px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 190px;
}
.panel :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
</style>
