<template>
  <el-dialog
    :model-value="visible"
    :title="check?.termination ? '本轮产出处置' : '结束本轮并登记产出'"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    @update:model-value="onVisibilityChange"
  >
    <div v-loading="loading">
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="check">
        <el-alert
          title="本轮产出与物料余料分别核对"
          type="info"
          :closable="false"
          show-icon
          description="只登记尚未入库的本轮可用产出与报废。报废不触发补料或补产；可用部分登记后仍需办理成品入库，全部报废无需入库。"
        />
        <el-descriptions
          :column="3"
          border
          class="section"
        >
          <el-descriptions-item label="工单">{{ check.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item label="生产批次">{{ check.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            batchStatusMeta(check.batchStatus).label
          }}</el-descriptions-item>
          <el-descriptions-item
            label="成品"
            :span="3"
            >{{ check.productCode }} · {{ check.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="计划量"
            >{{ formatQuantity(check.plannedQuantity) }} {{ check.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="末工序有效正常报工">{{
            formatQuantity(check.reportedNormalQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="历史已确认报废">{{
            formatQuantity(check.existingScrapQuantity)
          }}</el-descriptions-item>
        </el-descriptions>

        <el-form
          label-position="top"
          class="section"
          :disabled="readonly || submitting || unresolved"
        >
          <div class="quantity-fields">
            <el-form-item
              label="本轮可用产出（待入库）"
              required
            >
              <el-input-number
                v-model="availableQuantity"
                :min="0"
                :max="99999999"
                :precision="0"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item
              label="本次新增产出报废（不含历史报废）"
              required
            >
              <el-input-number
                v-model="additionalScrapQuantity"
                :min="0"
                :max="99999999"
                :precision="0"
                controls-position="right"
              />
            </el-form-item>
          </div>
          <p class="quantity-summary">
            可用及报废合计：{{ formatQuantity(totalOutput) }}；
            {{ variance >= 0 ? '超计划数量' : '未产出差额' }}：{{
              formatQuantity(Math.abs(variance))
            }}。 差额不计入报废，也不代表未用物料数量。
          </p>
          <el-form-item
            label="本轮结束原因"
            required
          >
            <el-input
              v-model="reason"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
            />
          </el-form-item>
          <h3>物料人工核对</h3>
          <p class="hint">
            以下为{{
              readonly ? '结束时' : '当前'
            }}的原库存批次领料记录。待确认退料和损耗已占用可退上限；上限不代表现场实存数量。
          </p>
          <el-table
            :data="check.materials"
            max-height="230"
            empty-text="本批次暂无物料分配记录"
          >
            <el-table-column
              prop="itemCode"
              label="物料编码"
              min-width="120"
            />
            <el-table-column
              prop="materialVariantCode"
              label="版本"
              min-width="100"
            />
            <el-table-column
              prop="inventoryBatchCode"
              label="库存批次"
              min-width="130"
            />
            <el-table-column
              prop="unit"
              label="单位"
              width="60"
            />
            <el-table-column
              label="已领料"
              width="90"
              ><template #default="{ row }">{{
                formatQuantity(row.outboundQuantity)
              }}</template></el-table-column
            >
            <el-table-column
              label="退料占用"
              width="90"
              ><template #default="{ row }">{{
                formatQuantity(row.returnQuantity)
              }}</template></el-table-column
            >
            <el-table-column
              label="损耗占用"
              width="90"
              ><template #default="{ row }">{{
                formatQuantity(row.lossQuantity)
              }}</template></el-table-column
            >
            <el-table-column
              label="可退上限"
              width="90"
              ><template #default="{ row }">{{
                formatQuantity(row.returnableQuantity)
              }}</template></el-table-column
            >
          </el-table>
          <el-form-item
            label="物料核对及处理说明"
            required
            class="section"
          >
            <el-input
              v-model="materialReviewNote"
              type="textarea"
              :rows="3"
              maxlength="5000"
              show-word-limit
              placeholder="说明已领物料实际使用、损坏及未用余料情况；如尚待核对，写明后续负责人和处理安排。可复用余料请另在退料管理办理，已消耗或损坏的物料不能作为可用库存退回。"
            />
          </el-form-item>
          <h3>{{ readonly ? '结束时确认的影响' : '结束后将处理的事项' }}</h3>
          <p class="hint">
            分配行显示原分配量，仅释放其中尚未出库的预留。停止继续报工，保留原工序状态、报工和已领料事实；以下未完成事项随本轮结束。工单需在所有批次结束后另行关闭。
          </p>
          <el-table
            :data="check.impacts"
            max-height="220"
            empty-text="无待处理事项"
          >
            <el-table-column
              label="处理方式"
              width="210"
              ><template #default="{ row }">{{ impactLabel(row) }}</template></el-table-column
            >
            <el-table-column
              prop="label"
              label="工序 / 单据 / 分配编号"
              min-width="200"
            />
            <el-table-column
              prop="id"
              label="记录 ID"
              width="100"
            />
            <el-table-column
              label="剩余需求 / 原分配量"
              min-width="160"
              ><template #default="{ row }">{{
                row.quantity === null ? '—' : `${formatQuantity(row.quantity)} ${row.unit}`
              }}</template></el-table-column
            >
          </el-table>
          <el-checkbox
            v-if="!readonly"
            v-model="confirmImpacts"
            class="section"
            >已核对产出、报废和物料安排，确认结束上述事项；结束记录提交后不可修改</el-checkbox
          >
        </el-form>
        <el-alert
          v-if="!readonly && check.blockers.length"
          :title="check.blockers.join('；')"
          type="warning"
          :closable="false"
          show-icon
        />
        <p
          v-if="readonly && check.termination"
          class="hint"
        >
          登记时间：{{ formatDateForDisplay(check.termination.createdAt) }}；登记人 ID：{{
            check.termination.createdBy
          }}
        </p>
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="close"
        >{{ readonly ? '关闭' : '取消' }}</el-button
      >
      <el-button
        v-if="!readonly"
        :disabled="submitting || loading"
        @click="refreshCheck"
        >{{ unresolved ? '核对提交结果' : '刷新核对信息' }}</el-button
      >
      <el-button
        v-if="!readonly"
        type="danger"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="submit"
        >{{ unresolved ? '重试原提交' : '确认结束本轮' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BatchTerminationCheck, BatchTerminationImpact } from '@company/contracts';
import { BATCH_TERMINATION_IMPACT_LABELS } from '@company/constants';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestRequest } from '../../../composables/requests/useLatestRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatDateForDisplay } from '../../../utils/date';
import { batchStatusMeta, formatQuantity } from '../production-status';

