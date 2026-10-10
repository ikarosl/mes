<template>
  <el-dialog
    :model-value="modelValue"
    title="批量冲销已选清单"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="selection-heading">
      <strong>已选 {{ selections.length }} 条 / {{ selectedStepCount }} 道工序</strong>
      <span v-if="batchNo">{{ batchNo }}</span>
    </div>
    <InlineHint
      >跨工序、分页保留本任务已选报工，最多
      {{ MAX_BATCH_STEP_REPORT_REVERSALS }} 条。关闭清单继续保留选择；修改后须重新预览。</InlineHint
    >
    <el-alert
      v-if="locked"
      class="selection-notice"
      title="批量提交结果尚未确认，已选清单及原请求继续保留，暂不能修改选择。"
      type="warning"
      :closable="false"
      show-icon
    />
    <div class="selection-tools">
      <el-button
        link
        type="primary"
        :disabled="locked || !selections.length"
        @click="$emit('clear')"
        >清空选择</el-button
      >
      <el-button
        link
        type="primary"
        :disabled="locked || refreshing || !selections.length"
        @click="$emit('refresh')"
        >刷新所选依据</el-button
      >
    </div>
    <el-table
      :data="selections"
      row-key="reportId"
      empty-text="尚未选择报工"
    >
      <el-table-column
        label="工序"
        min-width="150"
        ><template #default="{ row }"
          >{{ row.stepOrder }}. {{ row.stepName }}</template
        ></el-table-column
      >
      <el-table-column
        label="报工单号"
        min-width="190"
        ><template #default="{ row }">{{ row.report.reportNo }}</template></el-table-column
      >
      <el-table-column
        label="数量（正常／异常）"
        min-width="170"
        ><template #default="{ row }"
          >{{ formatQuantity(row.report.normalQuantity) }} /
          {{ formatQuantity(row.report.abnormalQuantity) }} {{ row.report.unit }}</template
        ></el-table-column
      >
      <el-table-column
        label="操作"
        width="80"
        ><template #default="{ row }"
          ><el-button
            link
            type="danger"
            :disabled="locked"
            @click="$emit('remove-report', row.reportId)"
            >移除</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭清单</el-button>
      <el-tooltip
        :disabled="canPreview"
        :content="locked ? '请先核对未确认结果' : previewBlockedReason || '当前不可批量冲销'"
      >
        <span class="preview-button"
          ><el-button
            type="danger"
            plain
            :disabled="!canPreview"
            @click="$emit('preview')"
            >预览批量冲销</el-button
          ></span
        >
      </el-tooltip>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MAX_BATCH_STEP_REPORT_REVERSALS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import type { SelectedProductionReport } from '../production-report-selection';
import { formatQuantity } from '../production-status';

defineOptions({ name: 'ProductionReportSelectionDialog' });
const props = defineProps<{
  modelValue: boolean;
  batchNo: string | null;
  selections: SelectedProductionReport[];
  locked: boolean;
  refreshing: boolean;
  canPreview: boolean;
  previewBlockedReason: string | null;
}>();
defineEmits<{
  'update:modelValue': [open: boolean];
  'remove-report': [id: string];
  clear: [];
  refresh: [];
  preview: [];
}>();
const selectedStepCount = computed(
  () => new Set(props.selections.map((selection) => selection.stepRecordId)).size,
);
</script>

<style scoped>
.selection-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.selection-heading > span {
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.selection-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0 8px;
}
.selection-tools :deep(.el-button + .el-button) {
  margin-left: 0;
}
.selection-notice {
  margin-top: 12px;
}
.preview-button {
  display: inline-block;
  margin-left: 12px;
}
</style>
