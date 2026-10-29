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
      <el-descriptions-item label="BOM 状态">{{ bomStatusLabel(row) }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{
        row.status === 1 ? '启用' : '停用'
      }}</el-descriptions-item>
      <el-descriptions-item
        label="规格参数"
        :span="2"
      >
        <JsonTableEditor
          :model-value="row.specValues"
          readonly
        />
      </el-descriptions-item>
      <el-descriptions-item
        label="规格书"
        :span="2"
      >
        <div
          v-if="row.specificationFile"
          class="file-attachment"
        >
          <span>{{ row.specificationFile.originalName }}</span>
          <el-button
            v-if="canPreviewFile(row.specificationFile.originalName)"
            link
            type="primary"
            :loading="fileActions.pendingAction.value === 'preview'"
            :disabled="Boolean(fileActions.pendingAction.value)"
            @click="fileActions.preview"
            >预览</el-button
          >
          <el-button
            link
            type="primary"
            :loading="fileActions.pendingAction.value === 'download'"
            :disabled="Boolean(fileActions.pendingAction.value)"
            @click="fileActions.download"
            >下载</el-button
          >
        </div>
        <span v-else>未上传规格书</span>
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
import { PRODUCT_BOM_STATUS_LABELS } from '@company/constants';
import type { ProductItemKind, ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { canPreviewFile } from '../../../utils/file-preview';
import { useTechnicalFileActions } from '../../../composables/useTechnicalFileActions';

const props = defineProps<{
  visible: boolean;
  row: ProductListItem | null;
  itemKindLabel: (kind: ProductItemKind) => string;
  acquireMethodLabels: Record<string, string>;
}>();
const fileActions = useTechnicalFileActions(
  () => props.row?.specificationFile ?? null,
  () => props.visible,
);

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
.file-attachment {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  overflow-wrap: anywhere;
}
.file-attachment .el-button {
  margin: 0;
}
</style>
