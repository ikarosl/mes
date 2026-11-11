<template>
  <el-dialog
    :model-value="visible"
    title="工序追踪 / 异常处理"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div
      v-loading="loading && !!card"
      class="card-evidence"
      :aria-busy="loading"
    >
      <el-alert
        v-if="error"
        type="error"
        show-icon
        :closable="false"
      >
        <template #title>
          <span>{{ error }}</span>
          <el-button
            link
            type="primary"
            :disabled="loading"
            @click="$emit('refresh')"
            >重试</el-button
          >
        </template>
      </el-alert>
      <el-skeleton
        v-if="loading && !card"
        :rows="6"
        animated
      />
      <template v-else-if="card">
        <div class="evidence-heading">
          <div class="identity">
            <strong class="card-number">{{ card.cardNo }}</strong>
            <p class="identity-subtitle">
              {{ card.productCode }} · {{ card.productName }} · 任务 {{ card.batchNo }} · 当前剩余
              <strong>{{ formatQuantity(card.quantity) }} {{ card.unit }}</strong>
            </p>
          </div>
          <div class="status-tags">
            <el-tag :type="trackingCardStatus(card.status).type">{{
              trackingCardStatus(card.status).label
            }}</el-tag>
            <el-tag
              type="info"
              effect="plain"
              >{{ trackingCardLocation(card) }}</el-tag
            >
            <el-tag
              v-if="card.openAbnormalityCount"
              :type="card.status === 'voided' ? 'info' : 'danger'"
              >{{ card.openAbnormalityCount }} 条{{
                card.status === 'voided' ? '未处理记录' : '待处理异常'
              }}</el-tag
            >
          </div>
        </div>
        <el-alert
          v-if="card.openAbnormalityCount && !isTerminal"
          :title="
            Number(card.quantity) === 0
              ? `本盘剩余盘量为0，仍有 ${card.openAbnormalityCount} 条异常待处理；请继续完成异常结算。`
              : `本盘有 ${card.openAbnormalityCount} 条待处理异常，已暂停整盘流转；全部处理完成后才能继续。`
          "
          type="error"
          show-icon
          :closable="false"
        />
        <el-alert
          v-if="card.status === 'scrapped'"
          title="本盘已整盘报废，异常已全部结算，无产出入库；不能继续流转或更改盘量。"
          type="error"
          show-icon
          :closable="false"
        />
        <el-alert
          v-if="card.status === 'voided'"
          :title="`人工作废原因：${card.voidReason || '—'}${card.openAbnormalityCount ? `；保留 ${card.openAbnormalityCount} 条未处理异常记录，本盘已停止办理。` : ''}`"
          type="info"
          show-icon
          :closable="false"
        />
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="实际可用产出"
            ><strong>{{ trackingOutputLabel(card) }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="工单">{{ card.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item label="建卡登记人"
            >{{ card.personnelName }} / {{ card.personnelCode }}</el-descriptions-item
          >
          <el-descriptions-item label="建卡时间">{{
            formatDateTimeForDisplay(card.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            v-if="card.status === 'voided' && card.voidedAt"
            label="作废时间"
            :span="2"
            >{{ formatDateTimeForDisplay(card.voidedAt) }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="card.remark"
            label="备注"
            :span="2"
            ><span class="description">{{ card.remark }}</span></el-descriptions-item
          >
        </el-descriptions>
        <div
          v-if="card.output"
          class="output-note"
        >
          终检登记人 {{ card.output.personnelName }} ·
          {{ formatDateTimeForDisplay(card.output.confirmedAt) }} ·
          {{ Number(card.output.quantity) > 0 ? '已同次确认成品入库' : '已确认零产出，未产生入库'
          }}<span v-if="card.output.remark"> · {{ card.output.remark }}</span>
        </div>
        <div
          v-if="canConfirmOutput || canChangeCard"
          class="action-bar"
        >
          <el-button
            v-if="canConfirmOutput"
            type="primary"
            :disabled="actionsDisabled || card.openAbnormalityCount > 0"
            @click="$emit('action', 'output')"
            >终检确认产出并入库</el-button
          >
          <el-button
            v-if="canChangeCard"
            type="danger"
            plain
            :disabled="actionsDisabled"
            @click="$emit('action', 'void')"
            >作废追踪卡</el-button
          >
        </div>

        <section class="evidence-section">
          <h3 class="section-title">工序流转记录</h3>
          <el-table
            :data="flowRows"
            row-key="stepRecordId"
            class="evidence-table"
            empty-text="暂无冻结工序"
          >
            <el-table-column
              label="工序"
              min-width="155"
              ><template #default="{ row }"
                >{{ row.stepOrder }}. {{ row.stepName }}</template
              ></el-table-column
            >
            <el-table-column
              label="状态"
              width="100"
              ><template #default="{ row }"
                ><el-tag
                  :type="row.status.type"
                  size="small"
                  effect="light"
                  >{{ row.status.label }}</el-tag
                ></template
              ></el-table-column
            >
            <el-table-column
              label="到站登记人"
              min-width="110"
              ><template #default="{ row }">{{ row.visit?.personnelName || '—' }}</template>
            </el-table-column>
            <el-table-column
              label="到站时间"
              min-width="170"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.visit?.arrivedAt, '—')
              }}</template></el-table-column
            >
            <el-table-column
              label="交接 / 完工时间"
              min-width="170"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.visit?.completedAt, '—')
              }}</template></el-table-column
            >
            <el-table-column
              label="报工量"
              min-width="120"
              align="right"
              ><template #default="{ row }">{{ trackingVisitQuantity(row.visit) }}</template>
            </el-table-column>
          </el-table>
        </section>

        <section class="evidence-section">
          <div class="section-heading">
            <h3 class="section-title">
              异常与处理记录 <span class="section-count">{{ card.abnormalities.length }} 条</span>
            </h3>
            <el-button
              v-if="canChangeCard"
              type="primary"
              plain
              :disabled="actionsDisabled"
              @click="$emit('action', 'abnormality')"
              >上报异常</el-button
            >
          </div>
          <el-empty
            v-if="!card.abnormalities.length"
            :image-size="50"
            description="暂无异常记录"
          />
          <div
            v-else
            class="abnormality-list"
          >
            <article
              v-for="item in card.abnormalities"
              :key="item.id"
              class="abnormality"
              :class="{ 'is-open': item.status === 'open' }"
            >
              <div class="abnormality-heading">
                <div class="abnormality-status">
                  <el-tag :type="item.status === 'resolved' ? 'success' : 'warning'">{{
                    PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS[item.status]
                  }}</el-tag>
                  <strong class="affected-quantity"
                    >登记影响 {{ formatQuantity(item.affectedQuantity) }} {{ card.unit }}</strong
                  >
                </div>
                <el-button
                  v-if="item.status === 'open' && !isTerminal"
                  type="primary"
                  link
                  :disabled="actionsDisabled"
                  @click="$emit('action', 'handling', item)"
                  >处理并结算</el-button
                >
              </div>
              <div class="record-meta">
                涉及工序：{{ item.stepName || '未到站' }} · 登记人 {{ item.personnelName }} ·
                {{ formatDateTimeForDisplay(item.createdAt) }}
              </div>
              <p class="description">{{ item.description }}</p>
              <p
                v-if="Number(item.affectedQuantity) > Number(card.quantity)"
                class="quantity-note"
              >
                当前剩余盘量为 {{ formatQuantity(card.quantity) }}
                {{ card.unit }}，异常影响数量保留登记时记录。
              </p>
              <div
                v-if="item.handling"
                class="handling"
              >
                <div class="handling-heading">
                  <strong>处理结算</strong>
                  <span class="record-meta"
                    >{{ item.handling.personnelName }} ·
                    {{ formatDateTimeForDisplay(item.handling.createdAt) }}</span
                  >
                </div>
                <div class="handling-quantities">
                  <span
                    >返修成功
                    <strong
                      >{{ formatQuantity(item.handling.repairedQuantity) }} {{ card.unit }}</strong
                    ></span
                  >
                  <span
                    >本次新增报废
                    <strong
                      >{{ formatQuantity(item.handling.scrappedQuantity) }} {{ card.unit }}</strong
                    ></span
                  >
                  <span
                    >关联已报废
                    <strong
                      >{{ formatQuantity(trackingReferencedScrapQuantity(item.handling)) }}
                      {{ card.unit }}</strong
                    >（不重复扣减）</span
                  >
                </div>
                <p class="description">{{ item.handling.content }}</p>
                <div
                  v-for="reference in item.handling.scrapReferences"
                  :key="reference.handlingId"
                  class="reference-evidence"
                >
                  关联来源问题：{{ scrapReferenceLabel(reference.handlingId) }} ·
                  {{ formatQuantity(reference.quantity) }} {{ card.unit }}
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="evidence-section">
          <h3 class="section-title">
            盘量更正记录 <span class="section-count">{{ card.quantityHistory.length }} 条</span>
          </h3>
          <el-table
            :data="card.quantityHistory"
            row-key="id"
            class="evidence-table"
            empty-text="暂无盘量更正记录"
          >
            <el-table-column
              label="原数量"
              width="135"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.previousQuantity) }} {{ card.unit }}</template
              ></el-table-column
            >
            <el-table-column
              label="更正后数量"
              width="135"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.quantity) }} {{ card.unit }}</template
              ></el-table-column
            >
            <el-table-column
              prop="reason"
              label="更正原因"
              min-width="220"
            />
            <el-table-column
              label="更正时间"
              min-width="180"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.createdAt)
              }}</template></el-table-column
            >
          </el-table>
        </section>
      </template>
      <el-empty
        v-else-if="!error"
        description="暂无追踪卡详情"
      />
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
      <el-button
        :disabled="actionsDisabled"
        @click="$emit('label')"
        >条码 / 打印</el-button
      >
      <el-button
        :loading="loading"
        @click="$emit('refresh')"
        >刷新详情</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  ProductionTrackingStep,
} from '@company/contracts';
import { PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS } from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../../../utils/quantity';
import {
  trackingCardLocation,
  trackingCardStatus,
  trackingFlowRows,
  trackingOutputLabel,
  trackingReferencedScrapQuantity,
  trackingVisitQuantity,
  type TrackingCardAction,
} from './tracking-presentation';

