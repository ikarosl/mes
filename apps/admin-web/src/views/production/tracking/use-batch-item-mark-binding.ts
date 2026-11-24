import { computed, onScopeDispose, ref, shallowReactive, shallowRef, watch } from 'vue';
import {
  CONCURRENCY_ERROR_CODES,
  PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE,
} from '@company/constants';
import type { SaveProductionTrackingItemMarkWorkspacePayload } from '@company/contracts';
import { RequestError } from '@company/request';
import {
  isValidTrackingItemMarkCode,
  normalizeTrackingItemMarkCode,
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
} from '@company/utils';
import { productionTrackingApi } from '../../../api/production/tracking';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';

export interface BatchItemMarkBindingTarget {
  batchId: string;
  batchNo: string;
  cardId: string;
  cardNo: string;
  cardVersion: number;
  personnelId: string;
  personnelName: string;
  startCode: string;
  remaining: number;
}

interface BindingOptions {
  target: () => BatchItemMarkBindingTarget | null;
  visible: () => boolean;
  refreshTarget: (target: BatchItemMarkBindingTarget) => Promise<BatchItemMarkBindingTarget>;
  saved: (target: BatchItemMarkBindingTarget, lastCode: string, count: number) => void;
  discard: () => void;
}

interface CodeRange {
  start: bigint;
  end: bigint;
  length: bigint;
}

const PAGE_SIZE = 10n;
// Same JSON payload limit as apps/api/src/main.ts. This request's values are ASCII.
const JSON_BODY_LIMIT = 20n * 1024n * 1024n;

function createChange(target: BatchItemMarkBindingTarget, markCode: string) {
  return {
    cardId: target.cardId,
    cardVersion: target.cardVersion,
    markId: null,
    previousMarkCode: null,
    version: null,
    markCode,
  };
}

function codeWindow(start: bigint, end: bigint): string[] {
  const codes: string[] = [];
  for (let code = start; code <= end; code++) codes.push(code.toString());
  return codes;
}

function isInRange(code: string, { start, end }: CodeRange): boolean {
  const value = BigInt(code);
  return value >= start && value <= end;
}

function payloadExceedsLimit(
  target: BatchItemMarkBindingTarget,
  range: CodeRange,
  excludedCodes: string[],
  count: bigint,
): boolean {
  // Count digits by decimal width, so even a very large preview stays lazy.
  let digitCount = 0n;
  for (
    let width = range.start.toString().length, lower = range.start;
    lower <= range.end;
    width++
  ) {
    const next = 10n ** BigInt(width);
    const upper = range.end < next ? range.end : next - 1n;
    digitCount += (upper - lower + 1n) * BigInt(width);
    lower = next;
  }
  for (const code of excludedCodes) digitCount -= BigInt(code.length);
  const emptyBytes = JSON.stringify({ personnelId: target.personnelId, changes: [] }).length;
  const rowBytes = JSON.stringify(createChange(target, '')).length;
  return BigInt(emptyBytes) + count * BigInt(rowBytes + 1) + digitCount - 1n > JSON_BODY_LIMIT;
}

