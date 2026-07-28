<template>
  <el-dialog
    :model-value="visible"
    title="配置产品物料清单"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="product">
      <el-alert
        v-if="!localRows.length"
        title="当前产品尚未配置物料清单。生产任务生成物料需求前，需要先维护这里的用料。"
        type="warning"
        :closable="false"
        show-icon
        class="bom-alert"
      />
      <div class="bom-header">
        <div>
          <span class="item-code">{{ product.itemCode }}</span>
          <span class="sub-text">{{ product.productName }}</span>
        </div>
        <div class="bom-actions">
          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="$emit('refresh')"
            >刷新物料</el-button
          >
          <el-button
            type="primary"
            :icon="Plus"
            @click="addRow"
            >添加已有物料</el-button
          >
        </div>
      </div>
      <el-table
        :data="localRows"
        class="material-table"
      >
        <el-table-column
          label="物料"
          min-width="260"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.materialProductId"
              filterable
              placeholder="请选择物料"
            >
              <el-option
                v-for="item in materialOptions"
                :key="item.id"
                :label="`${item.itemCode} / ${item.productName}`"
                :value="item.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="单位"
          width="120"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.unit"
              placeholder="pcs"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="单位用量"
          width="150"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.quantityPerUnit"
              :min="0.0001"
              :precision="4"
              :step="1"
              controls-position="right"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="关键物料"
          width="110"
          align="center"
        >
          <template #default="{ row }"><el-switch v-model="row.isKeyMaterial" /></template>
        </el-table-column>
        <el-table-column
          label="记录批次"
          width="110"
          align="center"
        >
          <template #default="{ row }"><el-switch v-model="row.needBatchRecord" /></template>
        </el-table-column>
        <el-table-column
          label="备注"
          min-width="160"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              placeholder="可选"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          align="center"
        >
          <template #default="{ $index }">
            <el-button
              link
              type="danger"
              @click="removeRow($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存物料清单</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type { ProductListItem, ProductOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

export type MaterialRow = {
  materialProductId: string;
  quantityPerUnit: number;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  product: ProductListItem | null;
  materialOptions: ProductOption[];
  loading: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', rows: MaterialRow[]): void;
  (e: 'refresh'): void;
}>();

const localRows = ref<MaterialRow[]>([]);

const setRows = (initial: MaterialRow[]): void => {
  localRows.value = initial;
};

const addRow = (): void => {
  localRows.value.push({
    materialProductId: '',
    quantityPerUnit: 1,
    unit: props.product?.unit ?? 'pcs',
    isKeyMaterial: true,
    needBatchRecord: true,
    remark: '',
  });
};

const removeRow = (index: number): void => {
  localRows.value.splice(index, 1);
};

const handleSubmit = (): void => {
  if (localRows.value.some((r) => !r.materialProductId)) {
    EMessage.warning('请选择物料');
    return;
  }
  if (new Set(localRows.value.map((r) => r.materialProductId)).size !== localRows.value.length) {
    EMessage.warning('同一物料不能重复添加');
    return;
  }
  emit('save', localRows.value);
};

defineExpose({ setRows });
</script>

<style scoped>
.bom-alert {
  margin-bottom: 14px;
}
.bom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.bom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-code {
  font-weight: 600;
}
.sub-text {
  margin-left: 8px;
  color: #6b7280;
  font-size: 13px;
}
.material-table {
  width: 100%;
}
.material-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.material-table :deep(.el-input),
.material-table :deep(.el-select),
.material-table :deep(.el-input-number) {
  width: 100%;
}
</style>
