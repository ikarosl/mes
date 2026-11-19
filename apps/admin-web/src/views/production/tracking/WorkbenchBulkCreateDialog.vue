<template>
  <el-dialog
    :model-value="visible"
    title="批量预生成追踪卡"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    :before-close="requestClose"
  >
    <p class="batch-context">{{ batchNo }} · 建卡登记人：{{ personnelName }}</p>
    <InlineHint>按本次分盘总量生成追踪卡，尚不到站；实物进入首工序时扫码到站。</InlineHint>
    <el-form
      label-position="top"
      @submit.prevent="submit()"
    >
      <div class="quantity-fields">
        <el-form-item label="本次分盘总量">
          <el-input-number
            v-model="totalQuantity"
            :min="1"
            :max="99999999"
            :precision="0"
            :step="1"
            :disabled="locked || !!result.length"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="标准每盘数量">
          <el-input-number
            v-model="quantityPerCard"
            :min="1"
            :max="99999999"
            :precision="0"
            :step="1"
            :disabled="locked || !!result.length"
            controls-position="right"
          />
        </el-form-item>
      </div>
      <el-alert
        v-if="preview && !result.length"
        :type="preview.count > PRODUCTION_TRACKING_CARD_BATCH_LIMIT ? 'warning' : 'info'"
        :closable="false"
      >
        <template #title>
          <template v-if="preview.count > PRODUCTION_TRACKING_CARD_BATCH_LIMIT"
            >本次将生成 {{ preview.count }} 张，单次最多
            {{ PRODUCTION_TRACKING_CARD_BATCH_LIMIT }} 张，请调整数量。</template
          >
          <template v-else
            >共 {{ preview.count }} 张：{{ preview.full }} 盘 × {{ quantityPerCard
            }}<template v-if="preview.tail">，尾盘 {{ preview.tail }}</template
            >，合计 {{ totalQuantity }}。</template
          >
        </template>
      </el-alert>
      <InlineHint v-if="!result.length"
        >本次分盘总量由现场填写，不计完成量或库存。选择“生成并打印追踪卡”将自动打印全部标签。</InlineHint
      >
    </el-form>
    <el-alert
      v-if="printerCheckError"
      :title="printerCheckError"
      type="error"
      show-icon
      :closable="false"
    />
    <SubmissionRecoveryNotice
      v-if="recovery"
      :status="status"
      :busy="creating"
      records-label="追踪卡管理"
      :retry-disabled="!active || !visible || (!!submission?.shouldPrint && printer.busy.value)"
      allow-restart
      @retry="submit()"
      @restart="restartSubmission"
    />
    <template v-if="result.length">
      <el-alert
        title="本批追踪卡已生成，尚未到站"
        type="success"
        :closable="false"
        show-icon
      />
      <p class="number-range">
        {{ result[0]?.cardNo }} 至 {{ result[result.length - 1]?.cardNo }} · 共
        {{ result.length }} 张
      </p>
      <el-alert
        v-if="printError"
        :title="printError"
        type="warning"
        show-icon
        :closable="false"
      >
        <el-button
          link
          type="primary"
          :loading="creating"
          :disabled="creating || printer.busy.value || !active"
          @click="reprintBatch"
          >补打本批原标签</el-button
        >
      </el-alert>
      <el-table
        :data="result"
        max-height="300"
        row-key="id"
      >
        <el-table-column
          prop="cardNo"
          label="追踪卡号"
          min-width="260"
        />
        <el-table-column
          label="盘量"
          width="150"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
          ></el-table-column
        >
      </el-table>
      <InlineHint
        >打印失败时补打本批原卡，无需重新生成编号。关闭后可在追踪卡管理中补打。</InlineHint
      >
    </template>
    <template #footer>
      <el-button
        :disabled="creating || printer.busy.value"
        @click="$emit('settings')"
        >打印设置</el-button
      >
      <el-button
        :disabled="creating"
        @click="requestClose"
        >关闭</el-button
      >
      <template v-if="result.length">
        <el-button
          :disabled="creating || (resultShouldPrint && printer.busy.value)"
          @click="nextBatch"
          >继续生成下一批</el-button
        >
        <el-button
          type="primary"
          :disabled="creating || printer.busy.value"
          @click="openLabels"
          >选择标签 / 打印</el-button
        >
      </template>
      <template v-else>
        <el-button
          v-if="isDevelopment"
          :loading="creating"
          :disabled="locked || !valid"
          @click="submit(false)"
          >仅生成追踪卡（开发）</el-button
        >
        <el-button
          type="primary"
          :loading="creating"
          :disabled="locked || printer.busy.value || !valid"
          @click="submit()"
          >生成并打印追踪卡</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { PRODUCTION_TRACKING_CARD_BATCH_LIMIT } from '@company/constants';
