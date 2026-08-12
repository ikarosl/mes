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
            :precision="4"
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
            :precision="4"
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
} from '@company/contracts';

const props = withDefaults(
  defineProps<{
    dispositions: BatchStepAbnormalDispositionItem[];
    reports: BatchStepReportItem[];
    reworks: ReworkRecordItem[];
    pendingKeys: Set<string>;
    unit?: string;
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

const sourceQuantity = (item: BatchStepAbnormalDispositionItem): string =>
  props.reports.find((report) => report.reportId === item.sourceReportId)?.abnormalQuantity ?? '—';
const reworkTagType = (status: ReworkRecordItem['status']) =>
  status === 'completed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';
const canComplete = computed(() => {
  const expected = Number(selectedRework.value?.reworkQuantity ?? 0);
  return (
    expected > 0 &&
    Math.abs(completionForm.normalQuantity + completionForm.abnormalQuantity - expected) < 0.00001
  );
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
</style>
