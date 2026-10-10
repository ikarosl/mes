<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="error"
    />
    <el-alert
      v-if="lastSuccess"
      type="success"
      :closable="false"
      :title="lastSuccess"
      class="notice"
    />
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions
          :column="3"
          size="small"
          border
          class="summary"
        >
          <el-descriptions-item label="工单 / 任务"
            >{{ detail.check.workOrderNo }} / {{ detail.check.batchNo }}</el-descriptions-item
          >
          <el-descriptions-item label="成品"
            >{{ detail.check.productCode }} · {{ detail.check.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="计划数量"
            >{{ quantity(detail.check.plannedQuantity) }}
            {{ detail.check.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="结案类型">{{
            PRODUCTION_CLOSEOUT_MODE_LABELS[detail.mode]
          }}</el-descriptions-item>
          <el-descriptions-item label="清单状态">{{
            PRODUCTION_OUTPUT_STATUS_LABELS[detail.status]
          }}</el-descriptions-item>
          <el-descriptions-item label="最终审批负责人">{{
            detail.workOrderOwnerName
          }}</el-descriptions-item>
          <el-descriptions-item label="原批准依据的末道正常量">{{
            detail.approvedReportedNormalQuantity === null
              ? '尚无批准依据'
              : quantity(detail.approvedReportedNormalQuantity) + ' ' + detail.check.unit
          }}</el-descriptions-item>
          <el-descriptions-item label="当前末道净正常报工"
            >{{ quantity(detail.currentReportedNormalQuantity) }}
            {{ detail.check.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="当前量与批准依据之差">{{
            formatQuantityDifference(detail.reportedNormalQuantityDifference)
          }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="stale"
          title="清单或质检依据已更新，当前输入已保留。请核对更新后继续填写，或重新加载已保存草稿。"
          type="warning"
          :closable="false"
          class="notice"
        />
        <div
          v-if="
            currentRound?.status !== 'inspecting' ||
            detail.canBeginCorrection ||
            detail.canCancelCorrection
          "
          class="current-action"
          role="status"
        >
          <div
            v-if="currentRound?.status !== 'inspecting'"
            class="current-description"
          >
            <strong>{{ currentStep }}</strong
            ><span>{{ currentStepNote }}</span>
          </div>
          <div class="actions">
            <el-button
              v-if="canViewFinishedInspections && currentRound?.status !== 'inspecting'"
              :disabled="busy || unresolved"
              @click="openFinishedInspection(detail.canBeginReinspection ? 'reinspect' : '')"
              >{{ detail.canBeginReinspection ? '前往复检' : '前往成品质检' }}</el-button
            >
            <el-button
              v-if="detail.canBeginCorrection"
              :disabled="busy || unresolved"
              @click="editor.beginCorrection"
              >更正清单</el-button
            >
            <el-button
              v-if="detail.canCancelCorrection"
              :disabled="busy || unresolved"
              @click="editor.cancelCorrection"
              >取消本次更正</el-button
            >
          </div>
        </div>
        <el-tabs
          v-model="activeTab"
          class="notice output-tabs"
        >
          <el-tab-pane
            :label="detail.canEdit ? '本次核对' : '清单与采用依据'"
            name="draft"
          >
            <ProductionOutputReviewForm
              :detail="detail"
              :draft="draft"
              :locked="locked"
              :quantity-errors="quantityErrors"
              @change="Object.assign(draft, $event)"
            />
          </el-tab-pane>
          <el-tab-pane
            :label="`质检记录（${detail.inspections.length}）`"
            name="inspections"
          >
            <div class="inspection-toolbar">
              <p class="muted">
                检验登记、复检及放行在成品质检页办理；此处核对历史记录并引用最新依据。
              </p>
              <el-button
                v-if="canViewFinishedInspections"
                type="primary"
                :disabled="busy || unresolved"
                @click="openFinishedInspection()"
                >前往成品质检</el-button
              >
            </div>
            <FinishedInspectionHistory
              :records="detail.inspections"
              :unit="detail.check.unit"
              :latest-inspection-id="detail.latestInspectionId"
              :current-round-id="detail.currentRoundId"
            />
          </el-tab-pane>
          <el-tab-pane
            :label="`批准清单（${detail.revisions.length}）`"
            name="revisions"
          >
            <ProductionOutputRevisionPanel
              :detail="detail"
              :selected-revision="selectedRevision"
              :busy="busy"
              :unresolved="unresolved"
              :error="error"
              @select-revision="selectedRevisionId = $event"
              @open-approval="openApproval"
              @print="printRevision"
            />
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-empty
        v-else-if="!loading && !error"
        description="尚无产出清单，请先完成工序执行或开始提前结束收尾"
      />
    </div>
    <el-alert
      v-if="unresolved"
      title="提交结果尚未确认，已保留原操作，请重试原操作或核对后关闭。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <template #footer
      ><div class="toolbar">
        <div>
          <el-button
            :disabled="submitting"
            @click="editor.close"
            >关闭</el-button
          ><el-button
            :disabled="busy || unresolved"
            @click="editor.load()"
            >刷新核对</el-button
          ><el-button
            v-if="stale"
            type="primary"
            plain
            :disabled="busy || unresolved || !detail?.canEdit"
            @click="openReconcile"
            >核对并保留填写</el-button
          ><el-button
            v-if="stale"
            :disabled="busy || unresolved"
            @click="editor.reloadDraft"
            >重新加载草稿</el-button
          ><el-button
            v-if="detail"
            :disabled="busy || unresolved"
            @click="openCloseout"
            >收尾与物料核对</el-button
          ><el-button
            v-if="detail?.approvalInstanceId && canAccessRoute({ name: 'approval-inbox' })"
            link
            type="primary"
            @click="openApproval(detail.approvalInstanceId)"
            >{{ detail.pendingApprovalId ? '查看在审申请' : '查看最近审批' }}</el-button
          >
        </div>
        <div>
          <el-button
            v-if="unresolved"
            type="primary"
            :loading="submitting"
            @click="editor.retry"
            >重试原操作</el-button
          ><template v-else-if="detail?.canEdit"
            ><span class="muted">{{
              dirty ? '草稿未保存' : detail.draft ? '草稿已保存' : '尚未建立草稿'
            }}</span
            ><el-button
              :disabled="locked || !valid || !dirty"
              @click="editor.save"
              >保存产出草稿</el-button
            ><el-button
              type="primary"
              :disabled="!canSubmit"
              :loading="submitting"
              @click="editor.submit"
              >提交结案审批</el-button
            ></template
          >
        </div>
      </div></template
    >
  </el-dialog>
  <el-dialog
    v-model="navigationVisible"
    title="前往成品质检"
    :width="DialogWidth.md"
    :close-on-click-modal="false"
    :show-close="!busy"
    :before-close="closeNavigation"
  >
    <InlineHint
      >当前产出填写尚未保存。可保存后前往，或保留本地填写并切换页面；返回后仍需核对最新依据。</InlineHint
    >
    <p
      v-if="!valid"
      class="muted"
    >
      存在未完成或无效的填写项，暂不能保存；仍可保留填写并前往质检。
    </p>
    <template #footer>
      <el-button
        :disabled="busy"
        @click="navigationVisible = false"
        >留在此页</el-button
      >
      <el-button
        :disabled="busy || unresolved"
        @click="goToInspection"
        >保留填写并前往</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="locked || !valid"
        @click="saveAndGoToInspection"
        >保存并前往</el-button
      >
    </template>
  </el-dialog>
  <el-dialog
    v-model="reconcileVisible"
    title="核对更新后的草稿"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
  >
    <InlineHint tone="warning"
      >清单或检验轮已变更。请对照以下内容；确认后保留本地填写，检验引用仍需在核对区明确采用。</InlineHint
    >
    <el-table
      :data="reconcileRows"
      border
      class="notice"
    >
      <el-table-column
        prop="label"
        label="核对项"
        width="150"
      />
      <el-table-column
        prop="server"
        label="最新已保存草稿"
      />
      <el-table-column
        prop="local"
        label="本地保留的填写"
      />
    </el-table>
    <p class="muted">
      本次可采用检验：{{
        detail?.applicableInspectionId ? `#${detail.applicableInspectionId}` : '暂无有效放行依据'
      }}。保留填写不会自动保存或提交审批。
    </p>
    <template #footer>
      <el-button @click="reconcileVisible = false">返回核对</el-button>
      <el-button
        type="primary"
        :disabled="busy || unresolved || !detail?.canEdit"
        @click="retainReviewedDraft"
        >已核对，保留本地填写</el-button
      >
    </template>
  </el-dialog>
  <Teleport to="body"
    ><article
      v-if="printingRevision"
      class="production-output-print"
    >
      <h1>成品产出批准清单 · 第 {{ printingRevision.revisionNo }} 版</h1>
      <p>
        {{
          printingRevision.id === detail?.currentRevisionId
            ? '最新批准版本，不单独代表当前入库资格'
            : '历史版本，仅供追溯，不用于入库'
        }}
        · 审批 #{{ printingRevision.approvalInstanceId }} · 批准人
        {{ printingRevision.approvedByName }} ·
        {{ formatDateTimeForDisplay(printingRevision.approvedAt) }}
      </p>
      <BatchCloseoutEvidence :snapshot="printingRevision.snapshot" /></article
  ></Teleport>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import type { ProductionOutputRevision } from '@company/contracts';
import {
  PERMISSIONS,
  PRODUCTION_CLOSEOUT_MODE_LABELS,
  PRODUCTION_OUTPUT_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity as quantity, formatQuantityDifference } from '../production-status';
import { useProductionOutput } from '../composables/useProductionOutput';
import BatchCloseoutEvidence from './BatchCloseoutEvidence.vue';
import FinishedInspectionHistory from '../../quality/components/FinishedInspectionHistory.vue';
import { useAuthStore } from '../../../stores/auth';
import ProductionOutputRevisionPanel from './ProductionOutputRevisionPanel.vue';
import ProductionOutputReviewForm from './ProductionOutputReviewForm.vue';
import InlineHint from '../../../components/InlineHint.vue';
const props = defineProps<{ visible: boolean; batchId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: []; 'open-closeout': [string] }>();
const editor = useProductionOutput(
  props,
  () => emit('changed'),
  () => emit('update:visible', false),
);
const {
  detail,
  draft,
  loading,
  submitting,
  error,
  unresolved,
  lastSuccess,
  dirty,
  busy,
  stale,
  locked,
  valid,
  canSubmit,
  quantityErrors,
} = editor;
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const auth = useAuthStore();
const canViewFinishedInspections = computed(() =>
  auth.can(PERMISSIONS.quality.finishedInspections.view),
);
const navigationVisible = ref(false);
const reconcileVisible = ref(false);
const reconcileVersion = ref<number | null>(null);
const reconcileRows = computed(() => [
  {
    label: '计划内累计目标',
    server: detail.value?.draft?.availableQuantity ?? '—',
    local: draft.availableQuantity,
  },
  {
    label: '计划外累计目标',
    server: detail.value?.draft?.extraQuantity ?? '—',
    local: draft.extraQuantity,
  },
  {
    label: '新增成品报废',
    server: detail.value?.draft?.additionalScrapQuantity ?? '—',
    local: draft.additionalScrapQuantity,
  },
  {
    label: '引用检验记录',
    server: detail.value?.draft?.inspectionRecordId ?? '未引用',
    local: draft.inspectionRecordId ?? '未引用',
  },
  { label: '产出说明', server: detail.value?.draft?.reason ?? '—', local: draft.reason },
  {
    label: '物料核对总结',
    server: detail.value?.draft?.materialReviewNote ?? '—',
    local: draft.materialReviewNote,
  },
]);
function openReconcile(): void {
  reconcileVersion.value = detail.value?.version ?? null;
  reconcileVisible.value = true;
}
function retainReviewedDraft(): void {
  if (reconcileVersion.value !== null && editor.retainReviewedDraft(reconcileVersion.value))
    reconcileVisible.value = false;
}
const inspectionAction = ref('');
function openFinishedInspection(action = ''): void {
  if (!props.batchId || busy.value || unresolved.value) return;
  inspectionAction.value = action;
  if (dirty.value) navigationVisible.value = true;
  else void goToInspection();
}
async function goToInspection(): Promise<void> {
  if (!props.batchId || busy.value || unresolved.value) return;
  navigationVisible.value = false;
  // 保持 editor 存活，由路由缓存隐藏弹窗；返回后刷新依据并保留原输入。
  await router.push({
    name: 'quality-finished-inspections',
    query: {
      batchId: props.batchId,
      ...(inspectionAction.value ? { action: inspectionAction.value } : {}),
    },
  });
}
async function saveAndGoToInspection(): Promise<void> {
  await editor.save();
  if (!dirty.value && !error.value && !unresolved.value) await goToInspection();
}
function closeNavigation(): void {
  if (!busy.value) navigationVisible.value = false;
}
const currentRound = computed(() =>
  detail.value?.rounds.find((row) => row.id === detail.value?.currentRoundId),
);
const dialogTitle = computed(() =>
  detail.value?.status === 'reviewing'
    ? '产出清单 · 审批中'
    : detail.value?.status === 'approved'
      ? '产出批准清单'
      : '产出清单与结案核对',
);
const currentStep = computed(() => {
  if (detail.value?.status === 'reviewing') return '清单正在审批';
  if (detail.value?.canExecuteCurrentRevision) return '最新批准清单可执行';
  if (detail.value?.status === 'approved') return '批准记录保留，当前不可入库';
  if (!detail.value?.draft) return '先保存产出草稿';
  if (currentRound.value?.status === 'inspecting') return '检验办理中，暂不能送审 / 入库';
  if (!detail.value?.applicableInspectionId) return '等待有效放行依据';
  return '核对产出与质检依据';
});
const currentStepNote = computed(() => {
  if (!detail.value?.draft) return '保存后前往质检；检验记录与产出草稿分别留存。';
  if (detail.value?.status === 'reviewing') return '数量及引用已冻结，审批完成后形成新授权。';
  if (detail.value?.currentRevisionId && detail.value.executionBlockedReason)
    return detail.value.executionBlockedReason;
  if (detail.value?.canExecuteCurrentRevision)
    return '入库按有效剩余额度办理，批准本身不增加库存。';
  if (currentRound.value?.status === 'inspecting')
    return '在成品质检页完成并保存本轮结果后，再回到此处核对采用依据。';
  if (!detail.value?.applicableInspectionId)
    return '可先保存产出填写；取得本轮适用放行依据后再送审。';
  return '明确采用检验依据，核对数量并保存后送负责人审批。';
});
const activeTab = ref('draft'),
  selectedRevisionId = ref<string | null>(null);
const selectedRevision = computed(
  () => detail.value?.revisions.find((row) => row.id === selectedRevisionId.value) ?? null,
);
let opening = true;
watch(
  () => [props.visible, props.batchId],
  () => {
    if (props.visible) opening = true;
  },
);
watch(
  () => [detail.value?.id, detail.value?.status],
  () => {
    if (!detail.value) return;
    if (opening) {
      activeTab.value =
        detail.value.status === 'approved' && detail.value.revisions.length ? 'revisions' : 'draft';
      opening = false;
    } else if (detail.value.status === 'correcting') activeTab.value = 'draft';
  },
);
watch(
  () => detail.value?.currentRevisionId,
  (id) => {
    selectedRevisionId.value = id ?? null;
  },
);
async function openCloseout() {
  const batchId = props.batchId;
  if (!batchId) return;
  if (busy.value || unresolved.value || !(await editor.close())) return;
  await nextTick();
  if (!props.visible) emit('open-closeout', batchId);
}
const openApproval = async (instanceId: string): Promise<void> => {
  if (busy.value || unresolved.value || !canAccessRoute({ name: 'approval-inbox' })) return;
  await router.push({ name: 'approval-inbox', query: { instanceId } });
};
const printingRevision = ref<ProductionOutputRevision | null>(null);
const finishPrint = () => {
  printingRevision.value = null;
};
async function printRevision() {
  if (!selectedRevision.value) return;
  printingRevision.value = selectedRevision.value;
  await nextTick();
  window.addEventListener('afterprint', finishPrint, { once: true });
  window.print();
}
onBeforeUnmount(() => {
  window.removeEventListener('afterprint', finishPrint);
});
defineExpose({
  close: editor.close,
  refresh: editor.load,
  navigationLocked: computed(() => busy.value || unresolved.value),
});
</script>
<style scoped>
.current-action {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  padding: 12px;
  background: var(--el-fill-color-light);
}
.current-description {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 240px;
}
.current-description span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.output-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
.inspection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.summary,
.notice {
  margin-top: 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
<style>
.production-output-print {
  display: none;
}
@media print {
  body > * {
    display: none !important;
  }
  body > .production-output-print {
    display: block !important;
    color: #000;
    background: #fff;
    font-size: 12px;
  }
  .production-output-print .el-table {
    overflow: visible;
  }
  .production-output-print .el-table__body-wrapper,
  .production-output-print .el-scrollbar__wrap {
    overflow: visible !important;
    max-height: none !important;
  }
  @page {
    size: A4 landscape;
    margin: 12mm;
  }
}
</style>
