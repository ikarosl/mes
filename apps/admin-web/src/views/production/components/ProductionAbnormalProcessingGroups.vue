<template>
  <section
    v-if="groups.length"
    class="processing-groups"
    aria-label="异常处理过程"
  >
    <ProductionAbnormalProcessingSummary :groups="groups" />
    <article
      v-for="group in groups"
      :key="processingGroupKey(group)"
      class="processing-group"
    >
      <button
        type="button"
        class="group-header"
        :aria-expanded="isExpanded(group)"
        @click="toggle(group)"
      >
        <span class="fold-control">{{ isExpanded(group) ? '▾ 收起' : '▸ 展开' }}</span>
        <span class="group-summary">{{ processingGroupSummary(group) }}</span>
        <el-tag
          :type="processingGroupMeta(group).type"
          size="small"
          >{{ processingGroupMeta(group).label }}</el-tag
        >
      </button>
      <div
        v-if="isExpanded(group)"
        class="group-body"
      >
        <div class="process-stage">
          <strong>{{ group.sourceReport ? '来源报工' : '来源专检' }}</strong>
          <span
            >{{ processingGroupSourceLabel(group) }} · 异常
            {{
              formatQuantity(
                group.disposition?.sourceAbnormalQuantity ?? group.rework?.reworkQuantity,
              )
            }}
            {{ unit }}</span
          >
          <span v-if="!group.sourceReport && group.disposition?.processInspectionRecordId"
            >采用结果记录 ID {{ group.disposition.processInspectionRecordId }}</span
          >
          <span v-if="group.rework?.quantityScope === 'inspection'">
            {{ INSPECTION_REWORK_QUANTITY_HINT }}
          </span>
          <el-button
            v-if="group.sourceReport"
            link
            type="primary"
            @click="$emit('view-report', group.sourceReport)"
            >查看来源报工</el-button
          >
          <el-button
            v-else-if="
              group.disposition?.processInspectionId &&
              canAccessRoute({ name: 'quality-process-inspections' })
            "
            link
            type="primary"
            @click="viewInspection(group.disposition.processInspectionId)"
            >查看来源专检</el-button
          >
        </div>
        <div
          v-if="group.disposition"
          class="process-stage"
        >
          <strong>异常处置</strong><span>{{ group.disposition.dispositionNo }}</span>
          <el-tag
            :type="dispositionTagType(group.disposition)"
            size="small"
          >
            {{ dispositionResultLabel(group.disposition) }}
          </el-tag>
          <span>{{ BATCH_STEP_ABNORMAL_ORIGIN_LABELS[group.disposition.abnormalOrigin] }}</span>
          <div
            v-if="actionsEnabled && group.disposition.reviewStatus === 'pending_review'"
            class="stage-actions"
          >
            <el-button
              link
              type="primary"
              :disabled="disabled"
              :loading="pendingKeys.has(`approve-rework:${group.disposition.dispositionId}`)"
              @click="$emit('review', group.disposition, 'rework')"
              >批准返工</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="disabled"
              :loading="pendingKeys.has(`approve-scrap:${group.disposition.dispositionId}`)"
              @click="$emit('scrap', group.disposition)"
              >报废并补料</el-button
            >
            <el-button
              v-if="
                group.disposition.sourceType === 'report' &&
                group.disposition.sourceReportSourceKind === 'direct_abnormal'
              "
              link
              type="danger"
              :disabled="disabled"
              :loading="pendingKeys.has(`reject:${group.disposition.dispositionId}`)"
              @click="$emit('review', group.disposition, 'reject')"
              >驳回并退回重报</el-button
            >
          </div>
          <p
            v-if="group.disposition.remark"
            class="stage-note"
          >
            {{ group.disposition.reviewStatus === 'rejected' ? '驳回原因' : '处置说明' }}：{{
              group.disposition.remark
            }}
          </p>
        </div>
        <div
          v-if="group.rework"
          class="process-stage"
        >
          <strong>返工</strong
          ><span
            >{{ group.rework.reworkNo }} · {{ formatQuantity(group.rework.reworkQuantity) }}
            {{ group.rework.unit }}</span
          >
          <el-tag
            :type="processingGroupMeta(group).type"
            size="small"
            >{{ REWORK_STATUS_LABELS[group.rework.status] }}</el-tag
          >
          <span
            >来源工序负责人（批准时） {{ group.rework.responsibleUserName || '未提供姓名' }}</span
          >
          <div
            v-if="actionsEnabled"
            class="stage-actions"
          >
            <el-button
              v-if="group.rework.status === 'pending'"
              link
              type="primary"
              :disabled="disabled"
              :loading="pendingKeys.has(`start-rework:${group.rework.reworkId}`)"
              @click="$emit('start', group.rework)"
              >开始返工</el-button
            >
            <el-button
              v-else-if="group.rework.status === 'doing'"
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('complete', group.rework)"
              >完成返工</el-button
            >
          </div>
          <p
            v-if="group.rework.completedAt"
            class="stage-note"
          >
            完成时间 {{ formatDateTimeForDisplay(group.rework.completedAt) }}
          </p>
        </div>
        <div
          v-if="group.completedNormalReport"
          class="process-stage"
        >
          <strong>{{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}</strong>
          <span>{{ group.completedNormalReport.reportNo }}</span>
          <span v-if="group.rework"
            >{{ resultQuantity(group.rework.completedNormalQuantity) }} {{ unit }}</span
          >
          <el-button
            link
            type="primary"
            @click="$emit('view-report', group.completedNormalReport)"
            >查看{{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}</el-button
          >
        </div>
        <div
          v-if="group.completedAbnormalReport"
          class="process-stage"
        >
          <strong>{{ BATCH_STEP_REWORK_RESULT_LABELS.abnormal }}</strong>
          <span>{{ group.completedAbnormalReport.reportNo }}</span>
          <span v-if="group.rework"
            >{{ resultQuantity(group.rework.completedAbnormalQuantity) }} {{ unit }}</span
          >
          <el-button
            link
            type="primary"
            @click="$emit('view-report', group.completedAbnormalReport)"
            >查看{{ BATCH_STEP_REWORK_RESULT_LABELS.abnormal }}</el-button
          >
        </div>
        <p
          v-if="
            !group.completedNormalReport &&
            !group.completedAbnormalReport &&
            group.disposition?.dispositionType === 'scrap'
          "
          class="stage-note scrap-note"
        >
          已批准报废；补料需求与领用进度在补料流程中核对。
        </p>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import {
  BATCH_STEP_ABNORMAL_ORIGIN_LABELS,
  BATCH_STEP_REWORK_RESULT_LABELS,
  INSPECTION_REWORK_QUANTITY_HINT,
  REWORK_STATUS_LABELS,
} from '@company/constants';
import type {
  BatchStepAbnormalDispositionView,
  BatchStepReportReference,
  ReworkRecordView,
} from '@company/contracts';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../production-status';
import type { StatusTagType } from '../production-status';
import ProductionAbnormalProcessingSummary from './ProductionAbnormalProcessingSummary.vue';
import {
  dispositionResultLabel,
  processingGroupMeta,
  processingGroupPending,
  processingGroupSummary,
  processingGroupKey,
  processingGroupSourceLabel,
  type AbnormalProcessingGroup,
} from '../production-report-presentation';

const props = withDefaults(
  defineProps<{
    groups: AbnormalProcessingGroup[];
    expansion: Record<string, boolean>;
    unit?: string;
    actionsEnabled?: boolean;
    disabled?: boolean;
    pendingKeys?: Set<string>;
  }>(),
  {
    unit: '',
    actionsEnabled: false,
    disabled: false,
    pendingKeys: () => new Set<string>(),
  },
);
const emit = defineEmits<{
  'update:expansion': [expansion: Record<string, boolean>];
  'view-report': [report: BatchStepReportReference];
  review: [disposition: BatchStepAbnormalDispositionView, mode: 'rework' | 'reject'];
  scrap: [disposition: BatchStepAbnormalDispositionView];
  start: [rework: ReworkRecordView];
  complete: [rework: ReworkRecordView];
}>();
const router = useRouter(),
  { canAccessRoute } = useRouteAccess();
const viewInspection = async (inspectionId: string): Promise<void> => {
  await router.push({ name: 'quality-process-inspections', query: { inspectionId } });
};
const resultQuantity = (quantity: string | null): string =>
  quantity === null ? '待核对' : formatQuantity(quantity);
const dispositionTagType = (disposition: BatchStepAbnormalDispositionView): StatusTagType => {
  if (disposition.reviewStatus === 'pending_review') return 'warning';
  if (disposition.reviewStatus === 'approved' && disposition.dispositionType === 'scrap')
    return 'danger';
  return 'info';
};
const isExpanded = (group: AbnormalProcessingGroup): boolean =>
  props.expansion[processingGroupKey(group)] ?? processingGroupPending(group);
const toggle = (group: AbnormalProcessingGroup): void =>
  emit('update:expansion', {
    ...props.expansion,
    [processingGroupKey(group)]: !isExpanded(group),
  });
</script>

<style scoped>
.processing-groups {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.processing-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  text-align: left;
  cursor: pointer;
}
.group-header:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.group-header > .el-tag {
  flex: 0 0 auto;
}
.group-summary {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.fold-control {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.group-body {
  padding: 4px 12px;
}
.process-stage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 9px 0;
  font-size: 13px;
}
.process-stage + .process-stage {
  border-top: 1px solid var(--el-border-color-lighter);
}
.process-stage > strong {
  min-width: 84px;
  color: var(--el-text-color-primary);
}
.stage-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.stage-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.stage-note {
  flex-basis: 100%;
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.scrap-note {
  padding: 0 0 8px;
}
</style>
