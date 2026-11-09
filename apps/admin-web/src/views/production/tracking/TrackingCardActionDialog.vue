<template>
  <el-dialog
    :model-value="visible"
    :title="TRACKING_ACTION_LABELS[action]"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="editingCard">
      <el-descriptions
        :column="2"
        border
        class="context"
        ><el-descriptions-item label="追踪卡">{{ editingCard.cardNo }}</el-descriptions-item
        ><el-descriptions-item label="本盘数量"
          >{{ formatQuantity(editingCard.quantity) }} {{ editingCard.unit }}</el-descriptions-item
        ><el-descriptions-item
          label="任务"
          :span="2"
          >{{ editingCard.batchNo }} · {{ editingCard.productName }}</el-descriptions-item
        ></el-descriptions
      >
      <el-alert
        v-if="recovery"
        :title="submissionRecoveryMessage(intentStatus, '追踪卡详情')"
        type="warning"
        show-icon
        :closable="false"
        class="context"
      />
      <InlineHint v-if="action === 'output'"
        >一盘一次定稿。可用产出为
        <strong>0</strong>
        时完成本盘但不入库，正数与本次终检同时入库；已定稿产出通过库存补差处理。</InlineHint
      >
      <InlineHint v-else-if="action === 'quantity'"
        >更正本盘后，各站后续沿用新盘量，已完成的交接报工保留原数量快照。请补打标签。</InlineHint
      >
      <InlineHint v-else-if="action === 'void'"
        >作废后保留到站、交接和异常记录，本盘不能继续流转或确认产出。</InlineHint
      >
      <el-form
        :model="form"
        label-width="100px"
        :disabled="submitting || recovery"
        class="action-form"
      >
        <el-form-item
          v-if="needsPersonnel"
          label="登记人员"
          required
        >
          <div class="personnel-select">
            <el-select
              v-model="form.personnelId"
              filterable
              placeholder="请选择现场登记人"
              :loading="personnelLoading"
              ><el-option
                v-for="person in personnel"
                :key="person.id"
                :label="`${person.code} / ${person.name}`"
                :value="person.id" /></el-select
            ><el-button
              :loading="personnelLoading"
              @click="loadPersonnel"
              >刷新</el-button
            >
          </div>
          <div
            v-if="personnelError"
            class="error-text"
          >
            {{ personnelError }}
          </div>
        </el-form-item>
        <el-form-item
          v-if="action === 'quantity'"
          label="更正后盘量"
          required
          ><el-input-number
            v-model="form.quantity"
            :min="1"
            :precision="0"
            :step="1"
        /></el-form-item>
        <el-form-item
          v-if="action === 'output'"
          label="可用产出"
          required
          ><el-input-number
            v-model="form.availableQuantity"
            :min="0"
            :max="Number(editingCard.quantity)"
            :precision="0"
            :step="1"
            placeholder="据实填写，允许0"
          /><span class="unit">{{ editingCard.unit }}</span></el-form-item
        >
        <el-form-item
          v-if="action === 'abnormality'"
          label="涉及工序"
          ><el-select
            v-model="form.stepRecordId"
            clearable
            placeholder="当前工序"
            ><el-option
              v-for="step in involvedSteps"
              :key="step.stepRecordId"
              :label="step.stepName"
              :value="step.stepRecordId" /></el-select></el-form-item
        ><el-form-item
          v-if="action === 'abnormality'"
          label="流转影响"
          required
          ><el-radio-group v-model="form.severity"
            ><el-radio
              v-for="severity in PRODUCTION_TRACKING_ABNORMALITY_SEVERITIES"
              :key="severity"
              :value="severity"
              >{{ PRODUCTION_TRACKING_ABNORMALITY_SEVERITY_LABELS[severity] }}</el-radio
            ></el-radio-group
          ></el-form-item
        >
        <el-form-item
          v-if="action === 'handling'"
          label="原异常"
          ><div class="original-description">
            {{ editingAbnormality?.description }}
          </div></el-form-item
        >
        <el-form-item
          :label="textLabel"
          :required="action !== 'output'"
          ><el-input
            v-model="form.text"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
        /></el-form-item>
        <el-form-item
          v-if="action === 'handling'"
          label="处理结果"
          ><el-checkbox v-model="form.resolve">本条异常已解决</el-checkbox></el-form-item
        >
      </el-form>
    </template>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="requestClose(false)"
        >取消</el-button
      ><el-button
        v-if="recovery"
        @click="abandonIntent"
        >核对后放弃本次提交</el-button
      ><el-button
        :type="action === 'void' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="intentStatus === 'blocked' || intentStatus === 'expired'"
        @click="submit"
        >{{ recovery ? '重试本次提交' : TRACKING_ACTION_LABELS[action] }}</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type {
  PersonnelOption,
  ProductionTrackingAbnormality,
  ProductionTrackingAbnormalitySeverity,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ABNORMALITY_SEVERITIES,
  PRODUCTION_TRACKING_ABNORMALITY_SEVERITY_LABELS,
} from '@company/constants';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  submissionRecoveryMessage,
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
import { TRACKING_ACTION_LABELS, type TrackingCardAction } from './tracking-presentation';

