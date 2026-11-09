<template>
  <div class="workbench-page">
    <section class="panel setup-panel">
      <el-form
        :inline="true"
        class="setup-form"
        :disabled="scanRecovery || scanning"
      >
        <el-form-item label="生产任务"
          ><RemoteSearchSelect
            v-model="batchId"
            :options="taskSearch.options.value"
            :loading="taskSearch.loading.value"
            :error="taskSearch.error.value"
            :has-more="taskSearch.hasMore.value"
            placeholder="搜索任务号 / 产品"
            @search="taskSearch.search"
            @open="taskSearch.search"
            @refresh="taskSearch.search"
            @update:model-value="changeBatch"
        /></el-form-item>
        <el-form-item label="本站工序"
          ><el-select
            v-model="stepId"
            placeholder="请选择本站工序"
            :disabled="!context || contextLoading"
            ><el-option
              v-for="(step, index) in context?.steps || []"
              :key="step.stepRecordId"
              :label="`${step.stepOrder}. ${step.stepName}${index === (context?.steps.length ?? 0) - 1 ? '（终检）' : ''}`"
              :value="step.stepRecordId" /></el-select
        ></el-form-item>
        <el-form-item label="人员分组"
          ><el-select v-model="personnelGroup"
            ><el-option
              label="全部人员"
              value="all" /><el-option
              v-for="group in PERSONNEL_GROUP_OPTIONS"
              :key="group.value"
              :label="group.label"
              :value="group.value" /></el-select></el-form-item
        ><el-form-item label="到站登记人"
          ><el-select
            v-model="personnelId"
            filterable
            placeholder="选择现场人员"
            :loading="personnelLoading"
            ><el-option
              v-for="person in visiblePersonnel"
              :key="person.id"
              :label="`${person.code} / ${person.name}`"
              :value="person.id" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            :icon="Refresh"
            :loading="contextLoading || personnelLoading"
            @click="refreshSetup"
            >刷新准备信息</el-button
          ></el-form-item
        >
      </el-form>
      <div
        v-if="personnel.length"
        class="quick-personnel"
      >
        <span>快捷切换</span
        ><el-button
          v-for="person in filteredPersonnel.slice(0, 8)"
          :key="person.id"
          :type="personnelId === person.id ? 'primary' : 'default'"
          :plain="personnelId === person.id"
          :disabled="scanRecovery || scanning"
          size="small"
          @click="personnelId = person.id"
          >{{ person.name }}</el-button
        >
      </div>
      <el-alert
        v-if="setupError"
        :title="setupError"
        type="error"
        show-icon
        :closable="false"
      />
      <InlineHint
        >到站登记人记录现场身份，登录账号记录操作审计。下一站扫码会同时完成前站交接与本站到站，交接产量归前站原登记人。</InlineHint
      >
    </section>

    <section
      v-if="context"
      class="panel task-panel"
    >
      <div class="section-heading">
        <div class="task-identity">
          <strong>{{ context.batch.batchNo }}</strong
          ><span>{{ context.batch.productName }}</span
          ><el-tag :type="batchStatusMeta(context.batch.status).type">{{
            batchStatusMeta(context.batch.status).label
          }}</el-tag>
        </div>
        <el-button
          v-if="canAccessRoute({ name: 'production-tracking' })"
          @click="openTracking"
          >查看全部追踪卡</el-button
        >
      </div>
      <el-descriptions :column="4"
        ><el-descriptions-item label="计划数量">{{
          formatQuantity(context.batch.plannedQuantity)
        }}</el-descriptions-item
        ><el-descriptions-item label="流转中"
          >{{ context.summary.inProgressCardCount }} 盘</el-descriptions-item
        ><el-descriptions-item label="已定稿"
          >{{ context.summary.completedCardCount }} 盘</el-descriptions-item
        ><el-descriptions-item label="实际可用产出"
          ><strong>{{
            formatQuantity(context.summary.availableQuantity)
          }}</strong></el-descriptions-item
        ></el-descriptions
      >
      <el-alert
        v-if="context.batch.orderType === 'research'"
        title="研发任务不使用工序追踪卡，请在生产任务中办理实际产出与结束。"
        type="info"
        :closable="false"
      />
      <el-alert
        v-else-if="context.batch.status !== 'doing'"
        title="当前任务尚未开工或已经结束，请先在生产任务中核对状态。"
        type="warning"
        :closable="false"
      />
      <div
        v-else
        class="station-strip"
      >
        <div
          v-for="(step, index) in context.steps"
          :key="step.stepRecordId"
          class="station"
          :class="{ 'station--selected': step.stepRecordId === stepId }"
        >
          <strong
            >{{ step.stepOrder }}. {{ step.stepName
            }}{{ index === context.steps.length - 1 ? ' · 终检' : '' }}</strong
          ><span>在站 {{ step.currentCardCount }} 盘 · 已交接 {{ step.completedCardCount }} 盘</span
          ><el-button
            v-if="step.sopFileId"
            type="primary"
            link
            @click="downloadSop(step)"
            >{{ step.sopFileName || '技术文件' }}</el-button
          >
        </div>
      </div>
    </section>

    <section class="panel scan-panel">
      <div class="section-heading">
        <strong>扫码到站 / 前站交接</strong
        ><el-button
          type="primary"
          plain
          :icon="Plus"
          :disabled="!canWork || scanning || scanRecovery"
          @click="openCreate"
          >建卡 / 生成条形码</el-button
        >
      </div>
      <el-alert
        v-if="scanRecovery"
        :title="submissionRecoveryMessage(scanStatus, '追踪卡到站与交接记录')"
        type="warning"
        show-icon
        :closable="false"
      />
      <div class="scan-input-row">
        <el-input
          ref="scanInput"
          v-model="scanText"
          size="large"
          :disabled="!canWork || scanning || scanRecovery"
          placeholder="扫描条形码，或手输追踪码后按 Enter"
          clearable
          @keyup.enter="scan"
        /><el-button
          size="large"
          type="primary"
          :loading="scanning"
          :disabled="
            (!scanRecovery && !canWork) || scanStatus === 'blocked' || scanStatus === 'expired'
          "
          @click="scan"
          >{{ scanRecovery ? '重试本次登记' : '确认到站 / 交接' }}</el-button
        ><el-button
          v-if="scanRecovery"
          @click="abandonScan"
          >核对后放弃</el-button
        >
      </div>
      <div class="scan-help">
        首站只登记到站；中间站不需要再点交接确认；最后一站加工完成后，在本盘详情填写可用产出并一次定稿。
      </div>
    </section>

    <section
      v-if="currentCard"
      class="panel detail-panel"
    >
      <TrackingCardEvidence
        :card="currentCard"
        :steps="context?.steps || []"
        :loading="detailLoading"
        @refresh="loadCurrentCard"
        @label="labelVisible = true"
        @action="openAction"
      />
    </section>
    <el-empty
      v-else
      description="选好本站工序与登记人员，扫描追踪码开始办理"
      class="panel"
    />

    <el-dialog
      :model-value="createVisible"
      title="建卡 / 生成条形码"
      :width="DialogWidth.md"
      :before-close="beforeCreateClose"
      @update:model-value="createVisible = $event"
    >
      <template v-if="createContext"
        ><el-descriptions
          :column="2"
          border
          ><el-descriptions-item label="任务">{{ createContext.batchNo }}</el-descriptions-item
          ><el-descriptions-item label="产品">{{
            createContext.productName
          }}</el-descriptions-item></el-descriptions
        ><InlineHint>每张追踪卡对应一盘工件。建卡和打印不登记到站，也不计入产出。</InlineHint
        ><el-alert
          v-if="createRecovery"
          :title="submissionRecoveryMessage(createStatus, '追踪卡列表')"
          type="warning"
          :closable="false" /><el-form
          label-width="100px"
          :disabled="creating || createRecovery"
          class="create-form"
          ><el-form-item
            label="本盘数量"
            required
            ><el-input-number
              v-model="createQuantity"
              :min="1"
              :precision="0" /></el-form-item
          ><el-form-item
            label="建卡登记人"
            required
            ><el-select
              v-model="createPersonnelId"
              filterable
              ><el-option
                v-for="person in personnel"
                :key="person.id"
                :label="`${person.code} / ${person.name}`"
                :value="person.id" /></el-select></el-form-item
          ><el-form-item label="备注"
            ><el-input
              v-model="createRemark"
              type="textarea"
              :rows="3"
              maxlength="1000" /></el-form-item></el-form
      ></template>
      <template #footer
        ><el-button
          :disabled="creating"
          @click="closeCreate(false)"
          >取消</el-button
        ><el-button
          type="primary"
          :loading="creating"
          :disabled="createStatus === 'blocked' || createStatus === 'expired'"
          @click="createCard"
          >{{ createRecovery ? '重试本次建卡' : '生成追踪卡与条码' }}</el-button
        ></template
      >
    </el-dialog>
    <TrackingCardActionDialog
      v-model:visible="actionVisible"
      :action="action"
      :card="currentCard"
      :abnormality="abnormality"
      :default-personnel-id="personnelId"
      route-name="production-workbench"
      @changed="cardChanged"
    />
    <TrackingLabelDialog
      v-model:visible="labelVisible"
      :card="currentCard"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type { InputInstance } from 'element-plus';
