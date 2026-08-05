<template>
  <el-dialog
    :model-value="visible"
    title="工序详情"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="detailRow"
      :column="2"
      border
    >
      <el-descriptions-item label="工序编码">{{ detailRow.stepCode }}</el-descriptions-item>
      <el-descriptions-item label="工序名称">{{ detailRow.stepName }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{
        detailRow.status === 1 ? '启用' : '停用'
      }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ detailRow.updatedAt || '-' }}</el-descriptions-item>
      <el-descriptions-item
        label="工序说明"
        :span="2"
        >{{ detailRow.description || '-' }}</el-descriptions-item
      >
      <el-descriptions-item
        label="技术文件"
        :span="2"
      >
        <span v-if="detailRow.sopFileName">{{ detailRow.sopFileName }}</span
        ><span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="备注"
        :span="2"
        >{{ detailRow.remark || '-' }}</el-descriptions-item
      >
    </el-descriptions>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ProcessStepListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

defineProps<{
  visible: boolean;
  detailRow: ProcessStepListItem | null;
}>();
defineEmits<{ (e: 'update:visible', val: boolean): void }>();
</script>
