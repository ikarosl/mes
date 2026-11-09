<template>
  <el-dialog
    :model-value="visible"
    title="建卡 / 生成条形码"
    :width="DialogWidth.md"
    :before-close="beforeCreateClose"
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="createContext"
      ><el-descriptions
        :column="2"
        border
        ><el-descriptions-item label="任务">{{ createContext.batchNo }}</el-descriptions-item
        ><el-descriptions-item label="产品">{{
          createContext.productName
        }}</el-descriptions-item></el-descriptions
      ><InlineHint>每张追踪卡对应一盘工件。建卡和打印不登记到站，也不计入产出。</InlineHint
      ><el-alert
        v-if="createRecovery"
        :title="submissionRecoveryMessage(createStatus, '追踪卡列表')"
        type="warning"
        :closable="false" /><el-form
        label-width="100px"
        :disabled="creating || createRecovery"
        class="create-form"
        ><el-form-item
          label="本盘数量"
          required
          ><el-input-number
            v-model="createQuantity"
            :min="1"
            :precision="0" /></el-form-item
        ><el-form-item
          label="建卡登记人"
          required
          ><el-select
            v-model="createPersonnelId"
            filterable
            ><el-option
              v-for="person in personnel"
              :key="person.id"
              :label="`${person.code} / ${person.name}`"
              :value="person.id" /></el-select></el-form-item
        ><el-form-item label="备注"
          ><el-input
            v-model="createRemark"
            type="textarea"
            :rows="3"
            maxlength="1000" /></el-form-item></el-form
    ></template>
    <template #footer
      ><el-button
        :disabled="creating"
        @click="requestClose(false)"
        >取消</el-button
      ><el-button
        type="primary"
        :loading="creating"
        :disabled="createStatus === 'blocked' || createStatus === 'expired'"
        @click="createCard"
        >{{ createRecovery ? '重试本次建卡' : '生成追踪卡与条码' }}</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type {
  PersonnelOption,
  ProductionBatchItem,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import {
  submissionRecoveryMessage,
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  defaultPersonnelId: string;
  personnel: PersonnelOption[];
}>();
const emit = defineEmits<{
  (event: 'update:visible', visible: boolean): void;
  (event: 'created', card: ProductionTrackingCardDetail): void;
}>();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
const creating = ref(false);
const createContext = ref<ProductionBatchItem | null>(null);
const createQuantity = ref(1);
const createPersonnelId = ref('');
const createRemark = ref('');
const createIntent = useIdempotentIntent('建卡');
const createStatus = ref<IdempotentIntentStatus>('idle');
const createRecovery = computed(() => createStatus.value !== 'idle');
let createSignature = '';
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    createContext.value = props.batch ? { ...props.batch } : null;
    createQuantity.value = 1;
    createPersonnelId.value = props.defaultPersonnelId;
    createRemark.value = '';
    createIntent.reset();
    createStatus.value = 'idle';
    createSignature = JSON.stringify([
      createQuantity.value,
      createPersonnelId.value,
      createRemark.value,
    ]);
  },
);
async function allowClose(): Promise<boolean> {
  if (creating.value) return false;
  if (!props.visible) return true;
  if (
    !createRecovery.value &&
    createSignature ===
      JSON.stringify([createQuantity.value, createPersonnelId.value, createRemark.value])
  )
    return true;
  try {
    await RouteMessageBox.confirm(
      createRecovery.value
        ? '建卡提交结果尚未确认，请先核对追踪卡列表。确认放弃后关闭？'
        : '本次建卡填写尚未保存，确认放弃？',
      '关闭确认',
      { type: 'warning' },
    );
    createIntent.reset();
    createStatus.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function requestClose(visible: boolean): Promise<void> {
  if (!visible && (await allowClose())) emit('update:visible', false);
}
async function beforeCreateClose(done: () => void): Promise<void> {
  if (await allowClose()) done();
}
async function createCard(): Promise<void> {
  const batch = createContext.value;
  if (!batch || creating.value || !active.value) return;
  if (!createPersonnelId.value) {
    EMessage.warning('请选择建卡登记人');
    return;
  }
  const data = {
    quantity: createQuantity.value,
    personnelId: createPersonnelId.value,
    remark: createRemark.value.trim() || null,
  };
  creating.value = true;
  try {
    const result = await createIntent.execute(
      {
        intentType: 'production.tracking.create',
        params: { batchId: batch.id },
        query: {},
        body: data,
      },
      (key) => productionTrackingApi.create(batch.id, data, key),
    );
    emit('created', result);
    emit('update:visible', false);
    EMessage.success('追踪卡已生成，可打印标签后扫码到站');
  } catch (error) {
    EMessage.error(error, '建卡失败');
  } finally {
    createStatus.value = createIntent.getStatus();
    creating.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard('production-workbench', allowClose);
onScopeDispose(unregister);
</script>

<style scoped>
.create-form {
  margin-top: 20px;
}
</style>
