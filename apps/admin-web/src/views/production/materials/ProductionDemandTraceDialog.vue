<template>
  <el-dialog
    :model-value="visible"
    title="需求变更追溯"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <div
      v-loading="loading"
      class="trace-body"
    >
      <el-alert
        v-if="error"
        type="error"
        :title="error"
        :closable="false"
        show-icon
      >
        <template v-if="rows.length">以下保留此前展示，更正入口已停用。请手动刷新。</template>
      </el-alert>
      <el-alert
        v-if="eligibilityError"
        type="error"
        :title="eligibilityError"
        :closable="false"
        show-icon
        >最新需求的更正入口已停用，请手动刷新后重新核对。</el-alert
      >
      <InlineHint v-if="needsRefresh && !loading && !error && !eligibilityError">
        请手动刷新，核对最新需求、审批历史和更正资格。
      </InlineHint>

      <template v-if="selected && latest">
        <section>
          <header class="section-heading">
            <h4>需求替代链</h4>
            <el-button
              type="success"
              :disabled="!canCorrectLatest"
              @click="correctLatest"
              >更正最新需求 id:{{ latest.demandId }}</el-button
            >
          </header>
          <InlineHint
            v-if="latestCheck && !latestCheck.canCorrect && latestCheck.blockers.length"
            class="correction-blockers"
            tone="warning"
          >
            <span class="blocker-title">最新需求当前不可更正：</span>
            <ul class="blocker-list">
              <li
                v-for="blocker in latestCheck.blockers"
                :key="blocker"
              >
                {{ blocker }}
              </li>
            </ul>
          </InlineHint>
          <el-table
            :data="rows"
            row-key="demandId"
            :row-class-name="traceRowClass"
            size="small"
            border
          >
            <el-table-column
              label="需求记录"
              min-width="150"
            >
              <template #default="{ row }">
                <strong>id:{{ row.demandId }}</strong>
                <div class="record-markers">
                  <el-tag
                    v-if="row.demandId === demandId"
                    size="small"
                    effect="plain"
                    >正在查看</el-tag
                  >
                  <el-tag
                    v-if="row.demandId === latest.demandId"
                    size="small"
                    type="info"
                    effect="plain"
                    >最新记录</el-tag
                  >
                </div>
                <div
                  v-if="row.correction?.replacesDemandId"
                  class="secondary-text"
                >
                  替代自 id:{{ row.correction.replacesDemandId }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="本条需求"
              width="100"
              align="right"
            >
              <template #default="{ row }"
                >{{ quantity(row.demandQuantity) }} {{ row.unit }}</template
              >
            </el-table-column>
            <el-table-column
              label="已领"
              width="100"
              align="right"
            >
              <template #default="{ row }"
                >{{ quantity(row.outboundQuantity) }} {{ row.unit }}</template
              >
            </el-table-column>
            <el-table-column
              label="未领"
              width="110"
              align="right"
            >
              <template #default="{ row }">
                {{ quantity(row.remainingDemandQuantity) }} {{ row.unit }}
                <div class="secondary-text">
                  {{ row.businessStatus === 'active' ? '当前待领' : '历史余量' }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="状态"
              width="110"
            >
              <template #default="{ row }">
                <el-tag
                  :type="productionDemandTraceStatus(row).type"
                  size="small"
                  >{{ productionDemandTraceStatus(row).label }}</el-tag
                >
                <div
                  v-if="row.businessStatus === 'active' && !row.correction?.pendingCorrectionId"
                  class="secondary-text"
                >
                  {{ productionDemandTraceProgressLabel(row) }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="创建时间"
              width="180"
            >
              <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column
              label="关闭原因与依据"
              min-width="240"
            >
              <template #default="{ row }">
                <template v-if="row.correction?.closeCause">
                  {{ DEMAND_CLOSE_CAUSE_LABELS[row.correction.closeCause as DemandCloseCause] }}
                  <div class="reason-text">{{ row.correction.closeReason }}</div>
                  <div class="secondary-text">
                    关闭时间 {{ formatDateTimeForDisplay(row.correction.closedAt) }}
                  </div>
                </template>
                <div v-if="row.correction?.correctionApprovalId">
                  <el-button
                    v-if="canAccessRoute({ name: 'approval-inbox' })"
                    link
                    type="primary"
                    @click="openApproval(row.correction.correctionApprovalId)"
                    >查看更正审批 id:{{ row.correction.correctionApprovalId }}</el-button
                  >
                  <span v-else>更正审批 id:{{ row.correction.correctionApprovalId }}</span>
                </div>
                <div v-if="row.correction?.closeoutId">
                  结案记录 id:{{ row.correction.closeoutId }}
                </div>
                <div v-if="row.correction?.closeoutApprovalId">
                  <el-button
                    v-if="canAccessRoute({ name: 'approval-inbox' })"
                    link
                    type="primary"
                    @click="openApproval(row.correction.closeoutApprovalId)"
                    >查看结案审批 id:{{ row.correction.closeoutApprovalId }}</el-button
                  >
                  <span v-else>结案审批 id:{{ row.correction.closeoutApprovalId }}</span>
                </div>
                <span
                  v-if="
                    !row.correction?.closeCause &&
                    !row.correction?.correctionApprovalId &&
                    !row.correction?.closeoutId &&
                    !row.correction?.closeoutApprovalId
                  "
                  >—</span
                >
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section
          v-if="
            original && (original.demandType === 'manual_additional' || original.generationReason)
          "
        >
          <h4>{{ original.demandType === 'manual_additional' ? '人工追加原因' : '来源说明' }}</h4>
          <div class="secondary-text">
            <template v-if="original.supplementNo">来源 {{ original.supplementNo }} · </template>
            原始需求 id:{{ original.demandId }} · 创建时间
            {{ formatDateTimeForDisplay(original.createdAt) }}
          </div>
          <p class="source-reason">{{ original.generationReason ?? '未记录人工追加原因' }}</p>
        </section>

        <section>
          <h4>更正审批历史</h4>
          <el-table
            :data="history"
            row-key="id"
            size="small"
            border
            empty-text="尚无更正审批记录"
          >
            <el-table-column
              label="更正申请"
              width="100"
            >
              <template #default="{ row }">id:{{ row.id }}</template>
            </el-table-column>
            <el-table-column
              label="需求变化"
              min-width="180"
            >
              <template #default="{ row }">
                id:{{ row.oldDemandId }} → {{ productionDemandCorrectionReplacementLabel(row) }}
                <div class="secondary-text">
                  {{
                    DEMAND_CORRECTION_KIND_LABELS[
                      row.snapshot.correctionKind as DemandCorrectionKind
                    ]
                  }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="目标总量前后"
              min-width="170"
            >
              <template #default="{ row }">
                {{ quantity(row.snapshot.check.currentTotalQuantity) }} →
                {{ quantity(row.snapshot.targetTotalQuantity) }} {{ row.snapshot.check.unit }}
                <div class="secondary-text">
                  申请时已领 {{ quantity(row.snapshot.check.issuedQuantity) }}
                  {{ row.snapshot.check.unit }}
                </div>
                <div class="secondary-text">
                  新剩余 {{ quantity(row.snapshot.newRemainingQuantity) }}
                  {{ row.snapshot.check.unit }}
                </div>
                <div
                  v-if="row.state !== 'applied'"
                  class="secondary-text"
                >
                  申请目标，尚未生效
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="状态"
              width="125"
            >
              <template #default="{ row }">
                <el-tag
                  :type="productionDemandCorrectionHistoryStatus(row).type"
                  size="small"
                  >{{ productionDemandCorrectionHistoryStatus(row).label }}</el-tag
                >
              </template>
            </el-table-column>
            <el-table-column
              label="原因"
              min-width="200"
            >
              <template #default="{ row }"
                ><div class="reason-text">{{ row.snapshot.reason }}</div></template
              >
            </el-table-column>
            <el-table-column
              label="申请 / 生效时间"
              width="190"
            >
              <template #default="{ row }">
                <div class="secondary-text">申请 {{ formatDateTimeForDisplay(row.createdAt) }}</div>
                <div class="secondary-text">
                  生效 {{ formatDateTimeForDisplay(row.appliedAt, '未生效') }}
                </div>
                <div
                  v-if="row.fulfilledSupplementIds.length"
                  class="secondary-text"
                >
                  本次齐套补料：{{
                    row.fulfilledSupplementIds.map((id: string) => `id:${id}`).join('、')
                  }}
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="审批记录"
              min-width="150"
              fixed="right"
            >
              <template #default="{ row }">
                <template v-if="row.approvalInstanceId">
                  <el-button
                    v-if="canAccessRoute({ name: 'approval-inbox' })"
                    link
                    type="primary"
                    @click="openApproval(row.approvalInstanceId)"
                    >查看审批 id:{{ row.approvalInstanceId }}</el-button
                  >
                  <span v-else>审批 id:{{ row.approvalInstanceId }}</span>
                </template>
                <span v-else>尚未提交审批</span>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>
      <el-empty
        v-else-if="!loading && !error"
        description="暂无可查看的需求记录"
      />
    </div>
    <template #footer>
      <el-button
        :loading="loading"
        :disabled="!batch || !demandId"
        @click="refresh"
        >刷新追溯</el-button
      >
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type {
  DemandCloseCause,
  DemandCorrectionKind,
  ProductionBatchItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { DEMAND_CLOSE_CAUSE_LABELS, DEMAND_CORRECTION_KIND_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { useProductionDemandTrace } from './use-production-demand-trace';
import {
  productionDemandCorrectionHistoryStatus,
  productionDemandCorrectionReplacementLabel,
  productionDemandTraceProgressLabel,
  productionDemandTraceStatus,
} from './production-demand-trace-presentation';
import { formatQuantity as quantity } from '../../../utils/quantity';

defineOptions({ name: 'ProductionDemandTraceDialog' });
const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  demandId: string | null;
  demands: ProductionMaterialDemandItem[];
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  correct: [demandId: string];
}>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const trace = useProductionDemandTrace(props);
const {
  rows,
  selected,
  original,
  latest,
  history,
  latestCheck,
  loading,
  error,
  eligibilityError,
  needsRefresh,
  canCorrectLatest,
  refresh,
} = trace;

const close = (): void => {
  trace.cancel();
  emit('update:visible', false);
};
const correctLatest = (): void => {
  if (!canCorrectLatest.value || !latest.value) return;
  emit('correct', latest.value.demandId);
};
const traceRowClass = ({ row }: { row: ProductionMaterialDemandItem }): string =>
  row.demandId === props.demandId ? 'selected-demand-row' : '';
const openApproval = async (instanceId: string): Promise<void> => {
  if (!canAccessRoute({ name: 'approval-inbox' })) return;
  await router.push({ name: 'approval-inbox', query: { instanceId } });
};
defineExpose({ refresh });
</script>

<style scoped>
.trace-body {
  min-height: 180px;
}
.trace-body > .el-alert,
.trace-body > .inline-hint {
  margin-bottom: 12px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 10px;
}
.section-heading h4 {
  margin: 0;
}
.record-markers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
section + section {
  margin-top: 20px;
}
.correction-blockers {
  margin-bottom: 12px;
}
h4 {
  margin: 0 0 10px;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
.secondary-text {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.source-reason,
.reason-text {
  margin: 6px 0 0;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.blocker-title {
  font-weight: 600;
}
.blocker-list {
  margin: 4px 0 0;
  padding-left: 20px;
}
.trace-body :deep(.selected-demand-row) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
</style>
