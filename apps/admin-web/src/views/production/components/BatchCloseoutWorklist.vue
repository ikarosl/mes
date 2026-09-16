<template>
  <div class="worklist">
    <section
      v-for="module in modules"
      :key="module.name"
      class="module"
    >
      <h3>
        {{ module.name }} <span class="muted">待处理 {{ module.count }} 项</span>
      </h3>
      <p
        v-if="module.name === groups[0].module"
        class="muted"
        style="color: darkorange; font-size: 16px; margin-bottom: 8px"
      >
        按出库单 → 分配 → 需求 → 补料单顺序处理。前一模块未完成，后一模块暂不可操作。
      </p>
      <section
        v-for="group in module.groups"
        :key="group.kind"
        class="group"
      >
        <div class="group-header">
          <strong>{{ group.title }}</strong>
          <el-tag
            v-if="!group.items.length"
            type="success"
            size="small"
            >无待处理项</el-tag
          >
          <el-button
            v-else
            type="warning"
            plain
            size="small"
            :disabled="disabled || !processable(group.items).length"
            @click="process(processable(group.items))"
          >
            一键处理本组可办事项（{{ processable(group.items).length }}）
          </el-button>
        </div>
        <el-alert
          v-if="group.items[0]?.blockedReason"
          :title="group.items[0].blockedReason"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table
          v-if="group.items.length"
          :data="group.items"
          size="small"
          row-key="id"
        >
          <el-table-column
            label="记录 / 原需求"
            min-width="210"
          >
            <template #default="{ row }">
              <strong>{{ recordLabel(row) }}</strong>
              <div
                v-for="id in row.demandIds"
                :key="id"
                class="muted"
              >
                需求 #{{ id }} · {{ demandLabel(id) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="状态 / 数量"
            width="140"
          >
            <template #default="{ row }">
              <div>{{ BATCH_CLOSEOUT_STATUS_LABELS[row.kind]?.[row.status] ?? row.status }}</div>
              <div v-if="row.quantity !== null">
                {{ row.kind === 'allocation' ? '原分配' : '剩余' }} {{ quantity(row.quantity) }}
                {{ row.unit }}
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="处理备注（已预填，可修改）"
            min-width="310"
          >
            <template #default="{ row }">
              <el-input
                v-model="reasons[keyOf(row)]"
                type="textarea"
                :rows="2"
                maxlength="5000"
                :disabled="disabled || Boolean(row.blockedReason)"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="120"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                link
                type="warning"
                :disabled="disabled || Boolean(row.blockedReason) || !reasons[keyOf(row)]?.trim()"
                @click="process([row])"
                >确认处理</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </section>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, watch, watchEffect } from 'vue';
import type { BatchCloseoutDemand, BatchCloseoutPendingItem } from '@company/contracts';
import { BATCH_CLOSEOUT_WORK_GROUPS, BATCH_CLOSEOUT_STATUS_LABELS } from '@company/constants';
import type { CloseoutItemDraft } from '../composables/useBatchCloseout';
import { formatQuantity as quantity } from '../production-status';
const props = defineProps<{
  items: BatchCloseoutPendingItem[];
  demands: BatchCloseoutDemand[];
  disabled: boolean;
}>();
const emit = defineEmits<{ process: [CloseoutItemDraft[]]; 'draft-change': [boolean] }>();
const groups = BATCH_CLOSEOUT_WORK_GROUPS;
const reasons = reactive<Record<string, string>>({});
const keyOf = (row: BatchCloseoutPendingItem) => `${row.kind}:${row.id}`;
watch(
  () => props.items,
  (items) => {
    for (const item of items)
      reasons[keyOf(item)] ??= groups.find((group) => group.kind === item.kind)!.reason;
  },
  { immediate: true },
);
watchEffect(() => {
  emit(
    'draft-change',
    props.items.some(
      (item) => reasons[keyOf(item)] !== groups.find((group) => group.kind === item.kind)?.reason,
    ),
  );
});
const modules = computed(() =>
  [...new Set(groups.map((group) => group.module))].map((name) => ({
    name,
    count: props.items.filter((item) =>
      groups.some((group) => group.module === name && group.kind === item.kind),
    ).length,
    groups: groups
      .filter((group) => group.module === name)
      .map((group) => ({
        ...group,
        items: props.items.filter((item) => item.kind === group.kind),
      })),
  })),
);
const processable = (items: BatchCloseoutPendingItem[]) =>
  items.filter((item) => !item.blockedReason && reasons[keyOf(item)]?.trim());
const demandLabel = (id: string) => {
  const row = props.demands.find((demand) => demand.id === id);
  return row
    ? `${row.materialVariantCode} · 原量 ${quantity(row.demandQuantity)} ${row.unit}`
    : '来源需求';
};
const recordLabel = (item: BatchCloseoutPendingItem) =>
  item.kind === 'allocation' ? `分配 #${item.id}` : `${item.label} · #${item.id}`;
function process(items: BatchCloseoutPendingItem[]) {
  emit(
    'process',
    items.map((item) => ({
      kind: item.kind,
      id: item.id,
      version: item.version,
      label: recordLabel(item),
      reason: reasons[keyOf(item)] ?? '',
    })),
  );
}
</script>
<style scoped>
.module {
  margin-top: 20px;
}
h3 {
  font-size: 16px;
  margin: 0 0 12px;
}
h3 span {
  font-weight: 400;
  font-size: 13px;
  margin-left: 8px;
}
.group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin: 10px 0;
  padding: 12px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
</style>
