<template>
  <el-dialog
    :model-value="visible"
    title="批量绑定单件刻码"
    :width="DialogWidth.lg"
    :before-close="discard"
  >
    <div
      v-if="bindingTarget"
      class="batch-binding-preview"
    >
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item label="任务">{{ bindingTarget.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="追踪卡"
          ><strong>{{ bindingTarget.cardNo }}</strong></el-descriptions-item
        >
        <el-descriptions-item label="登记人员">{{
          bindingTarget.personnelName
        }}</el-descriptions-item>
        <el-descriptions-item label="待绑量"
          ><strong>{{ bindingTarget.remaining }}</strong></el-descriptions-item
        >
      </el-descriptions>
      <el-form
        class="range-form"
        label-position="top"
        @submit.prevent="applyEnd"
      >
        <el-form-item label="起始号">
          <el-input
            :model-value="bindingTarget.startCode"
            disabled
          />
        </el-form-item>
        <el-form-item label="结束号">
          <el-input
            v-model="endInput"
            inputmode="numeric"
            maxlength="32"
            :disabled="locked"
            :aria-invalid="Boolean(endError)"
            aria-describedby="batch-mark-end-feedback"
            @blur="normalizeEnd"
          />
          <el-text
            id="batch-mark-end-feedback"
            role="status"
            type="danger"
            size="small"
          >
            {{ endError }}
          </el-text>
        </el-form-item>
        <el-button
          native-type="submit"
          :disabled="locked || Boolean(endError) || !hasUnappliedEnd"
          >更新预览</el-button
        >
      </el-form>
      <div
        v-if="range"
        class="range-summary"
      >
        <div role="status">
          共 <strong>{{ range.length.toString() }}</strong> 个，已选
          <strong>{{ selectedCount.toString() }}</strong> 个，已移除
          <strong>{{ excludedInRange.length }}</strong> 个
        </div>
        <el-button
          link
          type="primary"
          :disabled="locked || previewLoading"
          @click="checkPreview(true)"
        >
          重新查重
        </el-button>
      </div>
      <InlineHint
        v-if="countError"
        tone="warning"
        >{{ countError }}</InlineHint
      >
      <InlineHint
        v-if="occupiedInSelection.length"
        tone="warning"
      >
        已选刻码中有 {{ occupiedInSelection.length }} 个已被占用，请移除后保存。
        <el-button
          link
          type="primary"
          :disabled="busy"
          @click="showOccupiedCode"
          >查看占用刻码</el-button
        >
      </InlineHint>
      <InlineHint
        v-if="needsRefresh"
        tone="warning"
      >
        请重新核对追踪卡后保存。
        <el-button
          link
          type="primary"
          :loading="refreshingTarget"
          :disabled="locked"
          @click="refreshTarget"
        >
          核对当前卡
        </el-button>
      </InlineHint>
      <el-alert
        v-if="previewError || feedback"
        :title="feedback || previewError"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="rows.length">
        <el-table
          :data="rows"
          row-key="code"
        >
          <el-table-column
            prop="code"
            label="单件刻码"
            min-width="290"
          />
          <el-table-column
            label="占用状态"
            min-width="130"
          >
            <template #default="{ row }">
              <el-tag
                v-if="row.occupied"
                type="danger"
                >已占用</el-tag
              >
              <span v-else-if="row.checked">可用</span>
              <span v-else>{{ previewLoading ? '查重中' : '待查重' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="本次绑定"
            min-width="100"
          >
            <template #default="{ row }">{{ row.excluded ? '已移除' : '已选' }}</template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="100"
          >
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="locked"
                @click="toggleExcluded(row.code)"
              >
                {{ row.excluded ? '恢复' : '移除' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div
          v-if="hasPreviousPage || hasNextPage"
          class="range-pagination"
        >
          <el-button
            :disabled="!hasPreviousPage || busy"
            @click="movePage(-1)"
            >上一页</el-button
          >
          <el-button
            :disabled="!hasNextPage || busy"
            @click="movePage(1)"
            >下一页</el-button
          >
        </div>
      </template>
      <SubmissionRecoveryNotice
        :status="status"
        :busy="submitting"
        records-label="任务单件刻码记录"
        allow-restart
        @retry="save"
        @restart="restart"
      />
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="discard"
        >取消</el-button
      >
      <el-button
        v-if="recovery"
        :disabled="submitting"
        @click="$emit('inspect-records')"
        >查看绑定记录</el-button
      >
      <el-button
        v-else
        type="primary"
        :loading="submitting || checkingSelection"
        :disabled="!canSave"
        @click="save"
        >确认绑定 {{ selectedCount.toString() }} 个刻码</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import InlineHint from '../../../components/InlineHint.vue';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { DialogWidth } from '../../../utils/dialog';
import {
  useBatchItemMarkBinding,
  type BatchItemMarkBindingTarget,
} from './use-batch-item-mark-binding';

defineOptions({ name: 'TrackingBatchItemMarkDialog' });
const props = defineProps<{
  visible: boolean;
  target: BatchItemMarkBindingTarget | null;
  refreshTarget: (target: BatchItemMarkBindingTarget) => Promise<BatchItemMarkBindingTarget>;
}>();
const emit = defineEmits<{
  saved: [target: BatchItemMarkBindingTarget, lastCode: string, count: number];
  discard: [];
  'inspect-records': [];
}>();
const {
  target: bindingTarget,
  endInput,
  endError,
  hasUnappliedEnd,
  range,
  selectedCount,
  excludedInRange,
  occupiedInSelection,
  countError,
  hasPreviousPage,
  hasNextPage,
  rows,
  previewLoading,
  previewError,
  checkingSelection,
  refreshingTarget,
  needsRefresh,
  submitting,
  status,
  feedback,
  recovery,
  busy,
  locked,
  canSave,
  normalizeEnd,
  applyEnd,
  movePage,
  showOccupiedCode,
  toggleExcluded,
  checkPreview,
  save,
  refreshTarget,
  restart,
  discard,
} = useBatchItemMarkBinding({
  target: () => props.target,
  visible: () => props.visible,
  refreshTarget: (target) => props.refreshTarget(target),
  saved: (target, lastCode, count) => emit('saved', target, lastCode, count),
  discard: () => emit('discard'),
});
</script>

<style scoped>
.batch-binding-preview {
  display: grid;
  gap: 12px;
}
.range-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: start;
}
.range-form .el-form-item {
  margin-bottom: 0;
}
.range-form .el-button {
  align-self: start;
  margin-top: 30px;
}
.range-summary,
.range-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.range-summary {
  justify-content: space-between;
}
.range-pagination {
  justify-content: flex-end;
}
.range-pagination .el-button {
  margin-left: 0;
}
</style>
