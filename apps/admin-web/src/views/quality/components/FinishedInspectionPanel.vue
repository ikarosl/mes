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
      <div class="form-layout">
        <div class="form-main">
          <InlineHint class="form-context">
            正在填写本轮检验。<strong>现场实测量独立填写</strong>；产线申报仅供核对，保存后不会回写草稿。
          </InlineHint>
          <h3>检查事实</h3>
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
          <InlineHint class="quantity-help">
            <template v-if="isSampling"
              >样本检查数 =
              <strong>样本合格数 + 样本不合格数</strong>；仅记录实检样本，不推算整批数量。</template
            >
            <template v-else
              >检查数 = <strong>合格数 + 不合格数</strong>；按现场实检填写。</template
            >
          </InlineHint>
          <h3>明确结论与下一步</h3>
          <el-form-item
            label="本批处理结论"
            required
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
            >放行后由产线管理员核对产出清单并送负责人审批；待复检或不放行继续阻断。</InlineHint
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
        <aside class="reference-panel">
          <h3>本轮核对参考</h3>
          <el-descriptions
            :column="1"
            border
            size="small"
          >
            <el-descriptions-item label="本轮建立时已入">
              {{ baselineReceived === null ? '尚未固定' : baselineReceived + ' 件' }}
            </el-descriptions-item>
            <el-descriptions-item label="本轮建立时剩余">
              {{
                detail.startingDeclaredRemaining === null
                  ? '尚未固定'
                  : Number(detail.startingDeclaredRemaining) + ' 件'
              }}
            </el-descriptions-item>
            <el-descriptions-item label="产线申报累计目标"
              >{{ declaredCumulative }} 件</el-descriptions-item
            >
            <el-descriptions-item label="其中计划内 / 外"
              >{{ declared.availableQuantity }} /
              {{ declared.extraQuantity }} 件</el-descriptions-item
            >
            <el-descriptions-item label="另行申报新增报废"
              >{{ declared.additionalScrapQuantity }} 件</el-descriptions-item
            >
            <el-descriptions-item :label="isSampling ? '本次实检样本' : '本次实检总数'"
              >{{ inspectedTotal
              }}<template v-if="typeof inspectedTotal === 'number'">
                件</template
              ></el-descriptions-item
            >
            <el-descriptions-item :label="isSampling ? '样本合格 / 不合格' : '实检合格 / 不合格'">
              <template
                v-if="
                  inspection.qualifiedQuantity !== undefined &&
                  inspection.unqualifiedQuantity !== undefined
                "
              >
                <InspectionQuantity
                  :value="inspection.qualifiedQuantity"
                  kind="qualified"
                  unit="件"
                />
                /
                <InspectionQuantity
                  :value="inspection.unqualifiedQuantity"
                  kind="unqualified"
                  unit="件"
                />
              </template>
              <template v-else>请填写数量</template>
            </el-descriptions-item>
          </el-descriptions>
          <InlineHint class="reference-help"
            >产出仍须单独核对审批；不合格不自动登记报废。</InlineHint
          >
        </aside>
      </div>
    </el-form>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import InlineHint from '../../../components/InlineHint.vue';
import InspectionQuantity from './InspectionQuantity.vue';
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
    return '本轮检验已完成，可前往产出清单核对数量与检验引用。';
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
.quantity-fields {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 32px;
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
  margin-bottom: 16px;
}
.form-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  align-items: start;
  gap: 24px;
}
.form-main {
  min-width: 0;
}
.form-main h3:not(:first-child) {
  margin-top: 20px;
}
.reference-panel {
  position: sticky;
  top: 0;
  min-width: 0;
}
.reference-panel :deep(.el-descriptions__label) {
  width: 120px;
}
.reference-help {
  margin-top: 12px;
}
.quantity-help {
  margin-top: 12px;
}
.section-hint {
  margin-top: 12px;
}
.notice {
  margin-top: 12px;
}
@media (max-width: 820px) {
  .form-layout {
    grid-template-columns: 1fr;
  }
  .reference-panel {
    position: static;
  }
}
</style>
