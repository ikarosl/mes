<template>
  <div class="trace-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
      >
        <el-form-item label="追溯标识">
          <el-input
            v-model="keyword"
            clearable
            placeholder="工单号 / 生产批次号 / 物料编码 / 库存批次号"
            @keyup.enter="runSearch"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="runSearch"
            >查询</el-button
          >
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="trace-section">
      <TableToolbar :total="total">
        <template #actions>
          <div class="trace-caption">
            <strong>生产追溯</strong>
            <span>按任务核对物料、领料、库存流向和工序报工</span>
          </div>
        </template>
        <template #tools>
          <el-tooltip
            content="刷新当前追溯"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="detailLoading"
              @click="refresh"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <el-alert
        class="scope-tip"
        type="info"
        :closable="false"
        show-icon
        title="成品产出以当前批准清单为准，实际入库请核对入库确认记录。"
      />

      <div class="trace-workspace">
        <aside
          v-loading="loading"
          class="trace-results"
        >
          <section
            v-for="item in items"
            :key="item.workOrderId"
            class="trace-order-group"
          >
            <header>
              <strong>{{ item.workOrderNo }}</strong>
              <small>{{ item.productCode }} / {{ item.productName }}</small>
              <span>{{ item.batches.length }} 个生产批次</span>
            </header>
            <button
              v-for="batch in item.batches"
              :key="batch.productionBatchId"
              type="button"
              :class="['trace-result', { active: selectedBatchId === batch.productionBatchId }]"
              @click="selectBatch(batch.productionBatchId)"
            >
              <strong>{{ batch.batchNo }}</strong>
              <el-tag
                size="small"
                :type="batchStatusMeta(batch.batchStatus).type"
              >
                {{ batchStatusMeta(batch.batchStatus).label }}
              </el-tag>
            </button>
          </section>
          <el-empty
            v-if="!loading && items.length === 0"
            description="未找到生产追溯记录"
            :image-size="72"
          />
          <el-pagination
            v-if="total > 20"
            small
            layout="prev, pager, next"
            :current-page="currentPage"
            :page-size="20"
            :total="total"
            @current-change="changePage"
          />
        </aside>

        <main
          v-loading="detailLoading"
          class="trace-detail"
        >
          <template v-if="detail">
            <el-descriptions
              class="trace-summary"
              :column="3"
              size="default"
              border
            >
              <el-descriptions-item label="工单号">{{
                detail.summary.workOrderNo
              }}</el-descriptions-item>
              <el-descriptions-item label="任务号">{{
                detail.summary.batchNo
              }}</el-descriptions-item>
              <el-descriptions-item label="计划数量">{{
                formatQuantity(detail.summary.plannedQuantity)
              }}</el-descriptions-item>
              <el-descriptions-item
                label="产品"
                :span="2"
              >
                {{ detail.summary.productCode }} / {{ detail.summary.productName }}
              </el-descriptions-item>
              <el-descriptions-item label="任务状态">
                <el-tag
                  size="small"
                  :type="batchStatusMeta(detail.summary.batchStatus).type"
                >
                  {{ batchStatusMeta(detail.summary.batchStatus).label }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="开工时间">{{
                formatDateTimeForDisplay(detail.summary.startedAt)
              }}</el-descriptions-item>
              <el-descriptions-item label="执行完工时间">{{
                formatDateTimeForDisplay(detail.summary.executionCompletedAt)
              }}</el-descriptions-item>
              <el-descriptions-item label="正常结案时间">{{
                formatDateTimeForDisplay(detail.summary.completedAt)
              }}</el-descriptions-item>
            </el-descriptions>

            <section class="approved-output">
              <header class="summary-heading">
                <strong>审定产出</strong>
                <el-button
                  v-if="detail.summary.closeoutMode"
                  type="primary"
                  link
                  @click="openOutput(detail.summary.productionBatchId)"
                  >查看批准清单与结案记录</el-button
                >
              </header>
              <el-descriptions
                v-if="detail.summary.finalOutput"
                class="trace-summary"
                :column="3"
                size="default"
                border
              >
                <el-descriptions-item label="可用产出合计"
                  ><strong>{{
                    formatQuantity(approvedUsableQuantity(detail.summary.finalOutput))
                  }}</strong></el-descriptions-item
                >
                <el-descriptions-item label="计划内产出">{{
                  formatQuantity(detail.summary.finalOutput.availableQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="计划外产出">{{
                  formatQuantity(detail.summary.finalOutput.extraQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="累计成品报废">{{
                  formatQuantity(detail.summary.finalOutput.scrapQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="计划内差额">{{
                  plannedOutputGapText(detail.summary.finalOutput.plannedShortfallQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="批准清单版本"
                  >第 {{ detail.summary.finalOutput.revisionNo }} 版</el-descriptions-item
                >
              </el-descriptions>
              <p
                v-else
                class="output-pending"
              >
                尚无批准清单，暂不计入审定产出。
              </p>
            </section>

            <el-tabs
              v-model="activeTab"
              class="trace-tabs"
            >
              <el-tab-pane
                label="物料需求与分配"
                name="materials"
                lazy
              >
                <el-table
                  :data="detail.materialDemands"
                  empty-text="暂无物料需求事实"
                >
                  <el-table-column
                    prop="itemCode"
                    label="基础物料编码"
                    min-width="150"
                  />
                  <el-table-column
                    prop="materialVariantCode"
                    label="物料版本"
                    min-width="190"
                  >
                    <template #default="{ row }">{{ variantCode(row) }}</template>
                  </el-table-column>
                  <el-table-column
                    prop="itemName"
                    label="物料名称"
                    min-width="150"
                  />
                  <el-table-column
                    label="需求 / 已分配 / 已出库"
                    min-width="210"
                  >
                    <template #default="{ row }">
                      {{ formatQuantity(row.demandQuantity) }} /
                      {{ formatQuantity(row.allocatedQuantity) }} /
                      {{ formatQuantity(row.outboundQuantity) }} {{ row.unit }}
                    </template>
                  </el-table-column>
                  <el-table-column
                    label="库存批次分配"
                    min-width="260"
                  >
                    <template #default="{ row }">
                      <div
                        v-if="row.allocations.length"
                        class="fact-list"
                      >
                        <span
                          v-for="allocation in row.allocations"
                          :key="allocation.allocationId"
                        >
                          {{ allocation.batchCode }} · 分配
                          {{ formatQuantity(allocation.assignedQuantity) }} · 出库
                          {{ formatQuantity(allocation.outboundQuantity) }}
                        </span>
                      </div>
                      <span v-else>—</span>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane
                label="物料入库来源"
                name="inbound"
                lazy
              >
                <el-alert
                  title="这里展示本生产批次所分配库存批次的可用库存增加记录，包括外购入库、生产退料和盘点调整；不代表每笔入库数量均由本任务领用。"
                  type="info"
                  :closable="false"
                />
                <el-table
                  :data="detail.materialInboundSources"
                  empty-text="暂无可追溯的正库存来源"
                >
                  <el-table-column
                    label="物料 / 库存批次"
                    min-width="220"
                  >
                    <template #default="{ row }">
                      {{ row.itemCode }} · {{ row.itemName }} / {{ row.batchCode }}
                    </template>
                  </el-table-column>
                  <el-table-column
                    label="物料版本"
                    min-width="190"
                  >
                    <template #default="{ row }">{{ variantCode(row) }}</template>
                  </el-table-column>
                  <el-table-column
                    label="来源"
                    width="120"
                  >
                    <template #default="{ row }">{{ sourceLabel(row.sourceLabel) }}</template>
                  </el-table-column>
                  <el-table-column
                    label="来源单据 / 供应方"
                    min-width="190"
                  >
                    <template #default="{ row }">
                      {{ row.sourceDocumentNo || '—' }} / {{ row.provider || '—' }}
                    </template>
                  </el-table-column>
                  <el-table-column
                    label="确认时间"
                    width="175"
                  >
                    <template #default="{ row }">{{
                      formatDateTimeForDisplay(row.confirmedAt)
                    }}</template>
                  </el-table-column>
                  <el-table-column
                    label="正库存流水"
                    min-width="170"
                  >
                    <template #default="{ row }">
                      #{{ row.inventoryTransactionId }} · +{{ formatQuantity(row.inboundQuantity) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane
                label="领料出库与库存流水"
                name="outbound"
                lazy
              >
                <article
                  v-for="outbound in detail.materialOutbounds"
                  :key="outbound.outboundId"
                  class="fact-card"
                >
                  <header>
                    <strong>{{ outbound.outboundNo }}</strong>
                    <span
                      >{{ formatDateTimeForDisplay(outbound.outboundAt) }} ·
                      {{ outbound.operatorName || outbound.operatorId }}</span
                    >
                  </header>
                  <el-table
                    :data="outbound.details"
                    size="small"
                  >
                    <el-table-column
                      prop="itemCode"
                      label="基础物料"
                      min-width="150"
                    />
                    <el-table-column
                      prop="materialVariantCode"
                      label="物料版本"
                      min-width="190"
                    >
                      <template #default="{ row }">{{ variantCode(row) }}</template>
                    </el-table-column>
                    <el-table-column
                      prop="batchCode"
                      label="库存批次"
                      min-width="140"
                    />
                    <el-table-column
                      label="出库数量"
                      min-width="120"
                    >
                      <template #default="{ row }"
                        >{{ formatQuantity(row.outboundQuantity) }} {{ row.unit }}</template
                      >
                    </el-table-column>
                  </el-table>
                </article>
                <el-empty
                  v-if="detail.materialOutbounds.length === 0"
                  description="暂无生产领料出库事实"
                  :image-size="72"
                />
                <h2 class="subsection-title">对应库存流水</h2>
                <el-table
                  :data="detail.inventoryTransactions"
                  empty-text="暂无 production_material_outbound 流水"
                >
                  <el-table-column
                    prop="transactionId"
                    label="流水 ID"
                    width="100"
                  />
                  <el-table-column
                    prop="itemCode"
                    label="基础物料编码"
                    min-width="150"
                  />
                  <el-table-column
                    prop="materialVariantCode"
                    label="物料版本"
                    min-width="190"
                  >
                    <template #default="{ row }">{{ variantCode(row) }}</template>
                  </el-table-column>
                  <el-table-column
                    prop="batchCode"
                    label="库存批次"
                    min-width="140"
                  />
                  <el-table-column
                    label="流水数量"
                    min-width="120"
                  >
                    <template #default="{ row }"
                      >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
                    >
                  </el-table-column>
                  <el-table-column
                    label="发生时间"
                    min-width="170"
                  >
                    <template #default="{ row }">{{
                      formatDateTimeForDisplay(row.transactionAt)
                    }}</template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane
                label="工序与报工"
                name="steps"
                lazy
              >
                <article
                  v-for="step in detail.steps"
                  :key="step.stepRecordId"
                  class="fact-card"
                >
                  <header>
                    <strong>{{ step.stepOrder }}. {{ step.stepName }}</strong>
                    <el-tag :type="stepStatusMeta(step.status).type">{{
                      BATCH_STEP_STATUS_LABELS[step.status]
                    }}</el-tag>
                  </header>
                  <p class="step-summary">
                    有效正常 {{ formatQuantity(step.effectiveNormalQuantity) }} /
                    {{ formatQuantity(step.requiredNormalQuantity) }}； 有效异常
                    {{ formatQuantity(step.effectiveAbnormalQuantity) }}；待处置异常
                    {{
                      step.abnormalDispositions.filter(
                        (item) => item.reviewStatus === 'pending_review',
                      ).length
                    }}
                    条
                  </p>
                  <el-table
                    :data="step.reports"
                    size="small"
                    empty-text="暂无报工事实"
                  >
                    <el-table-column
                      prop="reportNo"
                      label="报工单号"
                      min-width="180"
                    />
                    <el-table-column
                      label="事实关系"
                      min-width="170"
                    >
                      <template #default="{ row }">
                        <span v-if="row.reversalOfReportId"
                          >冲销 #{{ row.reversalOfReportId }}</span
                        >
                        <span v-else-if="row.correctionOfReportId"
                          >替代 #{{ row.correctionOfReportId }}</span
                        >
                        <span v-else>原始报工</span>
                      </template>
                    </el-table-column>
                    <el-table-column
                      label="正常 / 异常"
                      min-width="150"
                    >
                      <template #default="{ row }"
                        >{{ formatQuantity(row.normalQuantity) }} /
                        {{ formatQuantity(row.abnormalQuantity) }}</template
                      >
                    </el-table-column>
                    <el-table-column
                      label="有效性"
                      width="90"
                    >
                      <template #default="{ row }"
                        ><el-tag :type="row.isEffective ? 'success' : 'info'">{{
                          row.isEffective ? '有效' : '已冲销'
                        }}</el-tag></template
                      >
                    </el-table-column>
                  </el-table>
                </article>
              </el-tab-pane>
            </el-tabs>
          </template>
          <el-empty
            v-else
            description="请从左侧选择生产批次"
          />
        </main>
      </div>
    </section>
  </div>
  <ProductionOutputDialog
    v-model:visible="outputVisible"
    :batch-id="outputBatchId"
    @changed="refresh"
    @open-closeout="openCloseoutItems"
  />
  <ProductionBatchTerminationDialog
    v-model:visible="closeoutVisible"
    :batch-id="outputBatchId"
    @terminated="refresh"
    @open-output="openOutput"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { usePageActivationRefresh } from '../../composables/requests/usePageActivationRefresh';
import ProductionOutputDialog from './components/ProductionOutputDialog.vue';
import ProductionBatchTerminationDialog from './components/ProductionBatchTerminationDialog.vue';
import type { InventoryTransactionType } from '@company/contracts';

import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS, INVENTORY_TRANSACTION_TYPE_LABELS } from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { batchStatusMeta, formatQuantity, stepStatusMeta } from './production-status';
import { approvedUsableQuantity, plannedOutputGapText } from './production-output-quantity';
import { useProductionTrace } from './composables/useProductionTrace';

defineOptions({ name: 'ProductionTracePage' });
const sourceLabel = (value: InventoryTransactionType) =>
  INVENTORY_TRANSACTION_TYPE_LABELS[value] ?? value;

const outputVisible = ref(false),
  closeoutVisible = ref(false),
  outputBatchId = ref<string | null>(null);
const openOutput = (batchId: string) => {
  outputBatchId.value = batchId;
  outputVisible.value = true;
};
const openCloseoutItems = (batchId: string) => {
  outputBatchId.value = batchId;
  closeoutVisible.value = true;
};
const keyword = ref('');
const currentPage = ref(1);
const activeTab = ref('materials');
const { items, total, loading, detailLoading, selectedBatchId, detail, search, selectBatch } =
  useProductionTrace();
const variantCode = (row: { materialVariantCode?: string | null }): string =>
  row.materialVariantCode || '未记录版本';

const runSearch = async () => {
  currentPage.value = 1;
  try {
    await search(keyword.value, 1);
  } catch (error) {
    EMessage.error(error, '生产追溯查询失败');
  }
};
const resetSearch = async () => {
  keyword.value = '';
  selectedBatchId.value = null;
  detail.value = null;
  await runSearch();
};
const changePage = async (page: number) => {
  currentPage.value = page;
  await search(keyword.value, page);
};
const refresh = async () => {
  if (selectedBatchId.value) await selectBatch(selectedBatchId.value);
  else await runSearch();
};

usePageActivationRefresh(refresh);
</script>

<style scoped>
.trace-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
}
.query-panel,
.trace-section,
.fact-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-input) {
  width: 360px;
}
.query-actions {
  margin-left: auto;
}
.trace-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.trace-section :deep(.table-toolbar) {
  flex: 0 0 auto;
}
.trace-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.trace-caption strong {
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.trace-caption span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.scope-tip {
  flex: 0 0 auto;
  margin: 16px 20px 0;
  width: auto;
}
.trace-workspace {
  display: grid;
  flex: 1;
  grid-template-columns: 300px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.trace-results {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
.trace-result {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.trace-order-group {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.trace-order-group header {
  display: grid;
  gap: 3px;
  padding: 2px 2px 6px;
}
.trace-order-group header small,
.trace-order-group header span {
  color: var(--el-text-color-secondary);
}
.trace-result.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.trace-result span,
.trace-result small {
  color: var(--el-text-color-secondary);
}
.trace-result :deep(.el-tag) {
  width: fit-content;
}
.trace-detail {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 20px;
}
.trace-summary :deep(.el-descriptions__table) {
  table-layout: fixed;
}
.trace-summary :deep(.el-descriptions__cell) {
  overflow-wrap: anywhere;
  font-size: 14px;
}
.approved-output {
  margin-top: 12px;
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}
.output-pending {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.trace-tabs {
  margin-top: 16px;
}
.fact-list {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.fact-card {
  margin-bottom: 12px;
  padding: 14px;
}
.fact-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.fact-card header span,
.step-summary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.subsection-title {
  margin: 20px 0 12px;
  font-size: 15px;
}
.step-summary {
  margin: 0 0 10px;
}
@media (max-width: 1000px) {
  .trace-workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
  }
  .trace-results {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .query-form {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto;
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
