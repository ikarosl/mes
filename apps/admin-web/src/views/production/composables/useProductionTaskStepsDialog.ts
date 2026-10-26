import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { RequestError } from '@company/request';
import type {
  BatchStepRecordItem,
  ProductionBatchStepRecordsHeader,
  TechnicalFileListItem,
  UserOption,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { productionApi } from '../../../api/production';
import { isAmbiguousFailure } from '../../../composables/idempotency/useIdempotentIntent';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useAuthStore } from '../../../stores/auth';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { stepStatusMeta } from '../production-status';

export type TaskStepAction = 'assign' | 'reassign' | 'unassign' | 'execution';

interface StepEditor {
  action: TaskStepAction;
  batchId: string;
  batchLabel: string;
  step: BatchStepRecordItem;
}

interface StepCommand {
  editor: StepEditor;
  responsibleUserId: string;
  actualSopFileId: string | null;
}

interface TaskStepsProps {
  visible: boolean;
  batchId: string | null;
  batchLabel?: string;
}

const actionLabels: Record<TaskStepAction, string> = {
  assign: '工序派工',
  reassign: '工序改派',
  unassign: '撤回派工',
  execution: '设置参考文件',
};

const eligible = (step: BatchStepRecordItem, action: TaskStepAction): boolean => {
  if (action === 'assign') return step.canAssign;
  if (action === 'reassign') return step.canReassign;
  if (action === 'unassign') return step.canUnassign;
  return step.canEditExecution;
};

const blockedReason = (step: BatchStepRecordItem, action: TaskStepAction): string => {
  if (action === 'assign') return step.assignBlockedReason || '';
  if (action === 'reassign') return step.reassignBlockedReason || '';
  if (action === 'unassign') return step.unassignBlockedReason || '';
  return step.executionEditBlockedReason || '';
};

const commandSuccessMessage = (action: TaskStepAction): string => {
  if (action === 'assign') return '工序派工成功';
  if (action === 'reassign') return '工序改派成功';
  if (action === 'unassign') return '工序派工已撤回';
  return '参考文件已保存';
};

const commandFailureMessage = (failure: unknown): string => {
  if (
    failure instanceof RequestError &&
    (failure.code === 'CONCURRENT_MODIFICATION' || failure.code === 'STEP_ASSIGNMENT_CONFLICT')
  )
    return '工序状态或派工已变化；选择仍保留，请重新核对后继续';
  if (failure instanceof Error) return failure.message;
  return '工序操作失败，请重新核对';
};

const selectedReferenceFileLabel = (step: BatchStepRecordItem): string => {
  if (!step.actualSopFileName) return '';
  const versionLabel = step.actualSopVersionNo ? ` · 版本 ${step.actualSopVersionNo}` : '';
  return `${step.actualSopFileName}${versionLabel}`;
};

export function technicalFileLabel(file: TechnicalFileListItem): string {
  return file.versionNo ? `${file.fileName} · 版本 ${file.versionNo}` : file.fileName;
}

export function taskStepResponsibleName(
  step: BatchStepRecordItem,
  source: 'default' | 'assigned' = 'assigned',
): string {
  if (source === 'default')
    return (
      step.defaultResponsibleUserName || (step.defaultResponsibleUserId ? '姓名暂不可用' : '未指定')
    );
  return step.responsibleUserName || (step.responsibleUserId ? '姓名暂不可用' : '尚未派工');
}

export function taskStepReferenceFileName(step: BatchStepRecordItem): string {
  if (step.actualSopFileId) return step.actualSopFileName || '文件名暂不可用';
  return step.defaultSopFileName || (step.defaultSopFileId ? '文件名暂不可用' : '未配置');
}

