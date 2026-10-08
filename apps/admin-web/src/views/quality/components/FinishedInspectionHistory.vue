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
      :title="`${!currentRoundId ? '检验记录' : record.roundId === currentRoundId ? '本轮检验' : '历史检验'} · 记录 ID ${record.id} · ${PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[record.releaseDecision]} · ${formatDateTimeForDisplay(record.inspectedAt)}${record.roundId !== currentRoundId && record.id === latestInspectionId ? ' · 最近一条' : ''}`"
    >
      <FinishedInspectionRecordDetail
        :inspection="record"
        :unit="unit"
        :round-label="
          currentRoundId ? (record.roundId === currentRoundId ? '本轮' : '历史轮') : null
        "
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
