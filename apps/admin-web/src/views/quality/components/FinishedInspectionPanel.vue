<template>
  <section>
    <div class="toolbar">
      <p class="muted">质检仅留存当时记录，不改写产线草稿。复检新增记录，历史记录不可覆盖。</p>
      <el-button
        type="primary"
        :disabled="
          !detail.canRecordInspection || busy || unresolved || Boolean(error) || inspectionOpen
        "
        @click="$emit('start')"
        >{{ detail.latestInspectionId ? '新增复检记录' : '登记线下质检' }}</el-button
      >
    </div>
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
      description="请核实本轮是否确无可送检产出并填写真实说明和凭据；已单独登记的报废不再次计入送检范围。零产出不得伪装为抽检，零量清单不办理成品入库。"
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
      <p>
        本次留存申报版本 {{ declaredVersion }}：计划内 {{ declared.availableQuantity }} / 计划外
        {{ declared.extraQuantity }} / 新增报废 {{ declared.additionalScrapQuantity }}。
      </p>
      <el-form-item
        label="检验方式"
        required
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
          v-if="isSampling"
          label="核实的整批实际送检总数"
          required
        >
          <el-input-number
            :model-value="inspection.coveredQuantity"
            :min="1"
            :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
            :precision="0"
            placeholder="按现场核实填写"
            @update:model-value="
              (value: number | undefined) => $emit('change', { coveredQuantity: value })
            "
          />
        </el-form-item>
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
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item
          :label="isSampling ? '样本检查总数（自动计算）' : '实际检查总数（自动计算）'"
          >{{ inspectedTotal }}</el-descriptions-item
        >
        <el-descriptions-item label="整批实际送检总数">{{ actualTotal }}</el-descriptions-item>
      </el-descriptions>
      <p class="muted">
        全检总数由合格数加不合格数计算。抽检的样本检查总数不得超过整批实际送检总数；实际总数按现场核实填写，可以与申报草稿不同。
      </p>
      <el-alert
        v-if="difference !== null && difference !== 0"
        type="warning"
        show-icon
        :closable="false"
        class="notice"
        :title="`实际送检总数与产线申报相差 ${difference > 0 ? '+' : ''}${difference} 件`"
        :description="`当时申报可送检 ${declaredTotal} 件，现场核实 ${actualTotal} 件。请在检验结果说明中记录差异；本次检验不会修改产线草稿。`"
      />
      <el-alert
        v-if="sampleExceedsTotal"
        type="warning"
        :closable="false"
        title="样本合格数与不合格数之和不能超过整批实际送检总数"
        class="notice"
      />
      <el-form-item
        label="本批处理结论"
        required
      >
        <span v-if="isZeroConfirmation">确认无送检产出，本次建议量为 0</span>
        <el-select
          v-else
          :model-value="inspection.releaseDecision"
          @update:model-value="
            (value: ProductionOutputReleaseDecision) => $emit('change', { releaseDecision: value })
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
      <el-alert
        :title="`本次检验建议量：${releasedQuantity}`"
        description="明确放行时，全检建议量为合格数，抽检建议量为实际送检总数减样本不合格数。数量差异不限制产出定稿；待复检或不放行仍阻断结案。不合格不自动登记报废。"
        type="info"
        :closable="false"
        class="notice"
      />
      <el-form-item
        label="线下检验时间"
        required
        ><el-date-picker
          :model-value="inspection.inspectedAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          @update:model-value="
            (value: string | null) => $emit('change', { inspectedAt: value ?? '' })
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
      <div class="toolbar">
        <el-button @click="$emit('discard')">放弃填写</el-button
        ><el-button
          type="primary"
          :disabled="!inspectionValid || inspectionStale"
          :loading="submitting"
          @click="$emit('record')"
          >留存本次质检记录</el-button
        >
      </div>
    </el-form>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
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
import {
  inspectionFormQuantities,
  type ProductionOutputInspectionForm,
} from '../finished-inspection';
const props = defineProps<{
  detail: FinishedInspectionTaskDetail;
  declared: ProductionOutputQuantities;
  declaredVersion: number | null;
  inspection: ProductionOutputInspectionForm;
  inspectionOpen: boolean;
  inspectionStale: boolean;
  inspectionValid: boolean;
  busy: boolean;
  unresolved: boolean;
  error: string;
  submitting: boolean;
}>();
const isSampling = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[1],
);
const isZeroConfirmation = computed(
  () => props.inspection.inspectionMethod === PRODUCTION_OUTPUT_INSPECTION_METHODS[2],
);
const inspectionQuantitiesAreZero = computed(
  () => props.inspectionOpen && isZeroConfirmation.value,
);
const quantities = computed(() => inspectionFormQuantities(props.inspection));
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
const actualTotal = computed(() => {
  if (!isSampling.value) return inspectedTotal.value;
  const covered = props.inspection.coveredQuantity;
  if (covered === undefined) return '请填写数量';
  return Number.isSafeInteger(covered) && covered > 0 && covered <= PRODUCTION_OUTPUT_QUANTITY_MAX
    ? covered
    : '请核对数量';
});
const declaredTotal = computed(
  () => props.declared.availableQuantity + props.declared.extraQuantity,
);
const difference = computed(() =>
  typeof actualTotal.value === 'number' ? actualTotal.value - declaredTotal.value : null,
);
const sampleExceedsTotal = computed(
  () =>
    isSampling.value &&
    typeof inspectedTotal.value === 'number' &&
    typeof actualTotal.value === 'number' &&
    inspectedTotal.value > actualTotal.value,
);
const releasedQuantity = computed(() =>
  !quantities.value
    ? '请核对数量'
    : props.inspection.releaseDecision === PRODUCTION_OUTPUT_RELEASE_DECISIONS[0]
      ? quantities.value.releasedQuantity
      : '未放行',
);
defineEmits<{
  start: [];
  record: [];
  discard: [];
  change: [Partial<ProductionOutputInspectionForm>];
}>();
</script>
<style scoped>
.toolbar,
.quantity-fields {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.quantity-fields {
  justify-content: flex-start;
  gap: 32px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.inspection-form {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}
.notice {
  margin-top: 12px;
}
</style>
