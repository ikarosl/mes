import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { WorkOrderMaterialConfiguration } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

export function useWorkOrderMaterialConfiguration(
  visible: Ref<boolean>,
  workOrderId: Ref<string | null>,
  close: () => void,
  saved: () => void,
) {
  const detail = ref<WorkOrderMaterialConfiguration | null>(null);
  const selections = ref<Record<string, string>>({});
  const reason = ref('');
  const loading = ref(false);
  const submitting = ref(false);
  const loadFailed = ref(false);
  const stale = ref(false);
  const unresolved = ref(false);
  const intent = useIdempotentIntent('工单物料配置');
  let requestVersion = 0;
  let active = true;
  const dirty = computed(
    () =>
      Boolean(reason.value.trim()) ||
      detail.value?.lines.some(
        (line) => selections.value[line.materialId] !== (line.materialVariantId ?? ''),
      ) === true,
  );
  const canSave = computed(
    () =>
      detail.value?.canConfigure &&
      !loading.value &&
      !loadFailed.value &&
      !stale.value &&
      reason.value.trim().length > 0 &&
      detail.value.lines.length > 0 &&
      detail.value.lines.every((line) =>
        line.variants.some(
          (variant) => variant.materialVariantId === selections.value[line.materialId],
        ),
      ) &&
      detail.value.lines.some(
        (line) => selections.value[line.materialId] !== (line.materialVariantId ?? ''),
      ),
  );

  async function load(preserveDraft = true): Promise<void> {
    const id = workOrderId.value;
    if (!id || !visible.value || !active || submitting.value || unresolved.value) return;
    const version = ++requestVersion;
    loading.value = true;
    const current = () =>
      active && version === requestVersion && visible.value && workOrderId.value === id;
    try {
      const result = await productionApi.getWorkOrderMaterialConfiguration(id);
      if (!current()) return;
      if (result.workOrderId !== id) throw new Error('返回的工单配置不匹配，请重新加载');
      loadFailed.value = false;
      if (preserveDraft && detail.value && detail.value.version !== result.version) {
        stale.value = true;
        return;
      }
      detail.value = result;
      if (!preserveDraft) {
        selections.value = Object.fromEntries(
          result.lines.map((line) => [line.materialId, line.materialVariantId ?? '']),
        );
        reason.value = '';
        stale.value = false;
      }
    } catch (error) {
      if (current()) {
        loadFailed.value = true;
        EMessage.error(error, '工单物料配置加载失败');
      }
    } finally {
      if (current()) loading.value = false;
    }
  }

  async function reload(): Promise<void> {
    if (submitting.value || unresolved.value) return;
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm('重新加载将放弃本次未保存的配置，是否继续？', '重新加载配置');
      } catch {
        return;
      }
    }
    await load(false);
  }

  async function save(): Promise<void> {
    const source = detail.value;
    if (!source || !canSave.value || submitting.value) return;
    const id = source.workOrderId;
    const body = {
      version: source.version,
      reason: reason.value.trim(),
      selections: source.lines.map((line) => ({
        materialId: line.materialId,
        materialVariantId: selections.value[line.materialId]!,
      })),
    };
    submitting.value = true;
    try {
      if (!unresolved.value)
        await RouteMessageBox.confirm(
          '保存后，本工单新生成的任务需求和补料将使用这些精确版本。确认配置无误？',
          '保存物料版本配置',
          { confirmButtonText: '确认保存', cancelButtonText: '返回检查' },
        );
      await intent.execute(
        {
          intentType: 'production.work-order.material-configuration.save',
          params: { workOrderId: id },
          query: {},
          body,
        },
        (key) => productionApi.saveWorkOrderMaterialConfiguration(id, body, key),
      );
      intent.reset();
      EMessage.success('工单物料版本配置已保存');
      saved();
      close();
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') EMessage.error(error, '工单物料配置保存失败');
    } finally {
      submitting.value = false;
      unresolved.value = intent.getStatus() !== 'idle';
    }
  }

  async function requestClose(): Promise<void> {
    if (submitting.value) return;
    if (unresolved.value || dirty.value) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '保存结果尚未确认，请先核对工单配置。确定放弃本次安全重试并关闭？'
            : '存在未保存的物料配置，确定放弃并关闭？',
          '关闭物料配置',
          { confirmButtonText: '放弃并关闭', cancelButtonText: '继续保留' },
        );
      } catch {
        return;
      }
    }
    intent.reset();
    unresolved.value = false;
    close();
  }

  watch(
    [visible, workOrderId],
    ([open, id]) => {
      ++requestVersion;
      loading.value = false;
      if (!open || !id) return;
      detail.value = null;
      selections.value = {};
      reason.value = '';
      stale.value = false;
      loadFailed.value = false;
      void load(false);
    },
    { immediate: true },
  );
  onActivated(() => {
    active = true;
    if (visible.value && !loading.value) void load(detail.value !== null);
  });
  onDeactivated(() => {
    active = false;
    ++requestVersion;
    loading.value = false;
  });
  onScopeDispose(() => {
    active = false;
    ++requestVersion;
  });

  return {
    detail,
    selections,
    reason,
    loading,
    submitting,
    loadFailed,
    stale,
    unresolved,
    canSave,
    load,
    reload,
    save,
    requestClose,
  };
}
