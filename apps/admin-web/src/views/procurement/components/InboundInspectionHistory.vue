<template>
  <el-empty
    v-if="!records.length"
    description="尚未留存检验记录"
    :image-size="72"
  />
  <el-collapse
    v-else
    v-model="expanded"
    class="business-collapse"
  >
    <el-collapse-item
      v-for="record in records"
      :key="record.id"
      :name="record.id"
      :title="recordTitle(record)"
    >
      <el-descriptions
        :column="3"
        border
        size="small"
        class="case-context"
      >
        <el-descriptions-item label="检验办理"
          >{{ QUALITY_INBOUND_CASE_TYPE_LABELS[record.caseType] }} ·
          {{ QUALITY_INBOUND_CASE_STATUS_LABELS[record.status] }}</el-descriptions-item
        >
        <el-descriptions-item label="发起时间">{{
          formatDateTimeForDisplay(record.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="发起时申报快照"
          >{{ record.coveredQuantity }} {{ unit }}</el-descriptions-item
        >
        <el-descriptions-item
          label="发起原因"
          :span="3"
          ><span class="record-text">{{ record.reason }}</span></el-descriptions-item
        >
      </el-descriptions>
      <InboundInspectionRecord
        v-if="record.inspection"
        :inspection="record.inspection"
        :round-no="roundNo(record)"
      />
      <p
        v-else
        class="muted"
      >
        本次办理尚未形成检验记录。
      </p>
    </el-collapse-item>
  </el-collapse>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { QualityInboundCaseItem, ReceiptRoundItem } from '@company/contracts';
import {
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  QUALITY_RELEASE_DECISION_LABELS,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
const props = defineProps<{
  records: QualityInboundCaseItem[];
  unit?: string;
  currentRoundId?: string;
  adoptedInspectionId?: string | null;
  rounds?: Array<Pick<ReceiptRoundItem, 'id' | 'roundNo'>>;
  focusedCaseId: string;
  focusedSourceRoundNo?: number;
}>();
const expanded = ref<string[]>([]);
function roundNo(record: QualityInboundCaseItem): number | undefined {
  return record.id === props.focusedCaseId
    ? props.focusedSourceRoundNo
    : props.rounds?.find((round) => round.id === record.roundId)?.roundNo;
}
function recordTitle(record: QualityInboundCaseItem): string {
  const sourceRoundNo = roundNo(record);
  const source =
    sourceRoundNo !== undefined
      ? `处理第 ${sourceRoundNo} 轮`
      : !props.currentRoundId
        ? '检验记录'
        : record.roundId === props.currentRoundId
          ? '本轮检验'
          : '历史检验';
  const adopted =
    record.inspection?.id === props.adoptedInspectionId
      ? record.roundId === props.currentRoundId
        ? ' · 当前采用'
        : ' · 当前采用，沿用此前检验'
      : '';
  return record.inspection
    ? `${source} · 检验记录 ID ${record.inspection.id} · ${QUALITY_RELEASE_DECISION_LABELS[record.inspection.releaseDecision]} · ${formatDateTimeForDisplay(record.inspection.inspectedAt)}${adopted}`
    : `${source} · ${QUALITY_INBOUND_CASE_TYPE_LABELS[record.caseType]} · ${QUALITY_INBOUND_CASE_STATUS_LABELS[record.status]} · ${formatDateTimeForDisplay(record.createdAt)}`;
}
watch(
  () => [props.focusedCaseId, props.records],
  () => {
    expanded.value =
      props.focusedCaseId && props.records.some((record) => record.id === props.focusedCaseId)
        ? [props.focusedCaseId]
        : expanded.value.filter((id) => props.records.some((record) => record.id === id));
  },
  { immediate: true },
);
</script>
<style scoped>
.case-context {
  margin-bottom: 12px;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.muted {
  color: var(--el-text-color-secondary);
}
</style>
