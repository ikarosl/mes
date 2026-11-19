<template>
  <div class="create-card-bar">
    <form
      class="create-controls"
      @submit.prevent="createCard()"
    >
      <label for="workbench-create-quantity">本盘数量</label>
      <el-input-number
        id="workbench-create-quantity"
        v-model="createQuantity"
        :min="1"
        :max="99999999"
        :precision="0"
        :step="1"
        controls-position="right"
        :disabled="disabled || locked || !canCreate"
      />
      <el-button
        native-type="submit"
        type="primary"
        plain
        :loading="creating"
        :disabled="disabled || locked || printer.busy.value || !canCreate"
      >
        生成并到站
      </el-button>
      <el-tooltip
        v-if="isDevelopment"
        content="仅跳过打印，仍会登记首工序到站"
      >
        <el-button
          :loading="creating"
          :disabled="disabled || locked || !canCreate"
          @click="createCard(false)"
          >仅生成追踪卡（开发）</el-button
        >
      </el-tooltip>
    </form>
    <span class="create-hint">现场建卡、登记首站到站并打印标签，沿用上方登记人员。</span>
    <el-alert
      v-if="printerCheckError"
      :title="printerCheckError"
      type="error"
      show-icon
      :closable="false"
    >
      <el-button
        link
        type="primary"
        :disabled="creating || printer.busy.value"
        @click="$emit('settings')"
        >打印设置</el-button
      >
    </el-alert>
    <el-alert
      v-if="printError && lastCreatedCard"
      :title="`${lastCreatedCard.cardNo} 已生成并到站。${printError}`"
      type="warning"
      show-icon
      :closable="false"
    >
      <div class="print-actions">
        <el-button
          link
          type="primary"
          :loading="creating"
          :disabled="disabled || creating || printer.busy.value || !active"
          @click="reprintOriginal"
          >补打原标签</el-button
        >
        <el-button
          link
          type="primary"
          :disabled="creating || printer.busy.value"
          @click="$emit('settings')"
          >打印设置</el-button
        >
        <el-button
          link
          type="primary"
          :disabled="creating || !active"
          @click="acknowledgePrintFailure"
          >已核对，继续下一盘</el-button
        >
      </div>
    </el-alert>
    <SubmissionRecoveryNotice
      v-if="createRecovery"
      :status="createStatus"
      :busy="creating"
      records-label="追踪卡列表"
      :retry-disabled="disabled || !active || (!!submission?.shouldPrint && printer.busy.value)"
      allow-restart
      @retry="createCard()"
      @restart="restartCreate"
    />
  </div>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type {
  CreateProductionTrackingCardPayload,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import { checkLabelPrinter, printBarcodeLabels } from '@company/printing';
import { productionTrackingApi } from '../../../api/production/tracking';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { useLabelPrinter } from '../../../composables/printing/use-label-printer';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import {
  confirmTrackingLabelReprint,
  trackingBarcodeLabels,
  trackingPrintFailure,
} from './tracking-label-printing';

defineOptions({ name: 'WorkbenchCreateCardBar' });
const isDevelopment = import.meta.env.DEV === true;
const props = defineProps<{
  batchId: string | null;
  personnelId: string;
  canCreate: boolean;
  disabled: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:locked', locked: boolean): void;
  (event: 'update:busy', busy: boolean): void;
  (event: 'created', card: ProductionTrackingCardDetail): void;
  (event: 'settings'): void;
}>();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
const creating = ref(false);
const printer = useLabelPrinter();
const printerCheckError = ref('');
const printError = ref('');
const printUnknown = ref(false);
const lastCreatedCard = ref<ProductionTrackingCardDetail | null>(null);
const createQuantity = ref<number | undefined>(1);
const createIntent = useIdempotentIntent('建卡');
const createStatus = ref<IdempotentIntentStatus>('idle');
const createRecovery = computed(() => createStatus.value !== 'idle');
const locked = computed(() => creating.value || createRecovery.value || !!printError.value);
watch(locked, (value) => emit('update:locked', value), { immediate: true, flush: 'sync' });
watch(creating, (value) => emit('update:busy', value), { immediate: true, flush: 'sync' });
const submission = shallowRef<{
  batchId: string;
  body: CreateProductionTrackingCardPayload;
  shouldPrint: boolean;
} | null>(null);
// 已成功生成的盘量作为本任务下一盘默认，不再计作未保存草稿。
let quantityBaseline = 1;

function resetDraft(): void {
  createIntent.reset();
  createStatus.value = 'idle';
  submission.value = null;
  createQuantity.value = quantityBaseline;
  printerCheckError.value = '';
  printError.value = '';
  printUnknown.value = false;
  lastCreatedCard.value = null;
}
watch(
  () => props.batchId,
  () => {
    if (!locked.value) {
      quantityBaseline = 1;
      resetDraft();
    }
  },
);
async function confirmDiscard(message: string): Promise<boolean> {
  if (creating.value) return false;
  try {
    await RouteMessageBox.confirm(message, '放弃建卡', { type: 'warning' });
    resetDraft();
    return true;
  } catch {
    return false;
  }
}
async function allowBatchChange(): Promise<boolean> {
  if (locked.value) return false;
  if (createQuantity.value === quantityBaseline) return true;
  return confirmDiscard('本盘数量尚未用于建卡，切换任务将放弃当前填写。确认切换？');
}
async function allowClose(): Promise<boolean> {
  if (creating.value) return false;
  if (createRecovery.value)
    return confirmDiscard('建卡提交结果尚未确认，请先核对追踪卡列表。确认放弃并关闭工作台？');
  if (printError.value)
    return confirmDiscard(
      '追踪卡已经生成并到站，标签尚未确认打印。关闭后可在追踪卡管理中补打原卡。确认关闭？',
    );
  if (createQuantity.value === quantityBaseline) return true;
  return confirmDiscard('本盘数量尚未用于建卡，确认放弃并关闭工作台？');
}
function restartCreate(): void {
  if (!active.value || creating.value) return;
  createIntent.reset();
  createStatus.value = 'idle';
  submission.value = null;
}
async function createCard(shouldPrint = true): Promise<void> {
  if (!shouldPrint && !isDevelopment) return;
  if (creating.value || !active.value || props.disabled || printError.value) return;
  const recovering = createRecovery.value;
  let candidate = submission.value;
  if (!candidate) {
    if (!props.canCreate || !props.batchId) return;
    if (!props.personnelId) {
      EMessage.warning('请选择上方登记人员');
      return;
    }
    const quantity = createQuantity.value;
    if (quantity === undefined || !Number.isSafeInteger(quantity) || quantity <= 0) {
      EMessage.warning('请填写大于0的整数本盘数量');
      return;
    }
    candidate = {
      batchId: props.batchId,
      body: { quantity, personnelId: props.personnelId, remark: null },
      shouldPrint,
    };
  }
  const frozen = candidate;
  if (!frozen.shouldPrint && !isDevelopment) return;
  if (frozen.shouldPrint && printer.busy.value) return;
  creating.value = true;
  printerCheckError.value = '';
  async function executeCreate(): Promise<ProductionTrackingCardDetail | null> {
    submission.value = frozen;
    let created: ProductionTrackingCardDetail;
    try {
      created = await createIntent.execute(
        {
          intentType: 'production.tracking.create-and-arrive',
          params: { batchId: frozen.batchId },
          query: {},
          body: frozen.body,
        },
        (key) => productionTrackingApi.create(frozen.batchId, frozen.body, key),
      );
    } catch (error) {
      if (active.value) EMessage.error(error, '建卡失败');
      return null;
    } finally {
      createStatus.value = createIntent.getStatus();
      if (!createRecovery.value) submission.value = null;
    }
    quantityBaseline = frozen.body.quantity;
    lastCreatedCard.value = { ...created };
    emit('created', created);
    if (active.value) EMessage.success('追踪卡已生成，首工序已到站');
    return created;
  }
  try {
    if (!frozen.shouldPrint) {
      await executeCreate();
      return;
    }
    await printer.runOperation(async (settings) => {
      // 未知业务结果必须先恢复原意图，不能被当前打印机故障阻断。
      if (!recovering) {
        try {
          await checkLabelPrinter(settings);
        } catch (error) {
          const reason = error instanceof Error ? error.message : '本机打印服务检查失败';
          printerCheckError.value = `本次尚未提交建卡。${reason}`;
          return;
        }
        if (!active.value || props.disabled || !props.canCreate || props.batchId !== frozen.batchId)
          return;
      }
      const created = await executeCreate();
      if (!created) return;
      // 建卡已确认成功；打印失败只保留原卡补打，不进入建卡失败或重放分支。
      try {
        await printBarcodeLabels(trackingBarcodeLabels([created]), settings);
        printError.value = '';
        printUnknown.value = false;
        if (active.value) EMessage.success('标签已提交打印服务，请核对实际出纸');
      } catch (error) {
        const failure = trackingPrintFailure(error);
        printError.value = failure.message;
        printUnknown.value = failure.unknown;
        if (active.value) EMessage.warning('追踪卡已生成并到站，请核对标签打印结果');
      }
    });
  } catch (error) {
    if (active.value)
      EMessage.error(
        error,
        frozen.shouldPrint
          ? '处理未完成，请核对追踪卡与标签打印结果'
          : '处理未完成，请核对追踪卡结果',
      );
  } finally {
    creating.value = false;
  }
}

async function reprintOriginal(): Promise<void> {
  const card = lastCreatedCard.value;
  if (!card || creating.value || printer.busy.value || !active.value || props.disabled) return;
  if (!(await confirmTrackingLabelReprint(printUnknown.value))) return;
  if (creating.value || printer.busy.value || !active.value || props.disabled) return;
  const labels = trackingBarcodeLabels([{ id: card.id, cardNo: card.cardNo }]);
  creating.value = true;
  try {
    await printer.runOperation((settings) => printBarcodeLabels(labels, settings));
    printError.value = '';
    printUnknown.value = false;
    if (active.value) EMessage.success('原标签已提交打印服务，请核对实际出纸');
  } catch (error) {
    const failure = trackingPrintFailure(error);
    printError.value = failure.message;
    printUnknown.value = failure.unknown;
  } finally {
    creating.value = false;
  }
}

function acknowledgePrintFailure(): void {
  if (creating.value || !active.value) return;
  printError.value = '';
  printUnknown.value = false;
  lastCreatedCard.value = null;
}
const unregister = useTabsStore().registerCloseGuard('production-workbench', allowClose);
onScopeDispose(unregister);
defineExpose({ allowBatchChange });
</script>

<style scoped>
.create-card-bar {
  display: grid;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.create-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.create-controls label {
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.create-controls .el-input-number {
  width: 140px;
}
.create-controls .el-button {
  margin-left: 0;
}
.create-hint {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.print-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.print-actions .el-button {
  margin-left: 0;
}
</style>
