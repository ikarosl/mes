<template>
  <div class="workbench-page">
    <WorkbenchTaskSummary
      :context="context"
      :loading="contextLoading"
    />

    <section
      class="context-bar"
      :aria-busy="contextLoading"
    >
      <div class="context-field">
        <label
          class="field-label"
          for="workbench-task"
          ><span class="field-number">01</span> 当前任务</label
        >
        <RemoteSearchSelect
          id="workbench-task"
          v-model="batchId"
          :options="taskSearch.options.value"
          :loading="taskSearch.loading.value"
          :error="taskSearch.error.value"
          :has-more="taskSearch.hasMore.value"
          :disabled="setupLocked"
          placeholder="搜索任务号 / 产品"
          @search="taskSearch.search"
          @open="taskSearch.search"
          @refresh="taskSearch.search"
          @update:model-value="changeBatch"
        />
      </div>
      <div class="context-field">
        <label
          class="field-label"
          for="workbench-step"
          ><span class="field-number">02</span> 当前工作工序</label
        >
        <el-select
          id="workbench-step"
          v-model="stepId"
          :disabled="!context || contextLoading || setupLocked"
          :placeholder="context ? '选择任务工序' : '请先选择任务'"
        >
          <el-option
            v-for="(step, index) in context?.steps || []"
            :key="step.stepRecordId"
            :label="
              step.stepOrder +
              '. ' +
              step.stepName +
              (index === (context?.steps.length ?? 0) - 1 ? '（终检）' : '')
            "
            :value="step.stepRecordId"
          />
        </el-select>
      </div>
      <div class="context-plan">
        <div>
          <span>任务计划数量</span>
          <strong>{{ context ? formatQuantity(context.batch.plannedQuantity) : '—' }}</strong>
          <el-tag
            v-if="context"
            size="small"
            :type="batchStatusMeta(context.batch.status).type"
            >{{ batchStatusMeta(context.batch.status).label }}</el-tag
          >
        </div>
        <el-button
          :icon="Refresh"
          :loading="contextLoading || personnelLoading"
          :disabled="setupLocked"
          text
          circle
          aria-label="刷新任务和人员准备信息"
          title="刷新任务和人员准备信息"
          @click="refreshSetup"
        />
      </div>
    </section>
    <el-alert
      v-if="contextError"
      :title="contextError"
      type="error"
      show-icon
      :closable="false"
    />
    <el-alert
      v-if="context?.batch.orderType === 'research'"
      title="研发任务不使用工序追踪卡，请在生产任务中办理实际产出与结束。"
      type="info"
      :closable="false"
    />
    <el-alert
      v-else-if="context && context.batch.status !== 'doing'"
      title="当前任务尚未开工或已经结束，请先在生产任务中核对状态。"
      type="warning"
      show-icon
      :closable="false"
    />

    <div class="work-grid">
      <section class="scan-card">
        <header class="card-heading">
          <div>
            <h2>
              <el-icon><FullScreen /></el-icon> 扫码到站
            </h2>
            <p>按当前工作工序接收本盘，同时完成上一站交接</p>
          </div>
          <el-tag
            type="info"
            effect="plain"
            >一盘一码 · 全程流转</el-tag
          >
        </header>
        <div class="scan-body">
          <form
            class="scan-form"
            @submit.prevent="scan"
          >
            <div class="personnel-field">
              <div class="personnel-label">
                <label
                  class="field-label"
                  for="workbench-personnel"
                  >登记人</label
                >
                <el-select
                  v-model="personnelGroup"
                  size="small"
                  class="personnel-group"
                  :disabled="setupLocked"
                  aria-label="人员分组"
                >
                  <el-option
                    label="全部人员"
                    value="all"
                  />
                  <el-option
                    v-for="group in PERSONNEL_GROUP_OPTIONS"
                    :key="group.value"
                    :label="group.label"
                    :value="group.value"
                  />
                </el-select>
              </div>
              <el-select
                id="workbench-personnel"
                v-model="personnelId"
                size="large"
                filterable
                :disabled="setupLocked"
                :loading="personnelLoading"
                placeholder="选择现场人员"
              >
                <el-option
                  v-for="person in visiblePersonnel"
                  :key="person.id"
                  :label="person.code + ' / ' + person.name"
                  :value="person.id"
                />
              </el-select>
            </div>
            <div class="scan-field">
              <label
                class="field-label"
                for="workbench-code"
                >工序追踪卡编号</label
              >
              <div class="input-group">
                <el-input
                  id="workbench-code"
                  ref="scanInput"
                  v-model="scanText"
                  size="large"
                  :disabled="!canWork || setupLocked"
                  placeholder="扫描追踪卡或输入追踪码"
                  maxlength="160"
                  clearable
                  @input="scanInputChanged"
                >
                  <template #prefix
                    ><el-icon><FullScreen /></el-icon
                  ></template>
                </el-input>
                <el-button
                  native-type="submit"
                  size="large"
                  type="primary"
                  :loading="scanning"
                  :disabled="
                    (!scanRecovery && !canWork) ||
                    scanStatus === 'blocked' ||
                    scanStatus === 'expired'
                  "
                >
                  {{ scanRecovery ? '重试本次登记' : '扫码到站' }}
                </el-button>
              </div>
            </div>
          </form>
          <el-alert
            v-if="personnelError"
            :title="personnelError"
            type="error"
            show-icon
            :closable="false"
            class="scan-notice"
          >
            <el-button
              link
              type="primary"
              :loading="personnelLoading"
              :disabled="setupLocked"
              @click="loadPersonnel"
              >重新加载人员</el-button
            >
          </el-alert>
          <div class="batch-tools">
            <el-button
              type="primary"
              plain
              :icon="Plus"
              :disabled="!canWork || setupLocked"
              @click="openCreate"
              >建卡 / 生成条形码</el-button
            >
            <el-button
              v-if="context && canAccessRoute({ name: 'production-tracking' })"
              link
              type="primary"
              @click="openTracking()"
              >查看全部追踪卡 <el-icon><ArrowRight /></el-icon
            ></el-button>
          </div>
          <p class="scan-help">
            扫码枪与手输共用此入口，按 Enter 登记到站；可连续扫描其他盘，记录自动保存。
          </p>
          <el-alert
            v-if="scanRecovery"
            :title="submissionRecoveryMessage(scanStatus, '追踪卡到站与交接记录')"
            type="warning"
            show-icon
            :closable="false"
            class="scan-notice"
          >
            <el-button
              link
              :disabled="scanning"
              @click="abandonScan"
              >核对后放弃本次提交</el-button
            >
          </el-alert>
          <el-alert
            v-else-if="scanError"
            :title="scanError"
            type="error"
            show-icon
            :closable="false"
            class="scan-notice"
          />
          <WorkbenchCurrentCard
            :card="currentCard"
            :steps="context?.steps || []"
            :step-id="stepId"
            :personnel-name="selectedPersonnel?.name || ''"
            :result-label="scanResultLabel"
            :disabled="setupLocked"
            @clear="clearCurrentCard"
            @detail="openCurrentDetail"
            @action="openCurrentAction"
          />
          <div class="scan-bottom">
            <el-icon><InfoFilled /></el-icon
            ><span
              >到站不计本站完成量；下一站接收时计入前站交接量，归前站原登记人。末站由质检人员显式确认产出。</span
            >
          </div>
          <p class="identity-hint">登记人记录现场身份，登录账号保留操作审计。</p>
        </div>
      </section>
      <WorkbenchRouteProgress
        :context="context"
        :step-id="stepId"
        :loading="contextLoading"
        :can-open-tracking="canAccessRoute({ name: 'production-tracking' })"
        @history="openTracking('history')"
        @sop="downloadSop"
      />
    </div>

    <WorkbenchRecentReports
      :batch-no="context?.batch.batchNo || ''"
      :task-selected="Boolean(batchId)"
      :items="recentReports.items.value"
      :loading="recentReports.loading.value"
      :error="recentReports.error.value"
      :total="recentReports.total.value"
      :can-open-tracking="canAccessRoute({ name: 'production-tracking' })"
      @refresh="recentReports.load"
      @history="openTracking('history')"
      @card="openReportDetail"
    />

    <el-dialog
      v-model="detailVisible"
      title="工序追踪详情"
      :width="DialogWidth.workbench"
    >
      <el-alert
        v-if="detailError"
        :title="detailError"
        type="error"
        show-icon
        :closable="false"
      >
        <el-button
          link
          type="primary"
          @click="loadDetail"
          >重新加载详情</el-button
        >
      </el-alert>
      <div
        v-loading="detailLoading"
        class="detail-content"
      >
        <TrackingCardEvidence
          v-if="selectedCard"
          :card="selectedCard"
          :steps="selectedSteps"
          :loading="detailLoading"
          @refresh="loadDetail"
          @label="openDetailLabel"
          @action="openDetailAction"
        />
        <el-empty
          v-else
          :description="detailLoading ? '正在加载追踪卡详情' : '详情尚未加载，请重试'"
          :image-size="64"
        />
      </div>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button></template>
    </el-dialog>

    <WorkbenchCreateCardDialog
      v-model:visible="createVisible"
      :batch="context?.batch ?? null"
      :default-personnel-id="personnelId"
      :personnel="personnel"
      @created="cardCreated"
    />
    <TrackingCardActionDialog
      v-model:visible="actionVisible"
      :action="action"
      :card="actionCard"
      :abnormality="abnormality"
      :default-personnel-id="personnelId"
      route-name="production-workbench"
      @changed="cardChanged"
    />
    <TrackingLabelDialog
      v-model:visible="labelVisible"
      :card="labelCard"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, FullScreen, InfoFilled, Plus, Refresh } from '@element-plus/icons-vue';
