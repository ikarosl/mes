<template>
  <el-dialog
    v-model="visible"
    title="来料检验历史"
    :width="DialogWidth.workbench"
    workbench
    :before-close="close"
  >
    <p v-if="source">
      {{ source.receiptNo }} · 第 {{ source.lineNo }} 行 · {{ source.itemName }} ·
      {{ source.materialVariantCode }}
    </p>
    <el-alert
      v-if="readError"
      title="检验历史加载失败，请刷新重试。"
      type="error"
      :closable="false"
    />
    <div v-loading="loading">
      <el-empty
        v-if="!loading && !readError && !rows.length"
        description="暂无检验记录"
      />
      <article
        v-for="row in rows"
        :key="row.id"
        class="inspection-record"
      >
        <strong
          >{{ QUALITY_INBOUND_CASE_TYPE_LABELS[row.caseType] }} ·
          {{ QUALITY_INBOUND_CASE_STATUS_LABELS[row.status] }}</strong
        >
        <p class="record-context">
          发起时间：{{ formatDateTimeForDisplay(row.createdAt) }} · 原申报量：{{
            row.coveredQuantity
          }}
          {{ source?.unit }} · 原因：{{ row.reason }}
        </p>
        <InboundInspectionRecord
          v-if="row.inspection"
          :inspection="row.inspection"
        />
        <p v-else>尚未形成检验结论</p>
      </article>
    </div>
    <template #footer>
      <el-pagination
        v-model:current-page="page"
        :page-size="10"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
      <el-button
        :disabled="loading"
        @click="load"
        >刷新</el-button
      >
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { onActivated, ref } from 'vue';
import type {
  ProcurementInboundInspectionDetail,
  QualityInboundCaseItem,
} from '@company/contracts';
import {
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatDateTimeForDisplay } from '../../../utils/date';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
const visible = ref(false),
  loading = ref(false),
  readError = ref(false),
  page = ref(1),
  total = ref(0);
const source = ref<ProcurementInboundInspectionDetail | null>(null);
const rows = ref<QualityInboundCaseItem[]>([]);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  if (!visible.value || !source.value || !read.isActive()) return;
  const id = source.value.id,
    requestedPage = page.value;
  const current = read.begin(
    () => visible.value && source.value?.id === id && page.value === requestedPage,
  );
  loading.value = true;
  rows.value = [];
  try {
    const result = await procurementApi.receiptCases(
      id,
      { page: requestedPage, pageSize: 10 },
      current.signal,
    );
    if (!current.isCurrent()) return;
    rows.value = result.items;
    total.value = result.total;
    readError.value = false;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '检验历史加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (line: ProcurementInboundInspectionDetail): Promise<void> => {
  read.invalidate();
  source.value = line;
  page.value = 1;
  total.value = 0;
  rows.value = [];
  readError.value = false;
  visible.value = true;
  await load();
};
const close = (): void => {
  visible.value = false;
  read.invalidate();
};
onActivated(() => {
  if (visible.value) void load();
});
defineExpose({ open, close, visible });
</script>
<style scoped>
.inspection-record {
  margin: 16px 0 24px;
}
.record-context {
  color: var(--el-text-color-regular);
}
.el-pagination {
  display: inline-flex;
  margin-right: 16px;
  vertical-align: middle;
}
</style>