const props = defineProps<{
  visible: boolean;
  action: TrackingCardAction;
  card: ProductionTrackingCardDetail | null;
  abnormality?: ProductionTrackingAbnormality | null;
  defaultPersonnelId?: string;
  routeName: string;
}>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'changed', card: ProductionTrackingCardDetail): void;
}>();
const editingCard = ref<ProductionTrackingCardDetail | null>(null),
  editingAbnormality = ref<ProductionTrackingAbnormality | null>(null);
const form = reactive<{
  personnelId: string;
  quantity: number;
  availableQuantity: number | undefined;
  stepRecordId: string;
  severity: ProductionTrackingAbnormalitySeverity;
  text: string;
  resolve: boolean;
}>({
  personnelId: '',
  quantity: 1,
  availableQuantity: undefined,
  stepRecordId: '',
  severity: 'normal',
  text: '',
  resolve: false,
});
const submitting = ref(false),
  personnel = ref<PersonnelOption[]>([]),
  personnelLoading = ref(false),
  personnelError = ref('');
const intent = useIdempotentIntent('追踪卡'),
  intentStatus = ref<IdempotentIntentStatus>('idle');
const recovery = computed(() => intentStatus.value !== 'idle');
const involvedSteps = computed(() => {
  const seen = new Set<string>();
  return (editingCard.value?.visits ?? []).filter((visit) => {
    if (seen.has(visit.stepRecordId)) return false;
    seen.add(visit.stepRecordId);
    return true;
  });
});
const needsPersonnel = computed(() => ['abnormality', 'handling', 'output'].includes(props.action));
const textLabel = computed(
  () =>
    ({
      quantity: '更正原因',
      void: '作废原因',
      abnormality: '异常描述',
      handling: '处理内容',
      output: '终检备注',
    })[props.action],
);
const reads = useLatestReadRequest(() => {
  personnelLoading.value = false;
});
let initialSignature = '';
async function loadPersonnel(): Promise<void> {
  if (!props.visible || !reads.isActive()) return;
  const read = reads.begin(() => props.visible);
  personnelLoading.value = true;
  personnelError.value = '';
  try {
    const values = await personnelApi.options(props.action === 'output' ? 'quality' : undefined, {
      signal: read.signal,
    });
    if (read.isCurrent()) personnel.value = values;
  } catch (error) {
    if (read.isCurrent())
      personnelError.value = error instanceof Error ? error.message : '登记人员加载失败，请重试';
  } finally {
    if (read.isCurrent()) personnelLoading.value = false;
  }
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      reads.invalidate();
      return;
    }
    editingCard.value = props.card ? { ...props.card } : null;
    editingAbnormality.value = props.abnormality ? { ...props.abnormality } : null;
    Object.assign(form, {
      personnelId: props.action === 'output' ? '' : props.defaultPersonnelId || '',
      quantity: Number(props.card?.quantity ?? 1),
      availableQuantity: undefined,
      stepRecordId: props.card?.currentStepRecordId || '',
      severity: 'normal',
      text: '',
      resolve: false,
    });
    initialSignature = JSON.stringify(form);
    personnel.value = [];
    personnelError.value = '';
    intent.reset();
    intentStatus.value = 'idle';
    if (needsPersonnel.value) void loadPersonnel();
  },
);
async function allowClose(): Promise<boolean> {
  if (submitting.value) return false;
  if (!props.visible) return true;
  if (!recovery.value && initialSignature === JSON.stringify(form)) return true;
  const message = recovery.value
    ? '本次提交结果尚未确认。请先核对追踪卡详情；放弃后将不能使用原请求重试，确认放弃？'
    : '本次填写尚未保存，确认放弃？';
  try {
    await RouteMessageBox.confirm(message, '关闭确认', {
      type: 'warning',
      confirmButtonText: '确认放弃',
      cancelButtonText: '继续保留',
    });
    intent.reset();
    intentStatus.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function requestClose(value: boolean): Promise<void> {
  if (!value && (await allowClose())) emit('update:visible', false);
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) done();
}
async function abandonIntent(): Promise<void> {
  if (await allowClose()) {
    intent.reset();
    intentStatus.value = 'idle';
    emit('update:visible', false);
  }
}
async function submit(): Promise<void> {
  const card = editingCard.value;
  if (!card || submitting.value || !reads.isActive()) return;
  if (needsPersonnel.value && !form.personnelId) {
    EMessage.warning('请选择登记人员');
    return;
  }
  if (props.action !== 'output' && !form.text.trim()) {
    EMessage.warning(`请填写${textLabel.value}`);
    return;
  }
  if (
    props.action === 'output' &&
    (form.availableQuantity === undefined ||
      !Number.isSafeInteger(form.availableQuantity) ||
      form.availableQuantity < 0 ||
      form.availableQuantity > Number(card.quantity))
  ) {
    EMessage.warning('请据实填写0到本盘数量之间的整数可用产出');
    return;
  }
  const action = props.action;
  const body = {
    version: card.version,
    personnelId: form.personnelId,
    quantity: form.quantity,
    availableQuantity: form.availableQuantity ?? 0,
    stepRecordId: form.stepRecordId || null,
    severity: form.severity,
    text: form.text.trim(),
    resolve: form.resolve,
    abnormalityId: editingAbnormality.value?.id ?? null,
    abnormalityVersion: editingAbnormality.value?.version ?? null,
  };
  submitting.value = true;
  try {
    const result = await intent.execute(
      { intentType: `production.tracking.${action}`, params: { cardId: card.id }, query: {}, body },
      async (key) => {
        if (action === 'quantity')
          return productionTrackingApi.correctQuantity(
            card.id,
            { version: body.version, quantity: body.quantity, reason: body.text },
            key,
          );
        if (action === 'void')
          return productionTrackingApi.void(
            card.id,
            { version: body.version, reason: body.text },
            key,
          );
        if (action === 'abnormality')
          return productionTrackingApi.reportAbnormality(
            card.id,
            {
              version: body.version,
              personnelId: body.personnelId,
              severity: body.severity,
              stepRecordId: body.stepRecordId,
              description: body.text,
            },
            key,
          );
        if (action === 'handling') {
          if (!body.abnormalityId || body.abnormalityVersion === null)
            throw new Error('异常依据缺失，请关闭后重新打开');
          return productionTrackingApi.handleAbnormality(
            card.id,
            body.abnormalityId,
            {
              version: body.abnormalityVersion,
              personnelId: body.personnelId,
              content: body.text,
              resolve: body.resolve,
            },
            key,
          );
        }
        return productionTrackingApi.confirmOutput(
          card.id,
          {
            version: body.version,
            personnelId: body.personnelId,
            availableQuantity: body.availableQuantity,
            remark: body.text || null,
          },
          key,
        );
      },
    );
    EMessage.success(`${TRACKING_ACTION_LABELS[action]}已完成`);
    emit('changed', result);
    emit('update:visible', false);
  } catch (error) {
    EMessage.error(error, `${TRACKING_ACTION_LABELS[action]}失败`);
  } finally {
    intentStatus.value = intent.getStatus();
    submitting.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard(props.routeName, allowClose);
onScopeDispose(unregister);
</script>

<style scoped>
.context {
  margin-bottom: 16px;
}
.action-form {
  margin-top: 20px;
}
.personnel-select {
  display: flex;
  gap: 8px;
  width: 100%;
}
.personnel-select .el-select {
  flex: 1;
}
.error-text {
  color: var(--el-color-danger);
}
.unit {
  margin-left: 8px;
}
.original-description {
  white-space: pre-wrap;
  line-height: 1.6;
}
</style>
