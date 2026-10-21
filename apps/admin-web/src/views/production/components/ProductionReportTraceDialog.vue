<template>
  <el-dialog
    :model-value="reader.visible"
    :title="`${reader.target?.reportNo || '报工'} · 记录与处理过程`"
    :width="DialogWidth.xl"
    @update:model-value="(open: boolean) => !open && reader.close()"
  >
    <div class="detail-toolbar">
      <span>只读追溯</span
      ><el-button
        link
        type="primary"
        :loading="reader.loading"
        @click="reader.refresh"
        >刷新详情</el-button
      >
    </div>
    <el-alert
      v-if="reader.errorText"
      :title="reader.errorText"
      type="error"
      :closable="false"
      show-icon
    />
    <div
      v-loading="reader.loading"
      class="report-detail"
    >
      <template v-if="reader.detail">
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="报工单号">{{ reader.detail.reportNo }}</el-descriptions-item>
          <el-descriptions-item label="业务类型"
            >{{ reportBusinessLabel(reader.detail) }}
            <el-tag
              :type="reportEffectMeta(reader.detail).type"
              size="small"
              >{{ reportEffectMeta(reader.detail).label }}</el-tag
            ></el-descriptions-item
          >
          <el-descriptions-item label="数量变动（正常 / 异常）"
            >{{ reportQuantityChange(reader.detail.normalQuantity, reader.detail) }} /
            {{ reportQuantityChange(reader.detail.abnormalQuantity, reader.detail) }}
            {{ reader.detail.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="业务来源与关系"
            ><ProductionReportRelations
              :report="reader.detail"
              @view-report="reader.open"
          /></el-descriptions-item>
          <el-descriptions-item label="实际录入人">{{
            reader.detail.createdByName || '未提供姓名'
          }}</el-descriptions-item>
          <el-descriptions-item label="录入时间">{{
            formatDateTimeForDisplay(reader.detail.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注 / 原因"
            :span="2"
            >{{ reader.detail.remark || '—' }}</el-descriptions-item
          >
        </el-descriptions>
        <p
          v-if="reportReadOnlyReason(reader.detail)"
          class="read-only-reason"
        >
          {{ reportReadOnlyReason(reader.detail) }}
        </p>
        <ProductionAbnormalProcessingGroups
          v-if="reader.detail.processingChain.length"
          :groups="processingChainGroups(reader.detail.processingChain)"
          :expansion="reader.expansion"
          :unit="reader.detail.unit"
          @update:expansion="reader.setExpansion"
          @view-report="reader.open"
        />
        <p
          v-else
          class="empty-process"
        >
          本记录没有异常处理过程。
        </p>
        <p
          v-if="reader.detail.dependencies.some((item) => !item.businessNo)"
          class="fact-identifiers"
        >
          <span
            v-for="item in reader.detail.dependencies.filter(
              (dependency) => !dependency.businessNo,
            )"
            :key="`${item.kind}:${item.id}`"
            >{{ reportDependencyLabel(item) }}</span
          >
        </p>
      </template>
      <el-empty
        v-else-if="!reader.loading && !reader.errorText"
        description="暂无报工详情"
        :image-size="60"
      />
    </div>
    <template #footer><el-button @click="reader.close">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ProductionReportTraceReader } from '../composables/useProductionReportTrace';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import {
  reportBusinessLabel,
  reportDependencyLabel,
  reportEffectMeta,
  reportQuantityChange,
  reportReadOnlyReason,
  processingChainGroups,
} from '../production-report-presentation';
import ProductionReportRelations from './ProductionReportRelations.vue';
import ProductionAbnormalProcessingGroups from './ProductionAbnormalProcessingGroups.vue';
defineProps<{ reader: ProductionReportTraceReader }>();
</script>

<style scoped>
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.report-detail {
  min-height: 100px;
}
.report-detail :deep(.el-descriptions__cell) {
  overflow-wrap: anywhere;
  font-size: 14px;
}
.report-detail :deep(.el-descriptions__label) {
  width: 158px;
}
.read-only-reason,
.empty-process,
.fact-identifiers {
  margin: 12px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}
.fact-identifiers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
