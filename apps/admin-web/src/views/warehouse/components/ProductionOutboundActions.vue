<template>
  <div>
    <SubmissionRecoveryNotice
      :status="orders.confirmIntentStatus.value"
      :busy="orders.confirmSubmitting.value"
      :records-label="`出库单 ${orders.confirmingNo.value} 的出库记录`"
      allow-restart
      @retry="confirm()"
      @restart="orders.resetConfirmIntent"
    />
    <MaterialOutboundOrderCreateDialog
      ref="createDialog"
      v-model="visible"
      :batch-options="orders.batchOptions.value"
      :candidates="orders.candidates.value"
      :option-loading="orders.optionLoading.value"
      :candidate-loading="orders.candidateLoading.value"
      :submitting="submitting"
      :intent-status="orders.createIntentStatus.value"
      @load-candidates="loadCandidates"
      @reset-intent="orders.resetCreateIntent"
      @resolve-batch="resolveBatch"
      @submit="submit"
      @retry="submit()"
    />
  </div>
</template>
<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CreateMaterialOutboundPayload } from '@company/contracts';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import {
  MaterialOutboundOrderCreateDialog,
  useMaterialOutboundOrders,
} from '../../production/public';
import { useTabsStore } from '../../../stores/tabs';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
defineOptions({ name: 'ProductionOutboundActions' });
const props = defineProps<{ tabName: string }>();
const emit = defineEmits<{ changed: [] }>();
const orders = useMaterialOutboundOrders();
const visible = ref(false),
  submitting = ref(false);
const createDialog = ref<InstanceType<typeof MaterialOutboundOrderCreateDialog> | null>(null);
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
async function open(): Promise<void> {
  if (visible.value || submitting.value) return;
  visible.value = true;
  try {
    await orders.loadBatchOptions();
  } catch (error) {
    EMessage.error(error, '生产批次候选加载失败');
  }
}
async function loadCandidates(id: string): Promise<void> {
  try {
    await orders.loadCandidates(id);
  } catch (error) {
    EMessage.error(error, '待出库分配行加载失败');
  }
}
async function submit(batchId?: string, payload?: CreateMaterialOutboundPayload): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const result = await orders.create(batchId, payload);
    visible.value = false;
    EMessage.success(`${result.outboundNo} 已创建，等待整单确认出库`);
    emit('changed');
  } catch (error) {
    EMessage.error(error, '领料单创建失败');
  } finally {
    submitting.value = false;
  }
}
async function confirm(id?: string): Promise<void> {
  if (orders.confirmSubmitting.value || (id && orders.confirmIntentStatus.value !== 'idle')) return;
  try {
    const row = id ? await orders.loadDetail(id) : undefined;
    if (id && !row) return;
    if (row)
      await RouteMessageBox.confirm(
        `确认整张领料单 ${row.outboundNo}？确认后各明细扣减库存，不能修改或直接取消；库存或分配发生变化时整单失败。`,
        '确认生产领料',
        { type: 'warning', confirmButtonText: '确认整单出库' },
      );
    if (await orders.confirm(row ?? undefined)) {
      EMessage.success('领料已确认，库存流水已生成');
      emit('changed');
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '整单出库确认未完成');
  }
}
async function cancel(id: string): Promise<void> {
  try {
    const row = await orders.loadDetail(id);
    if (!row || row.status !== 'pending_picking') return;
    const { value } = await RouteMessageBox.prompt(
      `取消 ${row.outboundNo} 后保留单据历史，不产生库存流水；请输入取消原因。`,
      '取消领料单',
      {
        inputType: 'textarea',
        inputValidator: (input: string) =>
          input.trim()
            ? input.trim().length <= 5000 || '原因不能超过 5000 个字符'
            : '请填写取消原因',
      },
    );
    await orders.cancel(row, value);
    EMessage.success('领料单已取消');
    emit('changed');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '取消领料单失败');
  }
}
async function resolveBatch(batchNo: string): Promise<void> {
  if (!canAccessRoute({ name: 'production-tasks' })) return;
  visible.value = false;
  await router.push({ name: 'production-tasks', query: { keyword: batchNo } });
}
onScopeDispose(
  useTabsStore().registerCloseGuard(props.tabName, async () => {
    if (submitting.value || orders.pendingKeys.value.size) return false;
    if (visible.value && !(await createDialog.value?.canDiscard())) return false;
    if (orders.confirmIntentStatus.value !== 'idle') {
      try {
        await RouteMessageBox.confirm(
          '请先核对原出库确认结果；关闭标签后将无法继续原请求重试。',
          '放弃未确认出库',
          { type: 'warning', confirmButtonText: '核对后仍要关闭' },
        );
        orders.resetConfirmIntent();
      } catch {
        return false;
      }
    }
    return true;
  }),
);
defineExpose({ open, confirm, cancel });
</script>
