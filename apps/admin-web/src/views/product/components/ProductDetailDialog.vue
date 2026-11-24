<template>
  <el-dialog
    :model-value="visible"
    title="产品详情"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="row">
      <el-descriptions
        :column="2"
        :label-width="100"
        border
        class="product-summary"
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
        <el-descriptions-item label="BOM 状态">{{ bomStatusLabel(row) }}</el-descriptions-item>
        <el-descriptions-item
          label="状态"
          :span="2"
          >{{ row.status === 1 ? '启用' : '停用' }}</el-descriptions-item
        >
        <el-descriptions-item
          label="规格书"
          :span="2"
        >
          <SpecificationFileList
            :files="row.specificationFiles"
            :active="visible"
          />
        </el-descriptions-item>
        <el-descriptions-item
          label="备注"
          :span="2"
          >{{ row.remark || '-' }}</el-descriptions-item
        >
      </el-descriptions>
      <section
        class="product-specs"
        aria-label="规格参数"
      >
        <h3>规格参数</h3>
        <JsonTableEditor
          :model-value="row.specValues"
          readonly
        />
      </section>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { PRODUCT_BOM_STATUS_LABELS } from '@company/constants';
import type { ProductItemKind, ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import SpecificationFileList from './SpecificationFileList.vue';

defineProps<{
  visible: boolean;
  row: ProductListItem | null;
  itemKindLabel: (kind: ProductItemKind) => string;
  acquireMethodLabels: Record<string, string>;
}>();
defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const bomStatusLabel = (row: ProductListItem): string => {
  if (row.bomStatus === 'approved' || row.bomLockedAt) {
    return `已永久锁定（${row.bomLockedAt ? formatDateTimeForDisplay(row.bomLockedAt) : '已批准'}${row.bomLockedById ? `，操作人 ID ${row.bomLockedById}` : ''}）`;
  }
  if (row.bomStatus === 'pending_approval') return '审批中，暂不可编辑';
  return `${PRODUCT_BOM_STATUS_LABELS.draft}，可编辑`;
};
</script>

<style scoped>
.product-summary {
  overflow-wrap: anywhere;
}
.product-summary :deep(.el-descriptions__table) {
  table-layout: fixed;
}
.product-specs {
  margin-top: 16px;
}
.product-specs h3 {
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
</style>