const props = defineProps<{ visible: boolean; batchId: string | null }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'terminated'): void;
}>();
const check = ref<BatchTerminationCheck | null>(null);
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const availableQuantity = ref<number | undefined>(0);
const additionalScrapQuantity = ref<number | undefined>(0);
const reason = ref('');
const materialReviewNote = ref('');
const confirmImpacts = ref(false);
const unresolved = ref(false);
const request = useLatestRequest();
const intent = useIdempotentIntent();
const readonly = computed(() => Boolean(check.value?.termination));
const totalOutput = computed(
  () =>
    (availableQuantity.value ?? 0) +
    (additionalScrapQuantity.value ?? 0) +
    Number(check.value?.existingScrapQuantity ?? 0),
);
const variance = computed(() => totalOutput.value - Number(check.value?.plannedQuantity ?? 0));
const impactLabel = (row: BatchTerminationImpact) => BATCH_TERMINATION_IMPACT_LABELS[row.kind];
const canSubmit = computed(
  () =>
    !loading.value &&
    !submitting.value &&
    !readonly.value &&
    !errorMessage.value &&
    Boolean(check.value?.canTerminate) &&
    confirmImpacts.value &&
    Boolean(reason.value.trim()) &&
    Boolean(materialReviewNote.value.trim()) &&
    Number.isSafeInteger(availableQuantity.value) &&
    Number.isSafeInteger(additionalScrapQuantity.value) &&
    (availableQuantity.value ?? -1) >= 0 &&
    (additionalScrapQuantity.value ?? -1) >= 0 &&
    totalOutput.value <= 99999999,
);

