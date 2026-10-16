<template>
  <div
    v-if="processingGroups.length"
    v-show="contentVisible"
    class="processing-entry"
  >
    <ProductionAbnormalProcessingSummary :groups="processingGroups">
      <el-button
        type="primary"
        link
        :disabled="disabled"
        @click="processingVisible = true"
        >查看 / 处理</el-button
      >
    </ProductionAbnormalProcessingSummary>
  </div>

  <el-dialog
    v-model="processingVisible"
    title="异常处理过程"
    width="min(1400px, calc(100% - 32px))"
  >
    <div class="processing-context">
      <span>{{ batchNo }}</span>
      <span
        >异常来源工序
        <strong class="source-emphasis"
          >{{ sourceStep.stepOrder }} · {{ sourceStep.stepName }}</strong
        ></span
      >
    </div>
    <ProductionAbnormalProcessingGroups
      :groups="processingGroups"
      :expansion="expansion"
      :pending-keys="pendingKeys"
      :unit="unit"
      :disabled="disabled"
      actions-enabled
      @update:expansion="$emit('update:expansion', $event)"
      @view-report="$emit('view-report', $event)"
      @review="openReview"
      @scrap="openSupplement"
      @start="$emit('start', $event)"
      @complete="$emit('complete', $event)"
    />
    <el-empty
      v-if="!processingGroups.length"
      description="当前工序没有异常处理记录"
    />
    <template #footer>
      <el-button @click="processingVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="reviewVisible"
    :title="reviewMode === 'rework' ? '批准异常返工' : '驳回异常并退回重报'"
    width="min(640px, 75vw)"
  >
    <el-alert
      class="dialog-tip"
      :type="reviewMode === 'rework' ? 'warning' : 'error'"
      :closable="false"
      show-icon
      :title="
        reviewMode === 'rework'
          ? '批准后将按来源异常数量创建整单返工，固定返回当前工序，由管理员在异常处置中办理。'
          : '驳回将全量冲销本次异常报工，不生成正常报工或补产授权；员工需要按正确数量和异常来源重新报工。'
      "
    />
    <el-form label-position="top">
      <el-form-item
        :label="reviewMode === 'rework' ? '审批说明' : '驳回原因'"
        :required="reviewMode === 'reject'"
      >
        <el-input
          v-model="reviewRemark"
          type="textarea"
          :rows="3"
          maxlength="5000"
          show-word-limit
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="reviewVisible = false">取消</el-button>
      <el-button
        :type="reviewMode === 'rework' ? 'primary' : 'danger'"
        :disabled="reviewMode === 'reject' && !reviewRemark.trim()"
        @click="submitReview"
        >{{ reviewMode === 'rework' ? '确认批准返工' : '确认驳回并退回' }}</el-button
      >
    </template>
  </el-dialog>

  <el-dialog
    v-model="supplementVisible"
    :title="supplementStage === 'edit' ? '编制报废补料需求' : '复核报废补料需求'"
    width="min(1100px, calc(100% - 32px))"
    :show-close="!supplementConfirming"
    :close-on-click-modal="!supplementConfirming"
    :close-on-press-escape="!supplementConfirming"
  >
    <el-alert
      class="dialog-tip"
      type="warning"
      :closable="false"
      show-icon
      title="报废数量沿用来源异常事实；补料品种和数量必须人工选择，不按异常数量自动推算。"
    />
    <el-descriptions
      v-if="supplementDisposition"
      class="supplement-context"
      :column="2"
      border
    >
      <el-descriptions-item label="异常来源工序">
        <strong class="source-emphasis"
          >{{ sourceStep.stepOrder }}. {{ sourceStep.stepName }}</strong
        >
      </el-descriptions-item>
      <el-descriptions-item label="产品补产数量">
        <strong class="quantity-emphasis"
          >{{ supplementDisposition.sourceAbnormalQuantity }} {{ unit }}</strong
        >
      </el-descriptions-item>
      <el-descriptions-item label="固定补产起点">
        <strong class="entry-emphasis"
          >{{ supplementPath[0]?.stepOrder }}. {{ supplementPath[0]?.stepName }}</strong
        >
      </el-descriptions-item>
      <el-descriptions-item label="受影响路线">
        {{ supplementPath.map((step) => step.stepName).join(' → ') }}
      </el-descriptions-item>
      <el-descriptions-item label="异常来源类型">
        {{ BATCH_STEP_ABNORMAL_ORIGIN_LABELS[supplementDisposition.abnormalOrigin] }}
      </el-descriptions-item>
      <el-descriptions-item label="候选物料范围">
        当前任务完整 BOM 基础；每种物料仅可使用初配冻结版本
      </el-descriptions-item>
    </el-descriptions>
    <template v-if="supplementStage === 'edit'">
      <el-alert
        class="dialog-tip"
        type="info"
        :closable="false"
        show-icon
        title="报废时会生成补料需求和待生效的报工上限，管理员在完成分配和出库后。补充的报工上限正式生效"
      />
      <el-alert
        v-if="supplementError"
        class="dialog-tip"
        type="error"
        :closable="false"
        :title="supplementError"
      />
      <el-table
        v-loading="supplementLoading"
        :data="supplementRows"
        empty-text="当前批次没有可用于补料的正常物料需求"
      >
        <el-table-column width="54">
          <template #default="{ row }">
            <el-checkbox v-model="row.selected" />
          </template>
        </el-table-column>
        <el-table-column
          label="基础物料编码"
          min-width="130"
        >
          <template #default="{ row }">{{
            row.candidate?.itemCode ?? row.savedLine?.itemCode
          }}</template>
        </el-table-column>
        <el-table-column
          label="物料名称"
          min-width="140"
        >
          <template #default="{ row }">{{
            row.candidate?.itemName ?? row.savedLine?.itemName
          }}</template>
        </el-table-column>
        <el-table-column
          label="任务冻结版本"
          min-width="200"
        >
          <template #default="{ row }">
            <strong class="locked-version">{{
              row.candidate?.lockedMaterialVariantCode || '待核对'
            }}</strong>
            <div
              :class="hasAvailableLockedVariant(row.candidate) ? 'field-note' : 'validation-error'"
            >
              {{
                hasAvailableLockedVariant(row.candidate)
                  ? '初配固定，不可换版'
                  : '冻结版本不可用，禁止补料'
              }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="补料版本"
          min-width="220"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.materialVariantId"
              :disabled="!row.selected || !hasAvailableLockedVariant(row.candidate)"
              filterable
              placeholder="请选择任务冻结版本"
            >
              <el-option
                v-if="hasUnavailableSelectedVariant(row)"
                :label="`${row.savedLine?.materialVariantCode || row.materialVariantId}（已失效）`"
                :value="row.materialVariantId"
                disabled
              />
              <el-option
                v-for="variant in row.candidate?.variants ?? []"
                :key="variant.id"
                :label="variant.variantCode"
                :value="variant.id"
                :disabled="variant.id !== row.candidate?.lockedMaterialVariantId"
              />
            </el-select>
            <div
              v-if="
                row.selected &&
                supplementSelectionError(row.candidate, row.materialVariantId, row.quantity)
              "
              class="validation-error"
            >
              {{ supplementSelectionError(row.candidate, row.materialVariantId, row.quantity) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="原需求"
          width="90"
        >
          <template #default="{ row }">{{ row.candidate?.normalDemandQuantity ?? '—' }}</template>
        </el-table-column>
        <el-table-column
          label="补料数量"
          width="190"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.quantity"
              :disabled="!row.selected"
              :min="1"
              :step="1"
              :precision="0"
            />
            {{ row.candidate?.unit ?? row.savedLine?.unit }}
          </template>
        </el-table-column>
      </el-table>
      <el-form label-position="top">
        <el-form-item label="审批说明">
          <el-input
            v-model="supplementRemark"
            type="textarea"
            :rows="3"
            maxlength="5000"
          />
        </el-form-item>
      </el-form>
    </template>
    <template v-else-if="persistedPlan">
      <el-alert
        v-if="supplementIntentStatus === 'pending'"
        class="dialog-tip"
        type="warning"
        :closable="false"
        show-icon
        title="上次最终确认结果未知。重试将复用原请求与提交标识；当前候选核验不改变原请求。"
      />
      <el-alert
        v-if="['blocked', 'expired'].includes(supplementIntentStatus)"
        class="dialog-tip"
        type="warning"
        :closable="false"
        show-icon
        :title="supplementIntentMessage"
      />
      <el-alert
        v-if="supplementError"
        class="dialog-tip"
        type="error"
        :closable="false"
        :title="supplementError"
      />
      <el-alert
        class="dialog-tip"
        type="warning"
        :closable="false"
        show-icon
        title="以下内容已暂存，但尚未创建正式物料需求，不能分配或出库。请逐行核对补料版本与任务冻结版本及数量；最终确定后不可直接修改。"
      />
      <el-descriptions
        class="supplement-context"
        :column="2"
        border
      >
        <el-descriptions-item label="需求物料种类">
          {{ persistedPlan.lines.length }} 种
        </el-descriptions-item>
        <el-descriptions-item
          label="审批说明"
          :span="2"
        >
          {{ persistedPlan.remark || '—' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-table :data="supplementReviewRows">
        <el-table-column
          prop="itemCode"
          label="物料编码"
          min-width="130"
        />
        <el-table-column
          prop="itemName"
          label="物料名称"
          min-width="150"
        />
        <el-table-column
          prop="materialVariantCode"
          label="已暂存补料版本"
          min-width="200"
        />
        <el-table-column
          label="任务冻结版本 / 核验"
          min-width="240"
        >
          <template #default="{ row }">
            <strong class="locked-version">{{ row.lockedMaterialVariantCode || '待核对' }}</strong>
            <div :class="row.validationMessage ? 'validation-error' : 'field-note'">
              {{ row.validationMessage || '与初配冻结版本一致' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="补料数量"
          width="180"
        >
          <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
        </el-table-column>
      </el-table>
    </template>
    <template #footer>
      <template v-if="supplementStage === 'edit'">
        <el-button @click="supplementVisible = false">取消</el-button>
        <el-button
          type="warning"
          :loading="supplementSaving"
          :disabled="!canStageSupplement"
          @click="stageSupplement"
          >暂存需求</el-button
        >
      </template>
      <template v-else>
        <el-button
          :disabled="supplementConfirming"
          @click="supplementVisible = false"
          >关闭</el-button
        >
        <el-button
          v-if="supplementIntentStatus === 'idle'"
          :disabled="supplementConfirming"
          @click="supplementStage = 'edit'"
          >重新编辑</el-button
        >
        <el-button
          v-else
          :disabled="supplementConfirming"
          @click="abandonSupplementIntent"
          >放弃旧提交并重新编辑</el-button
        >
        <el-button
          type="danger"
          :loading="supplementConfirming"
          :disabled="!canConfirmSupplement"
          @click="submitSupplement"
          >{{ supplementIntentStatus === 'pending' ? '重试最终确认' : '确定报废并生成' }}</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RequestError } from '@company/request';
import { BATCH_STEP_ABNORMAL_ORIGIN_LABELS } from '@company/constants';
import type {
  BatchStepAbnormalDispositionItem,
  BatchStepAbnormalDispositionView,
  BatchStepReportReference,
  ReworkRecordItem,
  ReworkRecordView,
  ProductionSupplementCandidateItem,
  ProductionScrapSupplementPlanItem,
  ProductionScrapSupplementPlanLineItem,
  ApproveScrapSupplementLinePayload,
  BatchStepExecutionRecordItem,
} from '@company/contracts';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { abnormalProcessingGroups } from '../production-report-presentation';
import ProductionAbnormalProcessingGroups from './ProductionAbnormalProcessingGroups.vue';
import ProductionAbnormalProcessingSummary from './ProductionAbnormalProcessingSummary.vue';

const props = withDefaults(
  defineProps<{
    batchNo: string;
    dispositions: BatchStepAbnormalDispositionView[];
    reworks: ReworkRecordView[];
    expansion: Record<string, boolean>;
    contentVisible?: boolean;
    disabled?: boolean;
    pendingKeys: Set<string>;
    unit?: string;
    sourceStep: BatchStepExecutionRecordItem;
    routeSteps: BatchStepExecutionRecordItem[];
    candidateLoader: (dispositionId: string) => Promise<ProductionSupplementCandidateItem[]>;
    planLoader: (dispositionId: string) => Promise<ProductionScrapSupplementPlanItem | null>;
    planSaver: (
      disposition: BatchStepAbnormalDispositionItem,
      details: ApproveScrapSupplementLinePayload[],
      remark: string,
      planVersion: number | null,
    ) => Promise<ProductionScrapSupplementPlanItem>;
    planConfirmer: (
      disposition: BatchStepAbnormalDispositionItem,
      planVersion: number,
    ) => Promise<void>;
    intentStatusLoader: (dispositionId: string) => IdempotentIntentStatus;
    intentResetter: (dispositionId: string) => void;
  }>(),
  { unit: '', contentVisible: true, disabled: false },
);
const emit = defineEmits<{
  approve: [item: BatchStepAbnormalDispositionItem, remark: string];
  reject: [item: BatchStepAbnormalDispositionItem, reason: string];
  start: [item: ReworkRecordItem];
  complete: [item: ReworkRecordView];
  'view-report': [report: BatchStepReportReference];
  'update:expansion': [expansion: Record<string, boolean>];
}>();
const processingGroups = computed(() =>
  abnormalProcessingGroups(props.dispositions, props.reworks),
);
const processingVisible = ref(false);

const reviewVisible = ref(false);
const reviewMode = ref<'rework' | 'reject'>('rework');
const selectedDisposition = ref<BatchStepAbnormalDispositionItem | null>(null);
const reviewRemark = ref('');
const supplementVisible = ref(false);
const supplementLoading = ref(false);
const supplementCandidatesReady = ref(false);
const supplementSaving = ref(false);
const supplementConfirming = ref(false);
const supplementError = ref('');
const supplementRemark = ref('');
const supplementDisposition = ref<BatchStepAbnormalDispositionItem | null>(null);
const supplementStage = ref<'edit' | 'review'>('edit');
const persistedPlan = ref<ProductionScrapSupplementPlanItem | null>(null);
const supplementIntentStatus = ref<IdempotentIntentStatus>('idle');
let supplementRequestSerial = 0;
interface SupplementRow {
  candidate: ProductionSupplementCandidateItem | null;
  savedLine: ProductionScrapSupplementPlanLineItem | null;
  materialVariantId: string;
  selected: boolean;
  quantity: number;
}
const supplementRows = ref<SupplementRow[]>([]);

const supplementPath = computed(() =>
  [...props.routeSteps]
    .filter((step) => step.stepOrder <= props.sourceStep.stepOrder)
    .sort((left, right) => left.stepOrder - right.stepOrder),
);
const hasAvailableLockedVariant = (candidate: ProductionSupplementCandidateItem | null): boolean =>
  Boolean(candidate?.variants.some((variant) => variant.id === candidate.lockedMaterialVariantId));
const hasUnavailableSelectedVariant = (row: SupplementRow): boolean =>
  Boolean(row.materialVariantId) &&
  !row.candidate?.variants.some((variant) => variant.id === row.materialVariantId);
const supplementSelectionError = (
  candidate: ProductionSupplementCandidateItem | null,
  materialVariantId: string,
  quantity: number,
): string => {
  if (!candidate) return '原需求已不在当前候选中，请核对后移除此行。';
  if (!hasAvailableLockedVariant(candidate))
    return '任务冻结版本已停用或不可用，不能以其他版本替代。';
  if (!materialVariantId) return '请选择任务冻结版本。';
  if (materialVariantId !== candidate.lockedMaterialVariantId)
    return '补料版本与任务冻结版本不一致，请重新选择。';
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99_999_999)
    return '补料数量须为 1 至 99999999 的整数。';
  return '';
};
const canStageSupplement = computed(() => {
  const selected = supplementRows.value.filter((row) => row.selected);
  return (
    !props.disabled &&
    !supplementLoading.value &&
    !supplementSaving.value &&
    supplementCandidatesReady.value &&
    Boolean(supplementDisposition.value) &&
    selected.length > 0 &&
    selected.every(
      (row) => !supplementSelectionError(row.candidate, row.materialVariantId, row.quantity),
    )
  );
});
const supplementReviewRows = computed(() =>
  (persistedPlan.value?.lines ?? []).map((line) => {
    const candidate =
      supplementRows.value.find(
        (row) =>
          row.candidate?.originalDemandId === line.originalDemandId &&
          row.candidate.requirementBasisId === line.requirementBasisId,
      )?.candidate ?? null;
    return {
      ...line,
      quantity: Number(line.plannedQuantity),
      lockedMaterialVariantCode: candidate?.lockedMaterialVariantCode,
      validationMessage: supplementCandidatesReady.value
        ? supplementSelectionError(candidate, line.materialVariantId, Number(line.plannedQuantity))
        : '候选核验未成功，请关闭后重试。',
    };
  }),
);
const canConfirmSupplement = computed(() => {
  if (
    persistedPlan.value?.status !== 'draft' ||
    supplementConfirming.value ||
    ['blocked', 'expired'].includes(supplementIntentStatus.value)
  )
    return false;
  // 未知结果只重放首次请求，不能用后来变化的候选阻止原请求重试。
  if (supplementIntentStatus.value === 'pending') return true;
  return (
    !props.disabled &&
    !supplementLoading.value &&
    supplementCandidatesReady.value &&
    supplementReviewRows.value.length > 0 &&
    supplementReviewRows.value.every((row) => !row.validationMessage)
  );
});
const supplementIntentMessage = computed(() => {
  if (supplementIntentStatus.value === 'blocked')
    return '上次确认结果无法核对，请联系管理员并核对异常处置和正式补料需求。';
  return '上次确认已超过可安全重试时间，请先核对异常处置和正式补料需求。';
});
const openReview = (item: BatchStepAbnormalDispositionItem, mode: 'rework' | 'reject') => {
  if (
    props.disabled ||
    (mode === 'reject' &&
      props.dispositions.find((current) => current.dispositionId === item.dispositionId)
        ?.sourceReportSourceKind !== 'direct_abnormal')
  )
    return;
  selectedDisposition.value = item;
  reviewMode.value = mode;
  reviewRemark.value = '';
  reviewVisible.value = true;
};
const submitReview = () => {
  if (!selectedDisposition.value || props.disabled) return;
  if (
    reviewMode.value === 'reject' &&
    props.dispositions.find(
      (current) => current.dispositionId === selectedDisposition.value?.dispositionId,
    )?.sourceReportSourceKind !== 'direct_abnormal'
  )
    return;
  if (reviewMode.value === 'rework') emit('approve', selectedDisposition.value, reviewRemark.value);
  else if (reviewRemark.value.trim()) emit('reject', selectedDisposition.value, reviewRemark.value);
  reviewVisible.value = false;
};
const openSupplement = async (item: BatchStepAbnormalDispositionItem) => {
  supplementDisposition.value = item;
  supplementIntentStatus.value = props.intentStatusLoader(item.dispositionId);
  supplementRows.value = [];
  supplementCandidatesReady.value = false;
  supplementRemark.value = '';
  supplementError.value = '';
  supplementStage.value = 'edit';
  persistedPlan.value = null;
  supplementVisible.value = true;
  supplementLoading.value = true;
  try {
    const plan = await props.planLoader(item.dispositionId);
    if (plan?.status === 'draft') {
      persistedPlan.value = plan;
      supplementRemark.value = plan.remark ?? '';
      await loadSupplementCandidates(plan);
      // 已有服务端草稿时先展示不可编辑的复核页，避免打开弹窗即误改已暂存需求。
      supplementStage.value = 'review';
      return;
    }
    await loadSupplementCandidates();
  } catch {
    supplementError.value = '暂存方案加载失败，请关闭后重试。';
  } finally {
    supplementLoading.value = false;
  }
};
const loadSupplementCandidates = async (restoredPlan?: ProductionScrapSupplementPlanItem) => {
  const item = supplementDisposition.value;
  if (!item) return;
  const requestSerial = ++supplementRequestSerial;
  supplementLoading.value = true;
  supplementCandidatesReady.value = false;
  supplementRows.value = [];
  supplementError.value = '';
  try {
    const candidates = await props.candidateLoader(item.dispositionId);
    if (
      requestSerial !== supplementRequestSerial ||
      supplementDisposition.value?.dispositionId !== item.dispositionId
    )
      return;
    const restoredByDemandId = new Map(
      (restoredPlan?.lines ?? []).map((line) => [line.originalDemandId, line]),
    );
    supplementRows.value = candidates.map((candidate) => {
      const restored = restoredByDemandId.get(candidate.originalDemandId);
      return {
        candidate,
        savedLine: restored ?? null,
        // 新需求显式选择冻结版；旧草稿保留真实版本，失效或不一致均不自动替换。
        materialVariantId: restored?.materialVariantId ?? '',
        selected: Boolean(restored),
        quantity: restored ? Number(restored.plannedQuantity) : 1,
      };
    });
    const candidateIds = new Set(candidates.map((candidate) => candidate.originalDemandId));
    for (const line of restoredPlan?.lines ?? []) {
      if (candidateIds.has(line.originalDemandId)) continue;
      supplementRows.value.push({
        candidate: null,
        savedLine: line,
        materialVariantId: line.materialVariantId,
        selected: true,
        quantity: Number(line.plannedQuantity),
      });
    }
    supplementCandidatesReady.value = true;
  } catch {
    supplementError.value = '补料候选加载失败，请关闭后重试。';
  } finally {
    if (requestSerial === supplementRequestSerial) supplementLoading.value = false;
  }
};
const stageSupplement = async () => {
  const disposition = supplementDisposition.value;
  if (!canStageSupplement.value || !disposition) return;
  const details = supplementRows.value
    .filter((row) => row.selected)
    .map((row) => {
      if (!row.candidate) throw new Error('补料候选未核验');
      return {
        originalDemandId: row.candidate.originalDemandId,
        requirementBasisId: row.candidate.requirementBasisId,
        materialVariantId: row.materialVariantId,
        supplementQuantity: row.quantity,
      };
    });
  supplementSaving.value = true;
  supplementError.value = '';
  try {
    const plan = await props.planSaver(
      disposition,
      details,
      supplementRemark.value,
      persistedPlan.value?.version ?? null,
    );
    persistedPlan.value = plan;
    supplementStage.value = 'review';
  } catch {
    supplementError.value = '暂存需求失败，可能已被其他管理员修改，请关闭后重新打开。';
  } finally {
    supplementSaving.value = false;
  }
};
const submitSupplement = async () => {
  if (!supplementDisposition.value || !persistedPlan.value || !canConfirmSupplement.value) return;
  supplementConfirming.value = true;
  supplementError.value = '';
  try {
    await props.planConfirmer(supplementDisposition.value, persistedPlan.value.version);
    supplementVisible.value = false;
  } catch (error) {
    // HTTP 错误由全局处理器按服务端 code 统一提示；组件只补充尚未进入 HTTP 链路的本地失败。
    if (!(error instanceof RequestError)) supplementError.value = '无法发起最终确认，请稍后重试。';
  } finally {
    supplementConfirming.value = false;
    supplementIntentStatus.value = supplementDisposition.value
      ? props.intentStatusLoader(supplementDisposition.value.dispositionId)
      : 'idle';
  }
};
const abandonSupplementIntent = async () => {
  const disposition = supplementDisposition.value;
  if (!disposition) return;
  try {
    await RouteMessageBox.confirm(
      '请确认你已核对异常处置和正式补料需求。放弃后将无法继续复用本次提交标识，重新提交可能生成重复业务事实。',
      '放弃上次最终确认',
      { type: 'warning', confirmButtonText: '已核对，放弃旧提交' },
    );
    props.intentResetter(disposition.dispositionId);
    supplementIntentStatus.value = props.intentStatusLoader(disposition.dispositionId);
    supplementError.value = '';
    supplementStage.value = 'edit';
  } catch {
    // 用户取消时继续保留旧幂等意图。
  }
};
</script>

<style scoped>
.processing-entry {
  margin-top: 12px;
}
.processing-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 14px;
}
.source-emphasis {
  color: var(--el-color-warning);
}
.entry-emphasis,
.locked-version {
  color: var(--el-color-primary);
}
.quantity-emphasis {
  color: var(--el-color-danger);
}
.source-emphasis,
.entry-emphasis,
.quantity-emphasis,
.locked-version {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.dialog-tip {
  margin-bottom: 12px;
}
.supplement-context {
  margin-bottom: 12px;
}
.field-note,
.validation-error {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
}
.field-note {
  color: var(--el-text-color-secondary);
}
.validation-error {
  color: var(--el-color-danger);
}
</style>
