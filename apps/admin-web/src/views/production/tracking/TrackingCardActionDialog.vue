<template>
  <el-dialog
    :model-value="visible"
    :title="TRACKING_ACTION_LABELS[editingAction]"
    :width="editingAction === 'handling' ? DialogWidth.lg : DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="editingCard">
      <el-descriptions
        :column="2"
        border
        class="context"
      >
        <el-descriptions-item label="追踪卡">{{ editingCard.cardNo }}</el-descriptions-item>
        <el-descriptions-item label="当前剩余盘量"
          >{{ formatQuantity(editingCard.quantity) }} {{ editingCard.unit }}</el-descriptions-item
        >
        <el-descriptions-item
          label="任务"
          :span="2"
          >{{ editingCard.batchNo }} · {{ editingCard.productName }}</el-descriptions-item
        >
      </el-descriptions>
      <SubmissionRecoveryNotice
        v-if="recovery"
        :status="intentStatus"
        :busy="submitting"
        records-label="追踪卡详情"
        :retry-disabled="!reads.isActive()"
        allow-restart
        @retry="submit"
        @restart="resetIntent"
      />
      <el-alert
        v-else-if="basisChanged"
        title="追踪卡数量或状态已更新，本次输入仍保留。请刷新核对办理依据，再检查当前盘量与异常后提交。"
        type="warning"
        show-icon
        :closable="false"
        class="context"
      />
      <el-alert
        v-if="basisError"
        :title="basisError"
        type="error"
        :closable="false"
        class="context"
      />
      <el-button
        :loading="basisLoading"
        :disabled="submitting || recovery"
        @click="refreshBasis"
        >刷新核对办理依据</el-button
      >
      <InlineHint>刷新后采用当前追踪卡与异常资料，保留本次填写；请核对后再提交。</InlineHint>
      <InlineHint v-if="editingAction === 'output'">
        本次将以当前剩余盘量
        <strong>{{ formatQuantity(editingCard.quantity) }} {{ editingCard.unit }}</strong>
        确认终检产出并完成末站报工。成品入库另行办理；未入库产出可在任务产出记录中填写原因撤销后重新终检。
      </InlineHint>
      <InlineHint v-else-if="editingAction === 'abnormality'"
        >登记后暂停整盘流转。不同问题分别登记，逐条完成处理后才能继续。</InlineHint
      >
      <InlineHint v-else-if="editingAction === 'handling'"
        >每条问题只提交一次最终处理。<strong>仅本次新增报废扣减盘量</strong>；关联已报废数量须由现场人员核对为同一实物。</InlineHint
      >
      <InlineHint v-else-if="editingAction === 'quantity'"
        >更正本盘后，各站后续沿用新盘量，已完成的交接报工保留原数量快照。请补打标签。</InlineHint
      >
      <InlineHint v-else-if="editingAction === 'void'"
        >人工作废后保留到站、交接和异常记录，本盘不能继续流转或确认产出；此操作不登记实物报废数量。</InlineHint
      >
      <el-form
        :model="form"
        label-width="116px"
        :disabled="submitting || recovery || succeeded"
        class="action-form"
      >
        <el-form-item
          v-if="needsPersonnel"
          :label="editingAction === 'output' ? '确认人员' : '登记人员'"
          required
        >
          <div class="personnel-select">
            <el-select
              v-model="form.personnelId"
              filterable
              placeholder="请选择现场人员"
              :loading="personnelLoading"
            >
              <el-option
                v-for="person in personnel"
                :key="person.id"
                :label="`${person.code} / ${person.name}`"
                :value="person.id"
              />
            </el-select>
            <el-button
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
          v-if="editingAction === 'quantity'"
          label="更正后盘量"
          required
        >
          <el-input-number
            v-model="form.quantity"
            :min="1"
            :precision="0"
            :step="1"
          /><span class="unit">{{ editingCard.unit }}</span>
        </el-form-item>
        <template v-if="editingAction === 'abnormality'">
          <el-form-item label="涉及工序">
            <el-select
              v-model="form.stepRecordId"
              clearable
              :placeholder="editingCard.currentStepRecordId ? '当前工序' : '未到站，可不选'"
              ><el-option
                v-for="step in involvedSteps"
                :key="step.stepRecordId"
                :label="step.stepName"
                :value="step.stepRecordId"
            /></el-select>
          </el-form-item>
          <el-form-item
            label="影响数量"
            required
          >
            <el-input-number
              v-model="form.affectedQuantity"
              :min="1"
              :max="Math.max(Number(editingCard.quantity), form.affectedQuantity ?? 0)"
              :precision="0"
              :step="1"
              placeholder="填写受影响数量"
            /><span class="unit">{{ editingCard.unit }}</span>
          </el-form-item>
        </template>
        <template v-if="editingAction === 'handling' && editingAbnormality">
          <el-form-item label="原异常"
            ><div class="original-description">
              {{ editingAbnormality.description }}
            </div></el-form-item
          >
          <el-form-item label="异常影响量"
            ><strong
              >{{ formatQuantity(editingAbnormality.affectedQuantity) }}
              {{ editingCard.unit }}</strong
            ></el-form-item
          >
          <div class="settlement-inputs">
            <el-form-item
              label="返修成功"
              required
              ><el-input-number
                v-model="form.repairedQuantity"
                :min="0"
                :max="
                  Math.max(
                    form.repairedQuantity ?? 0,
                    Math.min(
                      Number(editingAbnormality.affectedQuantity),
                      Number(editingCard.quantity),
                    ),
                  )
                "
                :precision="0"
                :step="1"
                placeholder="允许0"
              /><span class="unit">{{ editingCard.unit }}</span></el-form-item
            >
            <el-form-item
              label="本次新增报废"
              required
              ><el-input-number
                v-model="form.scrappedQuantity"
                :min="0"
                :max="
                  Math.max(
                    form.scrappedQuantity ?? 0,
                    Math.min(
                      Number(editingAbnormality.affectedQuantity),
                      Number(editingCard.quantity),
                    ),
                  )
                "
                :precision="0"
                :step="1"
                placeholder="允许0"
              /><span class="unit">{{ editingCard.unit }}</span></el-form-item
            >
          </div>
          <el-form-item label="关联已报废">
            <div class="scrap-references">
              <div
                v-for="reference in form.scrapReferences"
                :key="reference.clientKey"
                class="scrap-reference-row"
              >
                <div class="scrap-reference-source">
                  <el-select
                    v-model="reference.handlingId"
                    placeholder="选择本盘其他问题的报废记录"
                    class="source-select"
                  >
                    <el-option
                      v-for="source in scrapSources"
                      :key="source.handling.id"
                      :label="source.label"
                      :value="source.handling.id"
                      :disabled="
                        form.scrapReferences.some(
                          (other) => other !== reference && other.handlingId === source.handling.id,
                        )
                      "
                    />
                  </el-select>
                  <p
                    v-if="scrapSource(reference.handlingId)"
                    class="source-description"
                  >
                    {{ scrapSource(reference.handlingId)?.label }}
                  </p>
                </div>
                <el-input-number
                  v-model="reference.quantity"
                  :min="1"
                  :max="
                    Math.max(
                      reference.quantity ?? 0,
                      Number(scrapSource(reference.handlingId)?.handling.scrappedQuantity ?? 0),
                    )
                  "
                  :precision="0"
                  :step="1"
                  :disabled="!reference.handlingId"
                  :aria-label="`关联报废数量，单位${editingCard.unit}`"
                />
                <el-button
                  type="danger"
                  link
                  @click="removeScrapReference(reference.clientKey)"
                  >移除</el-button
                >
              </div>
              <el-button
                :disabled="form.scrapReferences.length >= scrapSources.length"
                @click="addScrapReference"
                >添加关联来源</el-button
              >
              <span
                v-if="!scrapSources.length"
                class="source-empty"
                >本盘其他问题暂无新增报废记录</span
              >
            </div>
          </el-form-item>
          <InlineHint
            class="settlement-summary"
            :tone="
              settlementTotal !== null &&
              settlementTotal !== Number(editingAbnormality.affectedQuantity)
                ? 'warning'
                : 'info'
            "
          >
            返修成功 + 本次新增报废 + 关联已报废合计
            <strong>{{
              settlementTotal === null ? '待填写' : formatQuantity(settlementTotal)
            }}</strong>
            / 影响量
            <strong
              >{{ formatQuantity(editingAbnormality.affectedQuantity) }}
              {{ editingCard.unit }}</strong
            >，两者须相等。 返修成功与本次新增报废合计不得超过当前剩余盘量。
            <template v-if="form.scrappedQuantity !== undefined"
              >处理后剩余盘量
              <strong
                >{{ formatQuantity(Number(editingCard.quantity) - form.scrappedQuantity) }}
                {{ editingCard.unit }}</strong
              >。</template
            >
          </InlineHint>
        </template>
        <el-form-item
          :label="textLabel"
          :required="editingAction !== 'output'"
          ><el-input
            v-model="form.text"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
        /></el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="requestClose(false)"
        >取消</el-button
      >
      <el-button
        :type="editingAction === 'void' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="succeeded || recovery || basisChanged || basisLoading || Boolean(basisError)"
        @click="submit"
        >{{ TRACKING_ACTION_LABELS[editingAction] }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type {
  ConfirmProductionTrackingOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  HandleProductionTrackingAbnormalityPayload,
  PersonnelOption,
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import {
  TRACKING_ACTION_LABELS,
  trackingCardStatus,
  type TrackingCardAction,
} from './tracking-presentation';

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
interface ScrapReferenceDraft {
  clientKey: number;
  handlingId: string;
  quantity: number | undefined;
}
type TrackingActionSubmission =
  | { action: 'quantity'; cardId: string; body: CorrectProductionTrackingQuantityPayload }
  | { action: 'void'; cardId: string; body: VoidProductionTrackingCardPayload }
  | { action: 'abnormality'; cardId: string; body: CreateProductionTrackingAbnormalityPayload }
  | {
      action: 'handling';
      cardId: string;
      abnormalityId: string;
      body: HandleProductionTrackingAbnormalityPayload;
    }
  | { action: 'output'; cardId: string; body: ConfirmProductionTrackingOutputPayload };
const editingCard = ref<ProductionTrackingCardDetail | null>(null),
  editingAbnormality = ref<ProductionTrackingAbnormality | null>(null),
  editingAction = ref<TrackingCardAction>('abnormality');
const form = reactive<{
  personnelId: string;
  quantity: number | undefined;
  affectedQuantity: number | undefined;
  repairedQuantity: number | undefined;
  scrappedQuantity: number | undefined;
  scrapReferences: ScrapReferenceDraft[];
  stepRecordId: string;
  text: string;
}>({
  personnelId: '',
  quantity: 1,
  affectedQuantity: undefined,
  repairedQuantity: undefined,
  scrappedQuantity: undefined,
  scrapReferences: [],
  stepRecordId: '',
  text: '',
});
const submitting = ref(false),
  succeeded = ref(false),
  personnel = ref<PersonnelOption[]>([]),
  personnelLoading = ref(false),
  personnelError = ref('');
const intent = useIdempotentIntent('追踪卡'),
  intentStatus = ref<IdempotentIntentStatus>('idle');
let pendingSubmission: TrackingActionSubmission | null = null;
const recovery = computed(() => intentStatus.value !== 'idle');
const basisChanged = computed(() =>
  Boolean(
    editingCard.value &&
    props.card?.id === editingCard.value.id &&
    props.card.version > editingCard.value.version,
  ),
);
const involvedSteps = computed(() => {
  const seen = new Set<string>();
  return (editingCard.value?.visits ?? []).filter((visit) => {
    if (seen.has(visit.stepRecordId)) return false;
    seen.add(visit.stepRecordId);
    return true;
  });
});
const scrapSources = computed(() =>
  (editingCard.value?.abnormalities ?? []).flatMap((item) => {
    const handling = item.handling;
    if (
      item.id === editingAbnormality.value?.id ||
      !handling ||
      Number(handling.scrappedQuantity) <= 0
    )
      return [];
    return [
      {
        handling,
        label: `${formatDateTimeForDisplay(handling.createdAt)} · ${handling.personnelName} · 新增报废 ${formatQuantity(handling.scrappedQuantity)} ${editingCard.value?.unit ?? ''} · ${item.description}`,
      },
    ];
  }),
);
function scrapSource(handlingId: string) {
  return scrapSources.value.find((source) => source.handling.id === handlingId);
}
let nextReferenceKey = 0;
function addScrapReference(): void {
  if (form.scrapReferences.length >= scrapSources.value.length) return;
  form.scrapReferences.push({ clientKey: ++nextReferenceKey, handlingId: '', quantity: undefined });
}
function removeScrapReference(clientKey: number): void {
  form.scrapReferences = form.scrapReferences.filter(
    (reference) => reference.clientKey !== clientKey,
  );
}
const settlementTotal = computed(() => {
  if (
    form.repairedQuantity === undefined ||
    form.scrappedQuantity === undefined ||
    form.scrapReferences.some(
      (reference) => !reference.handlingId || reference.quantity === undefined,
    )
  )
    return null;
  return (
    form.repairedQuantity +
    form.scrappedQuantity +
    form.scrapReferences.reduce((total, reference) => total + (reference.quantity ?? 0), 0)
  );
});
const needsPersonnel = computed(() =>
  ['abnormality', 'handling', 'output'].includes(editingAction.value),
);
const textLabel = computed(
  () =>
    ({
      quantity: '更正原因',
      void: '作废原因',
      abnormality: '异常描述',
      handling: '处理内容',
      output: '终检备注',
    })[editingAction.value],
);
const reads = useLatestReadRequest(() => {
  personnelLoading.value = false;
});
const basisLoading = ref(false),
  basisError = ref('');
const basisReads = useLatestReadRequest(() => {
  basisLoading.value = false;
});
async function refreshBasis(): Promise<void> {
  const cardId = editingCard.value?.id;
  if (!cardId || !props.visible || submitting.value || recovery.value || !basisReads.isActive())
    return;
  const read = basisReads.begin(() => props.visible && editingCard.value?.id === cardId);
  basisLoading.value = true;
  basisError.value = '';
  try {
    const card = await productionTrackingApi.detail(cardId, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    if (card.id !== cardId) throw new Error('追踪卡资料与当前目标不一致，请重新核对');
    editingCard.value = card;
    if (editingAbnormality.value) {
      editingAbnormality.value =
        card.abnormalities.find((item) => item.id === editingAbnormality.value?.id) ?? null;
      if (!editingAbnormality.value)
        basisError.value = '原异常已不在当前追踪卡资料中，请核对异常记录';
    }
  } catch (error) {
    if (read.isCurrent())
      basisError.value =
        error instanceof Error ? error.message : '追踪卡办理依据读取失败，请刷新重试';
  } finally {
    if (read.isCurrent()) basisLoading.value = false;
  }
}
let initialSignature = '';
async function loadPersonnel(): Promise<void> {
  if (!props.visible || !reads.isActive()) return;
  const read = reads.begin(() => props.visible);
  personnelLoading.value = true;
  personnelError.value = '';
  try {
    const values = await personnelApi.options({ signal: read.signal });
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
      basisReads.invalidate();
      return;
    }
    editingCard.value = props.card ? { ...props.card } : null;
    editingAbnormality.value = props.abnormality ? { ...props.abnormality } : null;
    editingAction.value = props.action;
    basisError.value = '';
    Object.assign(form, {
      personnelId: props.defaultPersonnelId || '',
      quantity: Number(props.card?.quantity ?? 1),
      affectedQuantity: undefined,
      repairedQuantity: undefined,
      scrappedQuantity: undefined,
      scrapReferences: [],
      stepRecordId: props.card?.currentStepRecordId || '',
      text: '',
    });
    initialSignature = JSON.stringify(form);
    nextReferenceKey = 0;
    personnel.value = [];
    personnelError.value = '';
    pendingSubmission = null;
    succeeded.value = false;
    intent.reset();
    intentStatus.value = 'idle';
    if (needsPersonnel.value) void loadPersonnel();
  },
);
function resetIntent(): void {
  if (submitting.value) return;
  intent.reset();
  intentStatus.value = 'idle';
  pendingSubmission = null;
}
async function allowClose(): Promise<boolean> {
  if (submitting.value) return false;
  if (!props.visible || succeeded.value) return true;
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
    resetIntent();
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
function createSubmission(card: ProductionTrackingCardDetail): TrackingActionSubmission | null {
  const action = editingAction.value;
  if (['completed', 'scrapped', 'voided'].includes(card.status)) {
    EMessage.warning(`本盘状态为“${trackingCardStatus(card.status).label}”，仅可查看记录`);
    return null;
  }
  if (Number(card.quantity) === 0 && action !== 'handling') {
    EMessage.warning('本盘剩余盘量为0，仅可继续结算未处理异常');
    return null;
  }
  if (needsPersonnel.value && !form.personnelId) {
    EMessage.warning('请选择登记人员');
    return null;
  }
  const text = form.text.trim();
  if (action !== 'output' && !text) {
    EMessage.warning(`请填写${textLabel.value}`);
    return null;
  }
  if (action === 'quantity') {
    if (form.quantity === undefined || !Number.isSafeInteger(form.quantity) || form.quantity <= 0) {
      EMessage.warning('请填写正整数盘量');
      return null;
    }
    return {
      action,
      cardId: card.id,
      body: { version: card.version, quantity: form.quantity, reason: text },
    };
  }
  if (action === 'void')
    return { action, cardId: card.id, body: { version: card.version, reason: text } };
  if (action === 'abnormality') {
    if (
      form.affectedQuantity === undefined ||
      !Number.isSafeInteger(form.affectedQuantity) ||
      form.affectedQuantity <= 0 ||
      form.affectedQuantity > Number(card.quantity)
    ) {
      EMessage.warning('影响数量须为不超过当前剩余盘量的正整数');
      return null;
    }
    return {
      action,
      cardId: card.id,
      body: {
        version: card.version,
        personnelId: form.personnelId,
        affectedQuantity: form.affectedQuantity,
        stepRecordId: form.stepRecordId || null,
        description: text,
      },
    };
  }
  if (action === 'handling') {
    const item = editingAbnormality.value;
    if (!item || item.status !== 'open' || item.handling) {
      EMessage.warning('异常已处理或依据缺失，请关闭后重新核对');
      return null;
    }
    if (
      form.repairedQuantity === undefined ||
      !Number.isSafeInteger(form.repairedQuantity) ||
      form.repairedQuantity < 0 ||
      form.scrappedQuantity === undefined ||
      !Number.isSafeInteger(form.scrappedQuantity) ||
      form.scrappedQuantity < 0
    ) {
      EMessage.warning('返修成功和本次新增报废须分别填写非负整数，允许0');
      return null;
    }
    if (form.repairedQuantity + form.scrappedQuantity > Number(card.quantity)) {
      EMessage.warning(
        '返修成功与本次新增报废合计不能超过当前剩余盘量；此前已报废的数量请关联原报废记录',
      );
      return null;
    }
    const seen = new Set<string>();
    const scrapReferences: HandleProductionTrackingAbnormalityPayload['scrapReferences'] = [];
    for (const reference of form.scrapReferences) {
      const source = scrapSource(reference.handlingId);
      if (
        !source ||
        seen.has(reference.handlingId) ||
        reference.quantity === undefined ||
        !Number.isSafeInteger(reference.quantity) ||
        reference.quantity <= 0 ||
        reference.quantity > Number(source.handling.scrappedQuantity)
      ) {
        EMessage.warning('请为每行选择不同的来源，并填写不超过该来源新增报废量的正整数');
        return null;
      }
      seen.add(reference.handlingId);
      scrapReferences.push({ handlingId: reference.handlingId, quantity: reference.quantity });
    }
    if (settlementTotal.value !== Number(item.affectedQuantity)) {
      EMessage.warning('返修成功、本次新增报废与关联已报废数量之和须等于异常影响量');
      return null;
    }
    return {
      action,
      cardId: card.id,
      abnormalityId: item.id,
      body: {
        version: item.version,
        personnelId: form.personnelId,
        content: text,
        repairedQuantity: form.repairedQuantity,
        scrappedQuantity: form.scrappedQuantity,
        scrapReferences,
      },
    };
  }
  if (card.openAbnormalityCount > 0) {
    EMessage.warning('请先处理本盘全部异常');
    return null;
  }
  return {
    action,
    cardId: card.id,
    body: { version: card.version, personnelId: form.personnelId, remark: text || null },
  };
}
function sendSubmission(
  submission: TrackingActionSubmission,
  key: string,
): Promise<ProductionTrackingCardDetail> {
  if (submission.action === 'quantity')
    return productionTrackingApi.correctQuantity(submission.cardId, submission.body, key);
  if (submission.action === 'void')
    return productionTrackingApi.void(submission.cardId, submission.body, key);
  if (submission.action === 'abnormality')
    return productionTrackingApi.reportAbnormality(submission.cardId, submission.body, key);
  if (submission.action === 'handling')
    return productionTrackingApi.handleAbnormality(
      submission.cardId,
      submission.abnormalityId,
      submission.body,
      key,
    );
  return productionTrackingApi.confirmOutput(submission.cardId, submission.body, key);
}
async function submit(): Promise<void> {
  const card = editingCard.value;
  if (
    !card ||
    submitting.value ||
    succeeded.value ||
    !reads.isActive() ||
    (!recovery.value && (basisChanged.value || basisLoading.value || Boolean(basisError.value)))
  )
    return;
  const submission = pendingSubmission ?? createSubmission(card);
  if (!submission) return;
  pendingSubmission = submission;
  submitting.value = true;
  try {
    const result = await intent.execute(
      {
        intentType: `production.tracking.${submission.action}`,
        params: {
          cardId: submission.cardId,
          ...(submission.action === 'handling' ? { abnormalityId: submission.abnormalityId } : {}),
        },
        query: {},
        body: submission.body,
      },
      (key) => sendSubmission(submission, key),
    );
    succeeded.value = true;
    EMessage.success(`${TRACKING_ACTION_LABELS[submission.action]}已完成`);
    emit('changed', result);
    emit('update:visible', false);
  } catch (error) {
    EMessage.error(error, `${TRACKING_ACTION_LABELS[submission.action]}失败`);
  } finally {
    intentStatus.value = intent.getStatus();
    if (intentStatus.value === 'idle') pendingSubmission = null;
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
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.settlement-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.scrap-references {
  display: grid;
  gap: 12px;
  width: 100%;
}
.scrap-reference-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px auto;
  gap: 8px;
  align-items: start;
}
.scrap-reference-source {
  min-width: 0;
}
.source-select {
  width: 100%;
}
.source-description {
  margin: 4px 0 0;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.source-empty {
  color: var(--el-text-color-secondary);
}
.scrap-references > .el-button {
  justify-self: start;
}
.settlement-summary {
  margin-bottom: 16px;
}
@media (max-width: 1200px) {
  .settlement-inputs {
    grid-template-columns: 1fr;
  }
}
</style>
