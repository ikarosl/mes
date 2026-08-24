<template>
  <section
    v-if="dispositions.length || reworks.length"
    class="abnormal-panel"
  >
    <div v-if="dispositions.length">
      <strong>异常处置</strong>
      <div
        v-for="item in dispositions"
        :key="item.dispositionId"
        class="business-row"
      >
        <div>
          <el-tag :type="item.reviewStatus === 'pending_review' ? 'danger' : 'info'">
            {{ item.dispositionNo }} ·
            {{ BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS[item.reviewStatus] }}
          </el-tag>
          <span>{{ sourceQuantity(item) }} {{ unit }}</span>
          <span>{{ item.abnormalOrigin === 'previous_step' ? '前置异常' : '当前工序异常' }}</span>
          <span
            v-if="item.reviewStatus !== 'pending_review'"
            class="disposition-remark"
          >
            {{ item.reviewStatus === 'rejected' ? '驳回原因' : '处置说明' }}：{{
              item.remark || '—'
            }}
          </span>
        </div>
        <div v-if="item.reviewStatus === 'pending_review'">
          <el-button
            link
            type="primary"
            :loading="pendingKeys.has(`approve-rework:${item.dispositionId}`)"
            @click="openReview(item, 'rework')"
            >批准返工</el-button
          >
          <el-button
            link
            type="warning"
            :loading="pendingKeys.has(`approve-scrap:${item.dispositionId}`)"
            @click="openSupplement(item)"
            >报废并补料</el-button
          >
          <el-button
            link
            type="danger"
            :loading="pendingKeys.has(`reject:${item.dispositionId}`)"
            @click="openReview(item, 'reject')"
            >驳回</el-button
          >
        </div>
      </div>
    </div>

    <div v-if="reworks.length">
      <strong>返工单</strong>
      <div
        v-for="item in reworks"
        :key="item.reworkId"
        class="business-row"
      >
        <div>
          <el-tag :type="reworkTagType(item.status)">{{
            REWORK_STATUS_LABELS[item.status]
          }}</el-tag>
          <span>{{ item.reworkNo }} · {{ item.reworkQuantity }} {{ item.unit }}</span>
          <span>负责人 {{ item.responsibleUserName || item.responsibleUserId }}</span>
        </div>
        <el-button
          v-if="item.status === 'pending'"
          link
          type="primary"
          :loading="pendingKeys.has(`start-rework:${item.reworkId}`)"
          @click="$emit('start', item)"
          >开始返工</el-button
        >
        <el-button
          v-else-if="item.status === 'doing'"
          link
          type="primary"
          @click="openCompletion(item)"
          >完成返工</el-button
        >
      </div>
    </div>

    <el-dialog
      v-model="reviewVisible"
      :title="reviewMode === 'rework' ? '批准异常返工' : '驳回异常处置'"
      width="min(640px, 75vw)"
    >
      <el-alert
        class="dialog-tip"
        :type="reviewMode === 'rework' ? 'warning' : 'error'"
        :closable="false"
        show-icon
        :title="
          reviewMode === 'rework'
            ? '批准后将按来源异常数量创建整单返工，固定返回当前工序并沿用当前负责人。'
            : '驳回只结束当前处置待办，不会消除原异常报工事实。'
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
          >{{ reviewMode === 'rework' ? '确认批准返工' : '确认驳回' }}</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="supplementVisible"
      :title="supplementStage === 'edit' ? '编制报废补料需求' : '复核报废补料需求'"
      width="min(820px, 85vw)"
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
          {{ sourceStep.stepOrder }}. {{ sourceStep.stepName }}
        </el-descriptions-item>
        <el-descriptions-item label="产品补产数量">
          {{ sourceQuantity(supplementDisposition) }} {{ unit }}
        </el-descriptions-item>
        <el-descriptions-item label="固定补产起点">
          {{ supplementPath[0]?.stepOrder }}. {{ supplementPath[0]?.stepName }}
        </el-descriptions-item>
        <el-descriptions-item label="受影响路线">
          {{ supplementPath.map((step) => step.stepName).join(' → ') }}
        </el-descriptions-item>
        <el-descriptions-item label="异常来源类型">
          {{
            supplementDisposition.abnormalOrigin === 'previous_step'
              ? '前置工序异常'
              : '当前工序异常'
          }}
        </el-descriptions-item>
        <el-descriptions-item label="候选物料范围">
          {{ materialPath.map((step) => step.stepName).join(' → ') || '待选择截止工序' }}
        </el-descriptions-item>
        <el-descriptions-item
          label="正常目标变化"
          :span="2"
        >
          {{ supplementTargetImpact }}
        </el-descriptions-item>
      </el-descriptions>
      <template v-if="supplementStage === 'edit'">
        <el-form label-position="top">
          <el-form-item
            label="候选物料截止工序"
            required
          >
            <el-select
              v-model="materialEndStepRecordId"
              placeholder="请选择实际需要重制到的最后一道工序"
              @change="() => loadSupplementCandidates()"
            >
              <el-option
                v-for="step in materialEndOptions"
                :key="step.stepRecordId"
                :label="`${step.stepOrder}. ${step.stepName}`"
                :value="step.stepRecordId"
              />
            </el-select>
            <div class="field-tip">
              系统只推荐首工序至该工序使用的候选物料，补料数量由管理员填写；补产上限数量仍从首工序逐道放行到异常上报工序。
            </div>
          </el-form-item>
        </el-form>
        <el-alert
          class="dialog-tip"
          type="info"
          :closable="false"
          show-icon
          title="先把需求保存为不可分配的草稿并复核；只有最终确定报废并生成后才会创建正式需求。补料全部确认领用后，补产才从首工序开始逐道放行。"
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
            prop="candidate.itemCode"
            label="物料编码"
            min-width="130"
          />
          <el-table-column
            prop="candidate.itemName"
            label="物料名称"
            min-width="150"
          />
          <el-table-column
            prop="candidate.normalDemandQuantity"
            label="原需求"
            width="110"
          />
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
              {{ row.candidate.unit }}
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
      <template v-else-if="stagedSupplement">
        <el-alert
          v-if="supplementIntentStatus !== 'idle'"
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
          title="以下内容已保存为服务端草稿，但尚未创建正式物料需求，不能分配或出库。请核对物料、数量和候选物料截止工序；最终确定后不可直接修改。"
        />
        <el-descriptions
          class="supplement-context"
          :column="2"
          border
        >
          <el-descriptions-item label="候选物料截止工序">
            {{ stagedSupplement.materialEndStepLabel }}
          </el-descriptions-item>
          <el-descriptions-item label="需求物料种类">
            {{ stagedSupplement.lines.length }} 种
          </el-descriptions-item>
          <el-descriptions-item
            label="审批说明"
            :span="2"
          >
            {{ stagedSupplement.remark || '—' }}
          </el-descriptions-item>
        </el-descriptions>
        <el-table :data="stagedSupplement.lines">
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
            :disabled="
              !stagedSupplement ||
              persistedPlan?.status !== 'draft' ||
              ['blocked', 'expired'].includes(supplementIntentStatus)
            "
            @click="submitSupplement"
            >{{
              supplementIntentStatus === 'pending' ? '重试最终确认' : '确定报废并生成'
            }}</el-button
          >
        </template>
      </template>
    </el-dialog>

    <el-dialog
      v-model="completionVisible"
      title="完成返工"
      width="min(640px, 75vw)"
    >
      <el-alert
        class="dialog-tip"
        type="warning"
        :closable="false"
        show-icon
        title="本次正常与异常数量合计必须等于返工单数量；提交后会生成不可变报工事实。"
      />
      <el-descriptions
        v-if="selectedRework"
        :column="2"
        border
      >
        <el-descriptions-item label="返工单">{{ selectedRework.reworkNo }}</el-descriptions-item>
        <el-descriptions-item label="返工数量"
          >{{ selectedRework.reworkQuantity }} {{ selectedRework.unit }}</el-descriptions-item
        >
      </el-descriptions>
      <el-form label-position="top">
        <el-form-item
          label="返工正常数量"
          required
        >
          <el-input-number
            v-model="completionForm.normalQuantity"
            :min="0"
            :max="Number(selectedRework?.reworkQuantity || 0)"
            :step="1"
            :precision="0"
          />
        </el-form-item>
        <el-form-item
          label="返工异常数量"
          required
        >
          <el-input-number
            v-model="completionForm.abnormalQuantity"
            :min="0"
            :max="Number(selectedRework?.reworkQuantity || 0)"
            :step="1"
            :precision="0"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="completionForm.remark"
            type="textarea"
            :rows="3"
            maxlength="5000"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completionVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!canComplete"
          :loading="
            selectedRework ? pendingKeys.has(`complete-rework:${selectedRework.reworkId}`) : false
          "
          @click="submitCompletion"
          >确认完成返工</el-button
        >
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS, REWORK_STATUS_LABELS } from '@company/constants';
import type {
  BatchStepAbnormalDispositionItem,
  BatchStepReportItem,
  ReworkRecordItem,
  ProductionSupplementCandidateItem,
  ProductionScrapSupplementPlanItem,
  ApproveScrapSupplementLinePayload,
  BatchStepExecutionRecordItem,
} from '@company/contracts';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { RouteMessageBox } from '../../../utils/route-message-box';

