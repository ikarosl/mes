import { useItemMarkCodeAvailability } from './use-item-mark-code-availability';
import { computed, nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { InputInstance } from 'element-plus';
import type {
  BindProductionTrackingItemMarkPayload,
  PersonnelOption,
  ProductionTrackingCardDetail,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import {
  isValidTrackingItemMarkCode,
  normalizeTrackingCardNo,
  normalizeTrackingItemMarkCode,
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
} from '@company/utils';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { trackingItemMarkPending } from './tracking-presentation';
import { useTrackingTaskSearch } from './use-tracking-task-search';

export function useCodeBinding(refreshRecords: () => Promise<void>) {
  const route = useRoute();
  const batchId = ref<string | null>(null),
    personnelId = ref(''),
    cardNo = ref(''),
    markCode = ref('');
  const context = ref<ProductionTrackingWorkbench | null>(null),
    contextLoading = ref(false),
    contextError = ref(''),
    contextVerified = ref(false);
  const personnel = ref<PersonnelOption[]>([]),
    personnelLoading = ref(false),
    personnelError = ref(''),
    personnelVerified = ref(false);
  const currentCard = ref<ProductionTrackingCardDetail | null>(null),
    cardLoading = ref(false),
    cardError = ref('');
  const submitting = ref(false),
    intentStatus = ref<IdempotentIntentStatus>('idle'),
    resultLabel = ref('');
  const pendingCodeLabel = ref('');
  const cardInput = ref<InputInstance>(),
    codeInput = ref<InputInstance>();
  const intent = useIdempotentIntent('单件刻码绑定');
  let pendingSubmission: {
    batchId: string;
    cardId: string;
    cardNo: string;
    body: BindProductionTrackingItemMarkPayload;
  } | null = null;
  const recovery = computed(() => intentStatus.value !== 'idle');
  const locked = computed(() => submitting.value || recovery.value);
  const contextReads = useLatestReadRequest(() => {
    contextLoading.value = false;
  });
  const personnelReads = useLatestReadRequest(() => {
    personnelLoading.value = false;
  });
  const cardReads = useLatestReadRequest(() => {
    cardLoading.value = false;
  });
  const codeAvailability = useItemMarkCodeAvailability(markCode, () => !locked.value);
  function normalizeMarkCode(): void {
    if (!locked.value) markCode.value = normalizeTrackingItemMarkCode(markCode.value);
  }
  const taskSearch = useTrackingTaskSearch(() => context.value?.batch ?? null);
  const selectedPersonnel = computed(() =>
    personnel.value.find((item) => item.id === personnelId.value),
  );
  const taskCanBind = computed(
    () =>
      contextVerified.value &&
      !contextLoading.value &&
      !contextError.value &&
      context.value?.batch.status === 'doing' &&
      context.value.batch.orderType === 'mass_production',
  );
  const hasValidMarkCode = computed(() => isValidTrackingItemMarkCode(markCode.value));
  const markCodeError = computed(() =>
    markCode.value && !hasValidMarkCode.value ? TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE : '',
  );
  const fullCode = computed(() => {
    const no = currentCard.value?.cardNo || normalizeTrackingCardNo(cardNo.value);
    return no && hasValidMarkCode.value
      ? `${no}-${normalizeTrackingItemMarkCode(markCode.value)}`
      : '—';
  });
  const remainingToBind = computed(() =>
    currentCard.value ? trackingItemMarkPending(currentCard.value) : null,
  );
  const cardBlockedReason = computed(() => {
    const card = currentCard.value;
    if (!card) return '';
    if (card.status !== 'unused' && card.status !== 'in_progress')
      return '本卡已停止办理，不能绑定单件刻码。';
    if (card.openAbnormalityCount) return '本卡仍有待处理异常，请先处理后再绑定。';
    if (!trackingItemMarkPending(card)) return '本卡已绑满，请输入下一张追踪卡。';
    return '';
  });
  async function loadContext(): Promise<void> {
    const id = batchId.value;
    if (!id || !contextReads.isActive()) return;
    const read = contextReads.begin(() => batchId.value === id);
    contextLoading.value = true;
    contextVerified.value = false;
    contextError.value = '';
    try {
      const value = await productionTrackingApi.workbench(id, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (!read.isCurrent()) return;
      if (value.batch.id !== id) throw new Error('任务信息与当前目标不一致，请刷新重试');
      context.value = value;
      contextVerified.value = true;
    } catch (failure) {
      if (read.isCurrent())
        contextError.value =
          failure instanceof Error ? failure.message : '任务信息加载失败，请刷新重试';
    } finally {
      if (read.isCurrent()) contextLoading.value = false;
    }
  }
  async function loadPersonnel(): Promise<void> {
    if (!personnelReads.isActive()) return;
    const read = personnelReads.begin();
    personnelLoading.value = true;
    personnelVerified.value = false;
    personnelError.value = '';
    try {
      const values = await personnelApi.options({ signal: read.signal, skipErrorHandling: true });
      if (!read.isCurrent()) return;
      personnel.value = values;
      personnelVerified.value = true;
    } catch (failure) {
      if (read.isCurrent())
        personnelError.value =
          failure instanceof Error ? failure.message : '登记人员加载失败，请刷新重试';
    } finally {
      if (read.isCurrent()) personnelLoading.value = false;
    }
  }
  function clearCard(): void {
    cardReads.invalidate();
    currentCard.value = null;
    cardError.value = '';
    cardNo.value = '';
  }
  function cardInputChanged(): void {
    if (locked.value) return;
    cardReads.invalidate();
    currentCard.value = null;
    cardError.value = '';
    resultLabel.value = '';
  }
  function normalizeCardNo(): void {
    if (!locked.value) cardNo.value = normalizeTrackingCardNo(cardNo.value);
  }
  async function changeBatch(id: string | null): Promise<void> {
    if (id === batchId.value || locked.value || !contextReads.isActive()) return;
    contextReads.invalidate();
    clearCard();
    context.value = null;
    contextVerified.value = false;
    contextError.value = '';
    resultLabel.value = '';
    batchId.value = id;
    await loadContext();
  }
  async function lookupCard(): Promise<ProductionTrackingCardDetail | null> {
    if (locked.value || !batchId.value || !cardReads.isActive()) return null;
    normalizeCardNo();
    const no = cardNo.value,
      id = batchId.value;
    if (!no) {
      EMessage.warning('请扫描或输入追踪卡号');
      return null;
    }
    const read = cardReads.begin(() => batchId.value === id && cardNo.value === no);
    cardLoading.value = true;
    cardError.value = '';
    currentCard.value = null;
    try {
      const result = await productionTrackingApi.list(
        { batchId: id, keyword: no, page: 1, pageSize: 20 },
        { signal: read.signal, skipErrorHandling: true },
      );
      if (!read.isCurrent()) return null;
      const item = result.items.find(
        (value) => value.cardNo === no && value.productionBatchId === id,
      );
      if (!item) throw new Error('所选任务下未找到该追踪卡，请核对完整卡号');
      const card = await productionTrackingApi.detail(item.id, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (!read.isCurrent()) return null;
      if (card.id !== item.id || card.productionBatchId !== id || card.cardNo !== no)
        throw new Error('追踪卡与当前任务不一致，请重新查询');
      currentCard.value = card;
      return card;
    } catch (failure) {
      if (read.isCurrent())
        cardError.value = failure instanceof Error ? failure.message : '追踪卡查询失败，请重试';
      return null;
    } finally {
      if (read.isCurrent()) cardLoading.value = false;
    }
  }
  async function bind(): Promise<void> {
    if (submitting.value || cardLoading.value || !cardReads.isActive()) return;
    if (!pendingSubmission) {
      normalizeMarkCode();
      if (!hasValidMarkCode.value || codeAvailability.unavailable.value) return;
      if (!taskCanBind.value || !batchId.value) {
        EMessage.warning('请先选择已开工的批量任务并核对任务信息');
        return;
      }
      if (
        !personnelId.value ||
        !selectedPersonnel.value ||
        !personnelVerified.value ||
        personnelError.value
      ) {
        EMessage.warning('请明确选择有效登记人员，人员加载失败时请先刷新');
        return;
      }
      const card = currentCard.value ?? (await lookupCard());
      if (
        !card ||
        !cardReads.isActive() ||
        locked.value ||
        card.productionBatchId !== batchId.value
      )
        return;
      if (
        !hasValidMarkCode.value ||
        codeAvailability.unavailable.value ||
        !taskCanBind.value ||
        !personnelVerified.value ||
        !selectedPersonnel.value
      )
        return;
      if (cardBlockedReason.value) {
        EMessage.warning(cardBlockedReason.value);
        return;
      }
      pendingSubmission = {
        batchId: batchId.value,
        cardId: card.id,
        cardNo: card.cardNo,
        body: { version: card.version, personnelId: personnelId.value, markCode: markCode.value },
      };
      pendingCodeLabel.value = `${card.cardNo}-${markCode.value} · ${selectedPersonnel.value?.name ?? ''}`;
    }
    const submission = pendingSubmission;
    resultLabel.value = '';
    submitting.value = true;
    let focusCard = false;
    try {
      const result = await intent.execute(
        {
          intentType: 'production.tracking.item-mark.bind',
          params: { cardId: submission.cardId },
          query: {},
          body: submission.body,
        },
        (key) => productionTrackingApi.bindItemMark(submission.cardId, submission.body, key),
      );
      markCode.value = (BigInt(submission.body.markCode) + 1n).toString();
      resultLabel.value = `已绑定 ${submission.cardNo}-${submission.body.markCode}`;
      EMessage.success(resultLabel.value);
      if (cardReads.isActive() && batchId.value === submission.batchId) {
        if (trackingItemMarkPending(result) === 0) {
          clearCard();
          focusCard = true;
        } else {
          currentCard.value = result;
          cardNo.value = result.cardNo;
        }
        await refreshRecords();
      }
    } catch (failure) {
      EMessage.error(failure, '单件刻码绑定失败');
    } finally {
      intentStatus.value = intent.getStatus();
      if (intentStatus.value === 'idle') pendingSubmission = null;
      submitting.value = false;
      if (cardReads.isActive()) {
        await nextTick();
        if (focusCard) cardInput.value?.focus();
        else codeInput.value?.focus();
      }
    }
  }
  function restart(): void {
    if (submitting.value) return;
    intent.reset();
    intentStatus.value = 'idle';
    pendingSubmission = null;
    const no = cardNo.value;
    clearCard();
    cardNo.value = no;
  }
  async function refreshSetup(): Promise<void> {
    if (submitting.value) return;
    await Promise.all([loadContext(), loadPersonnel()]);
  }
  async function cardChanged(card: ProductionTrackingCardDetail): Promise<void> {
    if (
      cardReads.isActive() &&
      currentCard.value?.id === card.id &&
      currentCard.value.version <= card.version
    ) {
      cardReads.invalidate();
      currentCard.value = card;
    }
    if (cardReads.isActive() && (!batchId.value || batchId.value === card.productionBatchId))
      await refreshRecords();
  }
  async function allowClose(): Promise<boolean> {
    if (submitting.value) return false;
    return confirmSubmissionClose(intent.getStatus(), {
      entityLabel: '编码绑定',
      dirty: Boolean(cardNo.value.trim()),
    });
  }
  onScopeDispose(useTabsStore().registerCloseGuard('production-workbench', allowClose));
  let consumedLocation = '';
  async function locate(): Promise<void> {
    if (
      route.name !== 'production-workbench-code-binding' ||
      !contextReads.isActive() ||
      locked.value
    )
      return;
    const id = typeof route.query.batchId === 'string' ? route.query.batchId : '';
    if (!id || consumedLocation === id) return;
    consumedLocation = id;
    await changeBatch(id);
  }
  watch(
    () => [route.name, route.query.batchId],
    () => {
      void locate();
    },
  );
  let initiallyLoaded = false;
  onActivated(() => {
    if (initiallyLoaded) void locate();
  });
  usePageInitialLoad(async () => {
    await Promise.all([taskSearch.search(''), loadPersonnel()]);
    await locate();
    initiallyLoaded = true;
  });
  return {
    batchId,
    personnelId,
    cardNo,
    markCode,
    context,
    contextLoading,
    contextError,
    personnel,
    personnelLoading,
    personnelError,
    currentCard,
    cardLoading,
    cardError,
    submitting,
    intentStatus,
    resultLabel,
    recovery,
    pendingCodeLabel,
    locked,
    cardInput,
    codeInput,
    taskSearch,
    taskCanBind,
    hasValidMarkCode,
    markCodeError,
    normalizeMarkCode,
    codeAvailability,
    fullCode,
    remainingToBind,
    cardBlockedReason,
    changeBatch,
    lookupCard,
    cardInputChanged,
    normalizeCardNo,
    bind,
    restart,
    refreshSetup,
    loadPersonnel,
    cardChanged,
  };
}
