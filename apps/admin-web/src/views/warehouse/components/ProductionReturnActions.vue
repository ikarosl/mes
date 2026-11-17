<template>
  <el-dialog
    v-model="createVisible"
    title="创建生产退料单"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    :before-close="beforeCreateClose"
  >
    <div class="dialog-body">
      <el-alert
        title="退料不会产生或恢复物料需求"
        description="仅用于现场多余物料或订单中途关闭后的余料回仓，确认后进入公共可用库存。物料损坏或丢失请申报生产领料损耗；确需额外领料请创建人工追加需求。"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-form
        :disabled="submitting"
        class="create-form"
        label-width="100px"
      >
        <el-form-item
          label="生产批次"
          required
        >
          <el-select
            v-model="form.productionBatchId"
            filterable
            placeholder="选择存在已确认领料的生产批次"
            :loading="optionsLoading"
            @change="batchChanged"
            @visible-change="refreshOptions"
          >
            <el-option
              v-for="option in batchOptions"
              :key="option.productionBatchId"
              :label="`${option.batchNo} · ${option.workOrderNo} · ${option.productCode}`"
              :value="option.productionBatchId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="物料去向">
          <span class="return-destination">物料将退回原库存批次，成为公共可用库存。</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            maxlength="5000"
          />
        </el-form-item>
      </el-form>
      <div class="detail-heading">
        <strong>选择退料明细</strong>
        <span class="secondary-cell">可退数量 = 已确认领料 − 已占用退料 − 损耗占用</span>
      </div>
      <p class="return-limit-note">
        损耗占用包含待确认和已确认的领料损耗。待确认损耗取消后释放占用；已确认损耗永久扣减本来源的可退上限，关闭补料需求不会恢复额度。待确认退料单同样占用可退数量。
      </p>
      <el-table
        v-loading="candidatesLoading"
        :data="candidates"
        class="detail-table"
        empty-text="当前批次暂无可退物料"
      >
        <el-table-column
          label="选择"
          width="64"
          align="center"
        >
          <template #default="{ row }"
            ><el-checkbox
              v-model="row.selected"
              :disabled="submitting"
          /></template>
        </el-table-column>
        <el-table-column
          label="物料"
          min-width="210"
        >
          <template #default="{ row }">
            <div class="primary-cell">{{ row.itemCode }} · {{ row.itemName }}</div>
            <div class="variant-cell">版本 {{ row.materialVariantCode }}</div>
            <div class="secondary-cell">库存批次 {{ row.batchCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="已确认领料"
          width="120"
          align="right"
        >
          <template #default="{ row }"
            >{{ quantity(row.confirmedOutboundQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="已占用退料"
          width="120"
          align="right"
        >
          <template #default="{ row }"
            >{{ quantity(row.occupiedReturnQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="损耗占用"
          width="120"
          align="right"
        >
          <template #default="{ row }"
            >{{ quantity(row.occupiedLossQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="本次退料"
          width="180"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.returnQuantity"
              :disabled="submitting || !row.selected"
              :min="1"
              :max="Number(row.returnableQuantity)"
              :step="1"
              :precision="0"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="可退数量"
          width="120"
          align="right"
        >
          <template #default="{ row }"
            >{{ quantity(row.returnableQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button @click="closeCreate">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="submitCreate"
        >保存退料单</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { onScopeDispose, reactive, ref, watch } from 'vue';
import type {
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
} from '@company/contracts';
import { warehouseApi } from '../../../api/warehouse';
import { useTabsStore } from '../../../stores/tabs';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
defineOptions({ name: 'ProductionReturnActions' });
const props = defineProps<{ tabName: string }>();
const emit = defineEmits<{ changed: [] }>();
type CandidateRow = ReturnOrderCandidateItem & { selected: boolean; returnQuantity: number };
const createVisible = ref(false),
  submitting = ref(false),
  optionsLoading = ref(false),
  candidatesLoading = ref(false),
  pendingAction = ref('');
const batchOptions = ref<ReturnOrderBatchOption[]>([]),
  candidates = ref<CandidateRow[]>([]);
const form = reactive({ productionBatchId: '', remark: '' });
const actionReading = ref(false);
const optionRead = useLatestReadRequest(() => {
  optionsLoading.value = false;
});
const candidateRead = useLatestReadRequest(() => {
  candidatesLoading.value = false;
});
const actionRead = useLatestReadRequest(() => {
  actionReading.value = false;
});
async function refreshOptions(visible = true) {
  if (!visible || !createVisible.value || !optionRead.isActive()) return;
  const current = optionRead.begin(() => createVisible.value);
  optionsLoading.value = true;
  try {
    const result = await warehouseApi.listReturnBatchOptions(current.signal);
    if (current.isCurrent()) batchOptions.value = result;
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '生产批次候选加载失败');
  } finally {
    if (current.isCurrent()) optionsLoading.value = false;
  }
}
async function batchChanged(batchId: string) {
  candidates.value = [];
  candidateRead.invalidate();
  if (!batchId || !createVisible.value || !candidateRead.isActive()) return;
  const current = candidateRead.begin(
    () => createVisible.value && form.productionBatchId === batchId,
  );
  candidatesLoading.value = true;
  try {
    const result = await warehouseApi.listReturnCandidates(batchId, current.signal);
    if (!current.isCurrent()) return;
    candidates.value = result.map((item) => ({
      ...item,
      selected: false,
      returnQuantity: Number(item.returnableQuantity),
    }));
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '可退物料加载失败');
  } finally {
    if (current.isCurrent()) candidatesLoading.value = false;
  }
}
async function openCreate() {
  if (createVisible.value || submitting.value) return;
  form.productionBatchId = '';
  form.remark = '';
  candidates.value = [];
  createVisible.value = true;
  await refreshOptions();
}
async function submitCreate() {
  if (submitting.value || candidatesLoading.value || !candidateRead.isActive()) return;
  const selected = candidates.value.filter((item) => item.selected);
  if (!form.productionBatchId) return EMessage.warning('请选择生产批次');
  if (!selected.length) return EMessage.warning('请至少选择一条退料明细');
  if (
    selected.some(
      (item) =>
        !Number.isInteger(item.returnQuantity) ||
        item.returnQuantity <= 0 ||
        item.returnQuantity > Number(item.returnableQuantity),
    )
  )
    return EMessage.warning('本次退料数量必须大于零且不能超过可退数量');
  submitting.value = true;
  try {
    await warehouseApi.createReturnOrder({
      productionBatchId: form.productionBatchId,
      remark: form.remark.trim() || null,
      details: selected.map((item) => ({
        allocationId: item.allocationId,
        returnQuantity: item.returnQuantity,
      })),
    });
    createVisible.value = false;
    EMessage.success('退料单已创建');
    emit('changed');
  } catch (error) {
    EMessage.error(error, '退料单创建失败');
  } finally {
    submitting.value = false;
  }
}
async function confirmOrder(row: ReturnOrderItem) {
  try {
    await RouteMessageBox.confirm(
      `确认退回 ${returnSummary(row)}？确认后物料退回原库存批次，增加公共可用库存，不再为原生产任务保留。`,
      '确认生产退料',
      { type: 'warning', confirmButtonText: '确认退料入库' },
    );
    pendingAction.value = `confirm:${row.id}`;
    await warehouseApi.confirmReturnOrder(row.id, row.version);
    EMessage.success('退料已确认，库存流水已生成');
    emit('changed');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '确认退料失败');
  } finally {
    pendingAction.value = '';
  }
}
async function cancelOrder(row: ReturnOrderItem) {
  try {
    const { value } = await RouteMessageBox.prompt(
      `确认取消退料单 ${row.returnNo}？请输入取消原因。`,
      '取消退料单',
      {
        type: 'warning',
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputType: 'textarea',
        inputPlaceholder: '请填写取消原因',
        inputValidator: cancellationReasonValidator,
      },
    );
    pendingAction.value = `cancel:${row.id}`;
    await warehouseApi.cancelReturnOrder(row.id, { version: row.version, reason: value.trim() });
    EMessage.success('退料单已取消');
    emit('changed');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '取消退料单失败');
  } finally {
    pendingAction.value = '';
  }
}

const cancellationReasonValidator = (input: string) =>
  input.trim() ? input.trim().length <= 5000 || '取消原因不能超过 5000 个字符' : '请填写取消原因';
const quantity = (value: string | number): string => Number(value).toFixed(0);
function returnSummary(row: ReturnOrderItem): string {
  const units = new Map<string, number>();
  for (const line of row.details)
    units.set(line.unit, (units.get(line.unit) ?? 0) + Number(line.returnQuantity));
  return [...units].map(([unit, quantity]) => quantity + ' ' + unit).join('；');
}
async function act(kind: 'confirm' | 'cancel', id: string): Promise<void> {
  if (pendingAction.value || actionReading.value || !actionRead.isActive()) return;
  const current = actionRead.begin();
  actionReading.value = true;
  try {
    const row = await warehouseApi.getReturnOrder(id, current.signal);
    if (!current.isCurrent()) return;
    if (kind === 'confirm') await confirmOrder(row);
    else await cancelOrder(row);
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '退料单读取失败');
  } finally {
    if (current.isCurrent()) actionReading.value = false;
  }
}
function hasDraft() {
  return Boolean(
    form.productionBatchId || form.remark.trim() || candidates.value.some((item) => item.selected),
  );
}
async function beforeCreateClose(done: () => void) {
  if (submitting.value) return;
  if (!hasDraft()) return done();
  try {
    await RouteMessageBox.confirm('当前退料单尚未保存，确认放弃？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
    });
    done();
  } catch {
    // 继续编辑。
  }
}
function closeCreate() {
  void beforeCreateClose(() => (createVisible.value = false));
}
watch(createVisible, (visible) => {
  if (!visible) {
    optionRead.invalidate();
    candidateRead.invalidate();
  }
});

onScopeDispose(
  useTabsStore().registerCloseGuard(props.tabName, async () => {
    if (submitting.value || pendingAction.value || actionReading.value) return false;
    if (!createVisible.value || !hasDraft()) return true;
    try {
      await RouteMessageBox.confirm('当前退料单尚未保存，关闭标签将放弃修改。', '放弃修改', {
        type: 'warning',
        confirmButtonText: '放弃修改',
      });
      return true;
    } catch {
      return false;
    }
  }),
);
defineExpose({
  open: openCreate,
  confirm: (id: string) => act('confirm', id),
  cancel: (id: string) => act('cancel', id),
});
</script>
<style scoped>
.return-destination {
  color: var(--el-color-warning-dark-2);
}
.primary-cell {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.secondary-cell,
.variant-cell {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.create-form {
  margin-top: 18px;
}
.detail-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  margin: 18px 0 10px;
}
.return-limit-note {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
.detail-table {
  margin-top: 12px;
}
</style>
