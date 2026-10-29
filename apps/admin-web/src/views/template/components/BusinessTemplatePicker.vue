<template>
  <el-dialog
    :model-value="visible"
    title="应用模板"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      inline
      @submit.prevent="list.search"
    >
      <el-form-item label="模板名称"
        ><el-input
          v-model="list.query.keyword"
          clearable
          placeholder="搜索模板"
          @keyup.enter="list.search"
      /></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          @click="list.search"
          >查询</el-button
        ></el-form-item
      >
    </el-form>
    <el-alert
      v-if="list.errorMessage.value"
      :title="list.errorMessage.value"
      type="error"
      :closable="false"
    />
    <el-table
      v-loading="list.loading.value"
      :data="list.items.value"
      empty-text="暂无启用模板"
    >
      <el-table-column
        prop="name"
        label="模板名称"
        min-width="160"
      />
      <el-table-column
        label="列名"
        min-width="220"
        ><template #default="{ row }">{{
          row.content.columns.map((column: JsonTableColumn) => column.label).join(' / ')
        }}</template></el-table-column
      >
      <el-table-column
        label="预设行"
        width="80"
        ><template #default="{ row }">{{ row.content.rows.length }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="80"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            :disabled="loading || list.loading.value || Boolean(list.errorMessage.value)"
            @click="select(row)"
            >预览</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <PaginationFooter
      :total="list.total.value"
      :current-page="list.page.value"
      :page-size="list.pageSize.value"
      compact
      :disabled="loading || list.loading.value"
      @page-change="list.changePage"
      @update:page-size="list.changePageSize"
    />
    <section
      v-if="selected"
      class="template-preview"
    >
      <strong>{{ selected.name }}</strong>
      <JsonTableEditor
        :model-value="selected.content"
        readonly
      />
    </section>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selected || loading"
        :loading="loading"
        @click="apply"
        >应用模板</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { BUSINESS_TEMPLATE_STATUS } from '@company/constants';
import type { BusinessTemplateItem, JsonTableColumn, JsonTableData } from '@company/contracts';
import { normalizeJsonTable } from '@company/utils';
import { businessTemplatesApi } from '../../../api/templates';
import { useBusinessTemplateList } from '../composables/use-business-template-list';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'apply', data: JsonTableData): void;
}>();
const list = useBusinessTemplateList(() => props.visible);
const selected = ref<BusinessTemplateItem | null>(null);
const loading = ref(false);
const reads = useLatestReadRequest(() => (loading.value = false));
watch(
  () => props.visible,
  (visible) => {
    reads.invalidate();
    if (visible) {
      selected.value = null;
      list.query.keyword = '';
      list.query.status = BUSINESS_TEMPLATE_STATUS.enabled;
      void list.search();
    }
  },
);
const readTemplate = async (id: string): Promise<BusinessTemplateItem | null> => {
  if (!props.visible || !reads.isActive()) return null;
  const { isCurrent, signal } = reads.begin(() => props.visible);
  loading.value = true;
  try {
    const item = await businessTemplatesApi.detail(id, signal);
    if (!isCurrent()) return null;
    if (item.status !== BUSINESS_TEMPLATE_STATUS.enabled) throw new Error('模板已停用，请重新选择');
    return item;
  } catch (error) {
    if (isCurrent()) EMessage.error(error, '模板读取失败');
    return null;
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
const select = async (item: BusinessTemplateItem): Promise<void> => {
  selected.value = null;
  const latest = await readTemplate(item.id);
  if (latest) selected.value = latest;
};
const apply = async (): Promise<void> => {
  if (!selected.value || loading.value) return;
  const item = await readTemplate(selected.value.id);
  if (!item) return;
  if (item.version !== selected.value?.version) {
    selected.value = item;
    EMessage.warning('模板内容已更新，请核对预览后再应用');
    return;
  }
  emit('apply', normalizeJsonTable(item.content));
  emit('update:visible', false);
};
</script>

<style scoped>
.template-preview {
  margin-top: 16px;
}
.template-preview > strong {
  display: block;
  margin-bottom: 12px;
}
</style>
