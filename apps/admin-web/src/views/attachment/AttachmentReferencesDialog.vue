<template>
  <el-dialog
    v-model="visible"
    :title="`附件引用 · ${fileName}`"
    :width="DialogWidth.lg"
  >
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="reference-toolbar">
      <span>当前引用与历史保留引用均阻止清理。</span
      ><el-button
        :loading="loading"
        @click="load"
        >刷新</el-button
      >
    </div>
    <el-table
      v-loading="loading"
      :data="items"
      empty-text="暂无引用"
    >
      <el-table-column
        label="业务对象"
        min-width="160"
        ><template #default="{ row }">{{ ownerLabel(row) }}</template></el-table-column
      >
      <el-table-column
        prop="ownerId"
        label="业务记录 ID"
        width="130"
      />
      <el-table-column
        label="用途"
        width="130"
        ><template #default="{ row }">{{ slotLabel(row) }}</template></el-table-column
      >
      <el-table-column
        label="登记人"
        min-width="120"
        ><template #default="{ row }">{{
          row.createdByName ?? row.createdBy ?? '未记录'
        }}</template></el-table-column
      >
      <el-table-column
        label="登记时间"
        min-width="175"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.createdAt)
        }}</template></el-table-column
      >
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :disabled="loading"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AttachmentReferenceItem } from '@company/contracts';
import { ATTACHMENT_OWNER_TYPE_LABELS, ATTACHMENT_REFERENCE_SLOT_LABELS } from '@company/constants';
import { attachmentsApi } from '../../api/attachments';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ attachmentId: string | null; fileName: string }>();
const items = ref<AttachmentReferenceItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const errorMessage = ref('');
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
const ownerLabel = (item: AttachmentReferenceItem) => ATTACHMENT_OWNER_TYPE_LABELS[item.ownerType];
const slotLabel = (item: AttachmentReferenceItem) => ATTACHMENT_REFERENCE_SLOT_LABELS[item.slot];
const load = async (): Promise<void> => {
  const id = props.attachmentId;
  if (!visible.value || !id || !reads.isActive()) return;
  const { isCurrent, signal } = reads.begin(() => visible.value && props.attachmentId === id);
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await attachmentsApi.references(
      id,
      { page: page.value, pageSize: pageSize.value },
      signal,
    );
    if (!isCurrent()) return;
    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    if (isCurrent())
      errorMessage.value = error instanceof Error ? error.message : '引用读取失败，请重试';
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
watch([visible, () => props.attachmentId], () => {
  reads.invalidate();
  if (visible.value) {
    items.value = [];
    total.value = 0;
    page.value = 1;
    void load();
  }
});
const changePage = (value: number): void => {
  page.value = value;
  void load();
};
const changePageSize = (value: number): void => {
  pageSize.value = value;
  page.value = 1;
  void load();
};
</script>
<style scoped>
.reference-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
</style>
