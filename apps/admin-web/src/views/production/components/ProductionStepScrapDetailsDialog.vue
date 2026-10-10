<template>
  <el-dialog
    :model-value="reader.visible"
    :title="`${reader.target?.stepName || '工序'} · 报废详情`"
    :width="DialogWidth.lg"
    @update:model-value="(open: boolean) => !open && reader.close()"
  >
    <div class="scrap-detail-toolbar">
      <span
        >{{ reader.target?.batchNo }} · {{ reader.target?.stepOrder }}.
        {{ reader.target?.stepName }}</span
      >
      <el-button
        link
        type="primary"
        :loading="reader.loading"
        @click="reader.refresh"
        >刷新记录</el-button
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
      class="scrap-records"
    >
      <article
        v-for="item in reader.items"
        :key="item.scrapRecordId"
        class="scrap-record"
      >
        <header>
          <strong>报废事实 ID {{ item.scrapRecordId }}</strong
          ><span>已报废 {{ formatQuantity(item.scrapQuantity) }} {{ item.unit }}</span>
        </header>
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="来源报工"
            ><el-button
              link
              type="primary"
              @click="$emit('view-report', item.sourceReport)"
              >{{ item.sourceReport.reportNo }}</el-button
            ><span class="source-kind">{{
              BATCH_STEP_REPORT_SOURCE_KIND_LABELS[item.sourceReportSourceKind]
            }}</span></el-descriptions-item
          >
          <el-descriptions-item label="源异常处置">{{ item.dispositionNo }}</el-descriptions-item>
          <el-descriptions-item label="记录人">{{
            item.createdByName || `人员 ID ${item.createdBy}`
          }}</el-descriptions-item>
          <el-descriptions-item label="记录时间">{{
            formatDateTimeForDisplay(item.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="来源报工说明"
            :span="2"
            >{{ item.sourceReportRemark || '未填写' }}</el-descriptions-item
          >
          <el-descriptions-item
            label="审批说明"
            :span="2"
            >{{ item.remark || '未填写' }}</el-descriptions-item
          >
          <template v-if="item.reproductionAuthorization">
            <el-descriptions-item label="报废补产授权"
              >{{ formatQuantity(item.reproductionAuthorization.authorizedQuantity) }} {{ item.unit
              }}<span class="fact-reference"
                >授权记录 ID {{ item.reproductionAuthorization.authorizationId }}</span
              ></el-descriptions-item
            >
            <el-descriptions-item label="授权人 / 时间"
              >{{
                item.reproductionAuthorization.authorizedByName ||
                `人员 ID ${item.reproductionAuthorization.authorizedBy}`
              }}
              ·
              {{
                formatDateTimeForDisplay(item.reproductionAuthorization.authorizedAt)
              }}</el-descriptions-item
            >
          </template>
          <template v-if="item.supplement">
            <el-descriptions-item label="关联补料单">{{
              item.supplement.supplementNo
            }}</el-descriptions-item>
            <el-descriptions-item label="补料状态">{{
              PRODUCTION_SUPPLEMENT_STATUS_LABELS[item.supplement.status]
            }}</el-descriptions-item>
            <el-descriptions-item
              label="补料单创建时间"
              :span="2"
              >{{ formatDateTimeForDisplay(item.supplement.createdAt) }}</el-descriptions-item
            >
            <el-descriptions-item
              v-if="item.supplement.remark"
              label="补料说明"
              :span="2"
              >{{ item.supplement.remark }}</el-descriptions-item
            >
          </template>
        </el-descriptions>
      </article>
      <el-empty
        v-if="!reader.items.length && !reader.loading && !reader.errorText"
        description="本工序没有报废记录"
        :image-size="60"
      />
    </div>
    <PaginationFooter
      :total="reader.total"
      :current-page="reader.page"
      :page-size="reader.pageSize"
      layout="prev, pager, next"
      @page-change="reader.changePage"
      @update:page-size="reader.changePageSize"
    />
    <template #footer><el-button @click="reader.close">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { BatchStepReportReference } from '@company/contracts';
import {
  BATCH_STEP_REPORT_SOURCE_KIND_LABELS,
  PRODUCTION_SUPPLEMENT_STATUS_LABELS,
} from '@company/constants';
import type { ProductionStepScrapDetailsReader } from '../composables/useProductionStepScrapDetails';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../production-status';
import PaginationFooter from '../../../components/PaginationFooter.vue';

defineProps<{ reader: ProductionStepScrapDetailsReader }>();
defineEmits<{ 'view-report': [report: BatchStepReportReference] }>();
</script>

<style scoped>
.scrap-detail-toolbar,
.scrap-record > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.scrap-detail-toolbar {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.scrap-records {
  display: grid;
  gap: 12px;
  min-height: 60px;
}
.scrap-record > header {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  background: var(--el-fill-color-light);
  font-size: 13px;
}
.scrap-record > header > span {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.source-kind,
.fact-reference {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.scrap-record :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
</style>
