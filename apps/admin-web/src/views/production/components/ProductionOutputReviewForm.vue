<template>
  <div class="review-layout">
    <section class="quantity-review">
      <div class="section-heading">
        <strong
          ><span
            v-if="detail.canEdit"
            class="section-step"
            >1</span
          >{{ detail.canEdit ? '填写产出草稿' : '清单产出数量' }}</strong
        >
        <span class="muted">单位：{{ detail.check.unit }}</span>
      </div>
      <p
        v-if="detail.canEdit"
        class="section-note"
      >
        先保存数量和说明，质检记录可在完成第 2 步后回来引用。数量有调整时须再次保存。
      </p>
      <el-form
        label-position="top"
        :disabled="locked"
        @submit.prevent
      >
        <div class="quantity-inputs">
          <el-form-item
            label="计划内累计目标"
            :error="quantityErrors.available"
            required
          >
            <el-input-number
              :model-value="draft.availableQuantity"
              :precision="0"
              controls-position="right"
              @update:model-value="changeQuantity('availableQuantity', $event)"
            />
            <span class="field-note"
              >已入 {{ detail.receipts.productionReceivedQuantity }}，计划上限
              {{ detail.check.plannedQuantity }}</span
            >
          </el-form-item>
          <el-form-item
            label="计划外累计目标"
            :error="quantityErrors.extra"
            required
          >
            <el-input-number
              :model-value="draft.extraQuantity"
              :precision="0"
              controls-position="right"
              @update:model-value="changeQuantity('extraQuantity', $event)"
            />
            <span class="field-note">历史已入 {{ detail.receipts.extraReceivedQuantity }}</span>
          </el-form-item>
        </div>
        <el-form-item
          label="本次新增成品报废"
          :error="quantityErrors.scrap"
          required
        >
          <el-input-number
            :model-value="draft.additionalScrapQuantity"
            :precision="0"
            controls-position="right"
            @update:model-value="changeQuantity('additionalScrapQuantity', $event)"
          />
          <span class="field-note"
            >历史工序报废
            {{
              detail.check.existingScrapQuantity
            }}；不合格不自动计为报废，不重复填写历史报废。</span
          >
        </el-form-item>
        <el-form-item
          label="产出说明 / 计划差异原因"
          required
        >
          <el-input
            :model-value="draft.reason"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            placeholder="说明实际产出情况，以及与任务计划不一致的原因"
            @update:model-value="$emit('change', { reason: $event })"
          />
        </el-form-item>
        <el-form-item
          label="物料安排说明"
          required
        >
          <el-input
            :model-value="draft.materialReviewNote"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            placeholder="先说明现场余料、耗用及后续安排；逐项实核后如有变化再补充"
            @update:model-value="$emit('change', { materialReviewNote: $event })"
          />
          <span
            v-if="detail.canEdit"
            class="field-note"
          >
            此处先保存安排说明；第 4 步仍须逐项核对物料，填写说明不代表已经完成实核。
          </span>
        </el-form-item>
      </el-form>
      <el-descriptions
        :column="1"
        size="small"
        border
        class="quantity-summary"
      >
        <el-descriptions-item label="拟定稿累计目标"
          ><strong>{{ formattedTotal }}</strong> {{ detail.check.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="本轮建立时已入">{{
          round
            ? `计划内 ${round.baselinePlannedReceived} / 计划外 ${round.baselineExtraReceived} ${detail.check.unit}`
            : '首份草稿尚未建立检验轮'
        }}</el-descriptions-item>
        <el-descriptions-item label="本轮拟新增可入库">
          <template v-if="round && proposedQuantity !== null">
            本次清单 {{ formattedTotal }} − 之前已入 {{ baselineReceived }} =
            <strong>{{ proposedQuantity }}</strong> {{ detail.check.unit }}
          </template>
          <template v-else>{{ round ? '待核对' : '保存草稿建立本轮后计算' }}</template>
        </el-descriptions-item>
        <el-descriptions-item label="入库数量提示">
          <InlineHint
            v-if="samplingNeedsReview"
            tone="warning"
            >{{ advice }}</InlineHint
          >
          <template v-else>{{ advice }}</template>
        </el-descriptions-item>
      </el-descriptions>
      <InlineHint class="notice"
        >数量差异只作核对提示；清单经负责人批准后才形成入库依据。</InlineHint
      >
    </section>
    <section
      ref="basisElement"
      class="inspection-basis"
    >
      <div class="section-heading">
        <strong
          ><span
            v-if="detail.canEdit"
            class="section-step"
            >3</span
          >{{ detail.canEdit ? '引用质检记录并保存' : '本清单采用的质检依据' }}</strong
        >
      </div>
      <p
        v-if="detail.canEdit"
        class="section-note"
      >
        请选择本次产出使用的质检记录，再保存草稿。
      </p>
      <div
        v-if="inspectionInProgress"
        class="inspection-status"
        role="status"
      >
        <strong>第 2 步进行中 · 本轮检验尚未完成</strong>
        <span>请在成品质检页完成并保存本轮结果，再回来引用；当前暂不能送审或入库。</span>
      </div>
      <InlineHint
        v-else-if="!detail.draft && detail.canEdit"
        class="notice"
      >
        先在左侧填写并保存产出草稿，再前往成品质检。首次保存无需选择质检记录。
      </InlineHint>
      <InlineHint
        v-else-if="!applicableInspection && detail.canEdit"
        tone="warning"
        class="notice"
      >
        第 2 步尚未完成：当前没有本次适用的放行记录，请先完成成品质检。
      </InlineHint>
      <el-form
        v-if="!inspectionInProgress && (applicableInspection || !detail.canEdit)"
        label-position="top"
        :disabled="locked"
        @submit.prevent
      >
        <el-form-item
          label="本次引用的质检记录"
          required
        >
          <el-select
            ref="inspectionSelector"
            :model-value="draft.inspectionRecordId"
            placeholder="请选择本次适用的放行记录"
            clearable
            @update:model-value="selectInspection"
          >
            <el-option
              v-for="record in inspectionOptions"
              :key="record.id"
              :value="record.id"
              :label="inspectionOptionLabel(record)"
              :disabled="record.id !== detail.applicableInspectionId"
            />
          </el-select>
          <span
            v-if="detail.canEdit && applicableInspection"
            class="field-note"
          >
            本次适用：检验记录 ID {{ applicableInspection.id }}；历史记录可查看，不能选为新依据。
          </span>
        </el-form-item>
      </el-form>
      <InlineHint
        v-if="invalidSelection"
        tone="warning"
        class="notice"
      >
        当前引用的检验记录 ID
        {{ draft.inspectionRecordId }}
        不可用于本次送审。请核对本轮最新适用记录，原选择不会自动替换。
      </InlineHint>
      <div
        v-if="
          applicableInspection &&
          selectedInspection?.id === applicableInspection.id &&
          detail.canEdit
        "
        class="reference-status"
        role="status"
      >
        <el-tag
          :type="referenceSaved ? 'success' : 'warning'"
          size="small"
        >
          {{ referenceSaved ? '引用已保存' : '已选择，尚未保存' }}
        </el-tag>
        <span>{{
          referenceSaved
            ? '其他产出填写若有变化，仍须再次保存。'
            : '请点击底部“保存引用与产出草稿”，再继续物料核对。'
        }}</span>
      </div>
      <FinishedInspectionRecordDetail
        v-if="displayInspection"
        :inspection="displayInspection"
        :column="1"
        :unit="detail.check.unit"
        :relationship="basisRelationship"
      />
      <p
        v-else
        class="empty-basis"
      >
        {{
          applicableInspection
            ? '尚未引用记录，请在上方选择后核对明细。'
            : '当前未引用质检记录；已有历史可在“质检记录”页签查看。'
        }}
      </p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SelectInstance } from 'element-plus';
import type {
  ProductionOutputDetail,
  ProductionOutputDraft,
  ProductionOutputInspection,
  ProductionOutputQuantities,
} from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import FinishedInspectionRecordDetail from '../../quality/components/FinishedInspectionRecordDetail.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
const props = defineProps<{
  detail: ProductionOutputDetail;
  draft: ProductionOutputDraft;
  locked: boolean;
  quantityErrors: { available: string; extra: string; scrap: string };
}>();
const emit = defineEmits<{ change: [Partial<ProductionOutputDraft>] }>();
const basisElement = ref<HTMLElement | null>(null);
const inspectionSelector = ref<SelectInstance | null>(null);
function focusInspection(): void {
  basisElement.value?.scrollIntoView({ block: 'nearest' });
  inspectionSelector.value?.focus();
}
defineExpose({ focusInspection });
const inspectionOptions = computed(() => [...props.detail.inspections].reverse());
function inspectionOptionLabel(record: ProductionOutputInspection): string {
  const relationship =
    record.id === props.detail.applicableInspectionId
      ? '最新，本次适用'
      : record.roundId === props.detail.currentRoundId && record.releaseDecision !== 'released'
        ? '本轮未放行，不可选'
        : '已过时，不可选';
  return `检验记录 ID ${record.id} · ${formatDateTimeForDisplay(record.inspectedAt)} · ${record.createdByName}（${relationship}）`;
}
function selectInspection(id: string | null | undefined): void {
  emit('change', { inspectionRecordId: id || null });
}
const selectedInspection = computed(
  () =>
    props.detail.inspections.find((record) => record.id === props.draft.inspectionRecordId) ?? null,
);
const applicableInspection = computed(
  () =>
    props.detail.inspections.find((record) => record.id === props.detail.applicableInspectionId) ??
    null,
);
const invalidSelection = computed(
  () =>
    props.detail.canEdit &&
    !!props.draft.inspectionRecordId &&
    props.draft.inspectionRecordId !== applicableInspection.value?.id,
);
const referenceSaved = computed(
  () =>
    !!props.draft.inspectionRecordId &&
    props.draft.inspectionRecordId === props.detail.draft?.inspectionRecordId,
);
const displayInspection = selectedInspection;
const basisRelationship = computed(() => {
  if (!displayInspection.value) return '尚未记录';
  if (!props.detail.canEdit) return '本清单引用记录';
  if (displayInspection.value.id !== applicableInspection.value?.id) return '仅供核对，不用于送审';
  return '已引用的适用依据';
});
const round = computed(() =>
  props.detail.rounds.find((row) => row.id === props.detail.currentRoundId),
);
const inspectionInProgress = computed(() => round.value?.status === 'inspecting');
const total = computed(() => props.draft.availableQuantity + props.draft.extraQuantity);
const formattedTotal = computed(() =>
  Number.isSafeInteger(total.value) ? String(total.value) : '待填写',
);
const baselineReceived = computed(
  () =>
    Number(round.value?.baselinePlannedReceived ?? 0) +
    Number(round.value?.baselineExtraReceived ?? 0),
);
const proposedQuantity = computed(() => {
  const planned = Number(round.value?.baselinePlannedReceived ?? 0);
  const extra = Number(round.value?.baselineExtraReceived ?? 0);
  return Number.isSafeInteger(total.value) &&
    props.draft.availableQuantity >= planned &&
    props.draft.extraQuantity >= extra
    ? total.value - baselineReceived.value
    : null;
});
const samplingNeedsReview = computed(() => {
  const record = selectedInspection.value;
  return (
    !!record &&
    (!props.detail.canEdit || record.id === applicableInspection.value?.id) &&
    record.releaseDecision === 'released' &&
    record.inspectionMethod === 'sampling' &&
    record.unqualifiedQuantity > 0
  );
});
const advice = computed(() => {
  const record = selectedInspection.value;
  if (!record || (props.detail.canEdit && record.id !== applicableInspection.value?.id))
    return '采用有效放行依据后比较';
  if (record.releaseDecision !== 'released') return '当前检验结论未放行，不作数量比较';
  if (record.inspectionMethod === 'sampling')
    return record.unqualifiedQuantity > 0
      ? `抽检已发现不合格 ${record.unqualifiedQuantity} ${props.detail.check.unit}，请核对拟入库数量是否已剔除；抽检结果不代表整批合格数量。`
      : '抽检样本未发现不合格，请按实际产出核对拟入库数量。';
  if (record.inspectionMethod === 'zero_confirmation')
    return '零量核实：本次检查、合格及不合格均为 0';
  if (record.inspectionMethod !== 'full') return '检验方式待核对';
  const originalReceived =
    Number(record.baselinePlannedReceived) + Number(record.baselineExtraReceived);
  if (!Number.isSafeInteger(total.value) || !Number.isSafeInteger(originalReceived))
    return '待核对数量';
  const proposedFromOriginalRound = total.value - originalReceived;
  const difference = proposedFromOriginalRound - record.qualifiedQuantity;
  return difference === 0
    ? `扣除原检验轮建立时已入 ${originalReceived} ${props.detail.check.unit} 后，与实检合格数一致`
    : `拟定稿累计目标扣除原检验轮建立时已入 ${originalReceived} ${props.detail.check.unit} 后，${difference > 0 ? '高于' : '低于'}实检合格数 ${Math.abs(difference)} ${props.detail.check.unit}（仅提示）`;
});
function changeQuantity(field: keyof ProductionOutputQuantities, value: number | undefined): void {
  emit('change', { [field]: value ?? Number.NaN });
}
</script>
<style scoped>
.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.inspection-basis {
  background: var(--el-bg-color);
  min-width: 0;
}
.quantity-review {
  min-width: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-heading strong {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.section-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-size: 12px;
}
.section-note,
.empty-basis {
  margin: 0 0 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
.empty-basis {
  padding: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
}
.reference-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.inspection-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--el-color-primary-light-7);
  border-left: 4px solid var(--el-color-primary);
  border-radius: var(--el-border-radius-base);
  background: var(--el-color-primary-light-9);
  line-height: 1.6;
}
.inspection-status strong {
  color: var(--el-color-primary-dark-2);
  font-size: 14px;
}
.inspection-status span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.quantity-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.quantity-inputs :deep(.el-input-number) {
  width: 100%;
}
.quantity-summary :deep(.el-descriptions__label) {
  width: 136px;
}
.field-note {
  display: block;
  width: 100%;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
  margin-top: 4px;
}
.notice {
  margin-bottom: 16px;
  margin-top: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 1200px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
}
</style>