defineOptions({ name: 'TrackingCardEvidence' });

const props = defineProps<{
  visible: boolean;
  card: ProductionTrackingCardDetail | null;
  steps: ProductionTrackingStep[];
  loading?: boolean;
  error?: string;
}>();

defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'refresh'): void;
  (event: 'label'): void;
  (
    event: 'action',
    action: Exclude<TrackingCardAction, 'quantity'>,
    abnormality?: ProductionTrackingAbnormality,
  ): void;
}>();

const actionsDisabled = computed(() => Boolean(props.loading || props.error || !props.card));
const isTerminal = computed(
  () => !!props.card && ['voided', 'completed', 'scrapped'].includes(props.card.status),
);
const flowRows = computed(() => trackingFlowRows(props.card, props.steps));
const canConfirmOutput = computed(
  () =>
    props.card?.status === 'in_progress' &&
    Number(props.card.quantity) > 0 &&
    props.steps.length > 0 &&
    props.card.currentStepRecordId === props.steps[props.steps.length - 1]?.stepRecordId,
);
const canChangeCard = computed(
  () => !!props.card && !isTerminal.value && Number(props.card.quantity) > 0,
);

function scrapReferenceLabel(handlingId: string): string {
  const source = props.card?.abnormalities.find((item) => item.handling?.id === handlingId);
  if (!source?.handling) return '来源处理记录不可读取';
  return `${source.description} · ${source.handling.personnelName} · ${formatDateTimeForDisplay(source.handling.createdAt)}`;
}
</script>

