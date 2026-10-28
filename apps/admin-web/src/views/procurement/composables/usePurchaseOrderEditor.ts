import { computed, ref } from 'vue';
import type {
  CreatePurchaseOrderPayload,
  MaterialOption,
  MaterialVariantItem,
  ProcurementDemandCandidate,
  ProcurementDemandWorkOrder,
  PurchaseOrderDetail,
  PurchaseOrderLineSource,
  PurchaseOrderSourceType,
  UpdatePurchaseOrderPayload,
} from '@company/contracts';
import {
  CONCURRENCY_ERROR_CODES,
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_DEMANDS,
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
} from '@company/constants';
import { RequestError } from '@company/request';
import { procurementApi } from '../../../api/procurement';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export interface PurchaseDraftRow {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  plannedQuantity: number | undefined;
  taxExclusiveAmount: string;
  taxInclusiveAmount: string;
  sources: PurchaseOrderLineSource[];
  ready: boolean;
}
const identity = (row: { itemId: string; materialVariantId: string }): string =>
  `${row.itemId}:${row.materialVariantId}`;

export function usePurchaseOrderEditor(onSaved: (id: string) => void | Promise<void>) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false),
    freshnessError = ref(false),
    pickerVisible = ref(false);
  const sourceType = ref<PurchaseOrderSourceType>('demand'),
    workOrderId = ref(''),
    workOrderNo = ref(''),
    workOrderPickerVisible = ref(false),
    sourceRowKey = ref<string | null>(null),
    supplierId = ref(''),
    supplierName = ref(''),
    supplierReady = ref(false),
    supplierRefreshToken = ref(0),
    remark = ref('');
  const original = ref<PurchaseOrderDetail | null>(null),
    rows = ref<PurchaseDraftRow[]>([]);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand(async (result) => {
    visible.value = false;
    await onSaved(result.purchaseOrderId);
  });
  const supplement = computed(() => Boolean(original.value?.supplementReason));
  const selectedIds = computed(() => [
    ...new Set(rows.value.flatMap((row) => row.sources.map((source) => source.demandId))),
  ]);
  const snapshot = (): string =>
    JSON.stringify({
      sourceType: sourceType.value,
      workOrderId: workOrderId.value,
      supplierId: supplierId.value,
      remark: remark.value.trim(),
      rows: rows.value.map((row) => ({
        itemId: row.itemId,
        materialVariantId: row.materialVariantId,
        plannedQuantity: row.plannedQuantity,
        taxExclusiveAmount: row.taxExclusiveAmount.trim(),
        taxInclusiveAmount: row.taxInclusiveAmount.trim(),
        demandIds: row.sources.map((source) => source.demandId),
      })),
    });
  let initialSnapshot = '';
  let rowSequence = 0;
  const dirty = computed(() => snapshot() !== initialSnapshot);
  const canSave = computed(
    () =>
      !loading.value &&
      !command.locked.value &&
      !stale.value &&
      !freshnessError.value &&
      Boolean(supplierId.value) &&
      supplierReady.value &&
      (sourceType.value === 'stock' || Boolean(workOrderId.value)) &&
      rows.value.reduce((count, row) => count + row.sources.length, 0) <=
        PURCHASE_ORDER_MAX_DEMANDS &&
      rows.value.length > 0 &&
      rows.value.every(
        (row) =>
          row.ready &&
          (sourceType.value === 'stock' || row.sources.length > 0) &&
          row.itemId &&
          row.materialVariantId &&
          row.taxExclusiveAmount.trim().length <= PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH &&
          row.taxInclusiveAmount.trim().length <= PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH &&
          Number.isInteger(row.plannedQuantity) &&
          Number(row.plannedQuantity) > 0 &&
          Number(row.plannedQuantity) <= PURCHASE_ORDER_MAX_QUANTITY,
      ),
  );

  const sourceCount = computed(() =>
    rows.value.reduce((count, row) => count + row.sources.length, 0),
  );
  const sourceRow = computed(() => rows.value.find((row) => row.key === sourceRowKey.value));
  const pickerSelectedIds = computed(
    () => sourceRow.value?.sources.map((source) => source.demandId) ?? [],
  );
  const pickerAlreadyAddedIds = computed(() =>
    sourceRowKey.value === null ? selectedIds.value : [],
  );
  const pickerOtherRowIds = computed(() =>
    sourceRowKey.value === null
      ? []
      : [
          ...new Set(
            rows.value
              .filter((row) => row.key !== sourceRowKey.value)
              .flatMap((row) => row.sources.map((source) => source.demandId)),
          ),
        ],
  );
  const demandSource = (demand: ProcurementDemandCandidate): PurchaseOrderLineSource => ({
    demandId: demand.demandId,
    workOrderId: demand.workOrderId,
    workOrderNo: demand.workOrderNo,
    productionBatchId: demand.productionBatchId,
    batchNo: demand.batchNo,
    demandQuantity: demand.demandQuantity,
    remainingDemandQuantity: demand.remainingDemandQuantity,
    supplierHint: demand.supplierHint,
  });
  const adoptDemands = (demands: ProcurementDemandCandidate[]): void => {
    if (
      !visible.value ||
      command.locked.value ||
      supplement.value ||
      sourceType.value !== 'demand' ||
      !demands.length
    )
      return;
    if (new Set(demands.map((demand) => demand.demandId)).size !== demands.length) {
      EMessage.warning('所选需求有重复，请重新核对');
      return;
    }
    if (demands.some((demand) => demand.workOrderId !== workOrderId.value)) {
      EMessage.warning('需求必须属于所选工单');
      return;
    }
    const editing = sourceRow.value;
    if (sourceRowKey.value !== null && !editing) {
      EMessage.warning('当前采购行已移除，请重新选择关联需求');
      return;
    }
    if (!editing && demands.some((demand) => selectedIds.value.includes(demand.demandId))) {
      EMessage.warning('部分需求已添加，请移除重复选择');
      return;
    }
    if (
      sourceCount.value - (editing?.sources.length ?? 0) + demands.length >
      PURCHASE_ORDER_MAX_DEMANDS
    ) {
      EMessage.warning('单张采购单最多 100 条来源映射，请另建采购单');
      return;
    }
    if (editing) {
      if (demands.some((demand) => identity(demand) !== identity(editing))) {
        EMessage.warning('本行来源须与采购物料及精确版本一致');
        return;
      }
      editing.sources = demands.map(demandSource);
      editing.ready = true;
    } else {
      const grouped = new Map(
        rows.value.map((row) => [identity(row), { ...row, sources: [...row.sources] }]),
      );
      for (const demand of demands) {
        const key = identity(demand);
        let row = grouped.get(key);
        if (!row) {
          row = {
            key: `new-${++rowSequence}`,
            itemId: demand.itemId,
            itemCode: demand.itemCode,
            itemName: demand.itemName,
            materialVariantId: demand.materialVariantId,
            materialVariantCode: demand.materialVariantCode,
            unit: demand.unit,
            plannedQuantity: undefined,
            taxExclusiveAmount: '',
            taxInclusiveAmount: '',
            sources: [],
            ready: true,
          };
          grouped.set(key, row);
        }
        row.sources.push(demandSource(demand));
      }
      if (grouped.size > PURCHASE_ORDER_MAX_LINES) {
        EMessage.warning('一张采购单最多 100 条物料行');
        return;
      }
      rows.value = [...grouped.values()];
    }
    if (demands[0]) workOrderNo.value = demands[0].workOrderNo;
    pickerVisible.value = false;
  };
  const selectSources = (row?: PurchaseDraftRow): void => {
    if (
      !visible.value ||
      loading.value ||
      command.locked.value ||
      supplement.value ||
      sourceType.value !== 'demand' ||
      !workOrderId.value
    )
      return;
    sourceRowKey.value = row?.key ?? null;
    pickerVisible.value = true;
  };
  const selectWorkOrder = async (order: ProcurementDemandWorkOrder): Promise<void> => {
    if (command.locked.value || supplement.value) return;
    if (order.id !== workOrderId.value && rows.value.length) {
      try {
        await RouteMessageBox.confirm(
          '切换工单将清空原需求和采购明细，请重新填写采购量与金额。确定继续吗？',
          '切换需求工单',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    if (order.id !== workOrderId.value) {
      rows.value = [];
      sourceRowKey.value = null;
      pickerVisible.value = false;
      read.invalidate();
    }
    workOrderId.value = order.id;
    workOrderNo.value = order.workOrderNo;
    workOrderPickerVisible.value = false;
  };
  const resolveSources = async (): Promise<boolean> => {
    if (sourceType.value !== 'demand' || supplement.value) return true;
    const ids = selectedIds.value;
    if (!ids.length) return false;
    const current = read.begin(() => visible.value);
    loading.value = true;
    try {
      const resolved = await procurementApi.resolveDemands(workOrderId.value, ids, current.signal);
      if (!current.isCurrent()) return false;
      for (const row of rows.value)
        row.ready = row.sources.every((source) =>
          resolved.some(
            (entry) =>
              entry.demandId === source.demandId &&
              entry.eligible &&
              entry.demand?.itemId === row.itemId &&
              entry.demand.materialVariantId === row.materialVariantId,
          ),
        );
      if (resolved.length !== ids.length || rows.value.some((row) => !row.ready)) {
        EMessage.warning('部分来源需求已变化，请重新选择需求并核对当前资格');
        return false;
      }
      return true;
    } catch (error) {
      if (current.isCurrent()) {
        freshnessError.value = true;
        EMessage.error(error, '需求来源核对失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const checkOriginal = async (): Promise<boolean> => {
    const target = original.value;
    if (!target) return true;
    const current = read.begin(() => visible.value && original.value?.id === target.id);
    loading.value = true;
    try {
      const latest = await procurementApi.getOrder(target.id, current.signal);
      if (!current.isCurrent()) return false;
      stale.value = latest.version !== target.version || latest.status !== 'draft';
      freshnessError.value = false;
      return !stale.value;
    } catch (error) {
      if (current.isCurrent()) {
        freshnessError.value = true;
        EMessage.error(error, '采购草稿依据刷新失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const refresh = async (): Promise<void> => {
    supplierRefreshToken.value += 1;
    if (await checkOriginal()) {
      freshnessError.value = false;
      await resolveSources();
    }
  };
  const open = async (
    type: PurchaseOrderSourceType,
    detail?: PurchaseOrderDetail,
    demandIds?: string[],
    targetWorkOrderId?: string,
  ): Promise<void> => {
    if (visible.value || command.locked.value) return;
    original.value = detail ?? null;
    sourceType.value = detail?.sourceType ?? type;
    workOrderId.value = detail?.workOrderId ?? targetWorkOrderId ?? '';
    workOrderNo.value = detail?.workOrderNo ?? targetWorkOrderId ?? '';
    sourceRowKey.value = null;
    workOrderPickerVisible.value = false;
    remark.value = detail?.remark ?? '';
    supplierId.value = detail?.supplierId ?? '';
    supplierName.value = detail?.supplierName ?? '';
    supplierReady.value = Boolean(detail?.supplementReason);
    stale.value = false;
    freshnessError.value = false;
    rows.value =
      detail?.items.map((line) => ({
        key: line.id,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        materialVariantId: line.materialVariantId,
        materialVariantCode: line.materialVariantCode,
        unit: line.unit,
        plannedQuantity: Number(line.plannedQuantity),
        taxExclusiveAmount: line.taxExclusiveAmount ?? '',
        taxInclusiveAmount: line.taxInclusiveAmount ?? '',
        sources: line.sources.map((source) => ({ ...source })),
        ready: Boolean(detail.supplementReason),
      })) ?? [];
    initialSnapshot = snapshot();
    visible.value = true;
    supplierRefreshToken.value += 1;
    if (demandIds?.length && workOrderId.value) {
      const current = read.begin(() => visible.value);
      loading.value = true;
      try {
        const result = await procurementApi.resolveDemands(
          workOrderId.value,
          demandIds,
          current.signal,
        );
        if (current.isCurrent()) {
          if (
            result.length === demandIds.length &&
            result.every((entry) => entry.eligible && entry.demand)
          )
            adoptDemands(result.flatMap((entry) => (entry.demand ? [entry.demand] : [])));
          else
            EMessage.warning(
              result.find((entry) => !entry.eligible)?.blockedReason ??
                '该需求当前不可采购，请重新选择',
            );
        }
      } catch (error) {
        if (current.isCurrent()) EMessage.error(error, '来源需求解析失败');
      } finally {
        if (current.isCurrent()) loading.value = false;
      }
    } else if (sourceType.value === 'demand' && !workOrderId.value) {
      workOrderPickerVisible.value = true;
    } else if (sourceType.value === 'demand' && detail) {
      await resolveSources();
    }
  };
  const addRow = (): void => {
    if (rows.value.length >= PURCHASE_ORDER_MAX_LINES) {
      EMessage.warning(`一张采购单最多 ${PURCHASE_ORDER_MAX_LINES} 行`);
      return;
    }
    rows.value.push({
      key: `new-${++rowSequence}`,
      itemId: '',
      itemCode: '',
      itemName: '',
      materialVariantId: '',
      materialVariantCode: '',
      unit: '',
      plannedQuantity: undefined,
      taxExclusiveAmount: '',
      taxInclusiveAmount: '',
      sources: [],
      ready: false,
    });
  };
  const changeMaterial = (
    row: PurchaseDraftRow,
    item?: MaterialOption,
    variant?: MaterialVariantItem,
  ): void => {
    if (
      item &&
      variant &&
      rows.value.some(
        (other) =>
          other.key !== row.key &&
          other.itemId === item.id &&
          other.materialVariantId === variant.id,
      )
    ) {
      EMessage.warning('相同物料及精确版本只能保留一行，请在已有明细填写采购量与金额');
      return;
    }
    row.itemId = item?.id ?? '';
    row.itemCode = item?.materialCode ?? '';
    row.itemName = item?.materialName ?? '';
    row.unit = item?.unit ?? '';
    row.materialVariantId = variant?.id ?? '';
    row.materialVariantCode = variant?.variantCode ?? '';
    row.ready = false;
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(dirty.value))) return false;
    visible.value = false;
    pickerVisible.value = false;
    workOrderPickerVisible.value = false;
    read.invalidate();
    return true;
  };
  const save = async (): Promise<void> => {
    if (!canSave.value || !(await checkOriginal()) || !(await resolveSources())) return;
    if (new Set(rows.value.map(identity)).size !== rows.value.length) {
      EMessage.warning('相同物料及精确版本请合并为一行；不同供应商请另建采购单');
      return;
    }
    const body: CreatePurchaseOrderPayload = {
      supplierId: supplierId.value,
      workOrderId: sourceType.value === 'demand' ? workOrderId.value : null,
      sourceType: sourceType.value,
      remark: remark.value.trim() || null,
      items: rows.value.map((row) => ({
        itemId: row.itemId,
        materialVariantId: row.materialVariantId,
        plannedQuantity: Number(row.plannedQuantity),
        taxExclusiveAmount: row.taxExclusiveAmount.trim() || null,
        taxInclusiveAmount: row.taxInclusiveAmount.trim() || null,
        demandIds: row.sources.map((source) => source.demandId),
      })),
    };
    const target = original.value;
    const payload: CreatePurchaseOrderPayload | UpdatePurchaseOrderPayload = target
      ? { ...body, version: target.version }
      : body;
    await command.run(
      {
        intentType: target ? 'procurement.order.update' : 'procurement.order.create',
        params: target ? { id: target.id } : {},
        query: {},
        body: payload,
      },
      async (key) => {
        try {
          return target
            ? await procurementApi.updateOrder(
                target.id,
                payload as UpdatePurchaseOrderPayload,
                key,
              )
            : await procurementApi.createOrder(payload, key);
        } catch (error) {
          if (
            error instanceof RequestError &&
            error.code === CONCURRENCY_ERROR_CODES.concurrentModification
          )
            stale.value = true;
          throw error;
        }
      },
      target ? '采购草稿已保存' : '采购草稿已创建',
    );
  };
  return {
    visible,
    loading,
    stale,
    freshnessError,
    pickerVisible,
    sourceType,
    workOrderId,
    workOrderNo,
    workOrderPickerVisible,
    sourceRow,
    pickerSelectedIds,
    pickerAlreadyAddedIds,
    pickerOtherRowIds,
    supplierRefreshToken,
    supplierId,
    supplierName,
    supplierReady,
    selectWorkOrder,
    selectSources,
    remark,
    original,
    rows,
    command,
    supplement,
    selectedIds,
    canSave,
    open,
    close,
    save,
    refresh,
    adoptDemands,
    addRow,
    changeMaterial,
  };
}
