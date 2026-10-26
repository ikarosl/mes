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
      <FinishedInspectionRecordDetail
        :inspection="record"
        :unit="unit"
        :round-label="roundLabel(record)"
      />
    </el-collapse-item>
  </el-collapse>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ProductionOutputInspection } from '@company/contracts';
import { PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS } from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
import FinishedInspectionRecordDetail from './FinishedInspectionRecordDetail.vue';
const props = defineProps<{
  records: ProductionOutputInspection[];
  latestInspectionId: string | null;
  currentRoundId: string | null;
  focusedRecordId?: string | null;
  unit?: string;
}>();
const expanded = ref<string[]>([]);
function recordTitle(record: ProductionOutputInspection): string {
  let source = '检验记录';
  if (props.currentRoundId) {
    if (record.roundId === props.currentRoundId) source = '本轮检验';
    else source = '历史检验';
  }
  const latest =
    record.roundId !== props.currentRoundId && record.id === props.latestInspectionId
      ? ' · 最近一条'
      : '';
  return `${source} · 记录 ID ${record.id} · ${PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[record.releaseDecision]} · ${formatDateTimeForDisplay(record.inspectedAt)}${latest}`;
}
function roundLabel(record: ProductionOutputInspection): string | null {
  if (!props.currentRoundId) return null;
  if (record.roundId === props.currentRoundId) return '本轮';
  return '历史轮';
}
watch(
  () => [props.focusedRecordId, props.records],
  () => {
    if (
      props.focusedRecordId &&
      props.records.some((record) => record.id === props.focusedRecordId)
    )
      expanded.value = [props.focusedRecordId];
  },
  { immediate: true },
);
</script>