import type {
  CreateProductionTrackingCardsPayload,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import { checkLabelPrinter, printBarcodeLabels } from '@company/printing';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { useLabelPrinter } from '../../../composables/printing/use-label-printer';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';
import { RouteMessageBox } from '../../../utils/route-message-box';
import {
  confirmTrackingLabelReprint,
  trackingBarcodeLabels,
  trackingPrintFailure,
} from './tracking-label-printing';

defineOptions({ name: 'WorkbenchBulkCreateDialog' });
const isDevelopment = import.meta.env.DEV === true;
const props = defineProps<{
  visible: boolean;
  batchId: string | null;
  batchNo: string;
  personnelId: string;
  personnelName: string;
}>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'created'): void;
  (event: 'print', cards: ProductionTrackingCardDetail[]): void;
  (event: 'settings'): void;
}>();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
const totalQuantity = ref<number>();
const quantityPerCard = ref<number>();
const creating = ref(false);
const printer = useLabelPrinter();
const printerCheckError = ref('');
const printError = ref('');
const printUnknown = ref(false);
const status = ref<IdempotentIntentStatus>('idle');
const intent = useIdempotentIntent('批量生成追踪卡');
const recovery = computed(() => status.value !== 'idle');
const locked = computed(() => creating.value || recovery.value);
const result = ref<ProductionTrackingCardDetail[]>([]);
const resultShouldPrint = ref(true);
const submission = shallowRef<{
  batchId: string;
  body: CreateProductionTrackingCardsPayload;
  shouldPrint: boolean;
} | null>(null);
let baseline = '';
const draftKey = () => JSON.stringify([totalQuantity.value, quantityPerCard.value]);
const preview = computed(() => {
  const total = totalQuantity.value,
    perCard = quantityPerCard.value;
  if (!total || !perCard || !Number.isSafeInteger(total) || !Number.isSafeInteger(perCard))
    return null;
  return {
    count: Math.ceil(total / perCard),
    full: Math.floor(total / perCard),
    tail: total % perCard,
  };
});
const valid = computed(
  () =>
    !!props.batchId &&
    !!props.personnelId &&
    !!preview.value &&
    preview.value.count <= PRODUCTION_TRACKING_CARD_BATCH_LIMIT,
);
function resetIntent(): void {
  intent.reset();
  status.value = 'idle';
  submission.value = null;
}
function resetPrintResult(): void {
  result.value = [];
  resultShouldPrint.value = true;
  printerCheckError.value = '';
  printError.value = '';
  printUnknown.value = false;
}
watch(
  () => props.batchId,
  () => {
    if (locked.value) return;
    totalQuantity.value = undefined;
    quantityPerCard.value = undefined;
    resetPrintResult();
    baseline = draftKey();
  },
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && !locked.value) {
      resetPrintResult();
      resetIntent();
      baseline = draftKey();
    }
  },
);
async function allowClose(): Promise<boolean> {
  if (!props.visible) return true;
  if (creating.value) return false;
  if (!recovery.value && !printError.value && (result.value.length || draftKey() === baseline))
    return true;
  try {
    let message = '本次分盘数量尚未提交，确认放弃并关闭？';
    if (recovery.value)
      message = '请先在追踪卡管理中核对本批是否已生成。确认放弃本次未确认提交并关闭？';
    else if (printError.value)
      message = '本批追踪卡已生成，标签尚未确认打印。关闭后可在追踪卡管理中补打原卡。确认关闭？';
    await RouteMessageBox.confirm(message, '关闭批量生成', { type: 'warning' });
    resetIntent();
    totalQuantity.value = undefined;
    quantityPerCard.value = undefined;
    return true;
  } catch {
    return false;
  }
}

