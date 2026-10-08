<template>
  <div class="review-layout">
    <section class="inspection-basis">
      <div class="section-heading">
        <strong>本次质检依据</strong>
      </div>
      <div
        v-if="inspectionInProgress"
        class="inspection-status"
        role="status"
      >
        <strong>检验办理中，暂不能送审 / 入库</strong>
        <span>在成品质检页完成并保存本轮结果后，再回到此处核对采用依据。</span>
      </div>
      <el-form
        v-else
        label-position="top"
        :disabled="locked"
        class="basis-selector"
      >
        <el-form-item
          label="本次引用的质检记录"
          required
        >
          <el-select
            :model-value="draft.inspectionRecordId"
            placeholder="请选择本次引用的最新检验记录"
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
        </el-form-item>
      </el-form>
      <InlineHint
        v-if="invalidSelection"
        tone="warning"
        class="notice"
      >
        当前引用不可用于本次送审。请核对最新记录与本轮办理状态，原选择不会自动替换。
      </InlineHint>
      <template v-if="displayInspection">
        <FinishedInspectionRecordDetail
          :inspection="displayInspection"
          :column="1"
          :unit="detail.check.unit"
          :relationship="basisRelationship"
        />
        <InlineHint
          v-if="
            applicableInspection &&
            selectedInspection?.id === applicableInspection.id &&
            detail.canEdit
          "
          class="notice"
          >已引用此检验；修改后的引用随产出草稿保存。</InlineHint
        >
      </template>
      <p
        v-else-if="inspectionInProgress"
        class="muted"
      >
        当前未引用检验记录；历史记录可在“质检记录”页签查看。
      </p>
      <el-empty
        v-else
        :description="
          applicableInspection
            ? '尚未引用质检记录，请在上方选择本次适用记录'
            : detail.inspections.length
              ? '尚未引用质检记录，历史记录可在质检记录页签查看'
              : '尚无检验记录，可先保存产出草稿，再前往质检'
        "
        :image-size="64"
      />
      <InlineHint
        v-if="!inspectionInProgress && !applicableInspection && detail.canEdit"
        tone="warning"
        class="notice"
        >当前没有可用于本次送审的放行依据。可保存草稿，完成质检后再核对引用。</InlineHint
      >
    </section>
    <section class="quantity-review">
      <div class="section-heading">
        <strong>产出数量核对</strong><span class="muted">单位：{{ detail.check.unit }}</span>
      </div>
      <el-form
        label-position="top"
        :disabled="locked"
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
        <el-descriptions
          :column="1"
          size="small"
          border
          class="notice"
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
            @update:model-value="$emit('change', { reason: $event })"
          />
        </el-form-item>
        <el-form-item
          label="物料核对总结及后续安排"
          required
        >
          <el-input
            :model-value="draft.materialReviewNote"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            @update:model-value="$emit('change', { materialReviewNote: $event })"
          />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="detail.blockers.length && detail.canEdit"
        type="warning"
        :closable="false"
        title="送审前仍需处理"
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
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
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
const inspectionOptions = computed(() => [...props.detail.inspections].reverse());
function inspectionOptionLabel(record: ProductionOutputInspection): string {
  const relationship =
    record.id === props.detail.applicableInspectionId
      ? '最新，本次适用'
      : record.roundId === props.detail.currentRoundId && record.releaseDecision !== 'released'
        ? '本轮未放行，不可选'
        : '已过时，不可选';
  return `质检记录：id ${record.id} · ${formatDateTimeForDisplay(record.inspectedAt)} · ${record.createdByName}（${relationship}）`;
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
    !!selectedInspection.value &&
    selectedInspection.value.id !== applicableInspection.value?.id,
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 24px;
  align-items: start;
}
.inspection-basis {
  position: sticky;
  top: 0;
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
.blockers {
  padding-left: 18px;
  margin: 4px 0;
}
@media (max-width: 1200px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
  .inspection-basis {
    position: static;
  }
}
</style>