async function loadCheck(): Promise<void> {
  const batchId = props.batchId;
  if (!batchId || !props.visible) return;
  const current = request.begin(() => props.visible && props.batchId === batchId);
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await productionApi.getBatchTerminationCheck(batchId);
    if (!current()) return;
    check.value = result;
    if (result.termination) {
      availableQuantity.value = Number(result.termination.availableQuantity);
      additionalScrapQuantity.value = Number(result.termination.additionalScrapQuantity);
      reason.value = result.termination.reason;
      materialReviewNote.value = result.termination.materialReviewNote;
      intent.reset();
      unresolved.value = false;
    }
  } catch (error) {
    if (current())
      errorMessage.value = error instanceof Error ? error.message : '核对信息加载失败，请重试';
  } finally {
    if (current()) loading.value = false;
  }
}

async function refreshCheck(): Promise<void> {
  if (submitting.value || loading.value) return;
  if (unresolved.value) {
    // 结果未知时只查看当前事实，不替换原提交的核对令牌。
    const batchId = props.batchId;
    const current = request.begin(() => props.visible && props.batchId === batchId);
    loading.value = true;
    try {
      const result = await productionApi.getBatchTerminationCheck(batchId!);
      if (!current()) return;
      if (result.termination) {
        await loadCheck();
        emit('terminated');
      } else EMessage.info('尚未查到结束记录，可重试原提交；原表单与提交标识已保留');
    } catch (error) {
      if (current()) EMessage.error(error);
    } finally {
      if (current()) loading.value = false;
    }
    return;
  }
  confirmImpacts.value = false;
  await loadCheck();
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !check.value || !props.batchId) return;
  const batchId = props.batchId;
  const body = {
    version: check.value.version,
    checkToken: check.value.checkToken,
    availableQuantity: availableQuantity.value!,
    additionalScrapQuantity: additionalScrapQuantity.value!,
    reason: reason.value.trim(),
    materialReviewNote: materialReviewNote.value.trim(),
    confirmImpacts: true,
  };
  submitting.value = true;
  try {
    await intent.execute(
      { intentType: 'production.batch.terminate', params: { batchId }, query: {}, body },
      (key) => productionApi.terminateBatch(batchId, body, key),
    );
    EMessage.success('本轮已结束，产出处置已登记');
    emit('terminated');
    emit('update:visible', false);
  } catch (error) {
    unresolved.value = intent.getStatus() !== 'idle';
    EMessage.error(error);
  } finally {
    submitting.value = false;
  }
}

async function close(): Promise<void> {
  if (submitting.value) return;
  if (intent.getStatus() !== 'idle') {
    try {
      await RouteMessageBox.confirm(
        '上次提交结果尚未确认，关闭将放弃本地重试标识。请先核对批次是否已结束。仍要关闭吗？',
        '提交结果未确认',
        { type: 'warning', confirmButtonText: '放弃重试并关闭' },
      );
    } catch {
      return;
    }
  }
  intent.reset();
  emit('update:visible', false);
}
const beforeClose = () => {
  void close();
};
const onVisibilityChange = (value: boolean) => {
  if (!value) void close();
};
watch(
  () => [props.visible, props.batchId] as const,
  ([visible]) => {
    request.invalidate();
    if (!visible) return;
    check.value = null;
    availableQuantity.value = 0;
    additionalScrapQuantity.value = 0;
    reason.value = '';
    materialReviewNote.value = '';
    confirmImpacts.value = false;
    unresolved.value = false;
    intent.reset();
    void loadCheck();
  },
);
</script>

<style scoped>
.section {
  margin-top: 16px;
}
.quantity-fields {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}
.quantity-summary {
  background: var(--el-fill-color-light);
  padding: 12px;
  margin: 0 0 16px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
h3 {
  font-size: 15px;
  margin: 20px 0 8px;
}
</style>
