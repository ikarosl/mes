<template>
  <el-form
    label-width="120px"
    :disabled="disabled"
    @submit.prevent
  >
    <el-form-item
      label="检验方式"
      required
    >
      <el-radio-group v-model="model.inspectionMethod">
        <el-radio
          v-for="method in QUALITY_INBOUND_METHODS"
          :key="method"
          :value="method"
          >{{ QUALITY_INSPECTION_METHOD_LABELS[method] }}</el-radio
        >
      </el-radio-group>
    </el-form-item>
    <div class="inspection-fields-grid">
      <el-form-item
        :label="model.inspectionMethod === 'sampling' ? '样本合格数' : '合格数'"
        required
      >
        <div class="quantity-field">
          <el-input-number
            :key="disabled ? 'qualified-locked' : 'qualified-ready'"
            v-model="model.qualifiedQuantity"
            :precision="0"
            :min="0"
            :max="PURCHASE_ORDER_MAX_QUANTITY"
            controls-position="right"
          />
          <span>{{ unit }}</span>
        </div>
      </el-form-item>
      <el-form-item
        :label="model.inspectionMethod === 'sampling' ? '样本不合格数' : '不合格数'"
        required
      >
        <div class="quantity-field">
          <el-input-number
            :key="disabled ? 'unqualified-locked' : 'unqualified-ready'"
            v-model="model.unqualifiedQuantity"
            :precision="0"
            :min="0"
            :max="PURCHASE_ORDER_MAX_QUANTITY"
            controls-position="right"
          />
          <span>{{ unit }}</span>
        </div>
      </el-form-item>
    </div>
    <InlineHint class="inspection-preview">
      {{ model.inspectionMethod === 'sampling' ? '样本总数' : '检查总数' }}：
      <strong v-if="preview">{{ preview.inspectedQuantity }} {{ unit }}</strong>
      <template v-else>请填写有效数量</template>。
      <template v-if="model.inspectionMethod === 'sampling'">抽检只填写本次样本数量。</template>
      检验报告与实际入库分别办理。
    </InlineHint>
    <div class="inspection-fields-grid">
      <el-form-item
        label="检验日期"
        required
      >
        <el-date-picker
          :model-value="toBeijingDateTimeInputValue(model.inspectedAt)"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          @update:model-value="model.inspectedAt = fromBeijingDateTimeInputValue($event)"
        />
      </el-form-item>
      <el-form-item label="有效期（选填）">
        <el-date-picker
          v-model="model.expiresOn"
          type="date"
          value-format="YYYY-MM-DD"
          clearable
        />
      </el-form-item>
    </div>
    <el-form-item label="规格型号（选填）">
      <el-input
        v-model="model.specification"
        :maxlength="QUALITY_INCOMING_INSPECTION_REPORT_HEADER_MAX_LENGTH"
      />
    </el-form-item>
    <el-form-item
      label="检查记录"
      required
      :error="inspectionDetailsError"
    >
      <div class="inspection-details">
        <JsonTableEditor
          v-model="model.inspectionDetails"
          :disabled="disabled || applyingTemplate"
        >
          <template #actions>
            <div class="template-actions">
              <el-button
                :disabled="!canUseTemplates || applyingTemplate"
                @click="chooseTemplate"
                >应用模板</el-button
              >
              <span
                v-if="!canViewTemplates"
                class="template-permission-hint"
                >需系统模板查看权限</span
              >
            </div>
          </template>
        </JsonTableEditor>
      </div>
    </el-form-item>
    <el-form-item label="异常说明（选填）">
      <el-input
        v-model="model.remark"
        type="textarea"
        :rows="2"
        :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
        show-word-limit
      />
    </el-form-item>
    <el-form-item label="检查凭据（选填）">
      <el-input
        v-model="model.evidence"
        type="textarea"
        :rows="2"
        :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
      />
    </el-form-item>
    <el-form-item
      v-if="model.previousRecordId"
      label="更正原因"
      required
    >
      <el-input
        v-model="model.correctionReason"
        type="textarea"
        :rows="2"
        :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
        show-word-limit
      />
    </el-form-item>
  </el-form>
  <BusinessTemplatePicker
    v-if="canViewTemplates"
    v-model:visible="templatesVisible"
    @apply="applyTemplate"
  />
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { JsonTableData } from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  QUALITY_INBOUND_METHODS,
  QUALITY_INSPECTION_METHOD_LABELS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  QUALITY_INCOMING_INSPECTION_REPORT_HEADER_MAX_LENGTH,
} from '@company/constants';
import { normalizeJsonTable } from '@company/utils';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import InlineHint from '../../../components/InlineHint.vue';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { BusinessTemplatePicker } from '../../template/public';
import {
  inboundInspectionPreview,
  normalizeInboundInspectionDetails,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';

const model = defineModel<InboundInspectionDraft>({ required: true });
const props = defineProps<{ disabled: boolean; unit: string; active: boolean }>();
const preview = computed(() => inboundInspectionPreview(model.value));
const inspectionDetailsError = computed(() => {
  try {
    normalizeInboundInspectionDetails(model.value.inspectionDetails);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '请核对检查记录';
  }
});
const lifecycleActive = ref(true);
const canEdit = computed(() => props.active && lifecycleActive.value && !props.disabled);
const { canAccessRoute } = useRouteAccess();
const canViewTemplates = computed(() => canAccessRoute({ name: 'system-templates' }));
const canUseTemplates = computed(() => canEdit.value && canViewTemplates.value);
const templatesVisible = ref(false);
const applyingTemplate = ref(false);
let templateTarget: InboundInspectionDraft | null = null;
let selectionRevision = 0;
function invalidateTemplateSelection(): void {
  selectionRevision += 1;
  templateTarget = null;
  templatesVisible.value = false;
}
function chooseTemplate(): void {
  if (!canUseTemplates.value || applyingTemplate.value) return;
  selectionRevision += 1;
  templateTarget = model.value;
  templatesVisible.value = true;
}
async function applyTemplate(content: JsonTableData): Promise<void> {
  const target = templateTarget;
  if (!canUseTemplates.value || !target || target !== model.value || applyingTemplate.value) return;
  const previous = target.inspectionDetails;
  const revision = selectionRevision;
  let replacement: JsonTableData;
  try {
    replacement = normalizeJsonTable(content);
  } catch (error) {
    EMessage.error(error, '模板内容不可用');
    return;
  }
  applyingTemplate.value = true;
  try {
    if (previous.columns.length) {
      try {
        await RouteMessageBox.confirm('应用模板会替换当前所有列及内容，确认继续？', '应用模板', {
          type: 'warning',
          confirmButtonText: '替换内容',
        });
      } catch {
        // 取消整表替换时保留原草稿。
        return;
      }
    }
    if (
      canUseTemplates.value &&
      selectionRevision === revision &&
      model.value === target &&
      target.inspectionDetails === previous
    )
      target.inspectionDetails = replacement;
  } finally {
    applyingTemplate.value = false;
  }
}
watch(canUseTemplates, (editable) => {
  if (!editable) invalidateTemplateSelection();
});
watch(() => model.value, invalidateTemplateSelection);
onActivated(() => (lifecycleActive.value = true));
onDeactivated(() => {
  lifecycleActive.value = false;
  invalidateTemplateSelection();
});
onScopeDispose(invalidateTemplateSelection);
</script>

<style scoped>
.inspection-fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.inspection-fields-grid :deep(.el-date-editor) {
  width: 100%;
}
.quantity-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.quantity-field .el-input-number {
  flex: 1;
  min-width: 0;
  width: 0;
}
.quantity-field > span {
  flex-shrink: 0;
}
.inspection-preview {
  margin: 0 0 16px 120px;
}
.inspection-details {
  width: 100%;
  min-width: 0;
}
.template-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.template-permission-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 1000px) {
  .inspection-fields-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
