<template>
  <section class="card-evidence">
    <div class="evidence-heading">
      <div class="identity">
        <strong>{{ card.cardNo }}</strong
        ><el-tag :type="trackingCardStatus(card.status).type">{{
          trackingCardStatus(card.status).label
        }}</el-tag
        ><span>{{ card.batchNo }} · {{ card.productName }}</span>
      </div>
      <div class="actions">
        <el-button @click="$emit('label')">条码 / 打印</el-button
        ><el-button
          :loading="loading"
          @click="$emit('refresh')"
          >刷新详情</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="card.isPaused"
      title="本盘有待处理的暂停异常，处理完成后才能继续流转。"
      type="error"
      show-icon
      :closable="false"
    />
    <el-alert
      v-else-if="card.openAbnormalityCount"
      :title="`本盘有 ${card.openAbnormalityCount} 条待处理异常，可继续流转；终检定稿前须全部处理。`"
      type="warning"
      show-icon
      :closable="false"
    />
    <el-alert
      v-if="card.status === 'voided'"
      :title="`作废原因：${card.voidReason || '—'}`"
      type="info"
      :closable="false"
    />
    <el-descriptions
      :column="3"
      border
    >
      <el-descriptions-item label="本盘数量"
        ><strong>{{ formatQuantity(card.quantity) }} {{ card.unit }}</strong></el-descriptions-item
      >
      <el-descriptions-item label="当前站点">{{
        card.currentStepName || (card.status === 'unused' ? '等待首站到站' : '—')
      }}</el-descriptions-item>
      <el-descriptions-item label="实际可用产出"
        ><strong>{{
          card.availableQuantity === null
            ? '尚未定稿'
            : `${formatQuantity(card.availableQuantity)} ${card.unit}`
        }}</strong></el-descriptions-item
      >
      <el-descriptions-item label="建卡登记人"
        >{{ card.personnelName }} / {{ card.personnelCode }}</el-descriptions-item
      >
      <el-descriptions-item label="建卡时间">{{
        formatDateTimeForDisplay(card.createdAt)
      }}</el-descriptions-item>
      <el-descriptions-item label="工单">{{ card.workOrderNo }}</el-descriptions-item>
      <el-descriptions-item
        v-if="card.remark"
        label="备注"
        :span="3"
        >{{ card.remark }}</el-descriptions-item
      >
    </el-descriptions>
    <div class="action-bar">
      <el-button
        v-if="card.status !== 'voided' && card.status !== 'completed'"
        @click="$emit('action', 'abnormality')"
        >登记随盘异常</el-button
      >
      <el-button
        v-if="canConfirmOutput"
        type="primary"
        :disabled="card.openAbnormalityCount > 0"
        @click="$emit('action', 'output')"
        >终检确认产出并入库</el-button
      >
      <el-button
        v-if="card.status !== 'voided' && card.status !== 'completed'"
        @click="$emit('action', 'quantity')"
        >更正盘量</el-button
      >
      <el-button
        v-if="card.status !== 'voided' && card.status !== 'completed'"
        type="danger"
        plain
        @click="$emit('action', 'void')"
        >作废追踪卡</el-button
      >
    </div>
    <div
      v-if="card.output"
      class="output-note"
    >
      终检登记人 {{ card.output.personnelName }} ·
      {{ formatDateTimeForDisplay(card.output.confirmedAt) }} ·
      {{ Number(card.output.quantity) > 0 ? '已同次确认成品入库' : '已确认零产出，未产生入库'
      }}<span v-if="card.output.remark"> · {{ card.output.remark }}</span>
    </div>
    <el-tabs v-model="tab">
      <el-tab-pane
        label="到站与交接"
        name="visits"
      >
        <el-table
          :data="card.visits"
          row-key="id"
        >
          <el-table-column
            label="工序"
            min-width="170"
            ><template #default="{ row }"
              >{{ row.stepOrder }}. {{ row.stepName }}</template
            ></el-table-column
          >
          <el-table-column
            label="到站登记人"
            min-width="120"
            ><template #default="{ row }">{{ row.personnelName }}</template></el-table-column
          >
          <el-table-column
            label="到站时间"
            min-width="175"
            ><template #default="{ row }">{{
              formatDateTimeForDisplay(row.arrivedAt)
            }}</template></el-table-column
          >
          <el-table-column
            label="交接 / 完工时间"
            min-width="175"
            ><template #default="{ row }">{{
              formatDateTimeForDisplay(row.completedAt, '尚未交接')
            }}</template></el-table-column
          >
          <el-table-column
            label="报工量"
            width="120"
            align="right"
            ><template #default="{ row }">{{
              row.reportedQuantity === null
                ? '尚未报工'
                : `${formatQuantity(row.reportedQuantity)} ${row.unit}`
            }}</template></el-table-column
          >
        </el-table>
      </el-tab-pane>
      <el-tab-pane
        :label="`随盘异常（${card.abnormalities.length}）`"
        name="abnormalities"
      >
        <el-empty
          v-if="!card.abnormalities.length"
          description="尚无随盘异常"
        />
        <article
          v-for="item in card.abnormalities"
          :key="item.id"
          class="abnormality"
        >
          <div class="abnormality-heading">
            <el-tag :type="item.status === 'resolved' ? 'success' : 'warning'">{{
              PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS[item.status]
            }}</el-tag
            ><el-tag
              :type="item.severity === 'pause' ? 'danger' : 'info'"
              effect="plain"
              >{{ PRODUCTION_TRACKING_ABNORMALITY_SEVERITY_LABELS[item.severity] }}</el-tag
            ><span
              >{{ item.stepName || '未到站' }} · {{ item.personnelName }} ·
              {{ formatDateTimeForDisplay(item.createdAt) }}</span
            ><el-button
              v-if="item.status === 'open'"
              type="primary"
              link
              @click="$emit('action', 'handling', item)"
              >追加处理 / 解决</el-button
            >
          </div>
          <p class="description">{{ item.description }}</p>
          <div
            v-for="handling in item.handlings"
            :key="handling.id"
            class="handling"
          >
            <div>{{ handling.content }}</div>
            <span
              >{{ handling.personnelName }} · {{ formatDateTimeForDisplay(handling.createdAt)
              }}{{ handling.resolvesAbnormality ? ' · 已解决' : '' }}</span
            >
          </div>
        </article>
      </el-tab-pane>
      <el-tab-pane
        :label="`盘量更正（${card.quantityHistory.length}）`"
        name="quantity"
      >
        <el-table
          :data="card.quantityHistory"
          row-key="id"
          ><el-table-column
            label="原数量"
            width="130"
            align="right"
            ><template #default="{ row }">{{
              formatQuantity(row.previousQuantity)
            }}</template></el-table-column
          ><el-table-column
            label="更正数量"
            width="130"
            align="right"
            ><template #default="{ row }">{{
              formatQuantity(row.quantity)
            }}</template></el-table-column
          ><el-table-column
            prop="reason"
            label="更正原因"
            min-width="220"
          /><el-table-column
            label="更正时间"
            min-width="180"
            ><template #default="{ row }">{{
              formatDateTimeForDisplay(row.createdAt)
            }}</template></el-table-column
          ></el-table
        >
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  ProductionTrackingStep,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ABNORMALITY_SEVERITY_LABELS,
  PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { trackingCardStatus, type TrackingCardAction } from './tracking-presentation';
