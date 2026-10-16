<template>
  <el-dialog
    :model-value="visible"
    :title="moveSourceIds ? '选择分开采购的需求' : '选择采购需求'"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-alert
      :title="
        moveSourceIds
          ? '选中的需求将移到新行，请分别核对两行采购数量。'
          : '仅选择当前工单的需求，可跨任务、跨页选择。采购数量另行填写，不分摊到需求。'
      "
      type="info"
      :closable="false"
    />
    <el-form
      v-if="!moveSourceIds"
      inline
      class="picker-search"
      @submit.prevent="search"
    >
      <el-form-item label="工单 / 任务 / 物料"
        ><el-input
          v-model="keyword"
          clearable
          placeholder="输入编码或物料名称"
      /></el-form-item>
      <el-form-item label="需求类型"
        ><el-select
          v-model="demandType"
          clearable
          placeholder="全部类型"
          style="width: 170px"
          ><el-option
            v-for="type in DEMAND_TYPES"
            :key="type"
            :value="type"
            :label="DEMAND_GENERATION_GROUP_TYPE_LABELS[type]" /></el-select
      ></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          native-type="submit"
          :loading="loading"
          >查询</el-button
        ><el-button @click="refreshAll">刷新并核对已选</el-button></el-form-item
      >
    </el-form>
    <div
      v-if="batchId"
      class="selection-summary"
    >
      <el-tag
        closable
        @close="clearGroupFilter"
        >当前分组筛选：{{ groupFilterLabel }}</el-tag
      >
    </div>
    <div class="selection-summary">
      <strong>
        已选 {{ selected.size }} / {{ PURCHASE_ORDER_MAX_DEMANDS }} 条
        {{ moveSourceIds ? '（原行须至少保留 1 条需求）' : '（跨页保留）' }}
      </strong>
      <el-tag
        v-for="entry in selected.values()"
        :key="entry.demandId"
        closable
        :type="entry.eligible && !alreadyAdded.has(entry.demandId) ? 'info' : 'danger'"
        @close="remove(entry.demandId)"
      >
        {{ entry.demand?.batchNo ?? entry.demandId }} ·
        {{ entry.demand?.materialVariantCode ?? '需求已不存在' }}
        <span v-if="alreadyAdded.has(entry.demandId)"> · 已添加，请移除重复选择</span>
        <span v-else-if="!entry.eligible"> · {{ entry.blockedReason }}</span>
      </el-tag>
    </div>
    <div
      v-loading="loading"
      class="candidate-body"
    >
      <el-empty
        v-if="!loading && !rows.length"
        description="没有符合条件的采购需求"
      />
      <section
        v-for="batch in grouped"
        :key="batch.id"
        class="work-order-group"
      >
        <h4>
          任务 {{ batch.no }}{{ moveSourceIds ? '' : '（当前页）'
          }}<el-button
            v-if="!moveSourceIds"
            link
            type="primary"
            @click="filterGroup(batch.id, batch.no)"
            >只看此任务</el-button
          >
        </h4>
        <el-table
          :data="batch.rows"
          row-key="demandId"
        >
          <el-table-column
            label="选择"
            width="65"
            ><template #default="{ row }"
              ><el-checkbox
                :model-value="selected.has(row.demandId)"
                :aria-label="`选择需求 ${row.demandId}`"
                :disabled="
                  disabled ||
                  alreadyAdded.has(row.demandId) ||
                  moveBlocked.has(row.demandId) ||
                  (!!moveSourceIds && !moveSourceIds.includes(row.demandId)) ||
                  (!!materialVariantId && row.materialVariantId !== materialVariantId)
                "
                @change="toggle(row)" /></template
          ></el-table-column>
          <el-table-column
            label="草稿关联"
            width="125"
          >
            <template #default="{ row }">
              <el-tag
                v-if="moveBlocked.has(row.demandId)"
                type="danger"
                >{{ moveBlocked.get(row.demandId) }}</el-tag
              >
              <el-tag
                v-else-if="moveSourceIds"
                type="info"
                >原行需求</el-tag
              >
              <el-tag
                v-else-if="alreadyAdded.has(row.demandId)"
                type="info"
                >已添加</el-tag
              >
              <el-tag
                v-else-if="otherRows.has(row.demandId)"
                type="info"
                >其他行已关联</el-tag
              >
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="itemCode"
            label="物料编码"
            min-width="140"
          />
          <el-table-column
            prop="itemName"
            label="物料名称"
            min-width="140"
          />
          <el-table-column
            prop="materialVariantCode"
            label="精确版本"
            min-width="190"
          />
          <el-table-column
            label="需求类型"
            width="135"
            ><template #default="{ row }">{{
              DEMAND_GENERATION_GROUP_TYPE_LABELS[row.demandType as DemandType]
            }}</template></el-table-column
          >
          <el-table-column
            label="需求状态"
            width="100"
            ><template #default="{ row }">{{
              DEMAND_BUSINESS_STATUS_LABELS[row.businessStatus as DemandBusinessStatus]
            }}</template></el-table-column
          >
          <el-table-column
            prop="supplierHint"
            label="生产采购提示"
            min-width="190"
          />
          <el-table-column
            label="需求量"
            width="110"
            ><template #default="{ row }"
              >{{ Number(row.demandQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="剩余缺口"
            width="110"
            ><template #default="{ row }">{{
              Number(row.remainingDemandQuantity)
            }}</template></el-table-column
          >
        </el-table>
      </section>
    </div>
    <PaginationFooter
      v-if="!moveSourceIds"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消选择</el-button>
      <el-button
        type="primary"
        :loading="resolving"
        :disabled="
          disabled ||
          !selected.size ||
          loading ||
          hasAlreadyAddedSelection ||
          (!!moveSourceIds && selected.size >= moveSourceIds.length)
        "
        @click="confirm"
        >{{ moveSourceIds ? '核对并移到新行' : '核对并采用所选需求' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import type {
  ProcurementDemandCandidate,
  ProcurementDemandResolution,
  DemandType,
  DemandBusinessStatus,
} from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_DEMANDS,
  DEMAND_TYPES,
  DEMAND_GENERATION_GROUP_TYPE_LABELS,
  DEMAND_BUSINESS_STATUS_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

const props = defineProps<{
  visible: boolean;
  selectedIds: string[];
  alreadyAddedIds: string[];
  otherRowIds: string[];
  moveSourceIds?: string[];
  disabled: boolean;
  workOrderId: string;
  itemId?: string;
  materialVariantId?: string;
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  selected: [ProcurementDemandCandidate[]];
}>();
const keyword = ref(''),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0),
  loading = ref(false),
  resolving = ref(false);
const demandType = ref<DemandType | ''>(''),
  batchId = ref<string>(),
  groupFilterLabel = ref('');
const rows = ref<ProcurementDemandCandidate[]>([]);
const selected = ref(new Map<string, ProcurementDemandResolution>());
const moveBlocked = ref(new Map<string, string>());
const alreadyAdded = computed(() => new Set(props.alreadyAddedIds));
const otherRows = computed(() => new Set(props.otherRowIds));
const hasAlreadyAddedSelection = computed(() =>
  [...selected.value.keys()].some((id) => alreadyAdded.value.has(id)),
);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const resolutionRead = useLatestReadRequest(() => {
  resolving.value = false;
});
const grouped = computed(() => {
  const batches = new Map<string, { id: string; no: string; rows: ProcurementDemandCandidate[] }>();
  for (const row of rows.value) {
    let batch = batches.get(row.productionBatchId);
    if (!batch) {
      batch = { id: row.productionBatchId, no: row.batchNo, rows: [] };
      batches.set(batch.id, batch);
    }
    batch.rows.push(row);
  }
  return [...batches.values()];
});
const load = async (): Promise<void> => {
  if (!props.visible || !props.workOrderId || !read.isActive()) return;
  const current = read.begin(() => props.visible);
  loading.value = true;
  try {
    if (props.moveSourceIds) {
      const result = await procurementApi.resolveDemands(
        props.workOrderId,
        props.moveSourceIds,
        current.signal,
      );
      if (current.isCurrent()) {
        rows.value = result.flatMap((entry) => (entry.demand ? [entry.demand] : []));
        moveBlocked.value = new Map(
          result
            .filter((entry) => !entry.eligible || !entry.demand)
            .map((entry) => [entry.demandId, entry.blockedReason ?? '当前不可采购']),
        );
        total.value = rows.value.length;
        if (rows.value.length !== props.moveSourceIds.length) {
          EMessage.warning('部分原行需求当前不可采购，请核对原行关联');
        }
      }
      return;
    }
    moveBlocked.value = new Map();
    const result = await procurementApi.demandCandidates(
      {
        keyword: keyword.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
        demandType: demandType.value || undefined,
        workOrderId: props.workOrderId,
        itemId: props.itemId,
        batchId: batchId.value,
      },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '需求候选加载失败');
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const resolveSelection = async (): Promise<ProcurementDemandCandidate[] | null> => {
  if (props.disabled) return null;
  if (hasAlreadyAddedSelection.value) {
    EMessage.warning('部分需求已添加，请移除重复选择后再继续');
    return null;
  }
  const ids = [...selected.value.keys()];
  if (
    props.moveSourceIds &&
    (ids.length >= props.moveSourceIds.length ||
      ids.some((id) => !props.moveSourceIds?.includes(id)))
  ) {
    EMessage.warning('请选择原行的部分需求，原行须至少保留 1 条');
    return null;
  }
  const current = resolutionRead.begin(() => props.visible);
  if (!ids.length) return [];
  resolving.value = true;
  try {
    const result = await procurementApi.resolveDemands(props.workOrderId, ids, current.signal);
    if (!current.isCurrent()) return null;
    if (
      props.disabled ||
      ids.some((id) => alreadyAdded.value.has(id)) ||
      (props.moveSourceIds &&
        (ids.length >= props.moveSourceIds.length ||
          ids.some((id) => !props.moveSourceIds?.includes(id))))
    ) {
      EMessage.warning('草稿已变化，请核对已选需求后再继续');
      return null;
    }
    selected.value = new Map(
      ids.map((id) => [
        id,
        result.find((entry) => entry.demandId === id) ?? {
          demandId: id,
          demand: selected.value.get(id)?.demand ?? null,
          eligible: false,
          blockedReason: '资格未返回，请重新核对',
        },
      ]),
    );
    if (result.length !== ids.length || result.some((entry) => !entry.eligible || !entry.demand)) {
      EMessage.warning('部分已选需求当前不可采购，请核对提示并移除后再继续');
      return null;
    }
    return result.flatMap((entry) => (entry.demand ? [entry.demand] : []));
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '已选需求核对失败');
    return null;
  } finally {
    if (current.isCurrent()) resolving.value = false;
  }
};
const remove = (id: string): void => {
  resolutionRead.invalidate();
  selected.value.delete(id);
};
const toggle = (row: ProcurementDemandCandidate): void => {
  if (
    props.disabled ||
    alreadyAdded.value.has(row.demandId) ||
    moveBlocked.value.has(row.demandId) ||
    (props.moveSourceIds && !props.moveSourceIds.includes(row.demandId)) ||
    (props.materialVariantId && row.materialVariantId !== props.materialVariantId)
  )
    return;
  resolutionRead.invalidate();
  if (selected.value.has(row.demandId)) {
    selected.value.delete(row.demandId);
    return;
  }
  if (selected.value.size >= PURCHASE_ORDER_MAX_DEMANDS) {
    EMessage.warning(`单次最多选择 ${PURCHASE_ORDER_MAX_DEMANDS} 条需求`);
    return;
  }
  selected.value.set(row.demandId, {
    demandId: row.demandId,
    demand: row,
    eligible: true,
    blockedReason: null,
  });
};
const search = async (): Promise<void> => {
  page.value = 1;
  await load();
};
const filterGroup = async (batch: string | undefined, label: string): Promise<void> => {
  batchId.value = batch;
  groupFilterLabel.value = label;
  await search();
};
const clearGroupFilter = async (): Promise<void> => {
  batchId.value = undefined;
  groupFilterLabel.value = '';
  await search();
};
const changePage = async (value: number): Promise<void> => {
  page.value = value;
  await load();
};
const changePageSize = async (value: number): Promise<void> => {
  pageSize.value = value;
  await search();
};
const refreshAll = async (): Promise<void> => {
  await Promise.all([load(), resolveSelection()]);
};
const confirm = async (): Promise<void> => {
  const result = await resolveSelection();
  if (result?.length) {
    emit('selected', result);
  }
};
watch(
  () => [props.alreadyAddedIds, props.disabled, props.moveSourceIds],
  () => resolutionRead.invalidate(),
  { flush: 'sync' },
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      read.invalidate();
      resolutionRead.invalidate();
      selected.value.clear();
      return;
    }
    selected.value = new Map(
      props.selectedIds.map((demandId) => [
        demandId,
        { demandId, demand: null, eligible: false, blockedReason: '待核对' },
      ]),
    );
    moveBlocked.value = new Map();
    page.value = 1;
    batchId.value = undefined;
    keyword.value = '';
    void refreshAll();
  },
);
onActivated(() => {
  if (props.visible) void refreshAll();
});
</script>

<style scoped>
.picker-search {
  margin-top: 16px;
}
.selection-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
  max-height: 140px;
  overflow: auto;
}
.selection-summary strong {
  width: 100%;
}
.candidate-body {
  min-height: 180px;
}
.work-order-group {
  margin: 12px 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}
h4 {
  margin: 10px 14px;
  font-size: 13px;
  color: #606266;
}
</style>