import type { InputInstance } from 'element-plus';
import { PERSONNEL_GROUP_OPTIONS } from '@company/constants';
import type {
  PersonnelGroup,
  PersonnelOption,
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  ProductionTrackingStep,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import {
  submissionRecoveryMessage,
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta } from '../shared/production-status';
import TrackingCardEvidence from './TrackingCardEvidence.vue';
import TrackingCardActionDialog from './TrackingCardActionDialog.vue';
import TrackingLabelDialog from './TrackingLabelDialog.vue';
import type { TrackingCardAction } from './tracking-presentation';
import { useTrackingTaskSearch } from './use-tracking-task-search';
import { useWorkbenchReports } from './use-workbench-reports';
import WorkbenchTaskSummary from './WorkbenchTaskSummary.vue';
import WorkbenchRouteProgress from './WorkbenchRouteProgress.vue';
import WorkbenchCurrentCard from './WorkbenchCurrentCard.vue';
import WorkbenchRecentReports from './WorkbenchRecentReports.vue';
import WorkbenchCreateCardDialog from './WorkbenchCreateCardDialog.vue';

defineOptions({ name: 'ProductionWorkbenchPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const batchId = ref<string | null>(null),
  stepId = ref(''),
  personnelId = ref('');
const context = ref<ProductionTrackingWorkbench | null>(null),
  contextLoading = ref(false),
  contextError = ref('');
const personnel = ref<PersonnelOption[]>([]),
  personnelLoading = ref(false),
  personnelError = ref(''),
  personnelVerified = ref(false),
  contextVerified = ref(false);
const personnelGroup = ref<PersonnelGroup | 'all'>('production');
const filteredPersonnel = computed(() =>
  personnel.value.filter(
    (person) => personnelGroup.value === 'all' || person.group === personnelGroup.value,
  ),
);
const visiblePersonnel = computed(() => {
  const values = [...filteredPersonnel.value];
  const selected = personnel.value.find((person) => person.id === personnelId.value);
  if (selected && !values.some((person) => person.id === selected.id)) values.unshift(selected);
  return values;
});
watch(stepId, (id) => {
  if (!context.value) return;
  personnelGroup.value =
    id === context.value.steps[context.value.steps.length - 1]?.stepRecordId
      ? 'quality'
      : 'production';
});
const selectedPersonnel = computed(() =>
  personnel.value.find((person) => person.id === personnelId.value),
);
const taskSearch = useTrackingTaskSearch(() => context.value?.batch ?? null);
const recentReports = useWorkbenchReports(() => batchId.value);
const contextReads = useLatestReadRequest(() => {
    contextLoading.value = false;
  }),
  personnelReads = useLatestReadRequest(() => {
    personnelLoading.value = false;
  });
async function loadContext(): Promise<void> {
  const id = batchId.value;
  if (!id || !contextReads.isActive()) return;
  const read = contextReads.begin(() => batchId.value === id);
  contextLoading.value = true;
  contextVerified.value = false;
  contextError.value = '';
  try {
    const value = await productionTrackingApi.workbench(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    context.value = value;
    contextVerified.value = true;
    if (!value.steps.some((step) => step.stepRecordId === stepId.value))
      stepId.value = value.steps[0]?.stepRecordId ?? '';
  } catch (error) {
    if (read.isCurrent())
      contextError.value = error instanceof Error ? error.message : '任务准备信息加载失败';
  } finally {
    if (read.isCurrent()) contextLoading.value = false;
  }
}
async function loadPersonnel(): Promise<void> {
  if (!personnelReads.isActive()) return;
  const read = personnelReads.begin();
  personnelLoading.value = true;
  personnelVerified.value = false;
  personnelError.value = '';
  try {
    const value = await personnelApi.options(undefined, { signal: read.signal });
    if (read.isCurrent()) {
      personnel.value = value;
      personnelVerified.value = true;
    }
  } catch (error) {
    if (read.isCurrent())
      personnelError.value = error instanceof Error ? error.message : '登记人员加载失败';
  } finally {
    if (read.isCurrent()) personnelLoading.value = false;
  }
}
async function refreshSetup(): Promise<void> {
  await Promise.all([loadContext(), loadPersonnel(), recentReports.load()]);
}
async function changeBatch(): Promise<void> {
  contextReads.invalidate();
  context.value = null;
  stepId.value = '';
  currentCard.value = null;
  scanResultLabel.value = '';
  scanError.value = '';
  await Promise.all([loadContext(), recentReports.load()]);
}
const canWork = computed(() =>
  Boolean(
    contextVerified.value &&
    personnelVerified.value &&
    context.value &&
    !contextLoading.value &&
    context.value.batch.id === batchId.value &&
    context.value.batch.orderType === 'mass_production' &&
    context.value.batch.status === 'doing' &&
    stepId.value &&
    personnel.value.some((person) => person.id === personnelId.value),
  ),
);
async function openTracking(view = 'cards'): Promise<void> {
  if (batchId.value)
    await router.push({
      name: 'production-tracking',
      query: { batchId: batchId.value, ...(view === 'history' ? { view } : {}) },
    });
}
async function downloadSop(step: ProductionTrackingStep): Promise<void> {
  if (!batchId.value) return;
  try {
    const content = await productionTrackingApi.sop(batchId.value, step.stepRecordId);
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = step.sopFileName || `${step.stepName}-技术文件`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    EMessage.error(error, '技术文件下载失败');
  }
}

const scanInput = ref<InputInstance>(),
  scanText = ref(''),
  scanning = ref(false),
  scanIntent = useIdempotentIntent('到站与交接'),
  scanStatus = ref<IdempotentIntentStatus>('idle');
const scanRecovery = computed(() => scanStatus.value !== 'idle');
const setupLocked = computed(() => scanRecovery.value || scanning.value);
const currentCard = ref<ProductionTrackingCardDetail | null>(null);
const scanResultLabel = ref('');
const scanError = ref('');
function clearCurrentCard(): void {
  if (setupLocked.value) return;
  currentCard.value = null;
  scanResultLabel.value = '';
}
function scanInputChanged(): void {
  if (setupLocked.value) return;
  clearCurrentCard();
  scanError.value = '';
}
const detailVisible = ref(false);
const detailTarget = ref<{ cardId: string; batchId: string } | null>(null);
const selectedCard = ref<ProductionTrackingCardDetail | null>(null);
const selectedSteps = ref<ProductionTrackingStep[]>([]);
const detailLoading = ref(false);
const detailError = ref('');
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
async function loadDetail(): Promise<void> {
  const target = detailTarget.value;
  if (!target || !detailVisible.value || !detailReads.isActive()) return;
  const read = detailReads.begin(() => detailVisible.value && detailTarget.value === target);
  detailLoading.value = true;
  detailError.value = '';
  selectedCard.value = null;
  try {
    const [card, workbench] = await Promise.all([
      productionTrackingApi.detail(target.cardId, { signal: read.signal, skipErrorHandling: true }),
      productionTrackingApi.workbench(target.batchId, {
        signal: read.signal,
        skipErrorHandling: true,
      }),
    ]);
    if (!read.isCurrent()) return;
    selectedCard.value = card;
    selectedSteps.value = workbench.steps;
    if (currentCard.value?.id === card.id) currentCard.value = card;
  } catch (error) {
    if (read.isCurrent())
      detailError.value = error instanceof Error ? error.message : '追踪卡详情加载失败';
  } finally {
    if (read.isCurrent()) detailLoading.value = false;
  }
}
async function openDetail(cardId: string, targetBatchId: string): Promise<void> {
  detailTarget.value = { cardId, batchId: targetBatchId };
  selectedCard.value = null;
  selectedSteps.value = [];
  detailVisible.value = true;
  await loadDetail();
}
async function openCurrentDetail(): Promise<void> {
  const card = currentCard.value;
  if (card && !setupLocked.value) await openDetail(card.id, card.productionBatchId);
}
async function openReportDetail(report: ProductionTrackingVisit): Promise<void> {
  await openDetail(report.trackingCardId, report.productionBatchId);
}
watch(detailVisible, (visible) => {
  if (!visible) detailReads.invalidate();
});
async function scan(): Promise<void> {
  if (scanning.value || !contextReads.isActive() || (!scanRecovery.value && !canWork.value)) return;
  const data = {
    cardNo: scanText.value.trim(),
    stepRecordId: stepId.value,
    personnelId: personnelId.value,
  };
  if (!data.cardNo) {
    EMessage.warning('请扫描或输入追踪码');
    return;
  }
  if (!scanRecovery.value) clearCurrentCard();
  scanError.value = '';
  let shouldFocus = false;
  scanning.value = true;
  try {
    const result = await scanIntent.execute(
      { intentType: 'production.tracking.scan', params: {}, query: {}, body: data },
      (key) => productionTrackingApi.scan(data, key),
    );
    if (contextReads.isActive()) {
      currentCard.value = result.card;
      scanText.value = '';
      if (result.duplicate) {
        scanResultLabel.value = '本盘已在本站登记，重复扫描未计量，原登记人保留';
        EMessage.info(scanResultLabel.value);
      } else {
        scanResultLabel.value = result.completedVisitId
          ? '前站交接与本站到站已完成'
          : '首站到站已登记';
        EMessage.success(scanResultLabel.value);
      }
      await Promise.all([loadContext(), recentReports.load()]);
      shouldFocus = true;
    }
  } catch (error) {
    scanError.value =
      error instanceof Error ? error.message : '到站与交接登记失败，请核对追踪码后重试';
    EMessage.error(error, '到站与交接登记失败');
  } finally {
    scanStatus.value = scanIntent.getStatus();
    scanning.value = false;
    if (shouldFocus && contextReads.isActive()) {
      await nextTick();
      scanInput.value?.focus();
    }
  }
}
async function abandonScan(): Promise<void> {
  try {
    await RouteMessageBox.confirm(
      '请先核对本盘到站与交接记录。确认放弃本次未确认提交？',
      '放弃提交',
      { type: 'warning' },
    );
    scanIntent.reset();
    scanStatus.value = 'idle';
    scanError.value = '';
  } catch {
    /* 用户保留本次提交。 */
  }
}

const createVisible = ref(false);
function openCreate(): void {
  if (!context.value || createVisible.value || setupLocked.value || !canWork.value) return;
  if (stepId.value !== context.value.steps[0]?.stepRecordId) {
    EMessage.warning('请在首工序建卡，切换到首工序后重试');
    return;
  }
  createVisible.value = true;
}
async function cardCreated(card: ProductionTrackingCardDetail): Promise<void> {
  if (contextReads.isActive() && batchId.value === card.productionBatchId) {
    currentCard.value = card;
    scanResultLabel.value = '';
    scanError.value = '';
    openLabel(card);
    await loadContext();
  }
}
const labelVisible = ref(false),
  labelCard = ref<ProductionTrackingCardDetail | null>(null),
  actionVisible = ref(false),
  actionCard = ref<ProductionTrackingCardDetail | null>(null),
  action = ref<TrackingCardAction>('abnormality'),
  abnormality = ref<ProductionTrackingAbnormality | null>(null);
function openLabel(card: ProductionTrackingCardDetail): void {
  labelCard.value = { ...card };
  labelVisible.value = true;
}
function openDetailLabel(): void {
  if (selectedCard.value && !detailLoading.value) openLabel(selectedCard.value);
}
function openAction(
  card: ProductionTrackingCardDetail,
  value: TrackingCardAction,
  item?: ProductionTrackingAbnormality,
): void {
  if (actionVisible.value) return;
  actionCard.value = { ...card };
  action.value = value;
  abnormality.value = item ?? null;
  actionVisible.value = true;
}
function openCurrentAction(value: TrackingCardAction): void {
  if (currentCard.value && !setupLocked.value) openAction(currentCard.value, value);
}
function openDetailAction(value: TrackingCardAction, item?: ProductionTrackingAbnormality): void {
  if (selectedCard.value && !detailLoading.value) openAction(selectedCard.value, value, item);
}
async function cardChanged(card: ProductionTrackingCardDetail): Promise<void> {
  if (currentCard.value?.id === card.id) {
    currentCard.value = card;
    scanResultLabel.value = '';
  }
  if (detailVisible.value && selectedCard.value?.id === card.id) selectedCard.value = card;
  if (batchId.value === card.productionBatchId)
    await Promise.all([loadContext(), recentReports.load()]);
}
async function allowTabClose(): Promise<boolean> {
  if (scanning.value) return false;
  if (scanRecovery.value) {
    try {
      await RouteMessageBox.confirm(
        '到站与交接提交结果尚未确认，请先核对记录。确认放弃并关闭工作台？',
        '关闭确认',
        { type: 'warning' },
      );
    } catch {
      return false;
    }
  }
  return true;
}
const unregister = useTabsStore().registerCloseGuard('production-workbench', allowTabClose);
onScopeDispose(unregister);
let consumedLocation = '';
async function locate(): Promise<void> {
  if (route.name !== 'production-workbench' || !contextReads.isActive()) return;
  const id = typeof route.query.batchId === 'string' ? route.query.batchId : '';
  const step = typeof route.query.stepRecordId === 'string' ? route.query.stepRecordId : '';
  const key = `${id}/${step}`;
  if (!id || key === consumedLocation || scanRecovery.value || scanning.value) return;
  consumedLocation = key;
  batchId.value = id;
  stepId.value = step;
  currentCard.value = null;
  scanResultLabel.value = '';
  scanError.value = '';
  context.value = null;
  await Promise.all([loadContext(), recentReports.load()]);
}
watch(
  () => [route.name, route.query.batchId, route.query.stepRecordId],
  () => {
    void locate();
  },
);
let initiallyLoaded = false;
onActivated(() => {
  if (initiallyLoaded) void locate();
});
usePageInitialLoad(async () => {
  await Promise.all([taskSearch.search(''), loadPersonnel()]);
  await locate();
  initiallyLoaded = true;
});
</script>

<style scoped>
.workbench-page {
  display: grid;
  gap: 16px;
}
.context-bar {
  display: grid;
  grid-template-columns: minmax(240px, 1.45fr) minmax(210px, 1fr) minmax(180px, 0.75fr);
  align-items: end;
  gap: 24px;
  padding: 18px 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.context-field {
  min-width: 0;
}
.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 500;
  line-height: 24px;
}
.field-number {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.context-field .el-select {
  width: 100%;
}
.context-plan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 64px;
  padding-left: 24px;
  border-left: 1px solid var(--el-border-color-lighter);
}
.context-plan > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.context-plan > div > span:first-child {
  width: 100%;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.context-plan strong {
  color: var(--el-text-color-primary);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.context-plan > .el-button {
  flex-shrink: 0;
}
.work-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
  gap: 20px;
}
.scan-card {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.card-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
.card-heading h2 .el-icon {
  color: var(--el-color-primary);
  font-size: 18px;
}
.card-heading p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.card-heading > .el-tag {
  flex-shrink: 0;
}
.scan-body {
  padding: 20px;
}
.scan-form {
  display: grid;
  grid-template-columns: 185px minmax(0, 1fr);
  gap: 16px;
  align-items: end;
}
.personnel-field,
.scan-field {
  min-width: 0;
}
.personnel-field > .el-select {
  width: 100%;
}
.personnel-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.personnel-label .field-label {
  flex-shrink: 0;
  margin-bottom: 0;
}
.personnel-group {
  width: 105px;
}
.input-group {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.input-group .el-input {
  flex: 1;
  min-width: 0;
}
.input-group .el-button {
  flex-shrink: 0;
}
.batch-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
}
.batch-tools .el-button + .el-button {
  margin-left: 0;
}
.scan-help,
.scan-bottom,
.identity-hint {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.scan-help {
  margin: 10px 0 0;
}
.scan-notice {
  margin-top: 16px;
}
.scan-bottom {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
}
.scan-bottom .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--el-text-color-secondary);
}
.identity-hint {
  margin: 6px 0 0 20px;
  color: var(--el-text-color-secondary);
}
.detail-content {
  min-height: 180px;
}
@media (max-width: 1100px) {
  .context-bar {
    gap: 16px;
  }
  .context-plan {
    padding-left: 16px;
  }
  .work-grid {
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 16px;
  }
  .scan-form {
    grid-template-columns: 170px minmax(0, 1fr);
    gap: 12px;
  }
  .card-heading > .el-tag {
    display: none;
  }
}
</style>
