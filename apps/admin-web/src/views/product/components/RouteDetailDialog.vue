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
      :label-width="88"
      border
    >
      <el-descriptions-item label="路线编号">{{ row.routeCode }}</el-descriptions-item>
      <el-descriptions-item label="路线名称">{{ row.routeName }}</el-descriptions-item>
      <el-descriptions-item label="版本">{{ row.versionNo || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ routeStatusLabel(row.status) }}</el-descriptions-item>
      <el-descriptions-item
        v-if="row.remark"
        label="备注"
        :span="2"
        >{{ row.remark }}</el-descriptions-item
      >
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
            <span class="step-card__name">{{ step.stepName }}</span>
            <span class="step-card__code">{{ step.stepCode }}</span>
            <el-tag
              v-if="step.status === SYSTEM_STATUS.disabled"
              size="small"
              type="info"
              effect="plain"
              >已停用</el-tag
            >
          </div>
          <div class="step-card__meta">
            <div class="step-card__meta-item">
              <span class="step-card__label">默认负责人：</span>
              <span>{{ step.defaultOwnerName || '未设置' }}</span>
            </div>
            <div class="step-card__meta-item">
              <span class="step-card__label">检验：</span>
              <span>{{ step.needInspection ? '需检验' : '无需检验' }}</span>
            </div>
          </div>
          <div
            v-if="step.description"
            class="step-card__desc"
          >
            {{ step.description }}
          </div>
          <div
            v-if="step.sopFileName"
            class="step-card__detail"
          >
            <span class="step-card__label">技术文件：</span>
            <span class="step-card__detail-value">{{ step.sopFileName }}</span>
          </div>
          <div
            v-if="step.remark"
            class="step-card__detail"
          >
            <span class="step-card__label">路线内备注：</span>
            <span class="step-card__detail-value">{{ step.remark }}</span>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
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
  margin-top: 16px;
}
.route-detail-steps__title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.route-detail-steps__state {
  padding: 12px 0;
}
.step-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}
.step-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--el-bg-color);
}
.step-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.step-card__order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-weight: 600;
}
.step-card__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.step-card__code {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.step-card__desc {
  margin-top: 8px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.step-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.step-card__meta-item {
  display: flex;
  align-items: baseline;
}
.step-card__label {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.step-card__detail {
  display: flex;
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.step-card__detail-value {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
