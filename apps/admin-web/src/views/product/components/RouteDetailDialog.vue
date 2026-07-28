<template>
  <el-dialog
    :model-value="visible"
    title="工艺路线详情"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="row"
      :column="2"
      border
    >
      <el-descriptions-item label="路线编号">{{ row.routeCode }}</el-descriptions-item>
      <el-descriptions-item label="路线名称">{{ row.routeName }}</el-descriptions-item>
      <el-descriptions-item label="适用产品">{{
        row.itemCode && row.productName ? `${row.itemCode} / ${row.productName}` : '-'
      }}</el-descriptions-item>
      <el-descriptions-item label="版本">{{ row.versionNo || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ routeStatusLabel(row.status) }}</el-descriptions-item>
      <el-descriptions-item label="备注">{{ row.remark || '-' }}</el-descriptions-item>
    </el-descriptions>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ProcessRouteListItem, ProcessRouteStatus } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

defineProps<{
  visible: boolean;
  row: ProcessRouteListItem | null;
  routeStatusLabel: (status: ProcessRouteStatus) => string;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();
</script>
