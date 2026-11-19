import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import {
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT,
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
} from '@company/constants';
import type {
  ConfirmProductionTrackingOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  HandleProductionTrackingAbnormalityPayload,
  PersonnelOption,
  ProductionTrackingAbnormality,
  ProductionTrackingAbnormalityResolution,
  ProductionTrackingCardDetail,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
import {
  TRACKING_ACTION_LABELS,
  trackingCardStatus,
  type TrackingCardAction,
} from './tracking-presentation';
import { useTrackingAbnormalityDescriptionSearch } from './use-tracking-abnormality-description-search';

export interface TrackingCardActionProps {
  visible: boolean;
  action: TrackingCardAction;
  card: ProductionTrackingCardDetail | null;
  abnormality?: ProductionTrackingAbnormality | null;
  defaultPersonnelId?: string;
  routeName: string;
}
interface TrackingCardActionEmit {
  (event: 'update:visible', value: boolean): void;
  (event: 'changed', card: ProductionTrackingCardDetail): void;
}
export type TrackingAbnormalityDisposition = ProductionTrackingAbnormalityResolution | 'mixed';
export function useTrackingCardAction(
  props: TrackingCardActionProps,
  emit: TrackingCardActionEmit,
) {
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
  type AbnormalityDispositionSubmission =
    | { kind: 'pending' }
    | { kind: 'resolved'; resolution: ProductionTrackingAbnormalityResolution }
    | { kind: 'mixed'; repairedQuantity: number; scrappedQuantity: number };
  const editingCard = ref<ProductionTrackingCardDetail | null>(null),
    editingAbnormality = ref<ProductionTrackingAbnormality | null>(null),
    editingAction = ref<TrackingCardAction>('abnormality');
  const form = reactive<{
    personnelId: string;
    quantity: number | undefined;
    affectedQuantity: number | undefined;
    scrappedQuantity: number | undefined;
    disposition: TrackingAbnormalityDisposition | '';
    descriptionLabels: string[];
    stepRecordId: string;
    text: string;
  }>({
    personnelId: '',
    quantity: 1,
    affectedQuantity: 1,
    scrappedQuantity: undefined,
    disposition: '',
    descriptionLabels: [],
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
  const formLocked = computed(() => submitting.value || recovery.value || succeeded.value);
  const openAbnormalityQuantity = computed(() =>
    (editingCard.value?.abnormalities ?? []).reduce(
      (total, item) => total + (item.status === 'open' ? Number(item.affectedQuantity) : 0),
      0,
    ),
  );
  const availableAbnormalityQuantity = computed(() =>
    Math.max(0, Number(editingCard.value?.quantity ?? 0) - openAbnormalityQuantity.value),
  );
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
  const descriptionTarget = computed(() => {
    if (!props.visible || editingAction.value !== 'abnormality' || !editingCard.value) return null;
    return {
      cardId: editingCard.value.id,
      stepRecordId: form.stepRecordId || undefined,
    };
  });
  const descriptionSearch = useTrackingAbnormalityDescriptionSearch(() => descriptionTarget.value);
  const selectedResolution = computed(() => form.disposition);
  const allowMixedResolution = computed(() => {
    const quantity = form.affectedQuantity;
    return quantity !== undefined && Number.isSafeInteger(quantity) && quantity >= 2;
  });
  const mixedResolutionError = computed(() => {
    if (form.disposition !== 'mixed' || !editingCard.value) return '';
    if (!allowMixedResolution.value)
      return `混合处置至少需要 2 ${editingCard.value.unit}，请调整数量或取消、改选处置。`;
    const affected = form.affectedQuantity;
    const scrapped = form.scrappedQuantity;
    if (affected === undefined || scrapped === undefined) return '';
    if (!Number.isSafeInteger(scrapped) || scrapped <= 0 || scrapped >= affected)
      return `报废数量须为 1 至 ${formatQuantity(affected - 1)} ${editingCard.value.unit}的整数。`;
    return '';
  });
  const handlingBlockedReason = computed(() => {
    if (editingAction.value !== 'handling' || !editingAbnormality.value || !editingCard.value)
      return '';
    if (editingAbnormality.value.status !== 'open' || editingAbnormality.value.handling)
      return '原异常已处理，请核对处理记录。';
    const affected = Number(editingAbnormality.value.affectedQuantity);
    const remaining = Number(editingCard.value.quantity);
    if (affected <= remaining) return '';
    return `原异常数量 ${formatQuantity(affected)} ${editingCard.value.unit} 超过当前剩余盘量 ${formatQuantity(remaining)} ${editingCard.value.unit}，可能涉及此前已报废的实物。当前表单不能直接处理，请先核对异常和原报废记录。`;
  });
  const mixedRepairedQuantity = computed(() => {
    const affected = form.affectedQuantity;
    const scrapped = form.scrappedQuantity;
    if (
      form.disposition !== 'mixed' ||
      !allowMixedResolution.value ||
      affected === undefined ||
      scrapped === undefined ||
      !Number.isSafeInteger(scrapped) ||
      scrapped <= 0 ||
      scrapped >= affected
    )
      return undefined;
    return affected - scrapped;
  });
  function setResolution(resolution: TrackingAbnormalityDisposition, checked: boolean): void {
    if (formLocked.value) return;
    if (checked && resolution === 'mixed' && !allowMixedResolution.value) return;
    form.disposition = checked ? resolution : '';
  }
  const resolutionEffect = computed(() => {
    const resolution = selectedResolution.value;
    if (!editingCard.value || !['abnormality', 'handling'].includes(editingAction.value)) return '';
    if (!resolution)
      return editingAction.value === 'abnormality' ? '未选择处置，仅登记异常并暂停整盘流转。' : '';
    const quantity = form.affectedQuantity;
    if (quantity === undefined || !Number.isSafeInteger(quantity) || quantity <= 0) return '';
    if (handlingBlockedReason.value) return '';
    if (resolution === 'mixed') {
      if (mixedRepairedQuantity.value === undefined || form.scrappedQuantity === undefined)
        return '';
      const remaining = Number(editingCard.value.quantity) - form.scrappedQuantity;
      if (remaining < 0) return '';
      return `处理后剩余盘量 ${formatQuantity(remaining)} ${editingCard.value.unit}。`;
    }
    const amount = `${formatQuantity(quantity)} ${editingCard.value.unit}`;
    if (resolution === 'repair') return `返修完成 ${amount}，盘量不变。`;
    const remaining = Number(editingCard.value.quantity) - quantity;
    if (remaining < 0) return '';
    return `报废 ${amount}，处理后剩余盘量 ${formatQuantity(remaining)} ${editingCard.value.unit}。`;
  });
  const needsPersonnel = computed(() =>
    ['abnormality', 'handling', 'output'].includes(editingAction.value),
  );
  const textLabel = computed(
    () =>
      (
        ({
          quantity: '更正原因',
          void: '作废原因',
          output: '终检备注',
        }) as Partial<Record<TrackingCardAction, string>>
      )[editingAction.value],
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
        else syncAbnormalityDetails(editingAbnormality.value);
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
  const draftSignature = () => {
    const { stepRecordId, affectedQuantity, descriptionLabels, ...input } = form;
    return JSON.stringify({
      form:
        editingAction.value === 'handling'
          ? input
          : { ...input, stepRecordId, affectedQuantity, descriptionLabels },
      descriptionInput: descriptionSearch.keyword.value,
    });
  };
  function syncAbnormalityDetails(item: ProductionTrackingAbnormality): void {
    form.stepRecordId = item.stepRecordId ?? '';
    form.affectedQuantity = Number(item.affectedQuantity);
    form.descriptionLabels = [...item.descriptionLabels];
  }
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
        descriptionSearch.reset();
        return;
      }
      editingCard.value = props.card ? { ...props.card } : null;
      editingAbnormality.value = props.abnormality ? { ...props.abnormality } : null;
      editingAction.value = props.action;
      basisError.value = '';
      Object.assign(form, {
        personnelId: props.defaultPersonnelId || '',
        quantity: Number(props.card?.quantity ?? 1),
        affectedQuantity: 1,
        scrappedQuantity: undefined,
        disposition: '',
        descriptionLabels: [],
        stepRecordId: '',
        text: '',
      });
      if (editingAction.value === 'handling' && editingAbnormality.value)
        syncAbnormalityDetails(editingAbnormality.value);
      descriptionSearch.reset();
      initialSignature = draftSignature();
      personnel.value = [];
      personnelError.value = '';
      pendingSubmission = null;
      succeeded.value = false;
      intent.reset();
      intentStatus.value = 'idle';
      if (needsPersonnel.value) void loadPersonnel();
    },
    { immediate: true },
  );
  watch(
    () => JSON.stringify(descriptionTarget.value),
    () => {
      descriptionSearch.clearCandidates();
      if (descriptionTarget.value) void descriptionSearch.refresh();
    },
    { immediate: true },
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
    if (!recovery.value && initialSignature === draftSignature()) return true;
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
  function readAbnormalityDisposition(): AbnormalityDispositionSubmission | null {
    if (!form.disposition) {
      if (editingAction.value === 'handling') {
        EMessage.warning('请选择处置方式');
        return null;
      }
      return { kind: 'pending' };
    }
    if (form.disposition !== 'mixed') return { kind: 'resolved', resolution: form.disposition };
    if (mixedResolutionError.value) {
      EMessage.warning(mixedResolutionError.value);
      return null;
    }
    if (mixedRepairedQuantity.value === undefined || form.scrappedQuantity === undefined) {
      EMessage.warning('请填写整数报废数量，其余数量计为返修完成');
      return null;
    }
    return {
      kind: 'mixed',
      repairedQuantity: mixedRepairedQuantity.value,
      scrappedQuantity: form.scrappedQuantity,
    };
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
    if (!text && (action === 'quantity' || action === 'void')) {
      EMessage.warning(`请填写${textLabel.value}`);
      return null;
    }
    if (action === 'quantity') {
      if (
        form.quantity === undefined ||
        !Number.isSafeInteger(form.quantity) ||
        form.quantity <= 0
      ) {
        EMessage.warning('请填写正整数盘量');
        return null;
      }
      if (form.quantity < openAbnormalityQuantity.value) {
        EMessage.warning(
          `更正后盘量不能小于未处理异常数量 ${formatQuantity(openAbnormalityQuantity.value)} ${card.unit}`,
        );
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
      if (descriptionSearch.keyword.value.trim()) {
        EMessage.warning('请先按回车添加描述，或清空输入后提交');
        return null;
      }
      if (
        form.affectedQuantity === undefined ||
        !Number.isSafeInteger(form.affectedQuantity) ||
        form.affectedQuantity <= 0 ||
        form.affectedQuantity > availableAbnormalityQuantity.value
      ) {
        EMessage.warning(
          `本盘尚可登记异常 ${formatQuantity(availableAbnormalityQuantity.value)} ${card.unit}，本次数量不能超过该数量`,
        );
        return null;
      }
      const descriptionLabels = [...new Set(form.descriptionLabels)];
      if (
        !descriptionLabels.length ||
        descriptionLabels.length > PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT ||
        descriptionLabels.some(
          (label) =>
            !label.trim() ||
            Array.from(label).length > PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
        )
      ) {
        EMessage.warning(
          `请选择或输入异常描述，最多 ${PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT} 个，每个不超过 ${PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH} 字`,
        );
        return null;
      }
      const disposition = readAbnormalityDisposition();
      if (!disposition) return null;
      return {
        action,
        cardId: card.id,
        body: {
          version: card.version,
          personnelId: form.personnelId,
          affectedQuantity: form.affectedQuantity,
          stepRecordId: form.stepRecordId || null,
          descriptionLabels,
          ...(disposition.kind === 'resolved' ? { resolution: disposition.resolution } : {}),
          ...(disposition.kind === 'mixed'
            ? { mixedScrappedQuantity: disposition.scrappedQuantity }
            : {}),
        },
      };
    }
    if (action === 'handling') {
      const item = editingAbnormality.value;
      if (!item || item.status !== 'open' || item.handling) {
        EMessage.warning('异常已处理或依据缺失，请关闭后重新核对');
        return null;
      }
      if (handlingBlockedReason.value) {
        EMessage.warning(handlingBlockedReason.value);
        return null;
      }
      const disposition = readAbnormalityDisposition();
      if (!disposition || disposition.kind === 'pending') return null;
      if (disposition.kind === 'resolved') {
        return {
          action,
          cardId: card.id,
          abnormalityId: item.id,
          body: {
            version: item.version,
            personnelId: form.personnelId,
            resolution: disposition.resolution,
          },
        };
      }
      return {
        action,
        cardId: card.id,
        abnormalityId: item.id,
        body: {
          version: item.version,
          personnelId: form.personnelId,
          content: `返修完成 ${disposition.repairedQuantity} ${card.unit}；本次报废 ${disposition.scrappedQuantity} ${card.unit}`,
          repairedQuantity: disposition.repairedQuantity,
          scrappedQuantity: disposition.scrappedQuantity,
          scrapReferences: [],
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
            ...(submission.action === 'handling'
              ? { abnormalityId: submission.abnormalityId }
              : {}),
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
  return {
    editingCard,
    editingAbnormality,
    editingAction,
    form,
    formLocked,
    availableAbnormalityQuantity,
    selectedResolution,
    setResolution,
    allowMixedResolution,
    mixedRepairedQuantity,
    mixedResolutionError,
    handlingBlockedReason,
    recovery,
    intentStatus,
    submitting,
    succeeded,
    basisChanged,
    basisError,
    basisLoading,
    reads,
    refreshBasis,
    needsPersonnel,
    personnelLoading,
    personnel,
    personnelError,
    loadPersonnel,
    involvedSteps,
    descriptionSearch,
    resolutionEffect,
    textLabel,
    beforeClose,
    requestClose,
    resetIntent,
    submit,
  };
}