async function openLabels(): Promise<void> {
  if (
    !active.value ||
    !props.visible ||
    creating.value ||
    printer.busy.value ||
    !result.value.length
  )
    return;
  if (!(await confirmTrackingLabelReprint(printUnknown.value))) return;
  if (!active.value || !props.visible || creating.value || printer.busy.value) return;
  emit(
    'print',
    result.value.map((card) => ({ ...card })),
  );
}
async function requestClose(): Promise<void> {
  if (await allowClose()) emit('update:visible', false);
}
function restartSubmission(): void {
  if (!active.value || creating.value) return;
  resetIntent();
}
async function submit(shouldPrint = true): Promise<void> {
  if (!shouldPrint && !isDevelopment) return;
  if (!active.value || !props.visible || creating.value || result.value.length) return;
  const recovering = recovery.value;
  let candidate = submission.value;
  if (!candidate) {
    if (!valid.value || !props.batchId || !totalQuantity.value || !quantityPerCard.value) return;
    candidate = {
      batchId: props.batchId,
      body: {
        totalQuantity: totalQuantity.value,
        quantityPerCard: quantityPerCard.value,
        personnelId: props.personnelId,
        remark: null,
      },
      shouldPrint,
    };
  }
  const frozen = candidate;
  if (!frozen.shouldPrint && !isDevelopment) return;
  if (frozen.shouldPrint && printer.busy.value) return;
  creating.value = true;
  printerCheckError.value = '';
  async function executeCreate(): Promise<ProductionTrackingCardDetail[] | null> {
    submission.value = frozen;
    let cards: ProductionTrackingCardDetail[];
    try {
      const created = await intent.execute(
        {
          intentType: 'production.tracking.create-bulk',
          params: { batchId: frozen.batchId },
          query: {},
          body: frozen.body,
        },
        (key) => productionTrackingApi.createBulk(frozen.batchId, frozen.body, key),
      );
      cards = created.cards;
    } catch (error) {
      if (active.value) EMessage.error(error, '批量生成失败');
      return null;
    } finally {
      status.value = intent.getStatus();
      if (!recovery.value) submission.value = null;
    }
    result.value = cards.map((card) => ({ ...card }));
    resultShouldPrint.value = frozen.shouldPrint;
    baseline = draftKey();
    emit('created');
    if (active.value) EMessage.success(`已生成 ${cards.length} 张追踪卡，尚未到站`);
    return cards;
  }
  try {
    if (!frozen.shouldPrint) {
      await executeCreate();
      return;
    }
    await printer.runOperation(async (settings) => {
      if (!recovering) {
        try {
          await checkLabelPrinter(settings);
        } catch (error) {
          const reason = error instanceof Error ? error.message : '本机打印服务检查失败';
          printerCheckError.value = `本次尚未提交批量生成。${reason}`;
          return;
        }
        if (!active.value || !props.visible || props.batchId !== frozen.batchId) return;
      }
      const cards = await executeCreate();
      if (!cards) return;
      try {
        await printBarcodeLabels(trackingBarcodeLabels(cards), settings);
        printError.value = '';
        printUnknown.value = false;
        if (active.value) EMessage.success('本批标签已提交打印服务，请核对实际出纸');
      } catch (error) {
        const failure = trackingPrintFailure(error);
        printError.value = failure.message;
        printUnknown.value = failure.unknown;
        if (active.value) EMessage.warning('本批追踪卡已生成，请核对标签打印结果');
      }
    });
  } catch (error) {
    if (active.value)
      EMessage.error(
        error,
        frozen.shouldPrint
          ? '处理未完成，请核对本批追踪卡与标签打印结果'
          : '处理未完成，请核对本批追踪卡结果',
      );
  } finally {
    creating.value = false;
  }
}

async function reprintBatch(): Promise<void> {
  if (
    !active.value ||
    !props.visible ||
    creating.value ||
    printer.busy.value ||
    !result.value.length
  )
    return;
  const cards = result.value.map((card) => ({ id: card.id, cardNo: card.cardNo }));
  if (!(await confirmTrackingLabelReprint(printUnknown.value))) return;
  if (!active.value || !props.visible || creating.value || printer.busy.value) return;
  creating.value = true;
  try {
    const labels = trackingBarcodeLabels(cards);
    await printer.runOperation((settings) => printBarcodeLabels(labels, settings));
    printError.value = '';
    printUnknown.value = false;
    if (active.value) EMessage.success('本批原标签已提交打印服务，请核对实际出纸');
  } catch (error) {
    const failure = trackingPrintFailure(error);
    printError.value = failure.message;
    printUnknown.value = failure.unknown;
  } finally {
    creating.value = false;
  }
}

async function nextBatch(): Promise<void> {
  if (!active.value || creating.value || (resultShouldPrint.value && printer.busy.value)) return;
  if (printError.value) {
    try {
      await RouteMessageBox.confirm(
        '本批追踪卡已生成，标签尚未确认打印。请先核对打印队列和实物，之后仍可在追踪卡管理中补打原卡。确认继续下一批？',
        '继续生成下一批',
        { type: 'warning' },
      );
    } catch {
      return;
    }
  }
  if (
    !active.value ||
    !props.visible ||
    creating.value ||
    (resultShouldPrint.value && printer.busy.value)
  )
    return;
  resetPrintResult();
}
const unregister = useTabsStore().registerCloseGuard('production-workbench', allowClose);
onScopeDispose(unregister);
</script>

<style scoped>
.batch-context,
.number-range {
  overflow-wrap: anywhere;
}
.quantity-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 16px;
}
.quantity-fields .el-input-number {
  width: 220px;
}
</style>