/** 当前任务详情、候选与命令草稿各自持有读取状态；刷新不替换编辑时的工序版本。 */
export function useProductionTaskStepsDialog(
  props: TaskStepsProps,
  callbacks: { changed: (batchId: string) => void; closed: () => void },
) {
  const batch = shallowRef<ProductionBatchStepRecordsHeader | null>(null);
  const stepRecords = shallowRef<BatchStepRecordItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const detailReady = ref(false);
  const readActive = ref(true);
  const submitting = ref(false);
  const editor = shallowRef<StepEditor | null>(null);
  const writeError = ref('');
  const unknownResult = ref(false);
  const needsRecheck = ref(false);
  const responsibleUserId = ref('');
  const actualSopFileId = ref<string | null>(null);
  const selectedUserName = ref('');
  const selectedFileName = ref('');
  const users = shallowRef<UserOption[]>([]);
  const usersLoading = ref(false);
  const usersError = ref('');
  const usersReady = ref(false);
  const sopFiles = shallowRef<TechnicalFileListItem[]>([]);
  const sopLoading = ref(false);
  const sopError = ref('');
  const sopReady = ref(false);
  const detailReads = useLatestReadRequest(() => (loading.value = false));
  const userReads = useLatestReadRequest(() => (usersLoading.value = false));
  const sopReads = useLatestReadRequest(() => (sopLoading.value = false));
  const auth = useAuthStore();
  let sessionEpoch = 0;
  let initialUserId = '';
  let initialFileId: string | null = null;
  let pendingCommand: StepCommand | null = null;
  let closingEditor: Promise<boolean> | null = null;

  const canOperate = computed(() =>
    Boolean(
      props.visible &&
      readActive.value &&
      detailReady.value &&
      !loading.value &&
      !error.value &&
      !submitting.value &&
      batch.value?.id === props.batchId,
    ),
  );
  const currentStep = computed(() => {
    const active = editor.value;
    if (!active || batch.value?.id !== active.batchId || props.batchId !== active.batchId)
      return null;
    return stepRecords.value.find((step) => step.id === active.step.id) ?? null;
  });
  const basisChanged = computed(() =>
    Boolean(
      editor.value &&
      (!currentStep.value || currentStep.value.version !== editor.value.step.version),
    ),
  );
  const editorTitle = computed(() =>
    editor.value ? actionLabels[editor.value.action] : '工序操作',
  );
  const isAssignment = computed(
    () => editor.value?.action === 'assign' || editor.value?.action === 'reassign',
  );
  const isDirty = computed(() => {
    if (!editor.value) return false;
    if (isAssignment.value) return responsibleUserId.value !== initialUserId;
    if (editor.value.action === 'execution') return actualSopFileId.value !== initialFileId;
    return false;
  });
  const selectedUserMissing = computed(
    () =>
      usersReady.value &&
      !!responsibleUserId.value &&
      !users.value.some((user) => user.id === responsibleUserId.value),
  );
  const selectedFileMissing = computed(
    () =>
      sopReady.value &&
      !!actualSopFileId.value &&
      !sopFiles.value.some((file) => file.id === actualSopFileId.value),
  );
  const userFallbackLabel = computed(
    () =>
      `${selectedUserName.value || '已选员工（姓名暂不可用）'}${selectedUserMissing.value ? '（当前不可选）' : '（待核对）'}`,
  );
  const fileFallbackLabel = computed(
    () =>
      `${selectedFileName.value || '已选参考文件（名称暂不可用）'}${selectedFileMissing.value ? '（当前不可选）' : '（待核对）'}`,
  );
  const editorBlockedReason = computed(() => {
    if (!editor.value) return '';
    if (!readActive.value) return '当前页面未激活，暂不能提交';
    if (props.batchId !== editor.value.batchId) return '当前任务已切换，请保留或关闭原任务草稿';
    if (!detailReady.value || loading.value || error.value) return '请刷新当前工序信息后再提交';
    if (unknownResult.value) return '本次操作结果未知，请核对当前工序后继续';
    if (needsRecheck.value || basisChanged.value)
      return '工序依据已变化或提交被拒绝，请重新核对并明确采用当前依据';
    if (!currentStep.value) return '当前任务中已找不到该工序';
    if (!eligible(currentStep.value, editor.value.action))
      return blockedReason(currentStep.value, editor.value.action) || '当前工序暂不能办理此操作';
    return '';
  });
  const canSubmit = computed(() => {
    const active = editor.value;
    if (!active || !canOperate.value || editorBlockedReason.value || submitting.value) return false;
    if (isAssignment.value)
      return (
        usersReady.value &&
        !usersLoading.value &&
        !usersError.value &&
        !!responsibleUserId.value &&
        !selectedUserMissing.value &&
        (active.action !== 'reassign' || responsibleUserId.value !== active.step.responsibleUserId)
      );
    if (active.action === 'execution')
      return (
        sopReady.value &&
        !sopLoading.value &&
        !sopError.value &&
        !selectedFileMissing.value &&
        actualSopFileId.value !== active.step.actualSopFileId
      );
    return true;
  });

  async function loadStepRecords(): Promise<boolean> {
    const batchId = props.batchId;
    if (
      !props.visible ||
      !batchId ||
      !readActive.value ||
      !detailReads.isActive() ||
      submitting.value
    )
      return false;
    const { isCurrent, signal } = detailReads.begin(
      () => props.visible && props.batchId === batchId,
    );
    loading.value = true;
    detailReady.value = false;
    error.value = '';
    try {
      const result = await productionApi.getBatchStepRecords(batchId, {
        signal,
        skipErrorHandling: true,
      });
      if (!isCurrent()) return false;
      if (
        !result ||
        !result.batch ||
        result.batch.id !== batchId ||
        !Array.isArray(result.stepRecords) ||
        result.stepRecords.some((step) => step.productionBatchId !== batchId)
      )
        throw new Error('任务工序响应与当前任务不一致，请重试');
      batch.value = result.batch;
      stepRecords.value = result.stepRecords;
      detailReady.value = true;
      return true;
    } catch (failure) {
      if (isCurrent())
        error.value = failure instanceof Error ? failure.message : '任务工序加载失败，请重试';
      return false;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  async function refreshUsers(): Promise<void> {
    const active = editor.value;
    if (!active || !isAssignment.value || !props.visible || !readActive.value || submitting.value)
      return;
    const { isCurrent, signal } = userReads.begin(() => props.visible && editor.value === active);
    usersLoading.value = true;
    usersReady.value = false;
    usersError.value = '';
    try {
      const result = await productApi.userOptions({ signal });
      if (!isCurrent()) return;
      users.value = result;
      usersReady.value = true;
      const selected = result.find((user) => user.id === responsibleUserId.value);
      if (selected) selectedUserName.value = selected.displayName;
    } catch (failure) {
      if (isCurrent())
        usersError.value = failure instanceof Error ? failure.message : '员工候选加载失败，请重试';
    } finally {
      if (isCurrent()) usersLoading.value = false;
    }
  }

  async function refreshSopFiles(): Promise<void> {
    const active = editor.value;
    if (
      !active ||
      active.action !== 'execution' ||
      !props.visible ||
      !readActive.value ||
      submitting.value
    )
      return;
    const { isCurrent, signal } = sopReads.begin(() => props.visible && editor.value === active);
    sopLoading.value = true;
    sopReady.value = false;
    sopError.value = '';
    try {
      const collected: TechnicalFileListItem[] = [];
      const pageSize = 100;
      let total: number | undefined;
      for (let page = 1; total === undefined || page <= Math.ceil(total / pageSize); page += 1) {
        const result = await productApi.technicalFiles(
          { page, pageSize, status: 1 },
          { signal, skipErrorHandling: true },
        );
        if (!isCurrent()) return;
        if (
          result.page !== page ||
          result.pageSize !== pageSize ||
          !Number.isInteger(result.total) ||
          result.total < 0 ||
          (total !== undefined && total !== result.total)
        )
          throw new Error('参考文件列表已变化或分页不完整，请重新刷新');
        total = result.total;
        collected.push(...result.items);
      }
      if (new Set(collected.map((file) => file.id)).size !== total)
        throw new Error('参考文件未完整加载，请重新刷新');
      sopFiles.value = collected;
      sopReady.value = true;
      const selected = collected.find((file) => file.id === actualSopFileId.value);
      if (selected) selectedFileName.value = technicalFileLabel(selected);
    } catch (failure) {
      if (isCurrent())
        sopError.value = failure instanceof Error ? failure.message : '参考文件加载失败，请重试';
    } finally {
      if (isCurrent()) sopLoading.value = false;
    }
  }

  function selectUser(id: string): void {
    responsibleUserId.value = id;
    const selected = users.value.find((user) => user.id === id);
    if (selected) selectedUserName.value = selected.displayName;
  }

  function selectFile(id: string | null | undefined): void {
    actualSopFileId.value = id || null;
    const selected = sopFiles.value.find((file) => file.id === actualSopFileId.value);
    if (selected) selectedFileName.value = technicalFileLabel(selected);
    else if (!actualSopFileId.value) selectedFileName.value = '';
  }

  function clearEditor(): void {
    userReads.invalidate();
    sopReads.invalidate();
    editor.value = null;
    pendingCommand = null;
    unknownResult.value = false;
    needsRecheck.value = false;
    writeError.value = '';
  }

  async function closeEditor(): Promise<boolean> {
    if (!editor.value) return true;
    if (submitting.value) return false;
    if (closingEditor) return closingEditor;
    const active = editor.value;
    closingEditor = (async () => {
      if (unknownResult.value || isDirty.value) {
        try {
          await RouteMessageBox.confirm(
            unknownResult.value
              ? '本次操作结果尚未确认，原请求与草稿已保留。请先核对当前工序；关闭将放弃这些本地记录，确认关闭？'
              : '当前选择尚未保存，确认放弃并关闭？',
            `关闭${actionLabels[active.action]}`,
            { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续保留' },
          );
        } catch {
          // 取消确认或离开当前路由时保留草稿与未知请求。
          return false;
        }
      }
      if (submitting.value || editor.value !== active) return false;
      clearEditor();
      return true;
    })();
    try {
      return await closingEditor;
    } finally {
      closingEditor = null;
    }
  }

  async function openAction(step: BatchStepRecordItem, action: TaskStepAction): Promise<void> {
    if (!canOperate.value || !batch.value || !eligible(step, action) || !(await closeEditor()))
      return;
    const current = stepRecords.value.find((item) => item.id === step.id);
    if (
      !canOperate.value ||
      !current ||
      current.version !== step.version ||
      !eligible(current, action)
    )
      return;
    editor.value = {
      action,
      batchId: batch.value.id,
      batchLabel: batch.value.batchNo,
      step: { ...current },
    };
    initialUserId =
      action === 'assign'
        ? current.defaultResponsibleUserId || ''
        : current.responsibleUserId || '';
    initialFileId = current.actualSopFileId;
    responsibleUserId.value = initialUserId;
    actualSopFileId.value = initialFileId;
    selectedUserName.value =
      action === 'assign'
        ? current.defaultResponsibleUserName || ''
        : current.responsibleUserName || '';
    selectedFileName.value = selectedReferenceFileLabel(current);
    if (action === 'assign' || action === 'reassign') await refreshUsers();
    else if (action === 'execution') await refreshSopFiles();
  }

  async function adoptCurrentBasis(): Promise<void> {
    const active = editor.value;
    if (!active || submitting.value || !(await loadStepRecords()) || editor.value !== active)
      return;
    const current = currentStep.value;
    if (!current) {
      writeError.value = '当前任务中已找不到该工序，原草稿仍保留';
      return;
    }
    const summary = `${active.batchLabel} · ${current.stepOrder}. ${current.stepName}\n当前状态：${stepStatusMeta(current.status).label}\n当前负责人：${taskStepResponsibleName(current)}\n当前参考文件：${taskStepReferenceFileName(current)}`;
    try {
      await RouteMessageBox.confirm(
        `${summary}\n\n${unknownResult.value ? '请先确认上次操作的实际结果。' : ''}采用当前依据后保留本次选择，由你再次明确提交，确认继续？`,
        '重新核对工序',
        {
          type: 'warning',
          confirmButtonText: '已核对，保留选择继续',
          cancelButtonText: '继续保留原依据',
        },
      );
    } catch {
      // 不确认采用新依据时，保留原版本和全部输入。
      return;
    }
    if (
      !canOperate.value ||
      editor.value !== active ||
      currentStep.value?.version !== current.version
    )
      return;
    // 采用新依据会改变 editor 身份，先结束旧候选请求，避免迟到响应留下 loading。
    userReads.invalidate();
    sopReads.invalidate();
    editor.value = { ...active, step: { ...current } };
    initialUserId =
      active.action === 'assign'
        ? current.defaultResponsibleUserId || ''
        : current.responsibleUserId || '';
    initialFileId = current.actualSopFileId;
    pendingCommand = null;
    unknownResult.value = false;
    needsRecheck.value = false;
    writeError.value = '';
  }

  async function sendCommand(command: StepCommand): Promise<void> {
    const { editor: active, responsibleUserId: userId, actualSopFileId: fileId } = command;
    const { batchId, step } = active;
    if (active.action === 'assign')
      await productionApi.assignStep(batchId, step.id, userId, step.version);
    else if (active.action === 'reassign')
      await productionApi.reassignStep(batchId, step.id, userId, step.version);
    else if (active.action === 'unassign')
      await productionApi.unassignStep(batchId, step.id, step.version);
    else
      await productionApi.updateBatchStepExecution(batchId, step.id, {
        actualSopFileId: fileId,
        version: step.version,
      });
  }

  async function submit(): Promise<void> {
    const active = editor.value;
    if (!active || !canSubmit.value || pendingCommand) return;
    const command = {
      editor: active,
      responsibleUserId: responsibleUserId.value,
      actualSopFileId: actualSopFileId.value,
    };
    const epoch = sessionEpoch;
    pendingCommand = command;
    detailReads.invalidate();
    submitting.value = true;
    writeError.value = '';
    let succeeded = false;
    try {
      await sendCommand(command);
      if (epoch !== sessionEpoch) return;
      succeeded = true;
      if (batch.value?.id === active.batchId) detailReady.value = false;
      if (editor.value === active) clearEditor();
      EMessage.success(commandSuccessMessage(active.action));
      callbacks.changed(active.batchId);
    } catch (failure) {
      if (epoch !== sessionEpoch || editor.value !== active) return;
      unknownResult.value = isAmbiguousFailure(failure);
      needsRecheck.value = true;
      if (!unknownResult.value) pendingCommand = null;
      writeError.value = commandFailureMessage(failure);
    } finally {
      if (epoch === sessionEpoch) submitting.value = false;
    }
    if (succeeded && props.batchId === active.batchId && props.visible && readActive.value)
      await loadStepRecords();
  }

  async function close(done?: () => void): Promise<boolean> {
    if (submitting.value || !(await closeEditor())) return false;
    detailReads.invalidate();
    callbacks.closed();
    done?.();
    return true;
  }

  watch(
    () => [props.visible, props.batchId] as const,
    ([visible, batchId]) => {
      detailReads.invalidate();
      detailReady.value = false;
      if (batch.value?.id !== batchId) {
        batch.value = null;
        stepRecords.value = [];
      }
      error.value = '';
      if (visible && batchId) void loadStepRecords();
      if (!visible) {
        userReads.invalidate();
        sopReads.invalidate();
      }
    },
    { immediate: true },
  );
  onActivated(() => {
    readActive.value = true;
  });
  onDeactivated(() => {
    readActive.value = false;
  });
  watch(
    () => auth.session?.user.id,
    () => {
      sessionEpoch += 1;
      detailReads.invalidate();
      clearEditor();
      batch.value = null;
      stepRecords.value = [];
      detailReady.value = false;
      users.value = [];
      sopFiles.value = [];
      usersReady.value = false;
      sopReady.value = false;
      submitting.value = false;
    },
  );
  const route = useRoute();
  onScopeDispose(useTabsStore().registerCloseGuard(String(route.name), () => close()));

  return {
    batch,
    stepRecords,
    loading,
    error,
    detailReady,
    readActive,
    submitting,
    editor,
    editorTitle,
    isAssignment,
    currentStep,
    basisChanged,
    unknownResult,
    needsRecheck,
    writeError,
    responsibleUserId,
    actualSopFileId,
    users,
    usersLoading,
    usersError,
    usersReady,
    sopFiles,
    sopLoading,
    sopError,
    sopReady,
    selectedUserMissing,
    selectedFileMissing,
    userFallbackLabel,
    fileFallbackLabel,
    canOperate,
    canSubmit,
    editorBlockedReason,
    loadStepRecords,
    refreshUsers,
    refreshSopFiles,
    selectUser,
    selectFile,
    openAction,
    adoptCurrentBasis,
    submit,
    closeEditor,
    close,
  };
}