import { PERSONNEL_GROUP_OPTIONS } from '@company/constants';
import type {
  PersonnelGroup,
  PersonnelOption,
  ProductionBatchItem,
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  ProductionTrackingStep,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
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

defineOptions({ name: 'ProductionWorkbenchPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const batchId = ref<string | null>(null),
  stepId = ref(''),
  personnelId = ref('');
const context = ref<ProductionTrackingWorkbench | null>(null),
  contextLoading = ref(false),
  setupError = ref('');
const personnel = ref<PersonnelOption[]>([]),
  personnelLoading = ref(false),
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
const taskSearch = useTrackingTaskSearch(() => context.value?.batch ?? null);
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
  setupError.value = '';
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
      setupError.value = error instanceof Error ? error.message : '任务准备信息加载失败';
  } finally {
    if (read.isCurrent()) contextLoading.value = false;
  }
}
async function loadPersonnel(): Promise<void> {
  if (!personnelReads.isActive()) return;
  const read = personnelReads.begin();
  personnelLoading.value = true;
  personnelVerified.value = false;
  try {
    const value = await personnelApi.options(undefined, { signal: read.signal });
    if (read.isCurrent()) {
      personnel.value = value;
      personnelVerified.value = true;
    }
  } catch (error) {
    if (read.isCurrent())
      setupError.value = error instanceof Error ? error.message : '登记人员加载失败';
  } finally {
    if (read.isCurrent()) personnelLoading.value = false;
  }
}
async function refreshSetup(): Promise<void> {
  await Promise.all([loadContext(), loadPersonnel()]);
}
async function changeBatch(): Promise<void> {
  contextReads.invalidate();
  context.value = null;
  stepId.value = '';
  currentCard.value = null;
  await loadContext();
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
async function openTracking(): Promise<void> {
  if (batchId.value)
    await router.push({ name: 'production-tracking', query: { batchId: batchId.value } });
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
const currentCard = ref<ProductionTrackingCardDetail | null>(null),
  detailLoading = ref(false);
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
async function loadCurrentCard(): Promise<void> {
  const id = currentCard.value?.id;
  if (!id || !detailReads.isActive()) return;
  const read = detailReads.begin(() => currentCard.value?.id === id);
  detailLoading.value = true;
  try {
    const value = await productionTrackingApi.detail(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (read.isCurrent()) currentCard.value = value;
  } catch (error) {
    if (read.isCurrent()) EMessage.error(error, '追踪卡详情刷新失败');
  } finally {
    if (read.isCurrent()) detailLoading.value = false;
  }
}
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
  scanning.value = true;
  try {
    const result = await scanIntent.execute(
      { intentType: 'production.tracking.scan', params: {}, query: {}, body: data },
      (key) => productionTrackingApi.scan(data, key),
    );
    if (contextReads.isActive()) {
      currentCard.value = result.card;
      scanText.value = '';
      if (result.duplicate) EMessage.info('本盘已在本站登记，本次未重复计量或更换登记人');
      else
        EMessage.success(result.completedVisitId ? '前站交接与本站到站已完成' : '首站到站已登记');
      await loadContext();
      await nextTick();
      scanInput.value?.focus();
    }
  } catch (error) {
    EMessage.error(error, '到站与交接登记失败');
  } finally {
    scanStatus.value = scanIntent.getStatus();
    scanning.value = false;
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
  } catch {
    /* 用户保留本次提交。 */
  }
}

const createVisible = ref(false),
  creating = ref(false),
  createContext = ref<ProductionBatchItem | null>(null),
  createQuantity = ref(1),
  createPersonnelId = ref(''),
  createRemark = ref('');
const createIntent = useIdempotentIntent('建卡'),
  createStatus = ref<IdempotentIntentStatus>('idle'),
  createRecovery = computed(() => createStatus.value !== 'idle');
let createSignature = '';
function openCreate(): void {
  if (!context.value || createVisible.value) return;
  if (stepId.value !== context.value.steps[0]?.stepRecordId) {
    EMessage.warning('请在首工序建卡，切换到首工序后重试');
    return;
  }
  createContext.value = { ...context.value.batch };
  createQuantity.value = 1;
  createPersonnelId.value = personnelId.value;
  createRemark.value = '';
  createIntent.reset();
  createStatus.value = 'idle';
  createSignature = JSON.stringify([
    createQuantity.value,
    createPersonnelId.value,
    createRemark.value,
  ]);
  createVisible.value = true;
}
async function allowCreateClose(): Promise<boolean> {
  if (creating.value) return false;
  if (!createVisible.value) return true;
  if (
    !createRecovery.value &&
    createSignature ===
      JSON.stringify([createQuantity.value, createPersonnelId.value, createRemark.value])
  )
    return true;
  try {
    await RouteMessageBox.confirm(
      createRecovery.value
        ? '建卡提交结果尚未确认，请先核对追踪卡列表。确认放弃后关闭？'
        : '本次建卡填写尚未保存，确认放弃？',
      '关闭确认',
      { type: 'warning' },
    );
    createIntent.reset();
    createStatus.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function closeCreate(visible: boolean): Promise<void> {
  if (!visible && (await allowCreateClose())) createVisible.value = false;
}
async function beforeCreateClose(done: () => void): Promise<void> {
  if (await allowCreateClose()) done();
}
async function createCard(): Promise<void> {
  const batch = createContext.value;
  if (!batch || creating.value || !contextReads.isActive()) return;
  if (!createPersonnelId.value) {
    EMessage.warning('请选择建卡登记人');
    return;
  }
  const data = {
    quantity: createQuantity.value,
    personnelId: createPersonnelId.value,
    remark: createRemark.value.trim() || null,
  };
  creating.value = true;
  try {
    const result = await createIntent.execute(
      {
        intentType: 'production.tracking.create',
        params: { batchId: batch.id },
        query: {},
        body: data,
      },
      (key) => productionTrackingApi.create(batch.id, data, key),
    );
    currentCard.value = result;
    createVisible.value = false;
    labelVisible.value = true;
    EMessage.success('追踪卡已生成，可打印标签后扫码到站');
    await loadContext();
  } catch (error) {
    EMessage.error(error, '建卡失败');
  } finally {
    createStatus.value = createIntent.getStatus();
    creating.value = false;
  }
}
const labelVisible = ref(false),
  actionVisible = ref(false),
  action = ref<TrackingCardAction>('abnormality'),
  abnormality = ref<ProductionTrackingAbnormality | null>(null);
function openAction(value: TrackingCardAction, item?: ProductionTrackingAbnormality): void {
  if (actionVisible.value || detailLoading.value) return;
  action.value = value;
  abnormality.value = item ?? null;
  actionVisible.value = true;
}
async function cardChanged(card: ProductionTrackingCardDetail): Promise<void> {
  if (currentCard.value?.id === card.id) currentCard.value = card;
  await loadContext();
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
  return allowCreateClose();
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
  context.value = null;
  await loadContext();
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
.panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.setup-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.setup-form :deep(.el-form-item) {
  margin-right: 0;
}
.setup-form :deep(.el-select) {
  width: 210px;
}
.setup-form :deep(.remote-search-select) {
  width: 280px;
}
.quick-personnel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.quick-personnel > span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-right: 4px;
}
.quick-personnel .el-button {
  margin: 0;
}
.section-heading,
.task-identity {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 12px;
}
.section-heading {
  margin-bottom: 16px;
}
.section-heading > strong,
.task-identity > strong {
  font-size: 16px;
}
.task-identity {
  justify-content: flex-start;
}
.station-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}
.station {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.station--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.station span {
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.station .el-button {
  justify-self: start;
}
.scan-input-row {
  display: flex;
  gap: 12px;
  margin: 16px 0 12px;
}
.scan-input-row .el-input {
  flex: 1;
}
.scan-help {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.7;
}
.create-form {
  margin-top: 20px;
}
</style>
