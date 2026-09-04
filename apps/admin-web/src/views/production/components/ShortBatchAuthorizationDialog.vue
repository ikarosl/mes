<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="loading">
      <el-alert
        type="warning"
        :closable="false"
        title="短批授权允许任务在物料未齐套时承担缺料风险开工，不代表系统已核定精确的物料可生产数量。"
      >
        <p>需求新增或取消后，本次授权立即失效，员工不可开工，必须由管理员重新复核并授权。</p>
      </el-alert>

      <el-table
        :data="preview?.lines ?? []"
        class="preview-table"
      >
        <el-table-column
          label="需求来源"
          min-width="210"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ materialDemandGroupLabel(row) }}</template>
        </el-table-column>
        <el-table-column
          prop="itemCode"
          label="基础物料编码"
          min-width="150"
        />
        <el-table-column
          prop="materialVariantCode"
          label="物料版本"
          min-width="190"
        >
          <template #default="{ row }">{{ row.materialVariantCode || '未记录版本' }}</template>
        </el-table-column>
        <el-table-column
          prop="itemName"
          label="物料"
          min-width="170"
        />
        <el-table-column
          label="需求量"
          width="110"
        >
          <template #default="{ row }"
            >{{ formatQuantity(row.demandQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="已确认出库"
          width="125"
        >
          <template #default="{ row }">{{
            formatQuantity(row.confirmedOutboundQuantity)
          }}</template>
        </el-table-column>
        <el-table-column
          label="当前预计出库"
          width="130"
        >
          <template #default="{ row }">{{ formatQuantity(row.expectedOutboundQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="授权后允许缺口"
          width="145"
        >
          <template #default="{ row }">
            <span class="shortage">{{ formatQuantity(row.authorizedRemainingQuantity) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="hasExistingAuthorization"
          label="既有授权允许缺口"
          width="155"
        >
          <template #default="{ row }">
            {{
              row.existingAuthorizedRemainingQuantity === null
                ? '—'
                : formatQuantity(row.existingAuthorizedRemainingQuantity)
            }}
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-if="preview?.blockedReason"
        class="blocked-alert"
        type="info"
        :closable="false"
        :title="preview.blockedReason"
      />

      <el-form
        v-if="isWritableAction"
        label-position="top"
        class="authorization-form"
      >
        <el-form-item label="授权原因">
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="说明当前缺料情况、允许短批的生产安排和风险判断"
          />
        </el-form-item>
        <el-checkbox v-model="acknowledged">
          我已逐项复核允许缺口，并知晓需求新增或取消后本授权失效且不可开工
        </el-checkbox>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{
        isWritableAction ? '取消' : '关闭'
      }}</el-button>
      <el-button
        v-if="isWritableAction"
        type="warning"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="$emit('submit', reason.trim())"
      >
        {{ submitLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShortBatchAuthorizationPreview } from '@company/contracts';
import { SHORT_BATCH_AUTHORIZATION_ACTION_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../production-status';
import { materialDemandGroupLabel } from '../material-demand-group-presentation';

const props = defineProps<{
  visible: boolean;
  preview: ShortBatchAuthorizationPreview | null;
  loading: boolean;
  submitting: boolean;
}>();

defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'submit', reason: string): void;
}>();

const reason = ref('');
const acknowledged = ref(false);
const isWritableAction = computed(
  () =>
    !props.preview?.blockedReason &&
    ['authorize', 'reauthorize', 'adjust'].includes(
      props.preview?.authorizationAction ?? 'not_required',
    ),
);
const dialogTitle = computed(() =>
  props.preview
    ? SHORT_BATCH_AUTHORIZATION_ACTION_LABELS[props.preview.authorizationAction]
    : '短批开工授权',
);
const submitLabel = computed(() =>
  props.preview?.authorizationAction === 'reauthorize'
    ? '确认重新授权'
    : props.preview?.authorizationAction === 'adjust'
      ? '确认调整授权'
      : '确认承担风险并授权',
);
const hasExistingAuthorization = computed(() =>
  Boolean(props.preview?.lines.some((line) => line.existingAuthorizedRemainingQuantity !== null)),
);
const canSubmit = computed(
  () =>
    isWritableAction.value &&
    acknowledged.value &&
    reason.value.trim().length > 0 &&
    !props.submitting,
);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    reason.value = '';
    acknowledged.value = false;
  },
);
</script>

<style scoped>
.preview-table {
  margin-top: 16px;
}
.shortage {
  color: var(--el-color-danger);
  font-weight: 600;
}
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.blocked-alert,
.authorization-form {
  margin-top: 16px;
}
</style>
