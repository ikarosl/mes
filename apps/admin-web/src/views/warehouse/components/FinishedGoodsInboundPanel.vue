<template>
  <section class="finished-inbounds">
    <el-radio-group
      v-model="view"
      @change="refreshActive"
    >
      <el-radio-button value="candidates">待入库</el-radio-button>
      <el-radio-button value="history">已入库记录</el-radio-button>
    </el-radio-group>
    <template v-if="view === 'candidates'">
      <details class="rules">
        <summary>查看成品入库资格与分次规则</summary>
        仅当前有效且尚有剩余额度的批准授权可办理；同一入库单限同一生产任务。每份授权可分次、分目标批次入库，确认时会重新核对资格。
      </details>
      <el-form
        :inline="true"
        class="query-panel"
        @submit.prevent="searchCandidates"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="candidateKeyword"
            clearable
            placeholder="工单 / 任务 / 成品"
            @keyup.enter="searchCandidates"
        /></el-form-item>
        <el-form-item label="授权类别"
          ><el-select
            v-model="candidateSource"
            clearable
            placeholder="全部类别"
          >
            <el-option
              v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
              :key="source"
              :value="source"
              :label="FINISHED_GOODS_INBOUND_SOURCE_LABELS[source]"
            /> </el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="candidateLoading"
            @click="searchCandidates"
            >查询</el-button
          ><el-button @click="resetCandidates">重置</el-button></el-form-item
        >
      </el-form>
      <el-alert
        v-if="candidateError"
        :title="candidateError"
        type="error"
        :closable="false"
      />
      <div class="table-panel">
        <TableToolbar :total="candidateTotal"
          ><template #actions>
            <el-button
              type="primary"
              :disabled="!selected.length && !editorDialog?.hasDraft()"
              @click="openCreate"
              >{{
                selected.length ? `核对入库（${selected.length} 条目标明细）` : '继续核对草稿'
              }}</el-button
            >
            <el-button
              :disabled="(!selected.length && !editorDialog?.hasDraft()) || visible"
              @click="clearSelection"
              >放弃草稿</el-button
            >
            <span class="muted">跨页保留已选授权；同一入库单限同一任务</span> </template
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="candidateLoading"
              aria-label="刷新成品授权"
              @click="loadCandidates" /></template
        ></TableToolbar>
        <el-table
          v-loading="candidateLoading"
          :data="candidates"
          row-key="allocationId"
          :empty-text="
            candidateError
              ? '读取失败，请刷新重试'
              : candidateKeyword || candidateSource
                ? '当前筛选无可入库授权，请清除筛选'
                : '无当前可入授权；请先核对成品质检与批准产出清单'
          "
        >
          <el-table-column width="50"
            ><template #default="{ row }"
              ><el-checkbox
                :model-value="isSelected(row.allocationId)"
                :disabled="
                  !row.canConfirm ||
                  (selectedTaskId !== null && selectedTaskId !== row.productionBatchId)
                "
                :aria-label="`${isSelected(row.allocationId) ? '取消整份授权' : '选择授权'} ${row.batchNo} ${row.productCode} ${FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]}`"
                @change="toggle(row)" /></template
          ></el-table-column>
          <el-table-column
            label="工单 / 任务"
            min-width="170"
            ><template #default="{ row }"
              >{{ row.workOrderNo }}
              <div class="muted">{{ row.batchNo }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="成品 / 类别"
            min-width="200"
            ><template #default="{ row }"
              >{{ row.productCode }} · {{ row.productName }}
              <div class="muted">
                {{
                  FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
                }}
                · {{ row.unit }}
              </div></template
            ></el-table-column
          >
          <el-table-column
            label="采用依据"
            min-width="160"
            ><template #default="{ row }"
              >批准清单第 {{ row.revisionNo }} 版
              <div class="muted">授权 {{ row.allocationId }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="批准 / 历史已入 / 当前剩余"
            min-width="205"
            ><template #default="{ row }"
              ><div>批准 {{ formatQuantity(row.authorizedQuantity) }} {{ row.unit }}</div>
              <div>已入 {{ formatQuantity(row.receivedQuantity) }} {{ row.unit }}</div>
              <strong
                >剩余 {{ formatQuantity(row.remainingQuantity) }} {{ row.unit }}</strong
              ></template
            ></el-table-column
          >
          <el-table-column
            label="当前资格"
            min-width="160"
            ><template #default="{ row }"
              ><span :class="row.canConfirm ? 'available' : 'error'">{{
                row.canConfirm
                  ? selectedTaskId && selectedTaskId !== row.productionBatchId
                    ? '需与已选授权同一任务'
                    : '可入库'
                  : row.blockers.join('；') || '当前不可入库'
              }}</span></template
            ></el-table-column
          >
          <el-table-column
            label="操作"
            width="110"
            fixed="right"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="
                  !row.canConfirm ||
                  (selectedTaskId !== null && selectedTaskId !== row.productionBatchId)
                "
                @click="openFromCandidate(row)"
                >办理入库</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <PaginationFooter
          :total="candidateTotal"
          :current-page="candidatePage"
          :page-size="10"
          total-suffix="份授权"
          @page-change="changeCandidatePage"
        />
      </div>
    </template>
    <template v-else>
      <el-form
        :inline="true"
        class="query-panel"
        @submit.prevent="list.search"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="入库单 / 工单 / 任务 / 成品"
            @keyup.enter="list.search"
        /></el-form-item>
        <el-form-item label="授权类别"
          ><el-select
            v-model="query.sourceType"
            clearable
            placeholder="全部类别"
            ><el-option
              v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
              :key="source"
              :value="source"
              :label="FINISHED_GOODS_INBOUND_SOURCE_LABELS[source]" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="list.search"
            >查询</el-button
          ><el-button @click="list.reset">重置</el-button></el-form-item
        >
      </el-form>
      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        :title="error"
      />
      <div class="table-panel">
        <TableToolbar :total="total"
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              aria-label="刷新成品入库记录"
              @click="list.load" /></template
        ></TableToolbar>
        <el-table
          v-loading="loading"
          :data="rows"
          row-key="inboundId"
          :empty-text="
            error
              ? '读取失败，请刷新重试'
              : query.keyword || query.sourceType
                ? '当前筛选无已入库记录，请清除筛选'
                : '暂无已确认成品入库记录；可切换到待入库办理'
          "
        >
          <el-table-column
            prop="inboundNo"
            label="入库单"
            min-width="180"
          />
          <el-table-column
            label="真实授权来源"
            min-width="210"
            ><template #default="{ row }"
              ><div
                v-for="item in sourceSummary(row)"
                :key="item.source"
              >
                {{ FINISHED_GOODS_INBOUND_SOURCE_LABELS[item.source] }}
                {{ formatQuantity(item.quantity) }} {{ row.unit }}
              </div></template
            ></el-table-column
          >
          <el-table-column
            label="工单 / 任务"
            min-width="190"
            ><template #default="{ row }"
              >{{ row.workOrderNo }}
              <div class="muted">{{ row.batchNo }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="成品 / 库存批次"
            min-width="220"
            ><template #default="{ row }"
              >{{ row.productCode }} · {{ row.productName }}
              <div class="muted">
                {{
                  [
                    ...new Set(
                      row.details.map((item: FinishedGoodsInboundOrderLine) => item.batchCode),
                    ),
                  ].join('、')
                }}
              </div></template
            ></el-table-column
          >
          <el-table-column
            label="实际入库数量"
            min-width="155"
            ><template #default="{ row }"
              >{{ formatQuantity(row.inboundQuantity) }} {{ row.unit }} ·
              {{ row.details.length }} 条明细</template
            ></el-table-column
          >
          <el-table-column
            label="确认时间"
            min-width="170"
            ><template #default="{ row }">{{
              formatDateTimeForDisplay(row.inboundAt)
            }}</template></el-table-column
          >
          <el-table-column
            label="操作"
            width="110"
            fixed="right"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                @click="openDetail(row.inboundId)"
                >查看详情</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <PaginationFooter
          :total="total"
          :current-page="query.page ?? 1"
          :page-size="query.pageSize ?? 20"
          @update:page-size="list.changePageSize"
          @page-change="list.changePage"
        />
      </div>
    </template>
    <FinishedGoodsInboundDialog
      ref="editorDialog"
      v-model:visible="visible"
      v-model:selected="selected"
      :inbound-id="selectedId"
      :active="active"
      @changed="onChanged"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type {
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderLine,
  FinishedGoodsInboundSource,
} from '@company/contracts';
import {
  FINISHED_GOODS_INBOUND_SOURCES,
  FINISHED_GOODS_INBOUND_SOURCE_LABELS,
} from '@company/constants';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useTabsStore } from '../../../stores/tabs';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import { useFinishedGoodsInbounds } from '../composables/useFinishedGoodsInbounds';
import type { FinishedInboundSelection } from '../finished-inbound-selection';
import FinishedGoodsInboundDialog from './FinishedGoodsInboundDialog.vue';

