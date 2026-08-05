<template>
  <el-dialog
    :model-value="visible"
    title="分类详情"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="detailRow"
      :column="2"
      border
    >
      <el-descriptions-item label="分类编码">{{ detailRow.categoryCode }}</el-descriptions-item>
      <el-descriptions-item label="分类名称">{{ detailRow.categoryName }}</el-descriptions-item>
      <el-descriptions-item label="对象类型">{{
        itemKindLabels[detailRow.itemKind]
      }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{
        detailRow.status === 1 ? '启用' : '停用'
      }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ detailRow.updatedAt || '-' }}</el-descriptions-item>
      <el-descriptions-item
        label="备注"
        :span="2"
        >{{ detailRow.remark || '-' }}</el-descriptions-item
      >
    </el-descriptions>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ProductCategoryListItem, ProductItemKind } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

defineProps<{
  visible: boolean;
  detailRow: ProductCategoryListItem | null;
  itemKindLabels: Record<ProductItemKind, string>;
}>();
defineEmits<{ (e: 'update:visible', val: boolean): void }>();
</script>
