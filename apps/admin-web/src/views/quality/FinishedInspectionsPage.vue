<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
      >
        <el-form-item label="工单 / 任务 / 成品"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="输入单号、编码或名称"
        /></el-form-item>
        <el-form-item label="办理范围"
          ><el-select
            v-model="status"
            clearable
            placeholder="全部"
            style="width: 180px"
          >
            <el-option
              v-for="value in FINISHED_INSPECTION_LIST_STATUSES"
              :key="value"
              :value="value"
              :label="FINISHED_INSPECTION_LIST_STATUS_LABELS[value]"
            /> </el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
    </div>
    <div class="table-panel">
      <TableToolbar
        ><template #actions
          ><span class="help"
            >选择任务登记全检、抽检或复检，记录检查事实与放行结论；已有记录保留用于结案引用。</span
          ></template
        >
        <template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新成品质检"
            @click="load" /></template
      ></TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="batchId"
        empty-text="暂无成品质检任务"
      >
        <el-table-column
          prop="workOrderNo"
          label="工单"
          min-width="170"
        />
        <el-table-column
          prop="batchNo"
          label="任务"
          min-width="170"
        />
        <el-table-column
          label="成品"
          min-width="230"
          ><template #default="{ row }"
            >{{ row.productCode }} · {{ row.productName }}</template
          ></el-table-column
        >
        <el-table-column
          label="计划数量"
          width="110"
          ><template #default="{ row }">{{
            Number(row.plannedQuantity)
          }}</template></el-table-column
        >
        <el-table-column
          label="最近检验结论"
          min-width="150"
          ><template #default="{ row }">{{
            decisionLabel(row.latestReleaseDecision)
          }}</template></el-table-column
        >
        <el-table-column
          prop="latestInspectedAt"
          label="最近检验时间"
          min-width="190"
        />
        <el-table-column
          label="操作"
          width="120"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="navigate(row.batchId)"
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
    <FinishedInspectionDialog
      ref="detail"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  FINISHED_INSPECTION_LIST_STATUSES,
  FINISHED_INSPECTION_LIST_STATUS_LABELS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
} from '@company/constants';
import type { ProductionOutputReleaseDecision } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { useFinishedInspectionsList } from './composables/useFinishedInspectionsList';
import FinishedInspectionDialog from './components/FinishedInspectionDialog.vue';
defineOptions({ name: 'FinishedInspectionsPage' });
const route = useRoute(),
  router = useRouter();
const {
  keyword,
  status,
  rows,
  page,
  pageSize,
  total,
  loading,
  load,
  search,
  reset,
  changePage,
  changePageSize,
} = useFinishedInspectionsList();
const detail = ref<InstanceType<typeof FinishedInspectionDialog>>();
const decisionLabel = (decision: ProductionOutputReleaseDecision | null) =>
  decision ? PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[decision] : '尚未检验';
let navigating = false;
async function navigate(id: string): Promise<boolean> {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    return (await detail.value?.open(id)) ?? false;
  } finally {
    navigating = false;
  }
}
let consumed = '',
  accepted = '';
async function locate() {
  if (route.name !== 'quality-finished-inspections') return;
  await nextTick();
  const id = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  if (!id || consumed === id) return;
  consumed = id;
  const succeeded = await navigate(id);
  if (route.name !== 'quality-finished-inspections' || route.query.batchId !== id) return;
  if (succeeded) accepted = id;
  else {
    consumed = accepted;
    const query = { ...route.query };
    delete query.batchId;
    await router.replace({ query: { ...query, ...(accepted ? { batchId: accepted } : {}) } });
  }
}
watch(
  () => [route.name, route.query.batchId],
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
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.table-panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
