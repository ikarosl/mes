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
        </el-descriptions>
        <el-alert
          v-if="stale"
          title="清单或质检依据已更新，当前输入已保留。请核对更新后继续填写，或重新加载已保存草稿。"
          type="warning"
          :closable="false"
          class="notice"
        />
        <ol
          v-if="detail.canEdit"
          class="workflow-steps"
          aria-label="产出清单与结案办理顺序"
        >
          <li
            v-for="(step, index) in workflowSteps"
            :key="step.title"
            :class="{ current: index === workflowStep, completed: index < workflowStep }"
            :aria-current="index === workflowStep ? 'step' : undefined"
          >
            <span class="step-number">{{ index + 1 }}</span>
            <div>
              <strong>{{ step.title }}</strong>
              <span>{{ step.note }}</span>
            </div>
          </li>
        </ol>
        <div
          class="current-action"
          role="status"
        >
          <div class="current-description">
            <strong>{{ currentStep }}</strong>
            <span>{{ currentStepNote }}</span>
            <ul
              v-if="detail.canEdit && workflowStep === 3 && detail.blockers.length"
              class="current-blockers"
            >
              <li
                v-for="blocker in detail.blockers"
                :key="blocker"
              >
                {{ blocker }}
              </li>
            </ul>
          </div>
          <div class="actions">
            <el-button
              v-if="canViewFinishedInspections && (!detail.canEdit || workflowStep !== 1)"
              link
              type="primary"
              :disabled="busy || unresolved"
              @click="openFinishedInspection(detail.canBeginReinspection ? 'reinspect' : '')"
              >{{ inspectionActionLabel }}</el-button
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
            <el-button
              v-if="
                detail.check.batchStatus === 'closing' &&
                !detail.currentRevisionId &&
                !detail.pendingApprovalId
              "
              type="warning"
              plain
              :disabled="busy || unresolved"
              @click="openWithdrawal"
              >撤回结束</el-button
            >
          </div>
        </div>
        <el-tabs
          v-model="activeTab"
          class="notice output-tabs"
        >
          <el-tab-pane
            :label="detail.canEdit ? '本次办理' : '清单与采用依据'"
            name="draft"
          >
            <ProductionOutputReviewForm
              ref="reviewForm"
              :detail="detail"
              :draft="draft"
              :locked="locked"
              :quantity-errors="quantityErrors"
              @change="Object.assign(draft, $event)"
            />
            <section
              v-if="detail.canEdit"
              class="submission-review"
            >
              <div class="submission-heading">
                <strong>送审前检查</strong>
                <span v-if="hasSavedInspectionReference && !dirty && detail.canSubmit">
                  当前产出、质检引用及收尾依据已满足送审要求
                </span>
                <span v-else>先保存草稿及质检引用，再完成收尾事项和逐项物料实核</span>
              </div>
              <el-alert
                v-if="detail.blockers.length"
                type="warning"
                :closable="false"
                :title="
                  detail.draft ? '提交审批前仍需处理' : '以下事项在送审前完成，不影响先保存产出草稿'
                "
              >
                <ul class="blockers">
                  <li
                    v-for="blocker in detail.blockers"
                    :key="blocker"
                  >
                    {{ blocker }}
                  </li>
                </ul>
              </el-alert>
              <InlineHint v-else-if="dirty">当前填写尚未保存，保存后才能提交审批。</InlineHint>
            </section>
          </el-tab-pane>
          <el-tab-pane
            :label="`质检记录（${detail.inspections.length}）`"
            name="inspections"
          >
            <div class="inspection-toolbar">
              <p class="muted">
                检验登记、复检及放行在成品质检页办理。历史仅供查阅；回到“本次办理”选择适用记录并保存。
              </p>
              <el-button
                v-if="canViewFinishedInspections"
                type="primary"
                :disabled="busy || unresolved"
                @click="openFinishedInspection()"
                >{{ inspectionActionLabel }}</el-button
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
        <div class="footer-secondary">
          <el-button
            :disabled="submitting"
            @click="editor.close"
            >关闭</el-button
          ><el-button
            :disabled="busy || unresolved"
            @click="editor.load()"
            >刷新核对</el-button
          ><el-button
            v-if="detail && (!detail.canEdit || workflowStep !== 3 || stale)"
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
        <div class="footer-next">
          <span
            v-if="detail?.canEdit || unresolved"
            class="footer-status"
            >{{ footerStatus }}</span
          >
          <div class="actions">
            <el-button
              v-if="unresolved"
              type="primary"
              :loading="submitting"
              @click="editor.retry"
              >重试原操作</el-button
            ><template v-else-if="stale">
              <el-button
                :disabled="busy"
                @click="editor.reloadDraft"
                >重新加载草稿</el-button
              >
              <el-button
                type="primary"
                :disabled="busy || !detail?.canEdit"
                @click="openReconcile"
                >核对并保留填写</el-button
              >
            </template>
            <template v-else-if="detail?.canEdit">
              <el-button
                v-if="!detail.draft && canViewFinishedInspections"
                :disabled="locked || !valid || !dirty"
                @click="editor.save"
                >仅保存草稿</el-button
              >
              <el-button
                v-if="dirty || !detail.draft"
                type="primary"
                :disabled="locked || !valid || !dirty"
                :loading="submitting"
                @click="saveCurrentStep"
                >{{ saveActionLabel }}</el-button
              >
              <el-button
                v-else-if="workflowStep === 1 && canViewFinishedInspections"
                type="primary"
                :disabled="locked"
                @click="openFinishedInspection(detail.canBeginReinspection ? 'reinspect' : '')"
                >{{ inspectionActionLabel }}</el-button
              >
              <el-button
                v-else-if="workflowStep === 2"
                type="primary"
                :disabled="locked"
                @click="focusInspectionReference"
                >核对并引用质检记录</el-button
              >
              <el-button
                v-else-if="workflowStep === 3"
                type="warning"
                :disabled="locked"
                @click="openCloseout"
                >前往收尾与物料核对</el-button
              >
              <el-button
                v-else-if="workflowStep === 4"
                type="primary"
                :disabled="!canSubmit"
                :loading="submitting"
                @click="editor.submit"
                >提交结案审批</el-button
              >
            </template>
          </div>
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
    <InlineHint>
      {{
        detail?.draft
          ? '当前产出填写尚未保存。可保存后前往，或保留本地填写并切换页面；返回后仍需核对最新依据。'
          : '首次质检需要已保存的产出申报。建议保存草稿后前往；仅保留本地填写并前往时可查看质检页，尚不能开始首次检验。'
      }}
    </InlineHint>
    <p
      v-if="!valid"
      class="muted"
    >
      存在未完成或无效的填写项，暂不能保存。保留填写并前往不会保存申报，也不会开始检验。
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
        >{{ detail?.draft ? '保留填写并前往' : '保留填写并查看质检' }}</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="locked || !valid"
        @click="saveAndGoToInspection"
        >保存草稿并前往质检</el-button
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
  PRODUCTION_CLOSEOUT_MODE_LABELS,
  PRODUCTION_OUTPUT_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity as quantity } from '../../../utils/quantity';
