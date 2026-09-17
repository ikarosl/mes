<template>
  <el-dialog
    :model-value="visible"
    :title="`物料版本配置${detail ? ` · ${detail.workOrderNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    @update:model-value="requestClose"
  >
    <div v-loading="loading">
      <el-alert
        title="每种基础物料为本工单统一选择一个精确版本；保存配置后，再到生产任务中确认生成需求。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="loadFailed"
        title="配置加载失败，请重新加载后再操作。"
        type="error"
        :closable="false"
      />
      <el-alert
        v-if="stale"
        title="工单已被其他操作修改，当前草稿已保留。请重新加载后核对。"
        type="warning"
        :closable="false"
      />
      <el-alert
        v-if="unresolved"
        title="保存结果尚未确认，请按原配置重试，或先核对后再关闭。"
        type="warning"
        :closable="false"
      />
      <el-alert
        v-if="detail?.blockedReason"
        :title="detail.blockedReason"
        type="warning"
        :closable="false"
      />
      <p
        v-if="detail?.blockingBatch"
        class="hint"
      >
        阻断任务：{{ detail.blockingBatch.batchNo }}（{{
          batchStatusMeta(detail.blockingBatch.status).label
        }}）。 未领料任务可取消；已领料任务须提前结束并完成收尾。正常完工的历史任务继续限制换版。
      </p>
      <el-table
        v-if="detail?.lines.length"
        :data="detail.lines"
        row-key="materialId"
      >
        <el-table-column
          label="基础物料"
          min-width="250"
        >
          <template #default="{ row }">
            <div>{{ row.materialName }}</div>
            <div class="hint">{{ row.materialCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="单位用量"
          width="130"
        >
          <template #default="{ row }"
            >{{ formatQuantity(row.quantityPerUnit) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="精确物料版本"
          min-width="300"
        >
          <template #default="{ row }">
            <el-select
              v-model="selections[row.materialId]"
              filterable
              placeholder="选择启用版本"
              :disabled="
                !detail?.canConfigure || loading || submitting || unresolved || stale || loadFailed
              "
              @visible-change="(open: boolean) => open && load()"
            >
              <el-option
                v-if="
                  selections[row.materialId] &&
                  !row.variants.some(
                    (variant: MaterialDemandManagementVariant) =>
                      variant.materialVariantId === selections[row.materialId],
                  )
                "
                :value="selections[row.materialId]"
                :label="`${row.materialVariantCode ?? selections[row.materialId]}（已失效）`"
                disabled
              />
              <el-option
                v-for="variant in row.variants"
                :key="variant.materialVariantId"
                :value="variant.materialVariantId"
                :label="variant.materialVariantCode"
              />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
      <el-form
        v-if="detail?.canConfigure"
        label-position="top"
        class="reason-form"
      >
        <el-form-item
          label="配置原因"
          required
        >
          <el-input
            v-model="reason"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            placeholder="填写首次配置或更正原因"
            :disabled="submitting || unresolved || stale"
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button
        :disabled="submitting || unresolved"
        @click="reload"
        >重新加载</el-button
      >
      <el-button
        :disabled="submitting"
        @click="requestClose"
        >关闭</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSave"
        @click="save"
        >{{ unresolved ? '重试保存' : '保存配置' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import type { MaterialDemandManagementVariant } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { batchStatusMeta, formatQuantity } from '../production-status';
import { useWorkOrderMaterialConfiguration } from '../composables/useWorkOrderMaterialConfiguration';

defineOptions({ name: 'WorkOrderMaterialConfigurationDialog' });
const props = defineProps<{ visible: boolean; workOrderId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; saved: [] }>();
const {
  detail,
  selections,
  reason,
  loading,
  submitting,
  loadFailed,
  stale,
  unresolved,
  canSave,
  load,
  reload,
  save,
  requestClose,
} = useWorkOrderMaterialConfiguration(
  toRef(props, 'visible'),
  toRef(props, 'workOrderId'),
  () => emit('update:visible', false),
  () => emit('saved'),
);
</script>

<style scoped>
.el-alert + .el-alert {
  margin-top: 12px;
}
.el-table {
  margin-top: 16px;
}
.el-select {
  width: 100%;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.reason-form {
  margin-top: 16px;
}
</style>