const props = withDefaults(
  defineProps<{
    dispositions: BatchStepAbnormalDispositionItem[];
    reports: BatchStepReportItem[];
    reworks: ReworkRecordItem[];
    pendingKeys: Set<string>;
    unit?: string;
    sourceStep: BatchStepExecutionRecordItem;
    routeSteps: BatchStepExecutionRecordItem[];
    candidateLoader: (
      dispositionId: string,
      materialEndStepRecordId: string,
    ) => Promise<ProductionSupplementCandidateItem[]>;
    planLoader: (dispositionId: string) => Promise<ProductionScrapSupplementPlanItem | null>;
    planSaver: (
      disposition: BatchStepAbnormalDispositionItem,
      materialEndStepRecordId: string,
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
  { unit: '' },
);
const emit = defineEmits<{
  approve: [item: BatchStepAbnormalDispositionItem, remark: string];
  reject: [item: BatchStepAbnormalDispositionItem, reason: string];
  start: [item: ReworkRecordItem];
  complete: [item: ReworkRecordItem, normal: number, abnormal: number, remark: string];
}>();

const reviewVisible = ref(false);
const reviewMode = ref<'rework' | 'reject'>('rework');
const selectedDisposition = ref<BatchStepAbnormalDispositionItem | null>(null);
const reviewRemark = ref('');
const completionVisible = ref(false);
const selectedRework = ref<ReworkRecordItem | null>(null);
const completionForm = reactive({ normalQuantity: 0, abnormalQuantity: 0, remark: '' });
const supplementVisible = ref(false);
const supplementLoading = ref(false);
const supplementSaving = ref(false);
const supplementConfirming = ref(false);
const supplementError = ref('');
const supplementRemark = ref('');
const supplementDisposition = ref<BatchStepAbnormalDispositionItem | null>(null);
const materialEndStepRecordId = ref('');
const supplementStage = ref<'edit' | 'review'>('edit');
const stagedSupplement = ref<{
  materialEndStepRecordId: string;
  materialEndStepLabel: string;
  lines: Array<{
    originalDemandId: string;
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
  }>;
  remark: string;
} | null>(null);
const persistedPlan = ref<ProductionScrapSupplementPlanItem | null>(null);
const supplementIntentStatus = ref<IdempotentIntentStatus>('idle');
let supplementRequestSerial = 0;
const supplementRows = ref<
  Array<{ candidate: ProductionSupplementCandidateItem; selected: boolean; quantity: number }>
>([]);

const sourceQuantity = (item: BatchStepAbnormalDispositionItem): string =>
  props.reports.find((report) => report.reportId === item.sourceReportId)?.abnormalQuantity ?? '—';
const supplementPath = computed(() =>
  [...props.routeSteps]
    .filter((step) => step.stepOrder <= props.sourceStep.stepOrder)
    .sort((left, right) => left.stepOrder - right.stepOrder),
);
const materialEndOptions = computed(() => {
  const disposition = supplementDisposition.value;
  if (!disposition) return [];
  return [...props.routeSteps]
    .filter((step) =>
      disposition.abnormalOrigin === 'previous_step'
        ? step.stepOrder < props.sourceStep.stepOrder
        : step.stepOrder <= props.sourceStep.stepOrder,
    )
    .sort((left, right) => left.stepOrder - right.stepOrder);
});
const materialPath = computed(() => {
  const end = materialEndOptions.value.find(
    (step) => step.stepRecordId === materialEndStepRecordId.value,
  );
  return end ? materialEndOptions.value.filter((step) => step.stepOrder <= end.stepOrder) : [];
});
const supplementTargetImpact = computed(() => {
  if (!supplementDisposition.value) return '—';
  const quantity = sourceQuantity(supplementDisposition.value);
  const upstream = supplementPath.value.slice(0, -1);
  if (upstream.length === 0)
    return `${props.sourceStep.stepName} 的正常目标维持批次计划量，补料领用后首工序投入上限增加 ${quantity} ${props.unit}`;
  const upstreamText = upstream.length
    ? `${upstream.map((step) => step.stepName).join('、')} 的正常目标各增加 ${quantity} ${props.unit}`
    : '没有前置工序需要提高正常目标';
  return `${upstreamText}；${props.sourceStep.stepName} 的最终正常目标不增加，等待前道新增正常产出后补报 ${quantity} ${props.unit}`;
});
const reworkTagType = (status: ReworkRecordItem['status']) =>
  status === 'completed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';
const canComplete = computed(() => {
  const expected = Number(selectedRework.value?.reworkQuantity ?? 0);
  return (
    expected > 0 &&
    Number.isInteger(completionForm.normalQuantity) &&
    Number.isInteger(completionForm.abnormalQuantity) &&
    completionForm.normalQuantity + completionForm.abnormalQuantity === expected
  );
});
const canStageSupplement = computed(
  () =>
    !supplementLoading.value &&
    !supplementSaving.value &&
    Boolean(supplementDisposition.value) &&
    Boolean(materialEndStepRecordId.value) &&
    supplementRows.value.some(
      (row) => row.selected && Number.isInteger(row.quantity) && row.quantity > 0,
    ),
);
const supplementIntentMessage = computed(() => {
  if (supplementIntentStatus.value === 'blocked')
    return '上次最终确认的幂等结果已损坏。请先在异常处置和正式补料需求中核对结果；确认未生成后，放弃旧提交再重新编辑。';
  if (supplementIntentStatus.value === 'expired')
    return '上次最终确认已超过安全重试窗口。请先核对异常处置和正式补料需求；确认未生成后，放弃旧提交再重新编辑。';
  return '上次最终确认结果尚未明确。系统已查询服务端方案但仍未确认；可保持当前方案重试，修改前必须先核对结果并放弃旧提交。';
});
const openReview = (item: BatchStepAbnormalDispositionItem, mode: 'rework' | 'reject') => {
  selectedDisposition.value = item;
  reviewMode.value = mode;
  reviewRemark.value = '';
  reviewVisible.value = true;
};
const submitReview = () => {
  if (!selectedDisposition.value) return;
  if (reviewMode.value === 'rework') emit('approve', selectedDisposition.value, reviewRemark.value);
  else if (reviewRemark.value.trim()) emit('reject', selectedDisposition.value, reviewRemark.value);
  reviewVisible.value = false;
};
const openSupplement = async (item: BatchStepAbnormalDispositionItem) => {
  supplementDisposition.value = item;
  supplementIntentStatus.value = props.intentStatusLoader(item.dispositionId);
  supplementRows.value = [];
  supplementRemark.value = '';
  supplementError.value = '';
  supplementStage.value = 'edit';
  stagedSupplement.value = null;
  persistedPlan.value = null;
  supplementVisible.value = true;
  const allowedEnds = [...props.routeSteps]
    .filter((step) =>
      item.abnormalOrigin === 'previous_step'
        ? step.stepOrder < props.sourceStep.stepOrder
        : step.stepOrder <= props.sourceStep.stepOrder,
    )
    .sort((left, right) => left.stepOrder - right.stepOrder);
  materialEndStepRecordId.value = allowedEnds.at(-1)?.stepRecordId ?? '';
  if (!materialEndStepRecordId.value) {
    supplementError.value = '前置异常没有可选的前置截止工序，请先核对异常来源。';
    return;
  }
  supplementLoading.value = true;
  try {
    const plan = await props.planLoader(item.dispositionId);
    if (plan?.status === 'draft') {
      persistedPlan.value = plan;
      materialEndStepRecordId.value = plan.materialEndStepRecordId;
      supplementRemark.value = plan.remark ?? '';
      await loadSupplementCandidates(plan);
      if (supplementIntentStatus.value !== 'idle') {
        const endStep = allowedEnds.find(
          (step) => step.stepRecordId === plan.materialEndStepRecordId,
        );
        stagedSupplement.value = {
          materialEndStepRecordId: plan.materialEndStepRecordId,
          materialEndStepLabel: endStep
            ? `${endStep.stepOrder}. ${endStep.stepName}`
            : plan.materialEndStepRecordId,
          lines: plan.lines.map((line) => ({
            originalDemandId: line.originalDemandId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            quantity: Number(line.plannedQuantity),
            unit: line.unit,
          })),
          remark: plan.remark ?? '',
        };
        supplementStage.value = 'review';
      }
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
  const materialEndId = materialEndStepRecordId.value;
  if (!item || !materialEndId) return;
  const requestSerial = ++supplementRequestSerial;
  supplementLoading.value = true;
  supplementRows.value = [];
  supplementError.value = '';
  try {
    const candidates = await props.candidateLoader(item.dispositionId, materialEndId);
    if (
      requestSerial !== supplementRequestSerial ||
      supplementDisposition.value?.dispositionId !== item.dispositionId ||
      materialEndStepRecordId.value !== materialEndId
    )
      return;
    const restored = new Map(
      (restoredPlan?.lines ?? []).map((line) => [line.originalDemandId, line.plannedQuantity]),
    );
    supplementRows.value = candidates.map((candidate) => ({
      candidate,
      selected: restored.has(candidate.originalDemandId),
      quantity: restored.has(candidate.originalDemandId)
        ? Number(restored.get(candidate.originalDemandId))
        : 1,
    }));
  } catch {
    supplementError.value = '补料候选加载失败，请关闭后重试。';
  } finally {
    if (requestSerial === supplementRequestSerial) supplementLoading.value = false;
  }
};
const stageSupplement = async () => {
  if (!canStageSupplement.value) return;
  const endStep = materialEndOptions.value.find(
    (step) => step.stepRecordId === materialEndStepRecordId.value,
  );
  if (!endStep) return;
  const details = supplementRows.value
    .filter((row) => row.selected && row.quantity > 0)
    .map((row) => ({
      originalDemandId: row.candidate.originalDemandId,
      supplementQuantity: row.quantity,
    }));
  supplementSaving.value = true;
  supplementError.value = '';
  try {
    const plan = await props.planSaver(
      supplementDisposition.value!,
      materialEndStepRecordId.value,
      details,
      supplementRemark.value,
      persistedPlan.value?.version ?? null,
    );
    persistedPlan.value = plan;
    stagedSupplement.value = {
      materialEndStepRecordId: plan.materialEndStepRecordId,
      materialEndStepLabel: `${endStep.stepOrder}. ${endStep.stepName}`,
      lines: plan.lines.map((line) => ({
        originalDemandId: line.originalDemandId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        quantity: Number(line.plannedQuantity),
        unit: line.unit,
      })),
      remark: plan.remark ?? '',
    };
    supplementStage.value = 'review';
  } catch {
    supplementError.value = '暂存需求失败，可能已被其他管理员修改，请关闭后重新打开。';
  } finally {
    supplementSaving.value = false;
  }
};
const submitSupplement = async () => {
  if (!supplementDisposition.value || !persistedPlan.value || supplementConfirming.value) return;
  supplementConfirming.value = true;
  supplementError.value = '';
  try {
    await props.planConfirmer(supplementDisposition.value, persistedPlan.value.version);
    supplementVisible.value = false;
  } catch {
    supplementError.value =
      '最终确认未完成。系统会保留原幂等提交；请按上方提示重试或核对结果后放弃旧提交。';
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
      '请确认你已在异常处置和正式补料需求中核对，本次最终确认没有成功。放弃后将不能再用原幂等键安全重试，重新提交可能生成重复业务事实。',
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
const openCompletion = (item: ReworkRecordItem) => {
  selectedRework.value = item;
  completionForm.normalQuantity = Number(item.reworkQuantity);
  completionForm.abnormalQuantity = 0;
  completionForm.remark = '';
  completionVisible.value = true;
};
const submitCompletion = () => {
  if (!selectedRework.value || !canComplete.value) return;
  emit(
    'complete',
    selectedRework.value,
    completionForm.normalQuantity,
    completionForm.abnormalQuantity,
    completionForm.remark,
  );
  completionVisible.value = false;
};
</script>

<style scoped>
.abnormal-panel {
  display: grid;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff7f7;
}
.business-row,
.business-row > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.business-row {
  margin-top: 8px;
}
.dialog-tip {
  margin-bottom: 16px;
}
.supplement-context {
  margin-bottom: 16px;
}
.field-tip {
  margin-top: 6px;
  /* color: var(--el-text-color-secondary); */
  color: #e35454;
  font-size: 12px;
}
</style>
