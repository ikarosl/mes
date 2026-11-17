<template>
  <div>
    <el-dialog
      v-model="visible"
      title="选择成品入库来源"
      :width="DialogWidth.workbench"
      workbench
    >
      <FinishedGoodsOutputPanel
        ref="picker"
        @select="selectBatch"
      />
      <template #footer><el-button @click="visible = false">关闭</el-button></template>
    </el-dialog>
    <TaskOutputDialog
      v-model:visible="inboundVisible"
      :batch="batch"
      :route-name="tabName"
      @changed="changed"
    />
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { DialogWidth } from '../../../utils/dialog';
import { TaskOutputDialog } from '../../production/public';
import FinishedGoodsOutputPanel from './FinishedGoodsOutputPanel.vue';
defineOptions({ name: 'FinishedGoodsInboundCreateDialog' });
defineProps<{ tabName: string }>();
const visible = ref(false),
  inboundVisible = ref(false);
const batch = ref<{ id: string } | null>(null);
const picker = ref<InstanceType<typeof FinishedGoodsOutputPanel> | null>(null);
const emit = defineEmits<{ changed: [] }>();
let opened = false;
async function open(): Promise<void> {
  visible.value = true;
  await nextTick();
  if (opened) await picker.value?.refresh();
  opened = true;
}
function selectBatch(id: string): void {
  batch.value = { id };
  inboundVisible.value = true;
}
async function changed(): Promise<void> {
  emit('changed');
  await picker.value?.refresh();
}
defineExpose({ open });
</script>