defineOptions({ name: 'FinishedGoodsInboundPanel' });
const props = defineProps<{ requestedInboundId?: string | null; active: boolean }>();
const view = ref<'candidates' | 'history'>('candidates');
const candidateKeyword = ref('');
const candidateSource = ref<FinishedGoodsInboundSource | ''>('');
const candidatePage = ref(1);
const candidates = ref<FinishedGoodsInboundCandidate[]>([]);
const candidateTotal = ref(0);
const candidateLoading = ref(false);
const candidateError = ref('');
const candidateRead = useLatestReadRequest(() => {
  candidateLoading.value = false;
});
const selected = ref<FinishedInboundSelection[]>([]);
const selectedTaskId = computed(() => selected.value[0]?.source.productionBatchId ?? null);
const list = useFinishedGoodsInbounds();
const { query, rows, total, loading, error } = list;
const route = useRoute();
const router = useRouter();
const editorDialog = ref<InstanceType<typeof FinishedGoodsInboundDialog> | null>(null);
const visible = ref(false);
const selectedId = ref<string | null>(null);
let changingTarget = false;

async function loadCandidates(): Promise<void> {
  if (!props.active || view.value !== 'candidates' || !candidateRead.isActive()) return;
  const current = candidateRead.begin(() => props.active && view.value === 'candidates');
  candidateLoading.value = true;
  candidateError.value = '';
  try {
    const page = await productionApi.finishedGoodsInboundCandidates({
      keyword: candidateKeyword.value.trim() || undefined,
      sourceType: candidateSource.value || undefined,
      page: candidatePage.value,
      pageSize: 10,
    });
    if (!current.isCurrent()) return;
    candidates.value = page.items;
    candidateTotal.value = page.total;
  } catch (failure) {
    if (!current.isCurrent()) return;
    candidateError.value = '成品授权读取失败，请重试';
    EMessage.error(failure);
  } finally {
    if (current.isCurrent()) candidateLoading.value = false;
  }
}
function searchCandidates(): void {
  candidatePage.value = 1;
  void loadCandidates();
}
function resetCandidates(): void {
  candidateKeyword.value = '';
  candidateSource.value = '';
  searchCandidates();
}
function changeCandidatePage(page: number): void {
  candidatePage.value = page;
  void loadCandidates();
}
function isSelected(allocationId: string): boolean {
  return selected.value.some((item) => item.source.allocationId === allocationId);
}
async function toggle(source: FinishedGoodsInboundCandidate): Promise<void> {
  if (visible.value || editorDialog.value?.isLocked()) return;
  if (isSelected(source.allocationId)) {
    const targetCount = selected.value.filter(
      (item) => item.source.allocationId === source.allocationId,
    ).length;
    if (targetCount > 1) {
      try {
        await RouteMessageBox.confirm(
          `取消整份授权将移除 ${targetCount} 条目标明细，确定继续吗？`,
          '取消已选授权',
          { type: 'warning', confirmButtonText: '移除整份授权' },
        );
      } catch {
        return;
      }
    }
    // A candidate checkbox represents the whole authorization, including every split target.
    selected.value = selected.value.filter(
      (item) => item.source.allocationId !== source.allocationId,
    );
    return;
  }
  if (
    !source.canConfirm ||
    (selectedTaskId.value && selectedTaskId.value !== source.productionBatchId)
  )
    return;
  selected.value.push({
    detailKey: crypto.randomUUID(),
    source: { ...source },
    quantity: source.remainingQuantity,
    target: { mode: 'new', clientKey: crypto.randomUUID() },
  });
}
async function openFromCandidate(source: FinishedGoodsInboundCandidate): Promise<void> {
  if (!isSelected(source.allocationId)) await toggle(source);
  if (isSelected(source.allocationId)) await openCreate();
}
function sourceSummary(
  row: FinishedGoodsInboundOrderItem,
): Array<{ source: FinishedGoodsInboundSource; quantity: number }> {
  const grouped = new Map<FinishedGoodsInboundSource, number>();
  for (const item of row.details)
    grouped.set(item.sourceType, (grouped.get(item.sourceType) ?? 0) + Number(item.quantity));
  return [...grouped].map(([source, quantity]) => ({ source, quantity }));
}
async function prepareTargetSwitch(): Promise<boolean> {
  if (!editorDialog.value) return !selected.value.length;
  if (!(await editorDialog.value.prepareTargetSwitch())) return false;
  await nextTick();
  return true;
}
async function openCreate(): Promise<void> {
  if (changingTarget || (!selected.value.length && !editorDialog.value?.hasDraft())) return;
  if (visible.value && !editorDialog.value?.currentInboundId()) return;
  changingTarget = true;
  try {
    if (visible.value && editorDialog.value && !(await editorDialog.value.close())) return;
    selectedId.value = null;
    visible.value = true;
  } finally {
    changingTarget = false;
  }
}
async function clearSelection(): Promise<void> {
  if (!editorDialog.value) return;
  await editorDialog.value.discardDraft();
}
async function restoreCurrentNavigation(rejectedId: string): Promise<void> {
  if (route.name !== 'warehouse-inbound' || route.query.inboundId !== rejectedId) return;
  const inboundId = editorDialog.value?.currentInboundId() ?? undefined;
  await router.replace({ query: { ...route.query, inboundId } });
}
async function openDetail(id: string, fromNavigation = false): Promise<void> {
  if (visible.value && editorDialog.value?.currentInboundId() === id) return;
  if (changingTarget) {
    if (fromNavigation) await restoreCurrentNavigation(id);
    return;
  }
  changingTarget = true;
  try {
    if (!(await prepareTargetSwitch())) {
      if (fromNavigation) await restoreCurrentNavigation(id);
      return;
    }
    if (fromNavigation && (route.name !== 'warehouse-inbound' || route.query.inboundId !== id))
      return;
    view.value = 'history';
    selectedId.value = id;
    visible.value = true;
  } finally {
    changingTarget = false;
  }
}
function onChanged(id: string): void {
  candidateRead.invalidate();
  view.value = 'history';
  selectedId.value = id;
  void list.load();
}
function refreshActive(): void {
  if (!props.active) return;
  if (view.value === 'candidates') void loadCandidates();
  else {
    candidateRead.invalidate();
    void list.load();
  }
}
watch(
  () => props.requestedInboundId,
  (id) => {
    if (id) void openDetail(id, true);
  },
  { immediate: true },
);
watch(view, (value) => {
  if (value === 'history') candidateRead.invalidate();
});
onMounted(refreshActive);
watch(
  () => props.active,
  (active) => {
    if (active) refreshActive();
    else candidateRead.invalidate();
  },
);
let activated = false;
onActivated(() => {
  if (activated && props.active) refreshActive();
  activated = true;
});
onScopeDispose(
  useTabsStore().registerCloseGuard('warehouse-inbound', async () =>
    editorDialog.value ? editorDialog.value.discardDraft() : !selected.value.length,
  ),
);
</script>

<style scoped>
.finished-inbounds {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  background: #fff;
  border-radius: 6px;
}
.query-panel {
  padding: 16px 16px 0;
}
.query-panel :deep(.el-select) {
  width: 170px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.available {
  color: var(--el-color-success-dark-2);
}
.error {
  color: var(--el-color-danger);
}
.rules {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding: 8px 16px;
}
.rules summary {
  color: var(--el-color-primary);
  cursor: pointer;
}
</style>
