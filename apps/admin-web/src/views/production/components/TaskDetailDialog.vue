<template>
  <el-dialog
    :model-value="visible"
    title="任务详情"
    :width="DialogWidth.lg"
    @update:model-value="updateVisible"
  >
    <div class="detail-toolbar">
      <div
        v-if="batch"
        class="task-identity"
      >
        <div class="task-heading">
          <strong>{{ batch.batchNo }}</strong>
          <el-tag
            :type="taskTypeTagType(batch.orderType)"
            effect="light"
            >{{ WORK_ORDER_TYPE_LABELS[batch.orderType] }}</el-tag
          >
          <el-tag :type="batchStatusMeta(batch.status).type">
            {{ batchStatusMeta(batch.status).label }}
          </el-tag>
        </div>
        <div class="product-heading">
          {{ batch.productName }} <span>{{ batch.productCode }}</span>
        </div>
      </div>
      <el-button
        :loading="loading"
        @click="refreshDetails"
        >刷新详情</el-button
      >
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      class="detail-error"
    />

    <div v-loading="loading">
      <template v-if="batch">
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="工单">{{ batch.workOrderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            batch.ownerName || (batch.ownerId ? '姓名暂不可用' : '未指定')
          }}</el-descriptions-item>
          <el-descriptions-item label="计划量">{{
            formatQuantity(batch.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="计划日期">
            {{ formatDateForDisplay(batch.planStartDate, '未定') }} 至
            {{ formatDateForDisplay(batch.planEndDate, '未定') }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="batch.orderType !== 'research'"
            label="工艺路线"
            :span="2"
          >
            {{ batch.routeCode || '未配置' }}
            <span
              v-if="batch.routeVersion"
              class="route-version"
              >版本 {{ batch.routeVersion }}</span
            >
          </el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="2"
          >
            <span class="multiline-text">{{ batch.remark || '未填写' }}</span>
          </el-descriptions-item>
          <el-descriptions-item
            label="当前批准产出"
            :span="2"
          >
            <BatchApprovedOutput :output="batch.finalOutput" />
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">任务开工记录</div>
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="开工人">{{
            batch.startedAt ? batch.startedByName || '姓名暂不可用' : '尚未开工'
          }}</el-descriptions-item>
          <el-descriptions-item label="开工时间">{{
            formatDateTimeForDisplay(batch.startedAt, '尚未开工')
          }}</el-descriptions-item>
        </el-descriptions>

        <section
          v-if="batch.startedAt"
          class="start-evidence"
        >
          <el-button
            class="evidence-toggle"
            :aria-expanded="expandedEvidence"
            :disabled="!readActive"
            @click="toggleEvidence"
          >
            <el-icon><ArrowDown v-if="expandedEvidence" /><ArrowRight v-else /></el-icon>
            <span>{{ expandedEvidence ? '收起' : '展开' }}开工记录</span>
            <el-tag
              v-if="startRecord"
              size="small"
              :type="startRecord.startMaterialSnapshot.hasMaterialShortage ? 'warning' : 'info'"
              class="snapshot-tag"
            >
              {{
                startRecord.startMaterialSnapshot.hasMaterialShortage ? '当时有缺口' : '当时无缺口'
              }}
            </el-tag>
          </el-button>
          <div
            v-if="expandedEvidence"
            v-loading="startRecordLoading"
            class="evidence-content"
          >
            <el-descriptions
              v-if="startRecord"
              :column="1"
              border
              class="start-reason"
            >
              <el-descriptions-item label="开工说明">
                <span class="multiline-text">{{ startRecord.startReason || '未填写说明' }}</span>
              </el-descriptions-item>
            </el-descriptions>
            <div class="evidence-toolbar">
              <p class="snapshot-note">以下数量保存于任务开工时，用于核对当时依据。</p>
              <el-button
                :loading="startRecordLoading"
                :disabled="!readActive"
                @click="loadStartRecord"
                >刷新开工记录</el-button
              >
            </div>
            <el-alert
              v-if="startRecordError"
              :title="startRecordError"
              type="error"
              :closable="false"
              show-icon
              class="detail-error"
            />
            <el-table
              v-if="startRecord"
              :data="startRecord.startMaterialSnapshot.lines"
              empty-text="开工时没有有效物料需求"
            >
              <el-table-column
                label="物料 / 精确版本"
                min-width="220"
              >
                <template #default="{ row }">
                  {{ row.itemCode }}
                  <div class="secondary-text">{{ row.materialVariantCode }}</div>
                </template>
              </el-table-column>
              <el-table-column
                label="开工时需求"
                min-width="140"
                align="right"
              >
                <template #default="{ row }"
                  >{{ formatQuantity(row.demandQuantity) }} {{ row.unit }}</template
                >
              </el-table-column>
              <el-table-column
                label="开工时已领"
                min-width="140"
                align="right"
              >
                <template #default="{ row }"
                  >{{ formatQuantity(row.confirmedOutboundQuantity) }} {{ row.unit }}</template
                >
              </el-table-column>
              <el-table-column
                label="开工时未领"
                min-width="140"
                align="right"
              >
                <template #default="{ row }"
                  >{{ formatQuantity(row.remainingQuantity) }} {{ row.unit }}</template
                >
              </el-table-column>
            </el-table>
            <el-skeleton
              v-else-if="startRecordLoading && !startRecordLoaded"
              :rows="3"
              animated
            />
            <el-empty
              v-else-if="startRecordLoaded && !startRecordError"
              :image-size="48"
              description="尚无任务开工记录"
            />
            <p
              v-else-if="!startRecordError"
              class="snapshot-note"
            >
              开工记录尚未加载，请刷新开工记录。
            </p>
          </div>
        </section>

        <template v-if="batch.status === 'cancelled'">
          <div class="section-title">取消记录</div>
          <el-descriptions
            :column="2"
            border
          >
            <el-descriptions-item label="取消人">{{
              batch.cancelledByName || '姓名暂不可用'
            }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{
              formatDateTimeForDisplay(batch.cancelledAt)
            }}</el-descriptions-item>
            <el-descriptions-item
              label="取消原因"
              :span="2"
            >
              <span class="multiline-text">{{ batch.cancelReason || '未记录原因' }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </template>
      <el-empty
        v-else-if="!loading && !error"
        :image-size="64"
        description="暂无任务详情"
      />
      <el-skeleton
        v-else-if="loading && !batch"
        :rows="5"
        animated
      />
    </div>

    <template #footer>
      <el-button @click="updateVisible(false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, ref, shallowRef, watch } from 'vue';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import type { ProductionBatchDetail, ProductionBatchStartRecord } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../../../utils/date';
import { batchStatusMeta, formatQuantity } from '../production-status';
import { taskTypeTagType } from '../production-task-presentation';
import BatchApprovedOutput from './BatchApprovedOutput.vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    batch: ProductionBatchDetail | null;
    loading?: boolean;
    error?: string;
  }>(),
  { loading: false, error: '' },
);

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'refresh'): void;
}>();

const expandedEvidence = ref(false);
const startRecord = shallowRef<ProductionBatchStartRecord | null>(null);
const startRecordLoaded = ref(false);
const startRecordLoading = ref(false);
const startRecordError = ref('');
const readActive = ref(true);
const startRecordReads = useLatestReadRequest(() => (startRecordLoading.value = false));

async function loadStartRecord(): Promise<void> {
  const batchId = props.batch?.id;
  if (!props.visible || !batchId || !readActive.value || !startRecordReads.isActive()) return;
  const { isCurrent, signal } = startRecordReads.begin(
    () => props.visible && props.batch?.id === batchId,
  );
  startRecordLoading.value = true;
  startRecordError.value = '';
  try {
    const result = await productionApi.getBatchStartRecord(batchId, {
      signal,
      skipErrorHandling: true,
    });
    if (!isCurrent()) return;
    if (
      result !== null &&
      (!result ||
        result.productionBatchId !== batchId ||
        !result.startMaterialSnapshot ||
        !Array.isArray(result.startMaterialSnapshot.lines))
    )
      throw new Error('开工记录与当前任务不一致或记录不完整，请重试');
    startRecord.value = result;
    startRecordLoaded.value = true;
  } catch (failure) {
    if (isCurrent())
      startRecordError.value =
        failure instanceof Error ? failure.message : '开工记录加载失败，请重试';
  } finally {
    if (isCurrent()) startRecordLoading.value = false;
  }
}

function expandEvidence(): void {
  if (!props.visible || !readActive.value) return;
  expandedEvidence.value = true;
  if (!startRecordLoaded.value && !startRecordLoading.value) void loadStartRecord();
}

function toggleEvidence(): void {
  if (expandedEvidence.value) expandedEvidence.value = false;
  else expandEvidence();
}

function refreshDetails(): void {
  emit('refresh');
  if (expandedEvidence.value || startRecordLoaded.value) void loadStartRecord();
}

function updateVisible(visible: boolean): void {
  if (!visible) {
    startRecordReads.invalidate();
    expandedEvidence.value = false;
  }
  emit('update:visible', visible);
}

watch(
  () => props.batch?.id,
  () => {
    startRecordReads.invalidate();
    expandedEvidence.value = false;
    startRecord.value = null;
    startRecordLoaded.value = false;
    startRecordError.value = '';
  },
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      startRecordReads.invalidate();
      expandedEvidence.value = false;
    }
  },
);
onActivated(() => (readActive.value = true));
onDeactivated(() => (readActive.value = false));
</script>

<style scoped>
.detail-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.task-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}
.task-heading strong {
  font-size: 16px;
}
.product-heading {
  margin-top: 8px;
  color: var(--el-text-color-primary);
}
.product-heading span,
.route-version,
.secondary-text,
.snapshot-note {
  color: var(--el-text-color-secondary);
}
.product-heading span,
.route-version {
  margin-left: 8px;
}
.detail-error {
  margin-bottom: 16px;
}
.section-title {
  margin: 20px 0 12px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.multiline-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.start-evidence {
  margin-top: 12px;
}
.evidence-toggle {
  justify-content: flex-start;
  width: 100%;
  height: auto;
  min-height: 42px;
  white-space: normal;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color-lighter);
}
.evidence-toggle :deep(> span) {
  flex-wrap: wrap;
  gap: 8px;
}
.snapshot-tag {
  margin-left: 12px;
}
.evidence-content {
  padding-top: 12px;
}
.start-reason {
  margin-bottom: 12px;
}
.evidence-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.evidence-toolbar .snapshot-note {
  margin: 0;
}
.snapshot-note {
  margin: 8px 0 12px;
  font-size: 13px;
}
.secondary-text {
  margin-top: 4px;
  font-size: 12px;
}
</style>
