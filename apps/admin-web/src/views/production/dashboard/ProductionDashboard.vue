<template>
  <section class="dashboard">
    <div class="toolbar">
      <span>我的视图</span>
      <span class="toolbar-note">{{
        refreshedAt ? `排期更新于 ${refreshedAt}` : '按工单和任务查看生产情况'
      }}</span
      ><el-button @click="openSettings">自定义看板</el-button
      ><el-button
        type="primary"
        plain
        @click="refresh"
        >刷新看板</el-button
      >
    </div>
    <el-form
      class="filters"
      label-position="top"
      @submit.prevent="applyFilters"
    >
      <el-form-item label="工单"
        ><DashboardSelect
          v-model="draft.workOrderId"
          kind="work-orders"
          label="全部工单"
          @update:model-value="draft.batchId = undefined"
      /></el-form-item>
      <el-form-item label="任务"
        ><DashboardSelect
          :key="draft.workOrderId ?? 'all'"
          v-model="draft.batchId"
          kind="tasks"
          label="全部任务"
          :scope="{ workOrderId: draft.workOrderId }"
      /></el-form-item>
      <el-form-item label="产品"
        ><DashboardSelect
          v-model="draft.productId"
          kind="products"
          label="全部产品"
      /></el-form-item>
      <el-form-item label="任务状态"
        ><el-select
          v-model="draft.status"
          clearable
          placeholder="全部状态"
          ><el-option
            v-for="item in BATCH_STATUS_META"
            :key="item.value"
            :value="item.value"
            :label="item.label" /></el-select
      ></el-form-item>
      <el-form-item label="工单 / 任务 / 产品关键词"
        ><el-input
          v-model="draft.keyword"
          clearable
          placeholder="输入关键词"
      /></el-form-item>
      <el-form-item class="filter-actions"
        ><el-button
          type="primary"
          native-type="submit"
          >查询</el-button
        ><el-button @click="resetFilters">重置</el-button></el-form-item
      >
    </el-form>
    <DashboardDateRange
      :range="query"
      @apply="applyDates"
    />
    <div class="dashboard-grid">
      <section
        v-for="module in visibleModules"
        :key="module"
        class="panel"
        :class="{ wide: module === 'schedule' || module === 'flow' }"
      >
        <header>
          <h2>{{ PRODUCTION_DASHBOARD_MODULE_LABELS[module] }}</h2>
          <span v-if="module === 'schedule'">全部工单可分页查看</span
          ><span v-else-if="module === 'flow'">当前选中任务</span>
        </header>
        <template v-if="module === 'schedule'">
          <el-alert
            v-if="schedule.state.error"
            :title="schedule.state.error"
            type="error"
            :closable="false"
            ><el-button
              link
              @click="loadSchedule"
              >重试</el-button
            ></el-alert
          >
          <div
            v-else
            v-loading="schedule.state.loading"
            :aria-busy="schedule.state.loading"
            class="schedule-body"
          >
            <DashboardGantt
              v-if="schedule.state.data?.items.length"
              :items="schedule.state.data.items"
              :start-date="query.startDate"
              :end-date="query.endDate"
              :selected-id="selectedId"
              @select="selectTask"
            /><el-empty
              v-else-if="schedule.state.data"
              description="当前筛选范围没有排期记录"
              :image-size="55"
            />
          </div>
          <PaginationFooter
            :total="schedule.state.data?.total ?? 0"
            :current-page="page"
            :page-size="pageSize"
            :page-sizes="[3, 5, 10]"
            :disabled="schedule.state.loading"
            @page-change="changePage"
            @update:page-size="changeSize"
          />
        </template>
        <template v-else-if="module === 'flow'">
          <DashboardFlowTaskSelect
            :key="flowScopeKey"
            :model-value="selectedTask"
            :scope="flowScope"
            @update:model-value="chooseFlowTask"
          >
            <el-checkbox
              v-if="flowMode === 'current'"
              :model-value="onlyInProgress"
              :disabled="defaultTask.state.loading"
              @change="filterInProgress(Boolean($event))"
              >仅看有在制的任务</el-checkbox
            >
          </DashboardFlowTaskSelect>
          <el-alert
            v-if="defaultTask.state.error"
            :title="defaultTask.state.error"
            type="error"
            :closable="false"
          >
            <el-button
              link
              @click="loadDefaultTask()"
              >重试任务选择</el-button
            >
          </el-alert>
          <div v-loading="defaultTask.state.loading">
            <DashboardFlow
              ref="flowPanels"
              :mode="flowMode"
              :batch-id="selectedId"
              :range="query"
              @update:mode="changeFlowMode"
            />
          </div>
        </template>
        <DashboardOutput
          v-else-if="module === 'output'"
          ref="outputPanels"
          :query="query"
        />
        <DashboardAbnormalities
          v-else
          ref="abnormalityPanels"
          :query="query"
        />
      </section>
    </div>
    <el-dialog
      v-model="settingsOpen"
      title="自定义看板"
      :width="DialogWidth.md"
    >
      <p class="settings-hint">
        选择显示模块并调整顺序。排期与工序流转始终各占一整排，设置仅保存在本浏览器的当前账号下。
      </p>
      <div
        v-for="(module, index) in settingsOrder"
        :key="module"
        class="setting-row"
      >
        <el-checkbox
          :model-value="settingsVisible.includes(module)"
          @change="setModuleVisible(module, Boolean($event))"
          >{{ PRODUCTION_DASHBOARD_MODULE_LABELS[module] }}</el-checkbox
        >
        <div>
          <el-button
            size="small"
            :disabled="index === 0"
            @click="move(index, -1)"
            >上移</el-button
          ><el-button
            size="small"
            :disabled="index === settingsOrder.length - 1"
            @click="move(index, 1)"
            >下移</el-button
          >
        </div>
      </div>
      <template #footer
        ><el-button
          @click="
            settingsOrder = [...PRODUCTION_DASHBOARD_MODULES];
            settingsVisible = [...PRODUCTION_DASHBOARD_MODULES];
          "
          >恢复默认</el-button
        ><el-button @click="settingsOpen = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="!settingsVisible.length"
          @click="saveSettings"
          >保存布局</el-button
        ></template
      >
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type {
  PageResult,
  ProductionDashboardQuery,
  ProductionDashboardFilter,
  ProductionDashboardScheduleItem,
  ProductionDashboardOption,
  ProductionDashboardOptionQuery,
  ProductionDashboardFlowMode,
} from '@company/contracts';
import {
  PRODUCTION_DASHBOARD_MODULES,
  PRODUCTION_DASHBOARD_MODULE_LABELS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { productionDashboardApi } from '../../../api/production/dashboard';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { BATCH_STATUS_META } from '../shared/production-status';
import { beijingDate } from './dashboard-presentation';
import DashboardDateRange from './DashboardDateRange.vue';
import { useDashboardRead } from './use-dashboard-read';
import DashboardSelect from './DashboardSelect.vue';
import DashboardGantt from './DashboardGantt.vue';
import DashboardFlow from './DashboardFlow.vue';
import DashboardFlowTaskSelect from './DashboardFlowTaskSelect.vue';
import DashboardOutput from './DashboardOutput.vue';
import DashboardAbnormalities from './DashboardAbnormalities.vue';
defineOptions({ name: 'ProductionDashboard' });
type Module = (typeof PRODUCTION_DASHBOARD_MODULES)[number];
type Panel = { refresh: () => Promise<void> };
const auth = useAuthStore();
const today = beijingDate();
const monthStart = today.slice(0, 7) + '-01';
function monthEnd(start: string, months: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
const initialRange = { startDate: monthStart, endDate: monthEnd(monthStart, 1) };
const draft = reactive<ProductionDashboardFilter>({});
const query = ref<ProductionDashboardQuery>({ ...initialRange });
const page = ref(1);
const pageSize = ref(3);
const selectedTask = ref<ProductionDashboardOption | null>(null);
const selectedId = computed(() => selectedTask.value?.id ?? null);
const flowMode = ref<ProductionDashboardFlowMode>('current');
const onlyInProgress = ref(false);
const flowScope = computed<ProductionDashboardOptionQuery>(() => ({
  workOrderId: query.value.workOrderId,
  batchId: query.value.batchId,
  productId: query.value.productId,
  status: query.value.status,
  keyword: query.value.keyword,
  onlyInProgress: onlyInProgress.value || undefined,
}));
const flowScopeKey = computed(() => JSON.stringify(flowScope.value));
const defaultTask = useDashboardRead<PageResult<ProductionDashboardOption>>();
const refreshedAt = ref('');
const schedule = useDashboardRead<PageResult<ProductionDashboardScheduleItem>>({
  keepPreviousData: true,
});
const flowPanels = ref<Panel[]>([]);
const outputPanels = ref<Panel[]>([]);
const abnormalityPanels = ref<Panel[]>([]);
const order = ref<Module[]>([...PRODUCTION_DASHBOARD_MODULES]);
const visible = ref<Module[]>([...PRODUCTION_DASHBOARD_MODULES]);
const visibleModules = computed(() =>
  order.value.filter((module) => visible.value.includes(module)),
);
const storageKey = `easy-mes.dashboard.v1.${auth.session?.user.id ?? 'anonymous'}`;
const settingsOpen = ref(false);
const settingsOrder = ref<Module[]>([]);
const settingsVisible = ref<Module[]>([]);
function isModules(value: unknown): value is Module[] {
  return (
    Array.isArray(value) &&
    value.every((item) => PRODUCTION_DASHBOARD_MODULES.some((module) => module === item)) &&
    new Set(value).size === value.length
  );
}
function restoreSettings(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      typeof saved === 'object' &&
      saved !== null &&
      'order' in saved &&
      'visible' in saved &&
      isModules(saved.order) &&
      saved.order.length === 4 &&
      isModules(saved.visible) &&
      saved.visible.length
    ) {
      order.value = saved.order;
      visible.value = saved.visible;
    }
  } catch {
    /* Optional layout storage: use defaults when unavailable or malformed. */
  }
}
restoreSettings();
function openSettings(): void {
  settingsOrder.value = [...order.value];
  settingsVisible.value = [...visible.value];
  settingsOpen.value = true;
}
function move(index: number, delta: number): void {
  const items = [...settingsOrder.value];
  const [item] = items.splice(index, 1);
  if (item) items.splice(index + delta, 0, item);
  settingsOrder.value = items;
}
function setModuleVisible(module: Module, checked: boolean): void {
  settingsVisible.value = checked
    ? [...new Set([...settingsVisible.value, module])]
    : settingsVisible.value.filter((item) => item !== module);
}
function saveSettings(): void {
  order.value = [...settingsOrder.value];
  visible.value = [...settingsVisible.value];
  settingsOpen.value = false;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ order: order.value, visible: visible.value }),
    );
    EMessage.success('看板布局已保存');
  } catch {
    EMessage.warning('布局已应用，但浏览器无法保存；刷新后将恢复默认');
  }
}
async function loadSchedule(): Promise<void> {
  const result = await schedule.load((signal) =>
    productionDashboardApi.schedule(
      { ...query.value, page: page.value, pageSize: pageSize.value },
      { signal, skipErrorHandling: true },
    ),
  );
  if (result) {
    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
  }
}
function selectTask(item: ProductionDashboardScheduleItem): void {
  if (!item.batchId) return;
  onlyInProgress.value = false;
  chooseFlowTask({ id: item.batchId, label: `${item.batchNo} · ${item.workOrderNo}` });
  if (!visible.value.includes('flow')) visible.value = [...visible.value, 'flow'];
}
function chooseFlowTask(task: ProductionDashboardOption | null): void {
  defaultTask.clear();
  selectedTask.value = task;
}
async function loadDefaultTask(preferredId?: string): Promise<void> {
  const scope = { ...flowScope.value, page: 1, pageSize: 1 };
  if (preferredId) {
    const preferred = await defaultTask.load((signal) =>
      productionDashboardApi.options(
        'tasks',
        { ...scope, batchId: preferredId },
        { signal, skipErrorHandling: true },
      ),
    );
    if (!preferred) return;
    if (preferred.items[0]) {
      selectedTask.value = preferred.items[0];
      return;
    }
  }
  const result = await defaultTask.load((signal) =>
    productionDashboardApi.options('tasks', scope, { signal, skipErrorHandling: true }),
  );
  if (result) selectedTask.value = result.items[0] ?? null;
}
function filterInProgress(checked: boolean): void {
  const preferredId = selectedId.value ?? undefined;
  onlyInProgress.value = checked;
  chooseFlowTask(null);
  void loadDefaultTask(preferredId);
}
function changeFlowMode(mode: ProductionDashboardFlowMode): void {
  flowMode.value = mode;
  if (mode === 'period') {
    onlyInProgress.value = false;
    defaultTask.clear();
  }
}
function applyDates(range: Pick<ProductionDashboardQuery, 'startDate' | 'endDate'>): void {
  query.value = { ...query.value, ...range };
  page.value = 1;
  schedule.clear();
  void loadSchedule();
}
function applyFilters(): void {
  query.value = {
    ...draft,
    keyword: draft.keyword?.trim() || undefined,
    startDate: query.value.startDate,
    endDate: query.value.endDate,
  };
  chooseFlowTask(null);
  page.value = 1;
  schedule.clear();
  void loadSchedule();
  void loadDefaultTask();
}
function resetFilters(): void {
  draft.workOrderId = undefined;
  draft.batchId = undefined;
  draft.productId = undefined;
  draft.status = undefined;
  draft.keyword = undefined;
  applyFilters();
}
function changePage(value: number): void {
  if (schedule.state.loading || value === page.value) return;
  page.value = value;
  void loadSchedule();
}
function changeSize(value: number): void {
  if (schedule.state.loading || value === pageSize.value) return;
  pageSize.value = value;
  page.value = 1;
  void loadSchedule();
}
async function refresh(): Promise<void> {
  await Promise.all([
    loadSchedule(),
    ...[...flowPanels.value, ...outputPanels.value, ...abnormalityPanels.value].map((panel) =>
      panel.refresh(),
    ),
  ]);
}
usePageInitialLoad(async () => {
  await Promise.all([loadSchedule(), loadDefaultTask()]);
});
</script>
<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar-note {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 0 16px;
  background: var(--el-bg-color);
  padding: 14px 16px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.filters :deep(.el-form-item) {
  margin-bottom: 14px;
}
.filters :deep(.el-select) {
  width: 100%;
}
.filter-actions {
  align-self: end;
}
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
}
.wide {
  grid-column: 1/-1;
}
.panel > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.panel h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.panel header span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.schedule-body {
  min-height: 150px;
}
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.settings-hint {
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
@media (min-width: 1600px) {
  .filters {
    grid-template-columns: repeat(5, minmax(150px, 1fr)) auto;
  }
}
@media (max-width: 1050px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
