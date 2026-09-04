<template>
  <el-dialog
    :model-value="visible"
    title="工艺路线详情"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="row"
      :column="2"
      border
    >
      <el-descriptions-item label="路线编号">{{ row.routeCode }}</el-descriptions-item>
      <el-descriptions-item label="路线名称">{{ row.routeName }}</el-descriptions-item>
      <el-descriptions-item label="适用产品">{{
        row.itemCode && row.productName ? `${row.itemCode} / ${row.productName}` : '-'
      }}</el-descriptions-item>
      <el-descriptions-item label="版本">{{ row.versionNo || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ routeStatusLabel(row.status) }}</el-descriptions-item>
      <el-descriptions-item label="备注">{{ row.remark || '-' }}</el-descriptions-item>
    </el-descriptions>

    <div class="route-detail-steps">
      <div class="route-detail-steps__title">工序顺序（路线不绑定 BOM）</div>
      <div
        v-if="stepsStatus === 'loading'"
        class="route-detail-steps__state"
      >
        <el-skeleton
          :rows="3"
          animated
        />
      </div>
      <el-alert
        v-else-if="stepsStatus === 'error'"
        type="error"
        show-icon
        :closable="false"
      >
        <template #title>
          <span>工序明细加载失败，请重试</span>
          <el-button
            link
            type="primary"
            @click="reloadDetail"
            >重试</el-button
          >
        </template>
      </el-alert>
      <el-empty
        v-else-if="stepsStatus === 'success' && steps.length === 0"
        description="该路线尚未配置工序"
      />
      <div
        v-else
        class="step-card-list"
      >
        <div
          v-for="step in steps"
          :key="step.id"
          class="step-card"
        >
          <div class="step-card__header">
            <span class="step-card__order">{{ step.stepOrder }}</span>
            <span class="step-card__name">{{ step.stepCode }} / {{ step.stepName }}</span>
            <el-tag
              v-if="step.needRecord"
              size="small"
              effect="plain"
              >需报工</el-tag
            >
            <el-tag
              v-if="step.needInspection"
              size="small"
              type="warning"
              effect="plain"
              >需检验</el-tag
            >
            <el-tag
              v-if="step.status === 0"
              size="small"
              type="info"
              effect="plain"
              >已停用</el-tag
            >
          </div>
          <div
            v-if="step.description"
            class="step-card__desc"
          >
            {{ step.description }}
          </div>
          <div class="step-card__meta">
            <span>负责人：{{ step.defaultOwnerName || '-' }}</span>
            <span>SOP：{{ step.sopFileName || '-' }}</span>
            <span v-if="step.remark">备注：{{ step.remark }}</span>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  ProcessRouteListItem,
  ProcessRouteStatus,
  ProcessRouteStepItem,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { DialogWidth } from '../../../utils/dialog';

type DetailStatus = 'idle' | 'loading' | 'success' | 'error';

const props = defineProps<{
  visible: boolean;
  row: ProcessRouteListItem | null;
  routeStatusLabel: (status: ProcessRouteStatus) => string;
}>();

defineEmits<{ (e: 'update:visible', val: boolean): void }>();

const steps = ref<ProcessRouteStepItem[]>([]);
const stepsStatus = ref<DetailStatus>('idle');
let requestToken = 0;

const loadSteps = async (routeId: string): Promise<void> => {
  const token = ++requestToken;
  stepsStatus.value = 'loading';
  try {
    const data = await productApi.routeSteps(routeId);
    if (token !== requestToken) return;
    steps.value = [...data].sort((a, b) => a.stepOrder - b.stepOrder);
    stepsStatus.value = 'success';
  } catch {
    if (token !== requestToken) return;
    steps.value = [];
    stepsStatus.value = 'error';
  }
};

const reloadDetail = (): void => {
  if (props.row) void loadSteps(props.row.id);
};

watch(
  () => [props.visible, props.row?.id] as const,
  ([visible, routeId]) => {
    if (!visible) {
      requestToken += 1;
      stepsStatus.value = 'idle';
      steps.value = [];
      return;
    }
    if (routeId) void loadSteps(routeId);
  },
);
</script>

<style scoped>
.route-detail-steps {
  margin-top: 20px;
}
.route-detail-steps__title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.route-detail-steps__state {
  padding: 12px 0;
}
.step-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 420px;
  overflow-y: auto;
}
.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  background: #ffffff;
}
.step-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-card__order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}
.step-card__name {
  font-weight: 600;
  color: #1f2937;
}
.step-card__desc {
  margin-top: 8px;
  color: #4b5563;
}
.step-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  color: #6b7280;
  font-size: 13px;
}
</style>