const props = defineProps<{
  card: ProductionTrackingCardDetail;
  steps: ProductionTrackingStep[];
  loading?: boolean;
}>();
defineEmits<{
  (event: 'refresh'): void;
  (event: 'label'): void;
  (event: 'action', action: TrackingCardAction, abnormality?: ProductionTrackingAbnormality): void;
}>();
const tab = ref('visits');
watch(
  () => props.card.id,
  () => {
    tab.value = 'visits';
  },
);
const canConfirmOutput = computed(
  () =>
    props.card.status === 'in_progress' &&
    props.steps.length > 0 &&
    props.card.currentStepRecordId === props.steps[props.steps.length - 1]?.stepRecordId,
);
</script>

<style scoped>
.card-evidence {
  display: grid;
  gap: 16px;
}
.evidence-heading,
.identity,
.actions,
.action-bar,
.abnormality-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.evidence-heading {
  justify-content: space-between;
}
.identity strong {
  font-size: 16px;
}
.identity span,
.output-note {
  color: var(--el-text-color-regular);
}
.abnormality {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.abnormality-heading span,
.handling span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.handling {
  display: grid;
  gap: 4px;
  margin: 10px 0 0 12px;
  padding: 8px 12px;
  border-left: 2px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  white-space: pre-wrap;
}
.card-evidence :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
</style>
