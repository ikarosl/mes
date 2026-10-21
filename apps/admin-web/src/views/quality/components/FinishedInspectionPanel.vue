<template>
  <section>
    <InlineHint
      v-if="!inspectionOpen"
      class="section-hint"
    >
      {{ handlingHint }}
    </InlineHint>
    <el-alert
      v-if="inspectionStale"
      title="申报内容已被其他操作更新，请放弃本次填写后重新登记质检。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-alert
      v-if="inspectionQuantitiesAreZero"
      title="零数量也需质检确认"
      description="零产出请按零产出确认填写说明和凭据，不使用抽检方式，也不办理入库。已单独登记的报废不再次计入送检范围。"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />
    <el-form
      v-if="inspectionOpen"
      label-position="top"
      :disabled="busy || unresolved || Boolean(error)"
      class="inspection-form"
    >
      <div class="form-main">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="production-reference"
        >
          <el-descriptions-item label="已有入库">
            <template v-if="baselineReceived !== null">
              <strong class="quantity-value">{{ baselineReceived }}</strong> 件
            </template>
            <template v-else>尚未固定</template>
          </el-descriptions-item>
          <el-descriptions-item label="产线申报数量">
            <strong class="quantity-value">{{ declaredCumulative }}</strong> 件
          </el-descriptions-item>
        </el-descriptions>
        <InlineHint class="form-context">
          正在填写本轮检验。<strong>现场实测量独立填写</strong>；产线申报仅供核对，保存后不会回写草稿。
        </InlineHint>
        <h3>检查结果</h3>
        <div class="inspection-fields">
          <el-form-item
            label="检验方式"
            required
            class="method-field"
          >
            <el-select
              :model-value="inspection.inspectionMethod"
              @update:model-value="
                (value: ProductionOutputInspectionMethod) =>
                  $emit('change', { inspectionMethod: value })
              "
            >
              <el-option
                v-for="method in PRODUCTION_OUTPUT_INSPECTION_METHODS"
                :key="method"
                :value="method"
                :label="PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS[method]"
              />
            </el-select>
          </el-form-item>
          <div class="quantity-fields">
            <el-form-item
              :label="isSampling ? '样本合格数' : '合格数'"
              required
            >
              <el-input-number
                :model-value="inspection.qualifiedQuantity"
                :min="0"
                :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
                :precision="0"
                :disabled="isZeroConfirmation"
                @update:model-value="
                  (value: number | undefined) => $emit('change', { qualifiedQuantity: value })
                "
              />
            </el-form-item>
            <el-form-item
              :label="isSampling ? '样本不合格数' : '不合格数'"
              required
            >
              <el-input-number
                :model-value="inspection.unqualifiedQuantity"
                :min="0"
                :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
                :precision="0"
                :disabled="isZeroConfirmation"
                @update:model-value="
                  (value: number | undefined) => $emit('change', { unqualifiedQuantity: value })
                "
              />
            </el-form-item>
          </div>
        </div>
        <InlineHint class="quantity-help">
          {{ isSampling ? '样本总数' : '检查总数' }}：
          <template v-if="typeof inspectedTotal === 'number'">
            <strong class="quantity-value">{{ inspectedTotal }}</strong> 件
          </template>
          <template v-else>{{ inspectedTotal }}</template>
          <span v-if="isSampling">；仅记录实检样本，不推算整批数量。</span>
        </InlineHint>
        <h3>明确结论与下一步</h3>
        <el-form-item
          label="本批处理结论"
          required
          class="decision-field"
        >
          <span v-if="isZeroConfirmation">确认无可检成品，检查数为 0</span>
          <el-select
            v-else
            :model-value="inspection.releaseDecision"
            placeholder="请选择处理结论"
            @update:model-value="
              (value: ProductionOutputReleaseDecision) =>
                $emit('change', { releaseDecision: value })
            "
          >
            <el-option
              v-for="decision in PRODUCTION_OUTPUT_RELEASE_DECISIONS"
              :key="decision"
              :value="decision"
              :label="PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[decision]"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="isZeroConfirmation"
          label="零产出核实"
          required
        >
          <el-checkbox
            :model-value="inspection.zeroConfirmed"
            @update:model-value="(value: boolean) => $emit('change', { zeroConfirmed: value })"
            >已核实本轮没有可检成品，确认检查数为 0</el-checkbox
          >
        </el-form-item>
        <InlineHint class="quantity-help"
          >放行后，请返回产出清单选择本次质检记录并保存。完成收尾和物料核对后可提交审批；待复检或未放行时暂不能提交。不合格不自动登记报废。</InlineHint
        >
        <h3>检验时间与凭据</h3>
        <el-form-item
          label="线下检验时间"
          required
          ><el-date-picker
            :model-value="toBeijingDateTimeInputValue(inspection.inspectedAt)"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            @update:model-value="
              (value: string | null) =>
                $emit('change', { inspectedAt: fromBeijingDateTimeInputValue(value) })
            "
        /></el-form-item>
        <el-form-item
          label="检验结果说明"
          required
          ><el-input
            :model-value="inspection.resultNote"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            @update:model-value="(value: string) => $emit('change', { resultNote: value ?? '' })"
        /></el-form-item>
        <el-form-item
          label="凭据编号 / 存放位置"
          required
          ><el-input
            :model-value="inspection.evidenceReference"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            required
            placeholder="必填：线下质检单编号或凭据存放位置，零产出确认也需填写"
            @update:model-value="
              (value: string) => $emit('change', { evidenceReference: value ?? '' })
            "
        /></el-form-item>
      </div>
    </el-form>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import InlineHint from '../../../components/InlineHint.vue';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import type {
  FinishedInspectionTaskDetail,
  ProductionOutputQuantities,
  ProductionOutputInspectionMethod,
  ProductionOutputReleaseDecision,
} from '@company/contracts';
import {
  PRODUCTION_OUTPUT_QUANTITY_MAX,
  PRODUCTION_OUTPUT_INSPECTION_METHODS,
  PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS,
  PRODUCTION_OUTPUT_RELEASE_DECISIONS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
} from '@company/constants';
import type { ProductionOutputInspectionForm } from '../finished-inspection';
const props = defineProps<{
  detail: FinishedInspectionTaskDetail;
  declared: ProductionOutputQuantities;
  baselineReceived: number | null;
  inspection: ProductionOutputInspectionForm;
  inspectionOpen: boolean;
  inspectionStale: boolean;
  busy: boolean;
  unresolved: boolean;
  error: string;
}>();
const handlingHint = computed(() => {
  if (props.detail.canRecordInspection) return '本轮已开始，可继续填写检验结果。';
  if (props.detail.canStartInspection) return '本轮送检范围已固定；开始检验后可填写检验结果。';
  if (props.detail.nextAction === 'review_output')
    return '本轮检验已完成。请返回产出清单核对数量、明确引用本次适用记录并保存，再完成收尾与物料核对后提交审批。';
  if (props.detail.nextAction === 'start_reinspection')
    return '本轮检验结果已留存。需要重新检查时，请开始复检并登记新一轮结果。';
  if (props.detail.nextAction === 'view_approval') return '清单正在审批，检验记录可在历史中查看。';
  if (props.detail.nextAction === 'save_draft') return '请先保存产出草稿，再开始本轮检验。';
  return '检验记录已留存，可在检验历史中查看明细。';
});
const isSampling = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[1],
);
const isZeroConfirmation = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[2],
);
const inspectionQuantitiesAreZero = computed(
  () => props.inspectionOpen && isZeroConfirmation.value,
);
const inspectedTotal = computed(() => {
  const qualified = props.inspection.qualifiedQuantity;
  const unqualified = props.inspection.unqualifiedQuantity;
  if (qualified === undefined || unqualified === undefined) return '请填写数量';
  const total = qualified + unqualified;
  return [qualified, unqualified].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    total <= PRODUCTION_OUTPUT_QUANTITY_MAX
    ? total
    : '请核对数量';
});
const declaredCumulative = computed(
  () => props.declared.availableQuantity + props.declared.extraQuantity,
);
defineEmits<{ change: [Partial<ProductionOutputInspectionForm>] }>();
</script>
<style scoped>
.inspection-fields,
.quantity-fields {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 32px;
}
.method-field {
  width: 240px;
  max-width: 100%;
}
.decision-field {
  width: 480px;
  max-width: 100%;
}
.inspection-form {
  margin-top: 12px;
}
.inspection-form h3 {
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
  font-size: 15px;
}
.form-context {
  margin-top: 12px;
  margin-bottom: 16px;
}
.form-main {
  min-width: 0;
}
.form-main h3:not(:first-child) {
  margin-top: 20px;
}
.production-reference :deep(.el-descriptions__label) {
  width: 120px;
}
.quantity-help {
  --hint-strong-color: var(--el-color-primary);
  margin-top: 12px;
}
.quantity-value {
  color: var(--el-color-primary);
  font-weight: 600;
}
.section-hint {
  margin-top: 12px;
}
.notice {
  margin-top: 12px;
}
</style>
