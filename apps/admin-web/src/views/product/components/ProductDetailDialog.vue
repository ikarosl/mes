<template>
  <el-dialog
    :model-value="visible"
    title="产品详情"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="row"
      :column="2"
      border
    >
      <el-descriptions-item label="产品编码">{{ row.itemCode }}</el-descriptions-item>
      <el-descriptions-item label="产品名称">{{ row.productName }}</el-descriptions-item>
      <el-descriptions-item label="对象类型">{{
        itemKindLabel(row.itemKind)
      }}</el-descriptions-item>
      <el-descriptions-item label="产品分类">{{ row.categoryName || '-' }}</el-descriptions-item>
      <el-descriptions-item label="获取方式">{{
        acquireMethodLabels[row.acquireMethod]
      }}</el-descriptions-item>
      <el-descriptions-item label="单位">{{ row.unit }}</el-descriptions-item>
      <el-descriptions-item label="物料清单">{{
        row.materialCount > 0 ? `${row.materialCount} 项` : '未配置'
      }}</el-descriptions-item>
      <el-descriptions-item label="默认路线">{{
        row.defaultRouteName || '未设置'
      }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{
        row.status === 1 ? '启用' : '停用'
      }}</el-descriptions-item>
      <el-descriptions-item
        label="规格参数"
        :span="2"
      >
        <div
          v-if="row.specValues?.length"
          class="spec-tags"
        >
          <el-tag
            v-for="item in row.specValues"
            :key="item.key"
            effect="plain"
            >{{ formatSpecItem(item) }}</el-tag
          >
        </div>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="备注"
        :span="2"
        >{{ row.remark || '-' }}</el-descriptions-item
      >
    </el-descriptions>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ProductItemKind, ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

defineProps<{
  visible: boolean;
  row: ProductListItem | null;
  itemKindLabel: (kind: ProductItemKind) => string;
  acquireMethodLabels: Record<string, string>;
  formatSpecItem: (item: { key: string; value: string; unit?: string }) => string;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();
</script>

<style scoped>
.spec-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
