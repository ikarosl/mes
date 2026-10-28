import { computed, onScopeDispose, ref } from 'vue';
import { RequestError } from '@company/request';
import {
  QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS,
  QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH,
} from '@company/constants';
import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  QualityIncomingInspectionExpectedOrder,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderReference,
  QualityIncomingInspectionReceiptItem,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import { incomingInspectionOrdersApi } from '../../../api/incoming-inspection-orders';
import {
  submissionRecoveryMessage,
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

export type IncomingInspectionAssociationMode = 'create' | 'manage' | 'move' | 'remark';
interface AssociationDraft {
  receipt: QualityIncomingInspectionReceiptItem;
  target: QualityIncomingInspectionOrderReference | null;
}
type AssociationCommand =
  | { kind: 'create'; body: CreateQualityIncomingInspectionOrderPayload }
  | { kind: 'remark'; orderId: string; body: UpdateQualityIncomingInspectionOrderPayload }
  | { kind: 'associations'; body: ChangeQualityIncomingInspectionAssociationsPayload };

/** A single association editor keeps only explicit deltas and their original versions. */
export function useIncomingInspectionOrderAssociation(onChanged: () => void) {
  const visible = ref(false);
  const mode = ref<IncomingInspectionAssociationMode>('create');
  const order = ref<QualityIncomingInspectionOrderItem | null>(null);
  const focusedReceipt = ref<QualityIncomingInspectionReceiptItem | null>(null);
  const focusedReceiptId = ref('');
  const remark = ref('');
  const baselineRemark = ref('');
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');
  const conflict = ref(false);
  const submitting = ref(false);
  const drafts = ref(new Map<string, AssociationDraft>());
  const expectedOrders = ref(new Map<string, number>());
  const status = ref<IdempotentIntentStatus>('idle');
  const intent = useIdempotentIntent('来料质检分组');
  let retainedCommand: AssociationCommand | null = null;
  let epoch = 0;
  let hasOrderBasis = false;

  const associated = ref<QualityIncomingInspectionReceiptItem[]>([]);
  const associatedPage = ref(1);
  const associatedTotal = ref(0);
  const associatedLoading = ref(false);
  const associatedError = ref('');
  const leftTab = ref<'associated' | 'candidates'>('associated');
  const candidates = ref<QualityIncomingInspectionReceiptItem[]>([]);
  const candidateKeyword = ref('');
  const candidateAssociation = ref<'unassigned' | 'assigned'>('unassigned');
  const candidatePage = ref(1);
  const candidateTotal = ref(0);
  const candidateLoading = ref(false);
  const candidateError = ref('');
  const targets = ref<QualityIncomingInspectionOrderItem[]>([]);
  const targetKeyword = ref('');
  const targetPage = ref(1);
  const targetTotal = ref(0);
  const targetLoading = ref(false);
  const targetError = ref('');
  const selectedTarget = ref<QualityIncomingInspectionOrderReference | null>(null);
  const moveDestination = ref<'order' | 'unassigned' | null>(null);
  let associatedLoaded = false;
  let candidatesLoaded = false;
  let targetsLoaded = false;

  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const associatedRead = useLatestReadRequest(() => {
    associatedLoading.value = false;
  });
  const candidatesRead = useLatestReadRequest(() => {
    candidateLoading.value = false;
  });
  const targetsRead = useLatestReadRequest(() => {
    targetLoading.value = false;
  });
  const locked = computed(() => submitting.value || status.value !== 'idle');
  const controlsDisabled = computed(
    () => locked.value || loading.value || !ready.value || conflict.value || !read.isActive(),
  );
  const targetPickerOpen = computed(
    () => mode.value === 'move' && moveDestination.value === 'order',
  );
  const prohibitedTargetId = computed(() => focusedReceipt.value?.order?.id);
  const dirty = computed(
    () =>
      drafts.value.size > 0 ||
      (mode.value === 'move' && moveDestination.value !== null) ||
      ((mode.value === 'create' || mode.value === 'remark') &&
        remark.value !== baselineRemark.value),
  );
  const draftRows = computed(() => [...drafts.value.values()]);
  const recoveryMessage = computed(() =>
    submissionRecoveryMessage(status.value, '质检主单及到货当前关联'),
  );
  const canSubmit = computed(() => {
    if (controlsDisabled.value) return false;
    if (mode.value === 'remark')
      return (
        dirty.value &&
        remark.value.trim().length <= QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH
      );
    if (!drafts.value.size || drafts.value.size > QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS)
      return false;
    return (
      mode.value !== 'create' ||
      remark.value.trim().length <= QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH
    );
  });

  function invalidateReads(): void {
    read.invalidate();
    associatedRead.invalidate();
    candidatesRead.invalidate();
    targetsRead.invalidate();
  }
  function resetState(): void {
    epoch += 1;
    invalidateReads();
    order.value = null;
    focusedReceipt.value = null;
    focusedReceiptId.value = '';
    remark.value = '';
    baselineRemark.value = '';
    ready.value = false;
    hasOrderBasis = false;
    error.value = '';
    conflict.value = false;
    drafts.value = new Map();
    expectedOrders.value = new Map();
    associated.value = [];
    associatedPage.value = 1;
    associatedTotal.value = 0;
    associatedError.value = '';
    leftTab.value = 'associated';
    candidates.value = [];
    candidateKeyword.value = '';
    candidateAssociation.value = 'unassigned';
    candidatePage.value = 1;
    candidateTotal.value = 0;
    candidateError.value = '';
    targets.value = [];
    targetKeyword.value = '';
    targetPage.value = 1;
    targetTotal.value = 0;
    targetError.value = '';
    selectedTarget.value = null;
    moveDestination.value = null;
    associatedLoaded = false;
    candidatesLoaded = false;
    targetsLoaded = false;
    retainedCommand = null;
    intent.reset();
    status.value = 'idle';
  }
  async function canDiscard(): Promise<boolean> {
    if (submitting.value) return false;
    const hasIntent = intent.getStatus() !== 'idle';
    if (!dirty.value && !hasIntent) return true;
    try {
      await RouteMessageBox.confirm(
        hasIntent
          ? '本次提交结果尚未确认，请先核对主单和到货关联。放弃后将丢失原样重试标识，重新办理可能重复创建主单。'
          : '当前备注或关联调整尚未保存，确认放弃这些修改吗？',
        hasIntent ? '放弃未确认提交' : '放弃未保存修改',
        {
          type: 'warning',
          confirmButtonText: hasIntent ? '核对后仍要放弃' : '放弃修改',
          cancelButtonText: '继续保留',
        },
      );
      return true;
    } catch {
      return false;
    }
  }
  async function close(): Promise<boolean> {
    if (!(await canDiscard())) return false;
    visible.value = false;
    resetState();
    return true;
  }
  function observeOrder(value: QualityIncomingInspectionOrderItem): void {
    const basis = order.value;
    if (!basis || value.id !== basis.id) return;
    if (value.version !== basis.version) {
      conflict.value = true;
      error.value = '主单已被其他操作更新，当前输入已保留。请核对后放弃草稿并重新载入。';
    }
  }
  async function loadOrder(): Promise<void> {
    const id = order.value?.id;
    if (!id || !visible.value || !read.isActive()) return;
    const request = read.begin(() => visible.value && order.value?.id === id);
    loading.value = true;
    if (!conflict.value) error.value = '';
    try {
      const result = await incomingInspectionOrdersApi.get(id, request.signal);
      if (!request.isCurrent()) return;
      if (result.id !== id) throw new Error('质检主单身份不匹配');
      if (!hasOrderBasis) {
        order.value = result;
        if (mode.value === 'remark') {
          remark.value = result.remark ?? '';
          baselineRemark.value = remark.value;
        }
        hasOrderBasis = true;
      } else observeOrder(result);
      ready.value = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = '主单依据加载失败，请重试；当前输入已保留。';
      ready.value = false;
      EMessage.error(cause, error.value);
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  }
  async function loadAssociated(): Promise<void> {
    const id = order.value?.id;
    if (
      !visible.value ||
      mode.value !== 'manage' ||
      leftTab.value !== 'associated' ||
      !id ||
      !associatedRead.isActive()
    )
      return;
    const requestedPage = associatedPage.value;
    const request = associatedRead.begin(
      () =>
        visible.value &&
        mode.value === 'manage' &&
        leftTab.value === 'associated' &&
        order.value?.id === id &&
        associatedPage.value === requestedPage,
    );
    associatedLoading.value = true;
    associatedLoaded = false;
    associatedError.value = '';
    try {
      const result = await incomingInspectionOrdersApi.receipts(
        id,
        { page: requestedPage, pageSize: 10 },
        request.signal,
      );
      if (!request.isCurrent()) return;
      if (result.order.id !== id) throw new Error('已关联目录与主单不匹配');
      associated.value = result.items;
      associatedTotal.value = result.total;
      associatedLoaded = true;
      if (ready.value) observeOrder(result.order);
    } catch (cause) {
      if (!request.isCurrent()) return;
      associatedError.value = '已关联到货加载失败，请重试。';
      EMessage.error(cause, associatedError.value);
    } finally {
      if (request.isCurrent()) associatedLoading.value = false;
    }
  }
  async function loadCandidates(): Promise<void> {
    if (
      !visible.value ||
      (mode.value !== 'create' && !(mode.value === 'manage' && leftTab.value === 'candidates')) ||
      !candidatesRead.isActive()
    )
      return;
    const requestedPage = candidatePage.value;
    const association = candidateAssociation.value;
    const request = candidatesRead.begin(
      () =>
        visible.value &&
        (mode.value === 'create' || (mode.value === 'manage' && leftTab.value === 'candidates')) &&
        candidatePage.value === requestedPage &&
        candidateAssociation.value === association,
    );
    candidateLoading.value = true;
    candidatesLoaded = false;
    candidateError.value = '';
    try {
      const result = await incomingInspectionOrdersApi.candidates(
        {
          page: requestedPage,
          pageSize: 10,
          keyword: candidateKeyword.value.trim() || undefined,
          association,
        },
        request.signal,
      );
      if (!request.isCurrent()) return;
      candidates.value = result.items;
      candidateTotal.value = result.total;
      candidatesLoaded = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      candidateError.value = '到货候选加载失败，请重试。';
      EMessage.error(cause, candidateError.value);
    } finally {
      if (request.isCurrent()) candidateLoading.value = false;
    }
  }
  async function loadTargets(): Promise<void> {
    if (!visible.value || !targetPickerOpen.value || !targetsRead.isActive()) return;
    const requestedPage = targetPage.value;
    const request = targetsRead.begin(
      () => visible.value && targetPickerOpen.value && targetPage.value === requestedPage,
    );
    targetLoading.value = true;
    targetsLoaded = false;
    targetError.value = '';
    try {
      const result = await incomingInspectionOrdersApi.targets(
        { page: requestedPage, pageSize: 10, keyword: targetKeyword.value.trim() || undefined },
        request.signal,
      );
      if (!request.isCurrent()) return;
      targets.value = result.items;
      targetTotal.value = result.total;
      targetsLoaded = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      targetError.value = '目标主单加载失败，请重试。';
      EMessage.error(cause, targetError.value);
    } finally {
      if (request.isCurrent()) targetLoading.value = false;
    }
  }
  async function refresh(): Promise<void> {
    if (submitting.value || !visible.value) return;
    const currentEpoch = epoch;
    if (mode.value === 'move') await loadFocusedReceipt();
    else await loadOrder();
    if (currentEpoch !== epoch || !visible.value) return;
    await Promise.all([loadAssociated(), loadCandidates(), loadTargets()]);
  }
  async function loadFocusedReceipt(): Promise<void> {
    const receiptId = focusedReceiptId.value;
    if (!receiptId || !visible.value || !read.isActive()) return;
    const request = read.begin(() => visible.value && focusedReceiptId.value === receiptId);
    loading.value = true;
    ready.value = false;
    if (!conflict.value) error.value = '';
    try {
      const result = await incomingInspectionOrdersApi.lines(receiptId, request.signal);
      if (!request.isCurrent()) return;
      if (result.receipt.receiptId !== receiptId) throw new Error('到货单身份不匹配');
      const basis = focusedReceipt.value;
      if (!basis) focusedReceipt.value = snapshotReceipt(result.receipt);
      else if (
        (basis.order?.id ?? null) !== (result.receipt.order?.id ?? null) ||
        basis.order?.version !== result.receipt.order?.version ||
        Boolean(basis.void) !== Boolean(result.receipt.void)
      ) {
        conflict.value = true;
        error.value = '到货归属或相关主单已变化，当前选择已保留。请核对后放弃草稿并重新载入。';
      }
      ready.value = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      error.value = '到货关联依据读取失败，请重新载入后核对。';
      EMessage.error(cause, error.value);
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  }
  async function open(
    nextMode: IncomingInspectionAssociationMode,
    sourceOrder?: QualityIncomingInspectionOrderItem,
    receipt?: QualityIncomingInspectionReceiptItem | string,
  ): Promise<boolean> {
    if (visible.value && !(await canDiscard())) return false;
    resetState();
    mode.value = nextMode;
    visible.value = true;
    const openingEpoch = epoch;
    order.value = sourceOrder ? { ...sourceOrder } : null;
    focusedReceipt.value =
      typeof receipt === 'string' || !receipt ? null : snapshotReceipt(receipt);
    focusedReceiptId.value = typeof receipt === 'string' ? receipt : (receipt?.receiptId ?? '');
    if (nextMode === 'create' || (nextMode === 'move' && focusedReceipt.value)) ready.value = true;
    if (sourceOrder && nextMode !== 'move') await loadOrder();
    if (openingEpoch !== epoch || !visible.value) return false;
    if (nextMode === 'move' && typeof receipt === 'string') await loadFocusedReceipt();
    if (openingEpoch !== epoch || !visible.value) return false;
    await Promise.all([loadAssociated(), loadCandidates()]);
    return true;
  }
  async function reloadDiscardingDraft(): Promise<void> {
    if (!visible.value || !(await canDiscard())) return;
    const nextMode = mode.value;
    const sourceOrder = order.value ?? undefined;
    const receipt = mode.value === 'move' ? focusedReceiptId.value : undefined;
    visible.value = false;
    await open(nextMode, sourceOrder, receipt);
  }
  function snapshotReceipt(
    receipt: QualityIncomingInspectionReceiptItem,
  ): QualityIncomingInspectionReceiptItem {
    return {
      ...receipt,
      order: receipt.order ? { ...receipt.order } : null,
      void: receipt.void ? { ...receipt.void } : null,
    };
  }
  function retainVersions(
    ...references: (QualityIncomingInspectionOrderReference | null)[]
  ): boolean {
    for (const reference of references) {
      if (!reference) continue;
      const known = expectedOrders.value.get(reference.id);
      if (known !== undefined && known !== reference.version) {
        conflict.value = true;
        error.value = '所选到货的归属或相关主单已变化，草稿已保留。请核对后放弃草稿并重新载入。';
        return false;
      }
    }
    for (const reference of references) {
      if (reference) expectedOrders.value.set(reference.id, reference.version);
    }
    return true;
  }
  function stage(
    receipt: QualityIncomingInspectionReceiptItem,
    target: QualityIncomingInspectionOrderReference | null,
    replaceFocused = false,
  ): boolean {
    if (controlsDisabled.value) return false;
    const existing = drafts.value.get(receipt.receiptId);
    if (existing && !replaceFocused) return false;
    // Replacing a destination must retain the first source snapshot, even after reference refreshes.
    const source = existing?.receipt ?? receipt;
    if (!source.order && source.void) {
      EMessage.warning('未关联且已作废的到货不能新增质检主单关联。');
      return false;
    }
    if (!existing && drafts.value.size >= QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS) {
      EMessage.warning(
        `每次最多调整 ${QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS} 张到货，请提交后继续下一批。`,
      );
      return false;
    }
    if (mode.value !== 'create' && (source.order?.id ?? null) === (target?.id ?? null))
      return false;
    if (!retainVersions(source.order, target)) return false;
    drafts.value.set(source.receiptId, {
      receipt: snapshotReceipt(source),
      target: target ? { ...target } : null,
    });
    pruneExpectedOrders();
    return true;
  }
  function addCandidate(receipt: QualityIncomingInspectionReceiptItem): void {
    if (mode.value !== 'create' && !order.value) return;
    stage(receipt, mode.value === 'create' ? null : order.value);
  }
  function removeAssociation(receipt: QualityIncomingInspectionReceiptItem): void {
    if (!receipt.order) return;
    stage(receipt, null);
  }
  function pruneExpectedOrders(): void {
    const used = new Set<string>();
    for (const draft of drafts.value.values()) {
      if (draft.receipt.order) used.add(draft.receipt.order.id);
      if (draft.target) used.add(draft.target.id);
    }
    expectedOrders.value = new Map([...expectedOrders.value].filter(([id]) => used.has(id)));
  }
  function removeDraft(receiptId: string): void {
    if (controlsDisabled.value && !conflict.value) return;
    if (locked.value) return;
    drafts.value.delete(receiptId);
    pruneExpectedOrders();
  }
  function chooseTarget(value: QualityIncomingInspectionOrderItem): void {
    if (
      mode.value !== 'move' ||
      !focusedReceipt.value ||
      moveDestination.value !== 'order' ||
      controlsDisabled.value ||
      targetLoading.value ||
      targetError.value ||
      value.id === prohibitedTargetId.value
    )
      return;
    const reference = {
      id: value.id,
      inspectionNo: value.inspectionNo,
      version: value.version,
    };
    if (!stage(focusedReceipt.value, reference, true)) return;
    selectedTarget.value = reference;
  }
  async function changeMoveDestination(value: unknown): Promise<void> {
    if (controlsDisabled.value || !focusedReceipt.value) return;
    if (value !== 'order' && value !== 'unassigned') return;
    if (value === moveDestination.value) return;
    if (value === 'unassigned') {
      if (!focusedReceipt.value.order || !stage(focusedReceipt.value, null, true)) return;
      moveDestination.value = value;
      selectedTarget.value = null;
      targetsRead.invalidate();
      return;
    }
    if (!focusedReceipt.value.order && focusedReceipt.value.void) return;
    moveDestination.value = value;
    selectedTarget.value = null;
    removeDraft(focusedReceipt.value.receiptId);
    if (!targetsLoaded || targetError.value) await loadTargets();
  }
  async function changeLeftTab(value: string | number): Promise<void> {
    if (locked.value || (value !== 'associated' && value !== 'candidates')) return;
    if (leftTab.value === value) return;
    associatedRead.invalidate();
    candidatesRead.invalidate();
    leftTab.value = value;
    if (value === 'associated' && (!associatedLoaded || associatedError.value))
      await loadAssociated();
    if (value === 'candidates' && (!candidatesLoaded || candidateError.value))
      await loadCandidates();
  }
  async function searchCandidates(): Promise<void> {
    candidatePage.value = 1;
    await loadCandidates();
  }
  async function changeCandidatePage(value: number): Promise<void> {
    candidatePage.value = value;
    candidates.value = [];
    await loadCandidates();
  }
  async function changeAssociatedPage(value: number): Promise<void> {
    associatedPage.value = value;
    associated.value = [];
    await loadAssociated();
  }
  async function searchTargets(): Promise<void> {
    targetPage.value = 1;
    await loadTargets();
  }
  async function changeTargetPage(value: number): Promise<void> {
    targetPage.value = value;
    targets.value = [];
    await loadTargets();
  }
  function expectedPayload(): QualityIncomingInspectionExpectedOrder[] {
    return [...expectedOrders.value].map(([orderId, expectedVersion]) => ({
      orderId,
      expectedVersion,
    }));
  }
  function commandSnapshot(command: AssociationCommand) {
    return {
      intentType: `quality.incoming-inspection-order.${command.kind}`,
      params: command.kind === 'remark' ? { orderId: command.orderId } : {},
      query: {},
      body: command.body,
    };
  }
  async function run(command: AssociationCommand): Promise<void> {
    if (submitting.value || !read.isActive()) return;
    const currentEpoch = epoch;
    retainedCommand = command;
    submitting.value = true;
    try {
      await intent.execute<unknown>(commandSnapshot(command), (key) => {
        if (command.kind === 'create') return incomingInspectionOrdersApi.create(command.body, key);
        if (command.kind === 'remark')
          return incomingInspectionOrdersApi.updateRemark(command.orderId, command.body, key);
        return incomingInspectionOrdersApi.changeAssociations(command.body, key);
      });
      if (currentEpoch !== epoch) return;
      EMessage.success(command.kind === 'create' ? '来料质检主单已创建' : '来料质检主单已更新');
      visible.value = false;
      resetState();
      onChanged();
    } catch (cause) {
      if (currentEpoch !== epoch) return;
      if (cause instanceof RequestError && cause.status === 409) {
        conflict.value = true;
        error.value = '到货归属或相关主单已变化，草稿已保留。请核对后放弃草稿并重新载入。';
        EMessage.error(error.value);
      } else EMessage.error(cause, '关联保存失败，原输入已保留');
    } finally {
      submitting.value = false;
      if (currentEpoch === epoch) {
        status.value = intent.getStatus();
        if (status.value === 'idle') retainedCommand = null;
      }
    }
  }
  async function submit(): Promise<void> {
    if (!canSubmit.value) return;
    if (mode.value === 'remark' && order.value) {
      await run({
        kind: 'remark',
        orderId: order.value.id,
        body: { expectedVersion: order.value.version, remark: remark.value.trim() || null },
      });
      return;
    }
    const entries = [...drafts.value.values()];
    const expected = expectedPayload();
    if (mode.value === 'create') {
      await run({
        kind: 'create',
        body: {
          remark: remark.value.trim() || null,
          receipts: entries.map((entry) => ({
            receiptId: entry.receipt.receiptId,
            fromOrderId: entry.receipt.order?.id ?? null,
          })),
          expectedOrders: expected,
        },
      });
      return;
    }
    await run({
      kind: 'associations',
      body: {
        changes: entries.map((entry) => ({
          receiptId: entry.receipt.receiptId,
          fromOrderId: entry.receipt.order?.id ?? null,
          toOrderId: entry.target?.id ?? null,
        })),
        expectedOrders: expected,
      },
    });
  }
  async function retry(): Promise<void> {
    status.value = intent.getStatus();
    if (!retainedCommand || status.value !== 'pending' || submitting.value) return;
    await run(retainedCommand);
  }
  onScopeDispose(
    useTabsStore().registerCloseGuard(
      'quality-inbound-inspections',
      async () => !visible.value || (await canDiscard()),
    ),
  );
  return {
    visible,
    mode,
    order,
    focusedReceipt,
    remark,
    loading,
    ready,
    error,
    conflict,
    submitting,
    drafts,
    draftRows,
    status,
    locked,
    controlsDisabled,
    dirty,
    canSubmit,
    recoveryMessage,
    associated,
    associatedPage,
    associatedTotal,
    associatedLoading,
    associatedError,
    leftTab,
    candidates,
    candidateKeyword,
    candidateAssociation,
    candidatePage,
    candidateTotal,
    candidateLoading,
    candidateError,
    targets,
    targetKeyword,
    targetPage,
    targetTotal,
    targetLoading,
    targetError,
    selectedTarget,
    targetPickerOpen,
    prohibitedTargetId,
    moveDestination,
    open,
    close,
    refresh,
    reloadDiscardingDraft,
    addCandidate,
    removeAssociation,
    removeDraft,
    chooseTarget,
    changeMoveDestination,
    changeLeftTab,
    loadAssociated,
    loadCandidates,
    loadTargets,
    searchCandidates,
    changeCandidatePage,
    changeAssociatedPage,
    searchTargets,
    changeTargetPage,
    submit,
    retry,
  };
}
