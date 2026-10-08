<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="searchAndExpand"
      >
        <el-form-item label="工单 / 任务 / 成品">
          <el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="输入单号、编码或名称"
          />
        </el-form-item>
        <el-form-item label="办理范围">
          <el-select
            v-model="status"
            clearable
            placeholder="全部任务"
            style="width: 180px"
          >
            <el-option
              v-for="value in FINISHED_INSPECTION_LIST_STATUSES"
              :key="value"
              :value="value"
              :label="FINISHED_INSPECTION_LIST_STATUS_LABELS[value]"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          >
          <el-button @click="resetAndExpand">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    <div
      v-loading="loading"
      class="table-panel"
    >
      <TableToolbar>
        <template #actions>
          <InlineHint>
            本页
            <strong>{{ rows.length }}</strong>
            项任务，按工单分组（同单可跨页）；各任务独立办理，<strong>已有记录仍可能待检</strong>。
          </InlineHint>
        </template>
        <template #tools>
          <el-button
            text
            @click="expandPage"
            >展开当前页</el-button
          >
          <el-button
            text
            @click="collapsePage"
            >收起当前页</el-button
          >
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新成品质检"
            @click="load"
          />
        </template>
      </TableToolbar>
      <div
        v-if="!groups.length && !loading"
        class="empty-area"
      >
        <el-empty
          description="当前筛选下暂无成品质检任务"
          :image-size="72"
        />
        <div class="empty-actions">
          <el-button
            v-if="status !== 'recorded'"
            @click="showRecorded"
            >查看已有检验记录</el-button
          >
          <el-button
            v-if="status"
            @click="showAll"
            >查看全部任务</el-button
          >
        </div>
      </div>
      <div
        v-for="group in groups"
        :key="group.workOrderId"
        class="document-block"
      >
        <div class="document-heading">
          <button
            class="fold-button business-disclosure"
            type="button"
            :aria-expanded="!collapsedOrders.has(group.workOrderId)"
            @click="toggleOrder(group.workOrderId)"
          >
            <span
              class="fold-icon"
              aria-hidden="true"
              >{{ collapsedOrders.has(group.workOrderId) ? '▶' : '▼' }}</span
            >
            <strong>工单 {{ group.workOrderNo }}</strong>
            <span class="fold-action">{{
              collapsedOrders.has(group.workOrderId) ? '展开' : '收起'
            }}</span>
          </button>
          <span class="document-meta">成品 {{ group.productCode }} · {{ group.productName }}</span>
          <span class="document-meta">本页含本单 {{ group.tasks.length }} 项任务</span>
          <span class="document-counts"
            >本页待开始 {{ group.startable }} 项 · 待填写 {{ group.recordable }} 项 · 复检待处理
            {{ group.reinspectionFollowups }} 项</span
          >
        </div>
        <div
          v-if="!collapsedOrders.has(group.workOrderId)"
          class="document-body"
        >
          <div
            class="task-grid column-heading"
            aria-hidden="true"
          >
            <span>任务</span><span>计划量</span><span>当前办理</span><span>检验记录参考</span
            ><span>下一步</span>
          </div>
          <div
            v-for="task in group.tasks"
            :key="task.batchId"
            class="task-grid task-row"
            :class="{ highlighted: highlightedBatchId === task.batchId }"
          >
            <strong>{{ task.batchNo }}</strong>
            <span>{{ Number(task.plannedQuantity) }} 件</span>
            <div>
              <el-tag
                size="small"
                :type="finishedStageTagType(task.stage)"
                >{{ FINISHED_INSPECTION_STAGE_LABELS[task.stage] }}</el-tag
              >
              <span class="round-reference">{{
                task.currentRoundNo ? '第 ' + task.currentRoundNo + ' 轮' : '尚无检验轮'
              }}</span>
            </div>
            <div>
              <template v-if="task.latestInspectionId">
                <span class="basis-label"
                  >{{
                    task.currentRoundInspectionId === task.latestInspectionId
                      ? '本轮检验记录'
                      : '最近历史记录'
                  }}
                  · 正式引用以清单为准</span
                >
                <el-button
                  class="inspection-id-link"
                  link
                  type="primary"
                  @click="openRecord(task.batchId, task.latestInspectionId)"
                  >检验记录 ID：{{ task.latestInspectionId }}</el-button
                >
                {{
                  task.latestReleaseDecision
                    ? PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[task.latestReleaseDecision]
                    : '结论未提供'
                }}
                <span class="record-time">{{
                  formatDateTimeForDisplay(task.latestInspectedAt)
                }}</span>
              </template>
              <span
                v-else
                class="muted"
                >尚无检验记录</span
              >
            </div>
            <div>
              <el-button
                link
                type="primary"
                @click="openTask(task.batchId)"
                >{{ FINISHED_INSPECTION_NEXT_ACTION_LABELS[task.nextAction] }}</el-button
              >
            </div>
          </div>
        </div>
      </div>
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
      @record-focus-cleared="clearRecordLocation"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  FINISHED_INSPECTION_LIST_STATUSES,
  FINISHED_INSPECTION_LIST_STATUS_LABELS,
  FINISHED_INSPECTION_STAGE_LABELS,
  FINISHED_INSPECTION_NEXT_ACTION_LABELS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
} from '@company/constants';
import type { FinishedInspectionTaskItem } from '@company/contracts';
import TableToolbar from '../../components/TableToolbar.vue';
import InlineHint from '../../components/InlineHint.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useFinishedInspectionsList } from './composables/useFinishedInspectionsList';
import { finishedStageTagType } from './inspection-presentation';
import FinishedInspectionDialog from './components/FinishedInspectionDialog.vue';

