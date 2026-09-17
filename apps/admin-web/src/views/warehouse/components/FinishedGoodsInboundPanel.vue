<template>
  <section class="finished-inbounds">
    <el-form
      :inline="true"
      class="query-panel"
    >
      <el-form-item label="关键字"
        ><el-input
          v-model="query.keyword"
          clearable
          placeholder="入库单 / 工单 / 任务 / 成品"
          @keyup.enter="list.search"
      /></el-form-item>
      <el-form-item label="业务来源"
        ><el-select
          v-model="query.sourceType"
          clearable
          placeholder="全部来源"
          ><el-option
            v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
            :key="source"
            :value="source"
            :label="FINISHED_GOODS_INBOUND_SOURCE_LABELS[source]" /></el-select
      ></el-form-item>
      <el-form-item label="状态"
        ><el-select
          v-model="query.status"
          clearable
          placeholder="全部状态"
          ><el-option
            v-for="(label, value) in inboundOrderStatusLabels"
            :key="value"
            :value="value"
            :label="label" /></el-select
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
        ><template #actions
          ><el-button
            v-for="source in FINISHED_GOODS_INBOUND_SOURCES"
            :key="source"
            type="primary"
            :plain="source === 'production_extra'"
            @click="openCreate(source)"
            >{{ FINISHED_GOODS_INBOUND_SOURCE_LABELS[source] }}</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="list.load" /></template
      ></TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="inboundId"
        empty-text="暂无成品入库单，可按已批准产出清单创建"
      >
        <el-table-column
          prop="inboundNo"
          label="入库单"
          min-width="180"
        />
        <el-table-column
          label="业务来源"
          min-width="130"
          ><template #default="{ row }">{{
            FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
          }}</template></el-table-column
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
          min-width="190"
          ><template #default="{ row }"
            >{{ row.productCode }} · {{ row.productName }}
            <div class="muted">{{ row.batchCode }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="采用清单 / 数量"
          min-width="165"
          ><template #default="{ row }"
            >第 {{ row.revisionNo }} 版 · {{ formatQuantity(row.inboundQuantity) }} {{ row.unit }}
            <div
              v-if="
                row.status === 'pending' && row.outputRevisionId !== row.currentOutputRevisionId
              "
              class="warning"
            >
              批准依据已更新
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          width="105"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'completed'
                  ? 'success'
                  : row.status === 'pending'
                    ? 'warning'
                    : 'info'
              "
              >{{ inboundOrderStatusLabel(row.status) }}</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column
          label="确认时间"
          min-width="170"
          ><template #default="{ row }">{{
            row.inboundAt ? formatDateTimeForDisplay(row.inboundAt) : '尚未确认'
          }}</template></el-table-column
        >
        <el-table-column
          label="操作"
          width="120"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openDetail(row.inboundId)"
              >{{ row.status === 'pending' ? '核对 / 办理' : '查看详情' }}</el-button
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
    <FinishedGoodsInboundDialog
      ref="editorDialog"
      v-model:visible="visible"
      :inbound-id="selectedId"
      :source-type="selectedSource"
      :active="active"
      @changed="list.load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type { FinishedGoodsInboundSource } from '@company/contracts';
import {
  FINISHED_GOODS_INBOUND_SOURCES,
  FINISHED_GOODS_INBOUND_SOURCE_LABELS,
} from '@company/constants';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import {
  inboundOrderStatusLabel,
  inboundOrderStatusLabels,
} from '../../../constants/business-status';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import { useFinishedGoodsInbounds } from '../composables/useFinishedGoodsInbounds';
import FinishedGoodsInboundDialog from './FinishedGoodsInboundDialog.vue';
defineOptions({ name: 'FinishedGoodsInboundPanel' });
const props = defineProps<{ requestedInboundId?: string | null; active: boolean }>();
const list = useFinishedGoodsInbounds();
const { query, rows, total, loading, error } = list;
const route = useRoute(),
  router = useRouter(),
  editorDialog = ref<InstanceType<typeof FinishedGoodsInboundDialog> | null>(null);
const visible = ref(false),
  selectedId = ref<string | null>(null),
  selectedSource = ref<FinishedGoodsInboundSource>('self_made');
let changingTarget = false;
async function prepareTargetSwitch(): Promise<boolean> {
  if (!visible.value) return true;
  if (!editorDialog.value || !(await editorDialog.value.prepareTargetSwitch())) return false;
  await nextTick();
  return true;
}
async function openCreate(source: FinishedGoodsInboundSource) {
  if (changingTarget) return;
  if (visible.value && !editorDialog.value?.currentInboundId() && selectedSource.value === source)
    return;
  changingTarget = true;
  try {
    if (!(await prepareTargetSwitch())) return;
    selectedId.value = null;
    selectedSource.value = source;
    visible.value = true;
  } finally {
    changingTarget = false;
  }
}
async function restoreCurrentNavigation(rejectedId: string) {
  if (route.name !== 'warehouse-inbound' || route.query.inboundId !== rejectedId) return;
  const inboundId = editorDialog.value?.currentInboundId() ?? undefined;
  await router.replace({ query: { ...route.query, inboundId } });
}
async function openDetail(id: string, fromNavigation = false) {
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
    selectedId.value = id;
    visible.value = true;
  } finally {
    changingTarget = false;
  }
}
watch(
  () => props.requestedInboundId,
  (id) => {
    if (id) void openDetail(id, true);
  },
  { immediate: true },
);
onMounted(() => {
  if (props.active) void list.load();
});
watch(
  () => props.active,
  (active) => {
    if (active) void list.load();
  },
);
let activated = false;
onActivated(() => {
  if (activated && props.active) void list.load();
  activated = true;
});
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
.warning {
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}
</style>