import { useProductionOutput } from './use-production-output';
import BatchCloseoutEvidence from './BatchCloseoutEvidence.vue';
import FinishedInspectionHistory from '../../quality/components/FinishedInspectionHistory.vue';
import ProductionOutputRevisionPanel from './ProductionOutputRevisionPanel.vue';
import ProductionOutputReviewForm from './ProductionOutputReviewForm.vue';
import InlineHint from '../../../components/InlineHint.vue';
const props = defineProps<{ visible: boolean; batchId: string | null }>();
const emit = defineEmits<{
  'update:visible': [boolean];
  changed: [];
  'open-closeout': [string];
  'open-withdrawal': [string];
}>();
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
const canViewFinishedInspections = computed(() =>
  canAccessRoute({ name: 'quality-finished-inspections' }),
);
const reviewForm = ref<InstanceType<typeof ProductionOutputReviewForm> | null>(null);
async function focusInspectionReference(): Promise<void> {
  activeTab.value = 'draft';
  await nextTick();
  reviewForm.value?.focusInspection();
}
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
  if (!props.batchId || busy.value || unresolved.value || !canViewFinishedInspections.value) return;
  inspectionAction.value = action;
  if (dirty.value) navigationVisible.value = true;
  else void goToInspection();
}
async function goToInspection(): Promise<void> {
  if (!props.batchId || busy.value || unresolved.value || !canViewFinishedInspections.value) return;
  navigationVisible.value = false;
  // 保持 editor 存活，由路由缓存隐藏弹窗并保留原输入。
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
async function saveCurrentStep(): Promise<void> {
  if (!detail.value?.draft && canViewFinishedInspections.value) {
    inspectionAction.value = '';
    await saveAndGoToInspection();
    return;
  }
  await editor.save();
}
function closeNavigation(): void {
  if (!busy.value) navigationVisible.value = false;
}
const currentRound = computed(() =>
  detail.value?.rounds.find((row) => row.id === detail.value?.currentRoundId),
);
const hasSavedInspectionReference = computed(
  () =>
    !!detail.value?.applicableInspectionId &&
    detail.value.draft?.inspectionRecordId === detail.value.applicableInspectionId,
);
const workflowStep = computed(() => {
  if (!detail.value?.draft) return 0;
  if (currentRound.value?.status === 'inspecting' || !detail.value.applicableInspectionId) return 1;
  if (dirty.value || !hasSavedInspectionReference.value) return 2;
  return detail.value.canSubmit ? 4 : 3;
});
const inspectionStepNote = computed(() => {
  if (currentRound.value?.status === 'inspecting') return '本轮检验中';
  if (detail.value?.applicableInspectionId) return '已有适用放行记录';
  return '保存申报后办理';
});
const inspectionReferenceStepNote = computed(() => {
  if (hasSavedInspectionReference.value && !dirty.value) return '引用已保存';
  if (draft.inspectionRecordId && draft.inspectionRecordId === detail.value?.applicableInspectionId)
    return '待保存本次填写';
  return '明确选择适用记录';
});
const closeoutStepNote = computed(() => {
  if (hasSavedInspectionReference.value && !dirty.value && detail.value?.canSubmit) {
    if (detail.value.currentRevisionId) return '沿用批准收尾依据';
    return '送审条件已满足';
  }
  if (workflowStep.value === 3 && detail.value?.blockers.length)
    return `仍有 ${detail.value.blockers.length} 项送审阻断`;
  return '处理事项与逐项实核';
});
const workflowSteps = computed(() => [
  { title: '保存产出草稿', note: detail.value?.draft ? '已保存申报' : '填写数量与安排' },
  { title: '完成成品质检', note: inspectionStepNote.value },
  { title: '引用记录并保存', note: inspectionReferenceStepNote.value },
  { title: '收尾与物料核对', note: closeoutStepNote.value },
  { title: '提交结案审批', note: workflowStep.value === 4 ? '可提交负责人审批' : '完成核对后提交' },
]);
const inspectionActionLabel = computed(() => {
  if (detail.value && !detail.value.canEdit) return '查看质检记录';
  if (currentRound.value?.status === 'inspecting') return '继续成品质检';
  if (detail.value?.canBeginReinspection) return '前往复检';
  return '前往成品质检';
});
const saveActionLabel = computed(() => {
  if (!detail.value?.draft && canViewFinishedInspections.value) return '保存草稿并前往质检';
  if (draft.inspectionRecordId && draft.inspectionRecordId === detail.value?.applicableInspectionId)
    return '保存引用与产出草稿';
  return '保存产出草稿';
});
const footerStatus = computed(() => {
  if (unresolved.value) return '原操作结果未确认，请先重试或核对业务结果。';
  if (stale.value) return '依据已更新；先核对更新内容，再继续填写。';
  if (error.value) return '读取失败，当前填写已保留；请刷新核对后继续。';
  if (!valid.value) {
    const quantityMessage = Object.values(quantityErrors.value).find(Boolean);
    if (quantityMessage) return quantityMessage;
    if (!draft.reason.trim() && !draft.materialReviewNote.trim())
      return '保存前请填写产出说明和物料安排说明。';
    if (!draft.reason.trim()) return '保存前请填写产出说明 / 计划差异原因。';
    return '保存前请填写物料安排说明。';
  }
  if (dirty.value) return '当前填写尚未保存，先保存再继续下一步。';
  if (workflowStep.value === 1)
    return canViewFinishedInspections.value
      ? '草稿已保存，下一步完成本轮成品质检。'
      : '草稿已保存，请由有成品质检页面权限的人员完成检验。';
  if (workflowStep.value === 2) return '质检已放行，请选择本次使用的记录并保存草稿。';
  if (workflowStep.value === 3) {
    if (!detail.value?.blockers[0]) return '产出与引用已保存，请核对收尾及当前送审资格。';
    const remainingBlockers =
      detail.value.blockers.length > 1
        ? `（另有 ${detail.value.blockers.length - 1} 项，见当前步骤）`
        : '';
    return `暂不能送审：${detail.value.blockers[0]}${remainingBlockers}`;
  }
  if (workflowStep.value === 4) return '送审条件已满足；提交后冻结本次产出和引用。';
  return '先填写并保存产出草稿。';
});
const dialogTitle = computed(() => {
  if (
    detail.value &&
    !detail.value.currentRevisionId &&
    detail.value.check.batchStatus !== 'closing'
  )
    return '保留产出记录';
  if (detail.value?.status === 'reviewing') return '产出清单 · 审批中';
  if (detail.value?.status === 'approved') return '产出批准清单';
  return '产出清单与结案核对';
});
const currentStep = computed(() => {
  if (detail.value?.canEdit)
    return `第 ${workflowStep.value + 1} 步 · ${workflowSteps.value[workflowStep.value]?.title}`;
  if (
    detail.value &&
    !detail.value.currentRevisionId &&
    detail.value.check.batchStatus !== 'closing'
  )
    return '任务已恢复生产，产出记录仅供复核';
  if (detail.value?.status === 'reviewing') return '清单正在审批';
  if (detail.value?.canExecuteCurrentRevision) return '最新批准清单可执行';
  if (detail.value?.status === 'approved') return '批准记录保留，当前不可入库';
  return '按当前任务资格核对产出记录';
});
const currentStepNote = computed(() => {
  if (detail.value?.canEdit) {
    if (workflowStep.value === 0)
      return '先填写产出数量、产出说明和物料初步安排并保存；首次质检需要已保存的申报，质检引用稍后补充。';
    if (workflowStep.value === 1) {
      if (currentRound.value?.status === 'inspecting')
        return '本轮检验正在办理，暂不能送审或入库。完成并保存质检结果后，回到此处引用记录。';
      if (canViewFinishedInspections.value)
        return '产出申报已保存。前往成品质检完成本轮检验，再回来选择适用的放行记录并保存。';
      return '产出申报已保存。请由有成品质检页面权限的人员完成检验，再刷新核对并引用放行记录。';
    }
    if (workflowStep.value === 2)
      return dirty.value
        ? '核对当前产出及适用质检记录，保存本次填写与引用后，再处理收尾和物料。'
        : '请在右侧核对检查结果，选择本次产出使用的质检记录并保存草稿。';
    if (workflowStep.value === 3)
      return '产出与质检引用已保存。请按下列原因核对送审条件；收尾事项及逐项物料实核在收尾工作台办理，完成后返回此处提交审批。';
    return '产出、质检引用及收尾依据已满足当前送审要求，可提交工单负责人审批。批准后由仓管按授权办理入库。';
  }
  if (
    detail.value &&
    !detail.value.currentRevisionId &&
    detail.value.check.batchStatus !== 'closing'
  )
    return '历史草稿、检验和收尾记录保留供查看；再次结束任务后，请核对当前可办理的产出和质检操作。';
  if (detail.value?.status === 'reviewing') return '数量及引用已冻结，审批完成后形成新授权。';
  if (detail.value?.currentRevisionId && detail.value.executionBlockedReason)
    return detail.value.executionBlockedReason;
  if (detail.value?.canExecuteCurrentRevision)
    return '入库按有效剩余额度办理，批准本身不增加库存。';
  return '当前产出记录仅可查看。请在生产任务中核对当前状态和可办理操作。';
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
async function openWithdrawal(): Promise<void> {
  const batchId = props.batchId;
  if (!batchId || busy.value || unresolved.value || !(await editor.close())) return;
  await nextTick();
  if (!props.visible) emit('open-withdrawal', batchId);
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
.workflow-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  padding: 0;
  margin: 16px 0 0;
  list-style: none;
}
.workflow-steps li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 10px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
}
.workflow-steps li > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.workflow-steps strong {
  font-size: 13px;
  line-height: 1.6;
}
.workflow-steps li > div > span {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 600;
}
.workflow-steps .completed .step-number {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.workflow-steps .current {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.workflow-steps .current .step-number {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary);
  color: var(--el-color-white);
}
.current-action {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 12px 0 16px;
  padding: 12px;
  border-left: 3px solid var(--el-color-primary);
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
.current-blockers {
  padding-left: 18px;
  margin: 4px 0 0;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
  line-height: 1.7;
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
.submission-review {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.submission-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 12px;
  font-size: 14px;
}
.submission-heading span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.blockers {
  padding-left: 18px;
  margin: 4px 0;
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
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.footer-secondary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.footer-secondary :deep(.el-button + .el-button) {
  margin-left: 0;
}
.footer-next {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 320px;
}
.footer-status {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  text-align: right;
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