defineOptions({ name: 'FinishedInspectionsPage' });
type WorkOrderGroup = {
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  tasks: FinishedInspectionTaskItem[];
  startable: number;
  recordable: number;
  reinspectionFollowups: number;
};
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
const collapsedOrders = ref(new Set<string>());
const highlightedBatchId = ref('');
const groups = computed<WorkOrderGroup[]>(() => {
  const orders = new Map<string, WorkOrderGroup>();
  for (const task of rows.value) {
    let order = orders.get(task.workOrderId);
    if (!order) {
      order = {
        workOrderId: task.workOrderId,
        workOrderNo: task.workOrderNo,
        productCode: task.productCode,
        productName: task.productName,
        tasks: [],
        startable: 0,
        recordable: 0,
        reinspectionFollowups: 0,
      };
      orders.set(task.workOrderId, order);
    }
    order.tasks.push(task);
    if (task.canStartInspection) order.startable += 1;
    if (task.canRecordInspection) order.recordable += 1;
    if (task.stage === 'needs_reinspection' || task.stage === 'not_released')
      order.reinspectionFollowups += 1;
  }
  return [...orders.values()];
});
function toggleOrder(id: string) {
  const next = new Set(collapsedOrders.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  collapsedOrders.value = next;
}
function expandPage() {
  collapsedOrders.value = new Set(
    [...collapsedOrders.value].filter(
      (id) => !groups.value.some((group) => group.workOrderId === id),
    ),
  );
}
function collapsePage() {
  collapsedOrders.value = new Set([
    ...collapsedOrders.value,
    ...groups.value.map((group) => group.workOrderId),
  ]);
}
async function searchAndExpand() {
  await search();
  expandPage();
}
async function resetAndExpand() {
  await reset();
  expandPage();
}
async function showRecorded() {
  status.value = 'recorded';
  await searchAndExpand();
}
async function showAll() {
  status.value = '';
  keyword.value = '';
  await searchAndExpand();
}
function revealTask(id: string) {
  const group = groups.value.find((order) => order.tasks.some((task) => task.batchId === id));
  if (group) {
    const next = new Set(collapsedOrders.value);
    next.delete(group.workOrderId);
    collapsedOrders.value = next;
    highlightedBatchId.value = id;
  }
}
let navigating = false;
let openedBatchId = '';
let openedRecordId = '';
async function openTask(id: string) {
  if (!(await navigate(id))) return;
  accepted = id;
  acceptedRecordId = '';
  if (route.query.batchId !== id || route.query.inspectionId || route.query.action) {
    const query = { ...route.query };
    query.batchId = id;
    delete query.inspectionId;
    delete query.action;
    await router.replace({ name: 'quality-finished-inspections', query });
  }
}
async function openRecord(batchId: string, recordId: string) {
  if (!(await navigate(batchId, 'record', recordId))) return;
  accepted = batchId;
  acceptedRecordId = recordId;
  if (
    route.query.batchId !== batchId ||
    route.query.inspectionId !== recordId ||
    route.query.action
  ) {
    const query = { ...route.query };
    query.batchId = batchId;
    query.inspectionId = recordId;
    delete query.action;
    await router.replace({ name: 'quality-finished-inspections', query });
  }
}
async function navigate(id: string, action?: string, recordId?: string): Promise<boolean> {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    revealTask(id);
    const opened = (await detail.value?.open(id, action, recordId)) ?? false;
    if (opened) {
      openedBatchId = id;
      openedRecordId = action === 'record' ? (recordId ?? '') : '';
    }
    return opened;
  } finally {
    navigating = false;
  }
}
let accepted = '';
let acceptedRecordId = '';
async function clearRecordLocation() {
  openedRecordId = '';
  acceptedRecordId = '';
  if (route.query.batchId !== openedBatchId || !route.query.inspectionId) return;
  const query = { ...route.query };
  delete query.inspectionId;
  await router.replace({ name: 'quality-finished-inspections', query });
}
async function consumeReinspectionAction(id: string) {
  if (route.query.batchId !== id || route.query.action !== 'reinspect') return;
  const query = { ...route.query };
  delete query.action;
  await router.replace({ name: 'quality-finished-inspections', query });
}
async function locate() {
  if (route.name !== 'quality-finished-inspections') return;
  await nextTick();
  const id = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  const recordId = typeof route.query.inspectionId === 'string' ? route.query.inspectionId : '';
  const action = recordId ? 'record' : route.query.action === 'reinspect' ? 'reinspect' : undefined;
  if (!id || navigating) return;
  if (openedBatchId === id && openedRecordId === recordId && detail.value?.visible) {
    if (action === 'reinspect') detail.value.focusReinspection();
    accepted = id;
    acceptedRecordId = recordId;
    await consumeReinspectionAction(id);
    return;
  }
  const succeeded = await navigate(id, action, recordId || undefined);
  if (route.name !== 'quality-finished-inspections') return;
  if (route.query.batchId !== id || (route.query.inspectionId || '') !== recordId) {
    void locate();
    return;
  }
  if (succeeded) {
    accepted = id;
    acceptedRecordId = recordId;
    await consumeReinspectionAction(id);
  } else {
    const query = { ...route.query };
    delete query.batchId;
    delete query.inspectionId;
    delete query.action;
    await router.replace({
      query: {
        ...query,
        ...(accepted ? { batchId: accepted } : {}),
        ...(acceptedRecordId ? { inspectionId: acceptedRecordId } : {}),
      },
    });
  }
}
watch(
  () => [route.name, route.query.batchId, route.query.inspectionId, route.query.action],
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
.document-meta,
.muted {
  color: #6b7280;
  font-size: 13px;
}
.empty-area {
  padding-bottom: 20px;
}
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.document-block {
  margin: 0 16px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.document-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 12px 16px;
  background: #f8fafc;
}
.fold-button {
  font-size: 14px;
}
.document-counts {
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.document-body {
  overflow-x: auto;
}
.task-grid {
  display: grid;
  grid-template-columns:
    minmax(130px, 1.2fr) minmax(85px, 0.7fr) minmax(160px, 1.3fr)
    minmax(230px, 2fr) minmax(140px, 1.1fr);
  gap: 12px;
  align-items: center;
  min-width: 850px;
  padding: 11px 16px;
  font-size: 13px;
}
.column-heading {
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
}
.task-row + .task-row {
  border-top: 1px solid #eef0f2;
}
.task-row.highlighted {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.round-reference,
.basis-label,
.record-time {
  display: block;
  color: #6b7280;
  font-size: 12px;
}
.round-reference {
  margin-top: 5px;
}
.record-time {
  margin-top: 2px;
}
.inspection-id-link {
  height: auto;
  padding: 0;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
