<template>
  <div
    ref="container"
    v-loading="loading"
    class="history-groups"
  >
    <div
      v-if="!rows.length"
      class="empty-list"
    >
      {{ emptyText }}
    </div>
    <section
      v-for="order in rows"
      :key="order.inboundId"
      class="inbound-block"
      :class="{ 'is-located': order.inboundId === locatedInboundId }"
    >
      <InboundGroupHeader
        :expanded="!collapsedInboundIds.has(order.inboundId)"
        :title="`入库单 ${order.inboundNo}`"
        :count-label="`本单 ${order.details.length} 条实际入库明细`"
        @toggle="toggleInbound(order.inboundId)"
      >
        <strong class="group-product">{{ order.productCode }} · {{ order.productName }}</strong>
        <span class="group-meta">工单 {{ order.workOrderNo }} · 任务 {{ order.batchNo }}</span>
        <span class="group-meta">确认 {{ formatDateTimeForDisplay(order.inboundAt) }}</span>
        <span class="group-meta">
          确认人 {{ displayPerson(order.createdByName, order.createdById) }}
        </span>
        <span class="group-meta">
          本次实际入库 <strong>{{ formatQuantity(order.inboundQuantity) }} {{ order.unit }}</strong>
        </span>
        <el-tag
          v-if="order.inboundId === locatedInboundId"
          type="primary"
          effect="plain"
          >当前定位</el-tag
        >
        <el-button
          v-if="order.inboundId === locatedInboundId"
          link
          @click="emit('clear-location')"
        >
          取消定位
        </el-button>
      </InboundGroupHeader>
      <div
        v-if="!collapsedInboundIds.has(order.inboundId)"
        v-loading="detailLoading[order.inboundId]"
        class="expanded-body"
      >
        <el-alert
          v-if="detailErrors[order.inboundId]"
          type="error"
          :closable="false"
          :title="detailErrors[order.inboundId]"
        />
        <el-button
          v-if="detailErrors[order.inboundId]"
          type="primary"
          link
          class="retry-button"
          @click="emit('retry', order.inboundId)"
          >重试读取本单依据</el-button
        >
        <template v-if="details[order.inboundId]">
          <div
            v-if="details[order.inboundId]?.remark"
            class="order-remark"
          >
            备注：{{ details[order.inboundId]?.remark }}
          </div>
          <el-table
            :data="details[order.inboundId]?.details"
            row-key="inboundDetailId"
            class="details-table"
            empty-text="本单无实际入库明细"
          >
            <el-table-column
              label="实际来源类别"
              min-width="145"
            >
              <template #default="{ row }">
                {{
                  FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
                }}
              </template>
            </el-table-column>
            <el-table-column
              label="目标库存批次"
              min-width="150"
            >
              <template #default="{ row }">
                <el-button
                  v-if="canViewInventory"
                  type="primary"
                  link
                  class="source-link"
                  @click="emit('batch', row.itemBatchId)"
                  >{{ row.batchCode }}</el-button
                >
                <span v-else>{{ row.batchCode }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="本次实际入库"
              min-width="145"
              align="right"
            >
              <template #default="{ row }">
                <strong>{{ formatQuantity(row.quantity) }} {{ order.unit }}</strong>
              </template>
            </el-table-column>
            <el-table-column
              label="本条采用的历史批准依据"
              min-width="260"
            >
              <template #default="{ row }">
                <div>产出清单第 {{ row.revisionNo }} 版</div>
                <template v-if="row.approvedOutput">
                  <div class="trace-meta">
                    批准人
                    {{
                      displayPerson(
                        row.approvedOutput.approvedByName,
                        row.approvedOutput.approvedBy,
                      )
                    }}
                  </div>
                  <div class="trace-meta">
                    批准时间 {{ formatDateTimeForDisplay(row.approvedOutput.approvedAt) }}
                  </div>
                  <el-button
                    v-if="canViewApproval && row.approvedOutput.approvalInstanceId"
                    type="primary"
                    link
                    class="source-link"
                    @click="emit('approval', row.approvedOutput.approvalInstanceId)"
                    >查看审批记录</el-button
                  >
                </template>
                <div
                  v-else
                  class="trace-meta"
                >
                  批准详情未提供
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="本条采用的历史检验"
              min-width="230"
            >
              <template #default="{ row }">
                <template v-if="row.approvedOutput?.snapshot.inspection">
                  <el-button
                    v-if="
                      canViewFinishedInspections &&
                      row.approvedOutput.snapshot.inspection.batchId === order.productionBatchId
                    "
                    type="primary"
                    link
                    class="source-link"
                    :title="`检验时间：${formatDateTimeForDisplay(row.approvedOutput.snapshot.inspection.inspectedAt)}`"
                    @click.stop="
                      emit(
                        'inspection',
                        order.productionBatchId,
                        row.approvedOutput.snapshot.inspection.id,
                      )
                    "
                    >检验记录 ID {{ row.approvedOutput.snapshot.inspection.id }}</el-button
                  >
                  <span
                    v-else
                    :title="`检验时间：${formatDateTimeForDisplay(row.approvedOutput.snapshot.inspection.inspectedAt)}`"
                    >检验记录 ID {{ row.approvedOutput.snapshot.inspection.id }}</span
                  >
                  <div class="trace-meta">
                    结论
                    {{
                      PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[
                        row.approvedOutput.snapshot.inspection
                          .releaseDecision as ProductionOutputReleaseDecision
                      ]
                    }}
                  </div>
                </template>
                <div
                  v-else
                  class="trace-meta"
                >
                  检验详情未提供
                </div>
              </template>
            </el-table-column>
          </el-table>
        </template>
        <div
          v-else-if="!detailErrors[order.inboundId]"
          class="detail-status"
        >
          正在读取本单历史批准与检验依据…
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type {
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundSource,
  ProductionOutputReleaseDecision,
} from '@company/contracts';
import {
  FINISHED_GOODS_INBOUND_SOURCE_LABELS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
  PERMISSIONS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'FinishedGoodsInboundHistoryGroups' });
