import { computed, onScopeDispose, ref, watch } from 'vue';
import { CONCURRENCY_ERROR_CODES } from '@company/constants';
import type {
  CorrectProductionTrackingAbnormalityScrapPayload,
  ProductionTrackingAbnormality,
  ProductionTrackingCardDetail,
  VoidProductionTrackingAbnormalityPayload,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { productionTrackingApi } from '../../../api/production/tracking';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';
import { RouteMessageBox } from '../../../utils/route-message-box';

export type TrackingAbnormalityCorrectionAction = 'correct-scrap' | 'void';
export interface TrackingAbnormalityCorrectionTarget {
  action: TrackingAbnormalityCorrectionAction;
  cardId: string;
  cardNo: string;
  abnormalityId: string;
  itemMarkId?: string;
}
interface CorrectionProps {
  visible: boolean;
  target: TrackingAbnormalityCorrectionTarget | null;
  routeName: string;
  contextGuard?: (card: ProductionTrackingCardDetail) => string;
}
interface AbnormalityBasis {
  card: ProductionTrackingCardDetail;
  record: ProductionTrackingAbnormality;
}
type Submission =
  | { action: 'correct-scrap'; body: CorrectProductionTrackingAbnormalityScrapPayload }
  | { action: 'void'; body: VoidProductionTrackingAbnormalityPayload };

export function useTrackingAbnormalityCorrection(
  props: CorrectionProps,
  onChanged: (card: ProductionTrackingCardDetail) => void,
  onClose: () => void,
) {
  const target = ref<TrackingAbnormalityCorrectionTarget | null>(null);
  const basis = ref<AbnormalityBasis | null>(null);
  const quantity = ref<number | undefined>();
  const selectedIds = ref<string[]>([]);
  const reason = ref('');
  const readError = ref('');
  const stale = ref(false);
  const loading = ref(false);
  const submitting = ref(false);
  const intentStatus = ref<IdempotentIntentStatus>('idle');
  const intent = useIdempotentIntent('随盘异常');
  const reads = useLatestReadRequest(() => {
    loading.value = false;
  });
  let submission: Submission | null = null;
  let closeApproved = false;

  const action = computed(() => target.value?.action ?? 'correct-scrap');
  const isCorrection = computed(() => action.value === 'correct-scrap');
  const title = computed(() => (isCorrection.value ? '更正报废' : '作废随盘异常'));
  const handling = computed(() => basis.value?.record.handling);
  const originalQuantity = computed(() => Number(handling.value?.currentScrappedQuantity ?? 0));
  const originalMarks = computed(() => handling.value?.currentScrappedItemMarks ?? []);
  const needsMarks = computed(
    () => isCorrection.value && handling.value?.scrapMode === 'item_marked',
  );
  const changesScrap = computed(() => {
    if (quantity.value !== originalQuantity.value) return true;
    if (!needsMarks.value) return false;
    const marks = new Set(selectedIds.value);
    return (
      marks.size !== originalMarks.value.length ||
      originalMarks.value.some((mark) => !marks.has(mark.itemMarkId))
    );
  });
  const dirty = computed(() =>
    Boolean(reason.value.trim() || (isCorrection.value && basis.value && changesScrap.value)),
  );
  const recovery = computed(() => intentStatus.value !== 'idle');
  const locked = computed(() => loading.value || submitting.value || recovery.value || stale.value);
  const blockedReason = computed(() => {
    const value = basis.value;
    if (!value?.record.handling) return '';
    const result = value.record.handling;
    if (result.voided) return '该异常已经作废。';
    const context = props.contextGuard?.(value.card);
    if (context) return context;
    if (!isCorrection.value)
      return result.canVoid ? '' : '当前异常不能作废，请核对卡状态和异常关联。';
    if (!result.canCorrectScrap)
      return result.scrapCorrectionBlockedReason || '当前异常不能更正报废，请核对异常处理记录。';
    if (result.scrapMode === 'unknown') return '原报废结算所处的工序无法核实。';
    if (needsMarks.value && result.currentScrappedItemMarks === null)
      return '原报废编码读取不完整，请刷新重试。';
    return '';
  });
  const remainingQuantity = computed(() => {
    if (!basis.value) return undefined;
    const next = isCorrection.value ? quantity.value : 0;
    if (next === undefined || !Number.isSafeInteger(next) || next < 0) return undefined;
    return Number(basis.value.card.quantity) + originalQuantity.value - next;
  });
  const quantityError = computed(() => {
    const card = basis.value?.card;
    const next = quantity.value;
    const remaining = remainingQuantity.value;
    if (!card || !isCorrection.value) return '';
    if (
      next === undefined ||
      !Number.isSafeInteger(next) ||
      next < 1 ||
      next > MAX_PERSISTED_INTEGER_QUANTITY
    )
      return '请输入至少为 1 的报废总量。';
    if (remaining === undefined || remaining < 0)
      return '更正后报废总量不能超过当前剩余盘量与原报废量的合计。';
    if (remaining > MAX_PERSISTED_INTEGER_QUANTITY)
      return `更正后盘量不能超过 ${formatQuantity(MAX_PERSISTED_INTEGER_QUANTITY)} ${card.unit}。`;
    const openQuantity = card.abnormalities.reduce(
      (total, item) => total + (item.status === 'open' ? Number(item.affectedQuantity) : 0),
      0,
    );
    if (remaining < openQuantity)
      return `更正后盘量不能小于待处理异常数量 ${formatQuantity(openQuantity)} ${card.unit}。`;
    if (needsMarks.value && selectedIds.value.length !== next)
      return `请选择 ${formatQuantity(next)} 个更正后实际报废编码。`;
    const nextActiveCount = needsMarks.value
      ? card.itemMarking.activeCount + originalMarks.value.length - selectedIds.value.length
      : card.itemMarking.activeCount;
    if (remaining < nextActiveCount) return `更正后盘量不能小于有效绑定编码数 ${nextActiveCount}。`;
    return '';
  });
  const canSubmit = computed(
    () =>
      props.visible &&
      Boolean(basis.value?.record.handling) &&
      !locked.value &&
      !readError.value &&
      !blockedReason.value &&
      Boolean(reason.value.trim()) &&
      (!isCorrection.value || (changesScrap.value && !quantityError.value)),
  );

  async function load(replace = false): Promise<void> {
    const source = target.value;
    if (
      !source ||
      !props.visible ||
      loading.value ||
      submitting.value ||
      recovery.value ||
      !reads.isActive()
    )
      return;
    const read = reads.begin(() => props.visible && target.value === source);
    loading.value = true;
    readError.value = '';
    try {
      const card = await productionTrackingApi.detail(source.cardId, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (!read.isCurrent()) return;
      const record = card.abnormalities.find((item) => item.id === source.abnormalityId);
      if (card.id !== source.cardId || !record?.handling)
        throw new Error('找不到原异常处理记录，请刷新追踪卡后核对。');
      if (
        source.itemMarkId &&
        !record.handling.currentScrappedItemMarks?.some(
          (mark) => mark.itemMarkId === source.itemMarkId,
        )
      )
        throw new Error('该编码的报废归属已变化，请刷新编码绑定记录后重新打开。');
      const previous = basis.value;
      if (
        !replace &&
        previous &&
        (previous.card.version !== card.version || previous.record.version !== record.version)
      ) {
        stale.value = true;
        return;
      }
      basis.value = { card, record };
      if (!previous || replace) {
        quantity.value = Number(record.handling.currentScrappedQuantity);
        selectedIds.value =
          record.handling.scrapMode === 'item_marked'
            ? (record.handling.currentScrappedItemMarks ?? []).map((mark) => mark.itemMarkId)
            : [];
        stale.value = false;
      }
    } catch (failure) {
      if (read.isCurrent())
        readError.value =
          failure instanceof Error ? failure.message : '异常办理依据读取失败，请重试。';
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }

  async function reloadBasis(): Promise<void> {
    if (!stale.value) {
      await load();
      return;
    }
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm(
          '追踪卡或异常已更新。载入最新资料后，数量和选码会按当前记录重新填入，已填原因将保留。',
          '重新核对办理依据',
          { type: 'warning', confirmButtonText: '载入最新资料', cancelButtonText: '保留本次输入' },
        );
      } catch {
        return;
      }
    }
    await load(true);
  }

  function resetIntent(): void {
    intent.reset();
    intentStatus.value = 'idle';
    submission = null;
  }

  async function restart(): Promise<void> {
    if (submitting.value) return;
    resetIntent();
    await load();
  }

  function allowClose(): Promise<boolean> {
    if (submitting.value) return Promise.resolve(false);
    if (!props.visible) return Promise.resolve(true);
    return confirmSubmissionClose(intent.getStatus(), {
      entityLabel: title.value,
      dirty: dirty.value,
    });
  }

  async function requestClose(value: boolean): Promise<void> {
    if (value) return;
    if (!closeApproved && !(await allowClose())) return;
    closeApproved = false;
    onClose();
  }

  async function beforeClose(done: () => void): Promise<void> {
    if (await allowClose()) {
      closeApproved = true;
      done();
    }
  }

  async function submit(): Promise<void> {
    const source = target.value;
    if (!source || !props.visible || submitting.value || !reads.isActive()) return;
    if (!submission) {
      if (!canSubmit.value) return;
      await load();
      const value = basis.value;
      if (!canSubmit.value || !reads.isActive() || target.value !== source || !value) return;
      const body = {
        version: value.record.version,
        cardVersion: value.card.version,
        reason: reason.value.trim(),
      };
      if (source.action === 'correct-scrap') {
        if (quantity.value === undefined) return;
        submission = {
          action: source.action,
          body: {
            ...body,
            scrappedQuantity: quantity.value,
            scrappedItemMarkIds: needsMarks.value ? [...selectedIds.value] : [],
          },
        };
      } else {
        submission = { action: source.action, body };
      }
    }
    const command = submission;
    const actionTitle = title.value;
    submitting.value = true;
    try {
      const card = await intent.execute(
        {
          intentType: `production.tracking.abnormality.${command.action}`,
          params: { cardId: source.cardId, abnormalityId: source.abnormalityId },
          query: {},
          body: command.body,
        },
        async (key) => {
          const result =
            command.action === 'correct-scrap'
              ? await productionTrackingApi.correctAbnormalityScrap(
                  source.cardId,
                  source.abnormalityId,
                  command.body,
                  key,
                )
              : await productionTrackingApi.voidAbnormality(
                  source.cardId,
                  source.abnormalityId,
                  command.body,
                  key,
                );
          const record = result.abnormalities.find((item) => item.id === source.abnormalityId);
          if (
            result.id !== source.cardId ||
            result.version <= command.body.cardVersion ||
            !record?.handling ||
            record.version <= command.body.version
          )
            throw new RequestError(`${actionTitle}的返回记录不完整，请核对后重试原操作。`, 502);
          return result;
        },
      );
      EMessage.success(isCorrection.value ? '报废已更正' : '异常已作废');
      onChanged(card);
      onClose();
    } catch (error) {
      if (
        error instanceof RequestError &&
        error.code === CONCURRENCY_ERROR_CODES.concurrentModification
      )
        stale.value = true;
      EMessage.error(error, `${actionTitle}失败`);
    } finally {
      intentStatus.value = intent.getStatus();
      if (intentStatus.value === 'idle') submission = null;
      submitting.value = false;
    }
  }

  watch(
    () => props.visible,
    (visible) => {
      if (!visible) {
        reads.invalidate();
        return;
      }
      if (!props.target) return;
      target.value = { ...props.target };
      basis.value = null;
      quantity.value = undefined;
      selectedIds.value = [];
      reason.value = '';
      readError.value = '';
      stale.value = false;
      closeApproved = false;
      resetIntent();
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(useTabsStore().registerCloseGuard(props.routeName, allowClose));

  return {
    target,
    title,
    action,
    isCorrection,
    basis,
    handling,
    originalQuantity,
    originalMarks,
    needsMarks,
    quantity,
    selectedIds,
    reason,
    remainingQuantity,
    quantityError,
    readError,
    stale,
    loading,
    submitting,
    intentStatus,
    recovery,
    locked,
    blockedReason,
    canSubmit,
    reads,
    reloadBasis,
    requestClose,
    beforeClose,
    restart,
    submit,
  };
}
