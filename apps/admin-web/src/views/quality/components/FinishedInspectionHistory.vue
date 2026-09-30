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
      :title="`${record.roundId === currentRoundId ? '本轮检验' : '历史检验'} · ${PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[record.releaseDecision]} · ${formatDateTimeForDisplay(record.inspectedAt)}${record.roundId !== currentRoundId && record.id === latestInspectionId ? ' · 最近一条' : ''}`"
    >
      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="所属检验轮">{{
          record.roundId === currentRoundId ? '本轮' : '历史轮'
        }}</el-descriptions-item>
        <el-descriptions-item label="检验记录 ID">{{ record.id }}</el-descriptions-item>
        <el-descriptions-item label="当时申报版本">{{
          record.declaredVersion
        }}</el-descriptions-item>
        <el-descriptions-item label="前次检验">{{
          record.previousInspectionId ? `记录 ID：${record.previousInspectionId}` : '首次检验'
        }}</el-descriptions-item>
        <el-descriptions-item label="检验时间">{{
          formatDateTimeForDisplay(record.inspectedAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="登记时间">{{
          formatDateTimeForDisplay(record.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item
          label="当时申报（计划内 / 外 / 报废）"
          :span="3"
          >计划内 {{ record.declared.availableQuantity }} 件 · 计划外
          {{ record.declared.extraQuantity }} 件 · 新增报废
          {{ record.declared.additionalScrapQuantity }} 件</el-descriptions-item
        >
        <el-descriptions-item
          label="检验结果"
          :span="3"
          >{{ record.resultNote }}</el-descriptions-item
        >
        <el-descriptions-item
          label="凭据参考"
          :span="3"
          >{{ record.evidenceReference }}</el-descriptions-item
        >
      </el-descriptions>
      <FinishedInspectionFacts :inspection="record" />
    </el-collapse-item>
  </el-collapse>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type { ProductionOutputInspection } from '@company/contracts';
import { PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS } from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
import FinishedInspectionFacts from './FinishedInspectionFacts.vue';
defineProps<{
  records: ProductionOutputInspection[];
  latestInspectionId: string | null;
  currentRoundId?: string | null;
}>();
const expanded = ref<string[]>([]);
</script>
