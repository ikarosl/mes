import { computed, ref } from 'vue';
import type {
  ProcurementReceiptVoidingDetail,
  VoidProcurementReceiptCommandResult,
  VoidProcurementReceiptPayload,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export function useReceiptVoid(
  onSaved: (result: VoidProcurementReceiptCommandResult) => void | Promise<void>,
) {
  const visible = ref(false),
    loading = ref(false),
    readError = ref(false),
    stale = ref(false),
    id = ref(''),
    reason = ref('');
  const detail = ref<ProcurementReceiptVoidingDetail | null>(null);
  const eligibility = ref<ProcurementReceiptVoidingDetail['voiding'] | null>(null);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<VoidProcurementReceiptCommandResult>(async (result) => {
    visible.value = false;
    read.invalidate();
    await onSaved(result);
  }, '到货单');
  const load = async (): Promise<boolean> => {
    if (!visible.value || !id.value || !read.isActive()) return false;
    const target = id.value;
    const current = read.begin(() => visible.value && id.value === target);
    loading.value = true;
    try {
      const latest = await procurementApi.receiptVoiding(target, current.signal);
      if (!current.isCurrent()) return false;
      if (
        latest.id !== target ||
        latest.items.length !== latest.voiding.lines.length ||
        new Set(latest.voiding.lines.map((line) => line.receiptLineId)).size !==
          latest.items.length ||
        latest.items.some((line) => {
          const token = latest.voiding.lines.find((item) => item.receiptLineId === line.id);
          return !token || line.receiptId !== target || token.version !== line.version;
        })
      )
        throw new Error('到货整单作废依据不完整或与当前明细不匹配，请重新核对');
      const basis = detail.value;
      if (basis && JSON.stringify(latest) !== JSON.stringify(basis)) stale.value = true;
      if (!basis) detail.value = latest;
      eligibility.value = latest.voiding;
      readError.value = false;
      return true;
    } catch (error) {
      if (current.isCurrent()) {
        readError.value = true;
        EMessage.error(error, '到货整单作废依据读取失败，当前输入已保留');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(Boolean(reason.value.trim())))) return false;
    visible.value = false;
    read.invalidate();
    return true;
  };
  const open = async (target: string): Promise<void> => {
    if (command.locked.value || (visible.value && !(await close()))) return;
    id.value = target;
    reason.value = '';
    detail.value = null;
    eligibility.value = null;
    readError.value = false;
    stale.value = false;
    visible.value = true;
    await load();
  };
  const canConfirm = computed(() =>
    Boolean(
      visible.value &&
      detail.value &&
      eligibility.value?.canVoid &&
      detail.value.voiding.lines.length &&
      reason.value.trim() &&
      reason.value.trim().length <= 2000 &&
      !loading.value &&
      !readError.value &&
      !stale.value &&
      !command.locked.value,
    ),
  );
  const confirm = async (): Promise<void> => {
    if (
      !canConfirm.value ||
      !(await load()) ||
      !read.isActive() ||
      !canConfirm.value ||
      !detail.value
    )
      return;
    const target = detail.value;
    const body: VoidProcurementReceiptPayload = {
      version: target.version,
      reason: reason.value.trim(),
      lines: target.voiding.lines.map((line) => ({ ...line })),
    };
    await command.run(
      { intentType: 'procurement.receipt.void', params: { id: target.id }, query: {}, body },
      async (key) => {
        const result = await procurementApi.voidReceipt(target.id, body, key);
        if (result.receiptId !== target.id || result.version !== target.version + 1)
          throw new RequestError('作废结果不完整，请核对后重试原操作', 502);
        return result;
      },
      '整张到货登记已作废，历史记录已保留',
    );
  };
  return {
    visible,
    loading,
    readError,
    stale,
    detail,
    eligibility,
    reason,
    command,
    canConfirm,
    open,
    close,
    load,
    confirm,
  };
}