const props = defineProps<{
  rows: FinishedGoodsInboundOrderItem[];
  loading: boolean;
  emptyText: string;
  details: Record<string, FinishedGoodsInboundOrderDetail>;
  detailLoading: Record<string, boolean>;
  detailErrors: Record<string, string>;
  locatedInboundId?: string | null;
}>();
const emit = defineEmits<{
  expand: [id: string];
  retry: [id: string];
  batch: [itemBatchId: string];
  approval: [instanceId: string];
  inspection: [batchId: string, recordId: string];
  'clear-location': [];
}>();
const auth = useAuthStore();
const { canAccessRoute } = useRouteAccess();
const canViewInventory = computed(() => auth.can(PERMISSIONS.production.inventory.view));
const canViewFinishedInspections = computed(() =>
  auth.can(PERMISSIONS.quality.finishedInspections.view),
);
const canViewApproval = computed(() => canAccessRoute({ name: 'approval-inbox' }));
const container = ref<HTMLElement | null>(null);
const collapsedInboundIds = ref(new Set<string>());
const orderedInboundIds = computed(() => props.rows.map((row) => row.inboundId));
watch(
  orderedInboundIds,
  (ids, previousIds) => {
    if (
      previousIds &&
      ids.length === previousIds.length &&
      ids.every((id, index) => id === previousIds[index])
    )
      return;
    const collapsed = new Set(ids.slice(1).filter((id) => id !== props.locatedInboundId));
    collapsedInboundIds.value = collapsed;
    for (const id of ids) if (!collapsed.has(id)) emit('expand', id);
  },
  { immediate: true },
);
watch(
  () => props.locatedInboundId,
  (id) => {
    if (!id || !orderedInboundIds.value.includes(id)) return;
    const next = new Set(collapsedInboundIds.value);
    next.delete(id);
    collapsedInboundIds.value = next;
    emit('expand', id);
  },
);
watch(
  () => [props.locatedInboundId, orderedInboundIds.value.join('\u0000')] as const,
  async ([id]) => {
    if (!id || !orderedInboundIds.value.includes(id)) return;
    await nextTick();
    container.value?.querySelector<HTMLElement>('.inbound-block.is-located')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  },
  { immediate: true, flush: 'post' },
);
function toggleInbound(id: string): void {
  const next = new Set(collapsedInboundIds.value);
  if (next.has(id)) {
    next.delete(id);
    emit('expand', id);
  } else next.add(id);
  collapsedInboundIds.value = next;
}
function expandedIds(): string[] {
  return orderedInboundIds.value.filter((id) => !collapsedInboundIds.value.has(id));
}
function displayPerson(name: string | null | undefined, id: string): string {
  return name && name !== id ? name : '姓名未提供';
}
defineExpose({ expandedIds });
</script>

<style scoped>
.history-groups {
  min-height: 90px;
}
.empty-list {
  padding: 32px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.inbound-block {
  border-top: 1px solid var(--el-border-color-lighter);
}
.inbound-block.is-located {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.group-meta {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.group-meta strong {
  color: var(--el-text-color-primary);
}
.group-product {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}
.expanded-body {
  min-height: 48px;
  max-width: 100%;
  overflow-x: auto;
}
.details-table {
  min-width: 1080px;
}
.order-remark {
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.trace-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.source-link {
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.retry-button {
  margin: 8px 16px;
}
.detail-status {
  padding: 14px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
