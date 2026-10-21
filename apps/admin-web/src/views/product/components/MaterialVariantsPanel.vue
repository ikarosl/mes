<template>
  <div
    v-loading="loading"
    class="material-variants-panel"
    :aria-busy="loading"
  >
    <div
      v-if="loading"
      class="loading-placeholder"
      role="status"
    >
      正在加载物料版本…
    </div>
    <div v-else-if="errorMessage">
      <el-alert
        title="物料版本加载失败"
        :description="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
      <el-button
        class="retry-button"
        @click="load"
        >重新加载</el-button
      >
    </div>
    <el-table
      v-else
      :data="variants"
      class="nested-table"
      empty-text="暂无物料版本"
    >
      <el-table-column
        prop="variantCode"
        label="完整版本编码"
        min-width="240"
      /><el-table-column
        prop="majorVersion"
        label="大版本"
        width="120"
      /><el-table-column
        prop="minorVersion"
        label="小版本"
        width="120"
      />
      <el-table-column
        label="状态"
        width="100"
        ><template #default="{ row }"
          ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
            row.status === 1 ? '启用' : '停用'
          }}</el-tag></template
        ></el-table-column
      >
      <el-table-column
        prop="remark"
        label="备注"
        min-width="180"
        ><template #default="{ row }">{{ row.remark || '—' }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="110"
        ><template #default="{ row }"
          ><el-button
            v-if="canChangeStatus"
            link
            :type="row.status === 1 ? 'danger' : 'success'"
            @click="$emit('change-status', row)"
            >{{ row.status === 1 ? '停用' : '启用' }}</el-button
          ></template
        ></el-table-column
      >
    </el-table>
  </div>
</template>

<script setup lang="ts">
import type { MaterialVariantItem } from '@company/contracts';
import { useMaterialVariants } from '../composables/useMaterialVariants';

const props = defineProps<{
  materialId: string;
  snapshotRevision: number;
  canChangeStatus: boolean;
}>();
defineEmits<{ (event: 'change-status', variant: MaterialVariantItem): void }>();

const { variants, loading, errorMessage, load } = useMaterialVariants(
  () => props.materialId,
  () => props.snapshotRevision,
);
</script>

<style scoped>
.loading-placeholder {
  min-height: 120px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 20px;
  color: var(--el-text-color-secondary);
}
.retry-button {
  margin-top: 12px;
}
.nested-table {
  border-radius: 6px;
}
.nested-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
</style>
