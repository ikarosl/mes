<template>
  <el-dialog
    :model-value="visible"
    title="任务开工"
    :width="DialogWidth.xl"
    :before-close="editor.close"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <div v-loading="loading">
      <p v-if="batchLabel">{{ batchLabel }}</p>
      <InlineHint
        >管理员确认任务开始生产。任务开工后各工序仍须分别开始；后续可继续办理物料分配与分次领料。</InlineHint
      >
      <el-descriptions
        v-if="basis"
        :column="2"
        border
        class="section"
      >
        <el-descriptions-item label="当前任务阶段">{{
          batchStatusMeta(basis.batchStatus).label
        }}</el-descriptions-item>
        <el-descriptions-item label="任务类型">{{
          WORK_ORDER_TYPE_LABELS[basis.orderType]
        }}</el-descriptions-item>
        <el-descriptions-item
          label="开工前提"
          :span="2"
          >{{
            basis.orderType === 'research'
              ? basis.hasInitialMaterialConfiguration
                ? '正式物料需求已配置；研发任务无需 BOM 或工序'
                : '须先配置至少一条正式物料需求；研发任务无需 BOM 或工序'
              : basis.hasInitialMaterialConfiguration
                ? '正式 BOM 需求已完整配置'
                : '须先完成正式 BOM 需求配置'
          }}</el-descriptions-item
        >
      </el-descriptions>
      <el-alert
        v-if="basis?.hasMaterialShortage"
        class="section"
        type="warning"
        :closable="false"
        show-icon
        title="仍有物料缺口，可确认开工；请说明缺料情况下的生产安排。"
      />
      <el-alert
        v-if="basis?.blockedReason"
        class="section"
        type="warning"
        :closable="false"
        show-icon
        :title="basis.blockedReason"
      />
      <el-table
        v-if="basis?.lines.length"
        :data="basis.lines"
        class="section"
      >
        <el-table-column
          label="物料 / 版本"
          min-width="230"
          ><template #default="{ row }"
            >{{ row.itemCode }}
            <div>{{ row.materialVariantCode }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="需求来源"
          width="130"
          ><template #default="{ row }">{{
            DEMAND_GENERATION_GROUP_TYPE_LABELS[row.demandType as DemandType]
          }}</template></el-table-column
        >
        <el-table-column
          label="需求量"
          width="120"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.demandQuantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="已确认领料"
          width="140"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.confirmedOutboundQuantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="未领余量"
          width="130"
          align="right"
          ><template #default="{ row }"
            ><span :class="{ shortage: Number(row.remainingQuantity) > 0 }"
              >{{ formatQuantity(row.remainingQuantity) }} {{ row.unit }}</span
            ></template
          ></el-table-column
        >
      </el-table>
      <el-empty
        v-else-if="basis"
        :image-size="64"
        :description="
          basis.hasInitialMaterialConfiguration
            ? '当前没有有效物料需求缺口'
            : '当前尚未配置正式物料需求'
        "
      />
      <el-form
        label-position="top"
        class="section"
        :disabled="submitting || unresolved"
      >
        <el-form-item
          :label="basis?.requiresReason ? '缺料开工说明' : '开工说明'"
          :required="basis?.requiresReason"
        >
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="说明本次开工安排"
          />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="stale"
        type="warning"
        :closable="false"
        show-icon
        title="任务或物料依据已变化，说明已保留；请重新核对后办理。"
      />
      <el-alert
        v-if="unresolved"
        class="section"
        type="warning"
        :closable="false"
        show-icon
        title="开工结果尚未确认，原请求与提交标识已保留；请重试原操作或先核对任务历史。"
      />
      <el-alert
        v-if="error"
        class="section"
        type="error"
        :closable="false"
        :title="error"
      />
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="editor.close()"
        >关闭</el-button
      >
      <el-button
        :disabled="submitting || unresolved"
        @click="editor.reloadBasis"
        >重新核对</el-button
      >
      <el-button
        v-if="unresolved"
        type="primary"
        :loading="submitting"
        :disabled="!canRetry"
        @click="editor.submit"
        >重试原开工</el-button
      >
      <el-button
        v-else
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="editor.submit"
        >确认任务开工</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type {
  DemandType,
  ProductionExecutionStartCheck,
  StartProductionExecutionPayload,
  ProductionExecutionStartResult,
} from '@company/contracts';
import { DEMAND_GENERATION_GROUP_TYPE_LABELS, WORK_ORDER_TYPE_LABELS } from '@company/constants';
import { RequestError } from '@company/request';
import { productionApi } from '../../../api/production';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { toBeijingDateTimeInputValue } from '../../../utils/date';
import { useProductionTaskCommand } from '../composables/useProductionTaskCommand';
import { batchStatusMeta, formatQuantity } from '../production-status';

defineOptions({ name: 'ProductionExecutionStartDialog' });
const props = defineProps<{ visible: boolean; batchId: string | null; batchLabel?: string }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [batchId: string] }>();
const editor = useProductionTaskCommand<
  ProductionExecutionStartCheck,
  StartProductionExecutionPayload,
  ProductionExecutionStartResult
>(props, {
  label: '任务开工',
  intentType: 'production.execution.start',
  loadCheck: productionApi.getExecutionStartCheck,
  validateCheck: (check, batchId) => {
    if (
      !check ||
      check.productionBatchId !== batchId ||
      !Number.isInteger(check.version) ||
      typeof check.canStart !== 'boolean' ||
      typeof check.requiresReason !== 'boolean' ||
      !Array.isArray(check.lines)
    )
      throw new Error('开工核对响应不完整，请重新核对');
  },
  basisSignature: (check) => `${check.version}:${check.canStart}:${check.requiresReason}`,
  eligible: (check) => check.canStart,
  requiresReason: (check) => check.requiresReason,
  buildBody: (check, reason) => ({ version: check.version, reason: reason || null }),
  send: productionApi.startProductionExecution,
  validateResult: (result, batchId, body) => {
    if (
      !result ||
      result.productionBatchId !== batchId ||
      result.batchStatus !== 'doing' ||
      !Number.isInteger(result.version) ||
      result.version !== body.version + 1 ||
      !/^[1-9]\d*$/.test(result.startedById) ||
      !toBeijingDateTimeInputValue(result.startedAt)
    )
      throw new RequestError('服务器未返回完整的开工结果，请重试原操作以核对结果。', 502);
  },
  successMessage: '任务已开工，可分别开始工序并继续办理物料',
  changed: (batchId) => emit('changed', batchId),
  closed: () => emit('update:visible', false),
});
const { basis, reason, loading, submitting, error, unresolved, stale, canSubmit, canRetry } =
  editor;
defineExpose({ close: editor.close, navigationLocked: submitting });
</script>

<style scoped>
.section {
  margin-top: 12px;
}
.shortage {
  color: var(--el-color-warning);
}
</style>