export function useBatchItemMarkBinding(options: BindingOptions) {
  const target = shallowRef<BatchItemMarkBindingTarget | null>(null);
  const endInput = ref('');
  const appliedEnd = ref('');
  const offset = ref(0n);
  const excluded = shallowReactive(new Set<string>());
  const occupied = shallowReactive(new Set<string>());
  const checkedPreviewCodes = shallowRef(new Set<string>());
  const previewLoading = ref(false);
  const previewError = ref('');
  const checkingSelection = ref(false);
  const refreshingTarget = ref(false);
  const needsRefresh = ref(false);
  const submitting = ref(false);
  const status = ref<IdempotentIntentStatus>('idle');
  const feedback = ref('');
  const closing = ref(false);
  const intent = useIdempotentIntent('批量绑定单件刻码');
  let pending: {
    target: BatchItemMarkBindingTarget;
    body: SaveProductionTrackingItemMarkWorkspacePayload;
    lastCode: string;
  } | null = null;
  let initialEnd = '';

  const recovery = computed(() => status.value !== 'idle');
  const busy = computed(
    () => checkingSelection.value || submitting.value || refreshingTarget.value,
  );
  const locked = computed(() => busy.value || recovery.value || closing.value);
  const previewReads = useLatestReadRequest(() => {
    previewLoading.value = false;
  });
  const selectionReads = useLatestReadRequest(() => {
    checkingSelection.value = false;
  });
  const targetReads = useLatestReadRequest(() => {
    refreshingTarget.value = false;
  });

  const normalizedEnd = computed(() => normalizeTrackingItemMarkCode(endInput.value));
  const endError = computed(() => {
    if (!target.value) return '';
    if (!isValidTrackingItemMarkCode(normalizedEnd.value))
      return TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE;
    return BigInt(normalizedEnd.value) < BigInt(target.value.startCode)
      ? '结束号必须大于或等于起始号'
      : '';
  });
  const range = computed<CodeRange | null>(() => {
    if (!target.value || !appliedEnd.value) return null;
    const start = BigInt(target.value.startCode);
    const end = BigInt(appliedEnd.value);
    return { start, end, length: end - start + 1n };
  });
  const hasUnappliedEnd = computed(() => normalizedEnd.value !== appliedEnd.value);
  const excludedInRange = computed(() => {
    const current = range.value;
    return current ? [...excluded].filter((code) => isInRange(code, current)) : [];
  });
  const selectedCount = computed(
    () => (range.value?.length ?? 0n) - BigInt(excludedInRange.value.length),
  );
  const occupiedInSelection = computed(() => {
    const current = range.value;
    return current
      ? [...occupied].filter((code) => isInRange(code, current) && !excluded.has(code))
      : [];
  });
  const countError = computed(() => {
    if (!target.value || !range.value) return '';
    if (selectedCount.value > BigInt(target.value.remaining))
      return `已选 ${selectedCount.value} 个，超过本卡待绑量 ${target.value.remaining} 个。请移除部分刻码或缩短范围。`;
    if (
      selectedCount.value > 0n &&
      payloadExceedsLimit(target.value, range.value, excludedInRange.value, selectedCount.value)
    )
      return '本次选择超过接口单次提交的大小限制，请缩短范围或移除部分刻码。';
    return '';
  });
  const hasPreviousPage = computed(() => offset.value > 0n);
  const hasNextPage = computed(
    () => !!range.value && offset.value + PAGE_SIZE < range.value.length,
  );
  const pageCodes = computed(() => {
    const current = range.value;
    if (!current) return [];
    const start = current.start + offset.value;
    const pageEnd = start + PAGE_SIZE - 1n;
    return codeWindow(start, pageEnd < current.end ? pageEnd : current.end);
  });
  const previewCodesToCheck = computed(() => {
    const current = range.value;
    if (current && current.length <= BigInt(PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE))
      return codeWindow(current.start, current.end);
    return pageCodes.value;
  });
  const rows = computed(() =>
    pageCodes.value.map((code) => ({
      code,
      excluded: excluded.has(code),
      occupied: occupied.has(code),
      checked: checkedPreviewCodes.value.has(code),
    })),
  );
  const canSave = computed(
    () =>
      !!target.value &&
      options.visible() &&
      !locked.value &&
      !previewLoading.value &&
      !hasUnappliedEnd.value &&
      !endError.value &&
      !countError.value &&
      !needsRefresh.value &&
      !occupiedInSelection.value.length &&
      selectedCount.value > 0n,
  );

  watch(options.target, (next) => {
    previewReads.invalidate();
    selectionReads.invalidate();
    targetReads.invalidate();
    target.value = next;
    initialEnd = next ? (BigInt(next.startCode) + BigInt(next.remaining) - 1n).toString() : '';
    endInput.value = initialEnd;
    appliedEnd.value = next && !endError.value ? initialEnd : '';
    offset.value = 0n;
    excluded.clear();
    occupied.clear();
    checkedPreviewCodes.value = new Set();
    previewError.value = '';
    feedback.value = '';
    needsRefresh.value = false;
    pending = null;
    intent.reset();
    status.value = 'idle';
  });

  function normalizeEnd(): void {
    if (!locked.value) endInput.value = normalizedEnd.value;
  }
  function applyEnd(): void {
    if (locked.value || endError.value || !hasUnappliedEnd.value) return;
    normalizeEnd();
    offset.value = 0n;
    appliedEnd.value = normalizedEnd.value;
    feedback.value = '';
  }
  function movePage(direction: -1 | 1): void {
    if (busy.value || (direction === -1 ? !hasPreviousPage.value : !hasNextPage.value)) return;
    offset.value += BigInt(direction) * PAGE_SIZE;
  }
  function showOccupiedCode(): void {
    const code = occupiedInSelection.value[0];
    if (!range.value || !code || busy.value) return;
    offset.value = ((BigInt(code) - range.value.start) / PAGE_SIZE) * PAGE_SIZE;
  }
  function toggleExcluded(code: string): void {
    if (locked.value || !range.value || !isInRange(code, range.value)) return;
    if (!excluded.delete(code)) excluded.add(code);
    feedback.value = '';
  }

  function applyOccupancy(codes: string[], occupiedCodes: string[]): void {
    const checkedOccupied = new Set(occupiedCodes);
    for (const code of codes) {
      if (checkedOccupied.has(code)) occupied.add(code);
      else occupied.delete(code);
    }
  }
  async function readOccupancy(
    codes: string[],
    read: ReturnType<typeof previewReads.begin>,
  ): Promise<boolean> {
    const result = await productionTrackingApi.occupiedItemMarkCodes(codes, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return false;
    applyOccupancy(codes, result);
    return true;
  }
  async function checkPreview(alsoKnownOccupied = false): Promise<void> {
    if (!options.visible() || !previewReads.isActive() || locked.value) return;
    const codes = previewCodesToCheck.value;
    if (!codes.length) return;
    const read = previewReads.begin(() => options.visible() && previewCodesToCheck.value === codes);
    previewLoading.value = true;
    previewError.value = '';
    checkedPreviewCodes.value = new Set();
    try {
      const toCheck = alsoKnownOccupied
        ? [...new Set([...codes, ...occupiedInSelection.value])]
        : codes;
      for (
        let start = 0;
        start < toCheck.length;
        start += PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE
      ) {
        const chunk = toCheck.slice(
          start,
          start + PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE,
        );
        if (!(await readOccupancy(chunk, read))) return;
      }
      checkedPreviewCodes.value = new Set(codes);
    } catch (failure) {
      if (read.isCurrent())
        previewError.value = failure instanceof Error ? failure.message : '查重失败，请重试';
    } finally {
      if (read.isCurrent()) previewLoading.value = false;
    }
  }
  watch(
    () => previewCodesToCheck.value.join(','),
    () => void checkPreview(),
  );
  watch(options.visible, (visible) => {
    if (!visible) {
      previewReads.invalidate();
      selectionReads.invalidate();
      targetReads.invalidate();
    }
  });

  async function prepareSubmission(): Promise<typeof pending> {
    if (!canSave.value || !target.value || !range.value || !selectionReads.isActive()) return null;
    const binding = target.value;
    const current = range.value;
    const body: SaveProductionTrackingItemMarkWorkspacePayload = {
      personnelId: binding.personnelId,
      changes: [],
    };
    const read = selectionReads.begin(() => options.visible() && target.value === binding);
    previewReads.invalidate();
    checkingSelection.value = true;
    previewError.value = '';
    let lastCode = '';
    let chunk: string[] = [];
    try {
      for (let value = current.start; value <= current.end; value++) {
        const code = value.toString();
        if (excluded.has(code)) continue;
        lastCode = code;
        body.changes.push(createChange(binding, code));
        chunk.push(code);
        if (chunk.length === PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE) {
          if (!(await readOccupancy(chunk, read))) return null;
          chunk = [];
        }
      }
      if (chunk.length && !(await readOccupancy(chunk, read))) return null;
      if (!read.isCurrent()) return null;
      if (occupiedInSelection.value.length) return null;
      return { target: binding, body, lastCode };
    } catch (failure) {
      if (read.isCurrent())
        previewError.value = failure instanceof Error ? failure.message : '查重失败，请重试';
      return null;
    } finally {
      if (read.isCurrent()) checkingSelection.value = false;
    }
  }

  async function save(): Promise<void> {
    if (busy.value || closing.value || !options.visible() || !selectionReads.isActive()) return;
    feedback.value = '';
    const submission = pending ?? (await prepareSubmission());
    if (
      !submission ||
      target.value !== submission.target ||
      !options.visible() ||
      !selectionReads.isActive() ||
      closing.value
    )
      return;
    pending = submission;
    submitting.value = true;
    let savedCount: number | undefined;
    try {
      const result = await intent.execute(
        {
          intentType: 'production.tracking.item-mark.save',
          params: { batchId: submission.target.batchId },
          query: {},
          body: submission.body,
        },
        (key) =>
          productionTrackingApi.saveItemMarkWorkspace(
            submission.target.batchId,
            submission.body,
            key,
          ),
      );
      savedCount = result.changedCount;
    } catch (failure) {
      feedback.value = failure instanceof Error ? failure.message : '批量绑定失败，请核对本次选择';
      if (
        failure instanceof RequestError &&
        failure.code === CONCURRENCY_ERROR_CODES.concurrentModification
      )
        needsRefresh.value = true;
    } finally {
      status.value = intent.getStatus();
      if (!recovery.value) pending = null;
      submitting.value = false;
    }
    if (savedCount !== undefined) options.saved(submission.target, submission.lastCode, savedCount);
    else if (!recovery.value) await checkPreview(true);
  }

  async function refreshTarget(): Promise<void> {
    const oldTarget = target.value;
    if (!oldTarget || locked.value || !options.visible() || !targetReads.isActive()) return;
    const initialTarget = options.target();
    const read = targetReads.begin(() => options.visible() && options.target() === initialTarget);
    refreshingTarget.value = true;
    try {
      const refreshed = await options.refreshTarget(oldTarget);
      if (!read.isCurrent()) return;
      target.value = refreshed;
      needsRefresh.value = false;
      feedback.value = '';
    } catch (failure) {
      if (read.isCurrent())
        feedback.value = failure instanceof Error ? failure.message : '追踪卡核对失败，请重试';
    } finally {
      if (read.isCurrent()) refreshingTarget.value = false;
    }
    await checkPreview(true);
  }

  async function restart(): Promise<void> {
    if (busy.value || closing.value || !options.visible() || !selectionReads.isActive()) return;
    intent.reset();
    status.value = 'idle';
    pending = null;
    needsRefresh.value = true;
    await refreshTarget();
  }

  async function discard(): Promise<void> {
    if (!options.visible() || submitting.value || closing.value) return;
    closing.value = true;
    selectionReads.invalidate();
    try {
      const confirmed = await confirmSubmissionClose(intent.getStatus(), {
        dirty: endInput.value !== initialEnd || excluded.size > 0,
        entityLabel: '批量绑码预览',
      });
      if (confirmed && options.visible() && selectionReads.isActive()) options.discard();
    } finally {
      closing.value = false;
    }
  }

  onScopeDispose(
    useTabsStore().registerCloseGuard(
      'production-workbench',
      async () =>
        !submitting.value &&
        (await confirmSubmissionClose(intent.getStatus(), {
          dirty: !!target.value,
          entityLabel: '批量绑码预览',
        })),
    ),
  );

  return {
    target,
    endInput,
    endError,
    hasUnappliedEnd,
    range,
    selectedCount,
    excludedInRange,
    occupiedInSelection,
    countError,
    hasPreviousPage,
    hasNextPage,
    rows,
    previewLoading,
    previewError,
    checkingSelection,
    refreshingTarget,
    needsRefresh,
    submitting,
    status,
    feedback,
    recovery,
    busy,
    locked,
    canSave,
    normalizeEnd,
    applyEnd,
    movePage,
    showOccupiedCode,
    toggleExcluded,
    checkPreview,
    save,
    refreshTarget,
    restart,
    discard,
  };
}
