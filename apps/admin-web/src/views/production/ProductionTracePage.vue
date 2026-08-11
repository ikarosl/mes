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
            <strong>Production 事实追溯</strong>
            <span>按批次核对需求、分配、领料出库、库存流水、工序和报工事实</span>
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
        title="本页只展示当前已落库的 Production 事实，不代表质量放行，也不包含返工、报废、退料或成品流向。"
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
            <div class="trace-overview">
              <div>
                <span>生产工单</span><strong>{{ detail.summary.workOrderNo }}</strong>
              </div>
              <div>
                <span>生产批次</span><strong>{{ detail.summary.batchNo }}</strong>
              </div>
              <div>
                <span>产品</span
                ><strong
                  >{{ detail.summary.productCode }} / {{ detail.summary.productName }}</strong
                >
              </div>
              <div>
                <span>执行状态</span
                ><strong>{{ batchStatusMeta(detail.summary.batchStatus).label }}</strong>
              </div>
              <div>
                <span>计划数量</span
                ><strong>{{ formatQuantity(detail.summary.plannedQuantity) }}</strong>
              </div>
              <div>
                <span>完成数量</span
                ><strong>{{ formatQuantity(detail.summary.completedQuantity) }}</strong>
              </div>
              <div>
                <span>开工时间</span
                ><strong>{{ formatDateTimeForDisplay(detail.summary.startedAt) }}</strong>
              </div>
              <div>
                <span>完工时间</span
                ><strong>{{ formatDateTimeForDisplay(detail.summary.completedAt) }}</strong>
              </div>
            </div>

            <el-tabs
              v-model="activeTab"
              class="trace-tabs"
            >
              <el-tab-pane
                label="物料需求与分配"
                name="materials"
              >
                <el-table
                  :data="detail.materialDemands"
                  empty-text="暂无物料需求事实"
                >
                  <el-table-column
                    prop="itemCode"
                    label="物料编码"
                    min-width="130"
                  />
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
                label="领料出库与库存流水"
                name="outbound"
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
                      label="物料"
                      min-width="130"
                    />
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
                    label="物料编码"
                    min-width="130"
                  />
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
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS } from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { batchStatusMeta, formatQuantity, stepStatusMeta } from './production-status';
import { useProductionTrace } from './composables/useProductionTrace';

defineOptions({ name: 'ProductionTracePage' });
const keyword = ref('');
const currentPage = ref(1);
const activeTab = ref('materials');
const { items, total, loading, detailLoading, selectedBatchId, detail, search, selectBatch } =
  useProductionTrace();

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

onMounted(runSearch);
onActivated(refresh);
</script>

<style scoped>
.trace-page {
  display: grid;
  gap: 16px;
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
  overflow: hidden;
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
  margin: 16px 20px 0;
  width: auto;
}
.trace-workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  min-height: 560px;
}
.trace-results {
  display: grid;
  align-content: start;
  gap: 8px;
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
  padding: 16px 20px 20px;
}
.trace-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.trace-overview div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.trace-overview span {
  color: var(--el-text-color-secondary);
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
  }
  .trace-results {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .trace-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
