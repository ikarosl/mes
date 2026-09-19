import { computed, onScopeDispose, ref } from 'vue';
import type { SupplierItem } from '@company/contracts';
import { CONCURRENCY_ERROR_CODES } from '@company/constants';
import { RequestError } from '@company/request';
import { procurementApi } from '../../../api/procurement';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

export function useSupplierEditor(onSaved: () => Promise<void>) {
  const visible = ref(false);
  const supplierName = ref('');
  const original = ref<SupplierItem | null>(null);
  const submitting = ref(false);
  const stale = ref(false);
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });

  const dirty = computed(() => supplierName.value.trim() !== (original.value?.supplierName ?? ''));
  const canSave = computed(
    () =>
      supplierName.value.trim().length > 0 &&
      supplierName.value.trim().length <= 100 &&
      dirty.value &&
      !stale.value &&
      !submitting.value,
  );

  const openCreate = (): void => {
    if (visible.value || submitting.value) return;
    original.value = null;
    supplierName.value = '';
    stale.value = false;
    visible.value = true;
  };
  const openEdit = (row: SupplierItem): void => {
    if (visible.value || submitting.value) return;
    original.value = { ...row };
    supplierName.value = row.supplierName;
    stale.value = false;
    visible.value = true;
  };
  const observeRows = (rows: SupplierItem[]): void => {
    if (!visible.value || !original.value || submitting.value) return;
    const current = rows.find((row) => row.id === original.value?.id);
    if (current && current.version !== original.value.version) stale.value = true;
  };

  const close = async (): Promise<void> => {
    if (submitting.value) return;
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm('供应商名称尚未保存，确定放弃修改吗？', '放弃修改', {
          type: 'warning',
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
        });
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') EMessage.error(error);
        return;
      }
    }
    visible.value = false;
  };

  const save = async (): Promise<void> => {
    if (!canSave.value) return;
    submitting.value = true;
    const target = original.value;
    try {
      const name = supplierName.value.trim();
      if (target) {
        await procurementApi.updateSupplier(target.id, {
          supplierName: name,
          version: target.version,
        });
      } else {
        await procurementApi.createSupplier({ supplierName: name });
      }
      if (disposed) return;
      visible.value = false;
      EMessage.success(target ? '供应商名称已更新' : '供应商已新增');
      await onSaved();
    } catch (error) {
      if (disposed) return;
      if (
        error instanceof RequestError &&
        error.code === CONCURRENCY_ERROR_CODES.concurrentModification
      ) {
        stale.value = true;
        await onSaved();
      }
      EMessage.error(error, '供应商保存失败');
    } finally {
      if (!disposed) submitting.value = false;
    }
  };

  return {
    visible,
    supplierName,
    original,
    submitting,
    stale,
    canSave,
    openCreate,
    openEdit,
    observeRows,
    close,
    save,
  };
}