<style scoped>
.card-evidence {
  display: grid;
  gap: 16px;
  min-height: 120px;
}
.evidence-heading,
.status-tags,
.action-bar,
.section-heading,
.abnormality-heading,
.abnormality-status,
.handling-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.evidence-heading,
.section-heading,
.abnormality-heading {
  justify-content: space-between;
}
.evidence-heading {
  align-items: flex-start;
}
.identity {
  flex: 1 1 440px;
  min-width: 0;
}
.card-number {
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.identity-subtitle {
  margin: 8px 0 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.identity-subtitle strong {
  color: var(--el-text-color-primary);
}
.status-tags {
  justify-content: flex-end;
  max-width: 100%;
}
.status-tags :deep(.el-tag) {
  max-width: 100%;
  height: auto;
  min-height: 24px;
  white-space: normal;
  line-height: 1.6;
}
.output-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.action-bar .el-button + .el-button {
  margin-left: 0;
}
.evidence-section {
  min-width: 0;
}
.section-title {
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.section-heading {
  margin-bottom: 12px;
}
.section-heading .section-title {
  margin-bottom: 0;
}
.section-count {
  margin-left: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 400;
}
.evidence-table {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.evidence-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.abnormality-list {
  display: grid;
  gap: 12px;
}
.abnormality {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.abnormality.is-open {
  border-left: 3px solid var(--el-color-warning);
}
.abnormality-heading {
  margin-bottom: 8px;
}
.record-meta,
.quantity-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.quantity-note {
  margin: 8px 0 0;
}
.affected-quantity,
.handling-quantities strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.description {
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.handling {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border-left: 2px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
}
.handling-heading {
  gap: 4px 12px;
}
.handling-heading > strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.handling-quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.handling .description {
  margin: 0;
}
.reference-evidence {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
