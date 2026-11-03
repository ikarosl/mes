<template>
  <el-dialog
    :model-value="visible"
    title="场景默认模板"
    :width="DialogWidth.xl"
    :before-close="beforeClose"
    :show-close="!editorVisible"
    :close-on-press-escape="!editorVisible"
    @update:model-value="close"
  >
    <TableToolbar :total="filteredDefaults.length">
      <template #actions>
        <el-input
          v-model="keyword"
          class="scene-search"
          clearable
          aria-label="搜索场景或模板名称"
          placeholder="搜索场景或模板名称"
        />
      </template>
      <template #tools>
        <el-button
          :icon="Refresh"
          :loading="loading"
          :disabled="editorVisible"
          @click="loadDefaults"
          >刷新配置</el-button
        >
      </template>
    </TableToolbar>
    <el-alert
      v-if="errorMessage"
      class="defaults-error"
      :title="errorMessage"
      :description="defaults.length ? '已显示的配置仅供查看，刷新成功后可继续配置。' : undefined"
      type="error"
      :closable="false"
      show-icon
    />
    <el-alert
      v-else-if="defaults.length && !ready && !loading"
      class="defaults-error"
      title="配置尚未读取完成，请刷新后再配置。"
      type="info"
      :closable="false"
      show-icon
    />
    <el-table
      v-loading="loading"
      :data="filteredDefaults"
      row-key="sceneCode"
      :empty-text="emptyText"
    >
      <el-table-column
        label="业务场景"
        min-width="180"
      >
        <template #default="{ row }">
          <span class="wrapping-name">{{ sceneLabel(row.sceneCode) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="当前默认模板"
        min-width="260"
      >
        <template #default="{ row }">
          <span class="wrapping-name">{{ templateName(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="配置状态"
        width="140"
      >
        <template #default="{ row }">
          <el-tag
            v-if="!row.template"
            type="warning"
            >{{ row.templateId ? '模板不可用' : '未配置' }}</el-tag
          >
          <el-tag
            v-else-if="row.template.status === BUSINESS_TEMPLATE_STATUS.disabled"
            type="warning"
            >模板已停用</el-tag
          >
          <el-tag
            v-else
            type="success"
            >已配置</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="130"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="!ready || loading || editorVisible"
            @click="configureDefault(row)"
            >配置默认模板</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button
        :disabled="editorVisible"
        @click="close"
        >关闭</el-button
      >
    </template>
  </el-dialog>
  <TemplateDefaultDialog
    v-model:visible="editorVisible"
    :item="editingDefault"
    @saved="loadDefaults"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { BUSINESS_TEMPLATE_SCENE_LABELS, BUSINESS_TEMPLATE_STATUS } from '@company/constants';
import type { BusinessTemplateDefaultItem, BusinessTemplateSceneCode } from '@company/contracts';
import { businessTemplatesApi } from '../../../api/templates';
import TableToolbar from '../../../components/TableToolbar.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import TemplateDefaultDialog from './TemplateDefaultDialog.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
}>();
const defaults = ref<BusinessTemplateDefaultItem[]>([]);
const keyword = ref('');
const loading = ref(false);
const ready = ref(false);
const errorMessage = ref('');
const editorVisible = ref(false);
const editingDefault = ref<BusinessTemplateDefaultItem | null>(null);
const reads = useLatestReadRequest(() => (loading.value = false));
const sceneLabel = (sceneCode: BusinessTemplateSceneCode): string =>
  BUSINESS_TEMPLATE_SCENE_LABELS[sceneCode] ?? sceneCode;
const templateName = (item: BusinessTemplateDefaultItem): string => {
  if (item.template) return item.template.name;
  return item.templateId ? '关联模板不可用' : '未配置';
};
const filteredDefaults = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase();
  if (!search) return defaults.value;
  return defaults.value.filter((item) =>
    [sceneLabel(item.sceneCode), item.template?.name ?? ''].some((name) =>
      name.toLocaleLowerCase().includes(search),
    ),
  );
});
const emptyText = computed(() => {
  if (loading.value) return '正在读取配置';
  if (errorMessage.value) return '配置读取失败，请刷新重试';
  if (!ready.value) return '请刷新读取场景默认配置';
  if (!defaults.value.length) return '暂无可配置的业务场景';
  return '未找到匹配的场景或模板';
});
const loadDefaults = async (): Promise<void> => {
  if (!props.visible || editorVisible.value) return;
  ready.value = false;
  if (!reads.isActive()) return;
  const { isCurrent, signal } = reads.begin(() => props.visible && !editorVisible.value);
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await businessTemplatesApi.defaults(signal);
    if (!isCurrent()) return;
    defaults.value = result;
    ready.value = true;
  } catch (error) {
    if (isCurrent())
      errorMessage.value = error instanceof Error ? error.message : '默认配置读取失败，请重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
watch(
  () => props.visible,
  (visible) => {
    reads.invalidate();
    if (visible) void loadDefaults();
  },
);
const configureDefault = (item: BusinessTemplateDefaultItem): void => {
  if (!props.visible || !ready.value || loading.value || editorVisible.value || !reads.isActive())
    return;
  editingDefault.value = item;
  editorVisible.value = true;
};
const close = (): void => {
  if (!editorVisible.value) emit('update:visible', false);
};
const beforeClose = (done: () => void): void => {
  if (!editorVisible.value) done();
};
</script>

<style scoped>
.scene-search {
  width: 280px;
  max-width: 100%;
}
.defaults-error {
  margin-bottom: 12px;
}
.wrapping-name {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
