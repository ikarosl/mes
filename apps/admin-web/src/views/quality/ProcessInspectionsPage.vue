<template>
  <section>
    <el-form
      inline
      class="query-panel"
      @submit.prevent="search"
    >
      <el-form-item label="工单 / 任务 / 工序"
        ><el-input
          v-model="keyword"
          clearable
          maxlength="100"
          placeholder="输入单号、名称或编码"
      /></el-form-item>
      <el-form-item><el-checkbox v-model="pendingOnly">仅待处理</el-checkbox></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          native-type="submit"
          :loading="loading"
          >查询</el-button
        ><el-button @click="reset">重置</el-button></el-form-item
      >
    </el-form>
    <div class="table-panel">
      <TableToolbar
        ><template #actions
          ><InlineHint
            >每个任务工序一行，进入后登记检查或处理已有记录。累计仅含有效结果，不代表独立实物覆盖量。</InlineHint
          >
          <el-button
            v-if="typeof route.query.inspectionId === 'string'"
            @click="retryLocation"
            >重新读取定位检查</el-button
          > </template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新工序专检"
            @click="load" /></template
      ></TableToolbar>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="stepId"
        border
      >
        <el-table-column
          label="工单 / 任务"
          min-width="190"
          ><template #default="{ row }"
            ><strong>{{ row.batchNo }}</strong>
            <div class="muted">{{ row.workOrderNo }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="成品 / 工序"
          min-width="210"
          ><template #default="{ row }"
            >{{ row.stepOrder }} · {{ row.stepName }}
            <div class="muted">{{ row.productCode }} · {{ row.productName }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="有效合格 / 不合格累计"
          min-width="185"
        >
          <template #default="{ row }">
            <InspectionQuantity
              :value="row.qualifiedQuantity"
              kind="qualified"
            />
            /
            <InspectionQuantity
              :value="row.unqualifiedQuantity"
              kind="unqualified"
            />
            {{ row.unit }}
            <div
              v-if="!row.activeInspectionCount"
              class="muted"
            >
              暂无有效检查
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="acceptedQuantity"
          label="已处理"
          width="85"
        />
        <el-table-column
          prop="pendingQuantity"
          label="待处理"
          width="85"
        />
        <el-table-column
          label="检查次数"
          min-width="125"
        >
          <template #default="{ row }"
            >{{ row.inspectionCount }} 次
            <div class="muted">有效 {{ row.activeInspectionCount }} 次</div></template
          >
        </el-table-column>
        <el-table-column
          label="最近有效检查"
          min-width="165"
        >
          <template #default="{ row }">{{
            formatDateTimeForDisplay(row.latestInspectedAt)
          }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="110"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="dialog?.open(row.stepId)"
              >查看 / 办理</el-button
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
    </div>
    <ProcessInspectionStepDialog
      ref="dialog"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type { ProcessInspectionStepSummary } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import InlineHint from '../../components/InlineHint.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import InspectionQuantity from './components/InspectionQuantity.vue';
import ProcessInspectionStepDialog from './components/ProcessInspectionStepDialog.vue';
import { processInspectionsApi } from '../../api/process-inspections';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../composables/requests/usePageInitialLoad';
import { formatDateTimeForDisplay } from '../../utils/date';
defineOptions({ name: 'ProcessInspectionsPage' });
const keyword = ref(''),
  pendingOnly = ref(false),
  rows = ref<ProcessInspectionStepSummary[]>([]);
const page = ref(1),
  pageSize = ref(10),
  total = ref(0),
  loading = ref(false),
  error = ref('');
const dialog = ref<InstanceType<typeof ProcessInspectionStepDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
async function load(): Promise<void> {
  if (!read.isActive()) return;
  const current = read.begin();
  loading.value = true;
  error.value = '';
  try {
    const result = await processInspectionsApi.list(
      {
        keyword: keyword.value.trim() || undefined,
        pendingOnly: pendingOnly.value ? 'true' : undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (failure) {
    if (current.isCurrent())
      error.value = failure instanceof Error ? failure.message : '专检列表加载失败';
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  page.value = 1;
  await load();
}
async function reset(): Promise<void> {
  keyword.value = '';
  pendingOnly.value = false;
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
usePageInitialLoad(load);
const route = useRoute(),
  router = useRouter();
let locating = false;
let consumedInspectionId = '';
function retryLocation(): void {
  consumedInspectionId = '';
  void locate();
}
async function locate(): Promise<void> {
  if (route.name !== 'quality-process-inspections') return;
  if (typeof route.query.inspectionId !== 'string') {
    consumedInspectionId = '';
    return;
  }
  const id = route.query.inspectionId;
  if (locating || id === consumedInspectionId) return;
  locating = true;
  try {
    await nextTick();
    if (route.name !== 'quality-process-inspections' || route.query.inspectionId !== id) return;
    consumedInspectionId = id;
    const opened = await dialog.value?.openInspection(id);
    if (opened && route.name === 'quality-process-inspections' && route.query.inspectionId === id) {
      const query = { ...route.query };
      delete query.inspectionId;
      await router.replace({ query });
    }
  } finally {
    locating = false;
    if (
      route.name === 'quality-process-inspections' &&
      typeof route.query.inspectionId === 'string' &&
      route.query.inspectionId !== id
    )
      void locate();
  }
}
watch(
  () => [route.name, route.query.inspectionId],
  () => {
    void locate();
  },
  { immediate: true },
);
onActivated(() => {
  void locate();
});
</script>
<style scoped>
.query-panel {
  padding: 16px 16px 0;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.table-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
</style>
