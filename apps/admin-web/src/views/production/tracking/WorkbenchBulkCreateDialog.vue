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
      @submit.prevent="submit"
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
        >本次分盘总量由现场填写，不计完成量或库存。生成后可选择全部或部分标签打印。</InlineHint
      >
    </el-form>
    <SubmissionRecoveryNotice
      v-if="recovery"
      :status="status"
      :busy="creating"
      records-label="追踪卡管理"
      :retry-disabled="!active || !visible"
      allow-restart
      @retry="submit"
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
        :disabled="creating"
        @click="requestClose"
        >关闭</el-button
      >
      <template v-if="result.length">
        <el-button @click="result = []">继续生成下一批</el-button>
        <el-button
          type="primary"
          @click="$emit('print', result)"
          >选择标签 / 打印</el-button
        >
      </template>
      <el-button
        v-else
        type="primary"
        :loading="creating"
        :disabled="locked || !valid"
        @click="submit"
        >生成追踪卡</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { PRODUCTION_TRACKING_CARD_BATCH_LIMIT } from '@company/constants';
import type {
  CreateProductionTrackingCardsPayload,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';
import { RouteMessageBox } from '../../../utils/route-message-box';

defineOptions({ name: 'WorkbenchBulkCreateDialog' });
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
const status = ref<IdempotentIntentStatus>('idle');
const intent = useIdempotentIntent('批量生成追踪卡');
const recovery = computed(() => status.value !== 'idle');
const locked = computed(() => creating.value || recovery.value);
const result = ref<ProductionTrackingCardDetail[]>([]);
let submission: { batchId: string; body: CreateProductionTrackingCardsPayload } | null = null;
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
  submission = null;
}
watch(
  () => props.batchId,
  () => {
    if (locked.value) return;
    totalQuantity.value = undefined;
    quantityPerCard.value = undefined;
    result.value = [];
    baseline = draftKey();
  },
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && !locked.value) {
      result.value = [];
      resetIntent();
      baseline = draftKey();
    }
  },
);
async function allowClose(): Promise<boolean> {
  if (!props.visible) return true;
  if (creating.value) return false;
  if (!recovery.value && (result.value.length || draftKey() === baseline)) return true;
  try {
    await RouteMessageBox.confirm(
      recovery.value
        ? '请先在追踪卡管理中核对本批是否已生成。确认放弃本次未确认提交并关闭？'
        : '本次分盘数量尚未提交，确认放弃并关闭？',
      '关闭批量生成',
      { type: 'warning' },
    );
    resetIntent();
    totalQuantity.value = undefined;
    quantityPerCard.value = undefined;
    return true;
  } catch {
    return false;
  }
}
async function requestClose(): Promise<void> {
  if (await allowClose()) emit('update:visible', false);
}
function restartSubmission(): void {
  if (!active.value || creating.value) return;
  resetIntent();
}
async function submit(): Promise<void> {
  if (!active.value || !props.visible || creating.value || result.value.length) return;
  if (!submission) {
    if (!valid.value || !props.batchId || !totalQuantity.value || !quantityPerCard.value) return;
    submission = {
      batchId: props.batchId,
      body: {
        totalQuantity: totalQuantity.value,
        quantityPerCard: quantityPerCard.value,
        personnelId: props.personnelId,
        remark: null,
      },
    };
  }
  const frozen = submission;
  creating.value = true;
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
    result.value = created.cards;
    baseline = draftKey();
    emit('created');
    EMessage.success(`已生成 ${created.cards.length} 张追踪卡，尚未到站`);
  } catch (error) {
    EMessage.error(error, '批量生成失败');
  } finally {
    status.value = intent.getStatus();
    if (!recovery.value) submission = null;
    creating.value = false;
  }
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
