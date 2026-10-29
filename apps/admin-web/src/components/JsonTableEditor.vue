<template>
  <div class="json-table-editor">
    <div
      v-if="!readonly"
      class="table-actions"
    >
      <div v-if="$slots.actions"><slot name="actions" /></div>
      <div class="table-size">
        <label :for="`${inputId}-columns`">列数</label>
        <el-input-number
          :id="`${inputId}-columns`"
          v-model="columnCount"
          :min="0"
          :max="20"
          :precision="0"
          controls-position="right"
          :disabled="disabled || confirming"
          aria-label="列数"
        />
        <label :for="`${inputId}-rows`">数据行数</label>
        <el-input-number
          :id="`${inputId}-rows`"
          v-model="rowCount"
          :min="0"
          :max="200"
          :precision="0"
          controls-position="right"
          :disabled="disabled || confirming || columnCount === 0"
          aria-label="数据行数"
        />
        <el-button
          :disabled="disabled || confirming"
          @click="resizeTable"
        >
          {{ modelValue.columns.length ? '调整行列' : '生成表格' }}
        </el-button>
        <el-button
          v-if="modelValue.columns.length"
          type="danger"
          plain
          :disabled="disabled || confirming"
          @click="clearTable"
        >
          清除表格
        </el-button>
      </div>
    </div>
    <p
      v-if="!readonly"
      class="table-hint"
    >
      首行为列名（必填），数据行数不含表头。调整行列会保留已有内容。
    </p>
    <el-table
      v-if="modelValue.columns.length"
      :data="modelValue.rows"
      empty-text="暂无内容"
      class="json-table"
    >
      <el-table-column
        v-for="(column, index) in modelValue.columns"
        :key="column.key"
        :label="column.label"
        min-width="180"
      >
        <template #header>
          <span v-if="readonly">{{ column.label }}</span>
          <div
            v-else
            class="column-heading"
          >
            <span
              class="required-mark"
              aria-hidden="true"
              >*</span
            >
            <el-input
              :model-value="column.label"
              :disabled="disabled || confirming"
              maxlength="100"
              placeholder="列名（必填）"
              :aria-label="`第 ${index + 1} 列列名`"
              aria-required="true"
              @update:model-value="changeColumnLabel(index, $event)"
            />
          </div>
        </template>
        <template #default="{ row, $index }">
          <span
            v-if="readonly"
            class="cell-text"
            >{{ row[column.key] || '—' }}</span
          >
          <el-input
            v-else
            :model-value="row[column.key] ?? ''"
            :disabled="disabled || confirming"
            maxlength="1000"
            :aria-label="`${column.label || `第 ${index + 1} 列`}，第 ${$index + 1} 行`"
            @update:model-value="changeCell($index, column.key, $event)"
          />
        </template>
      </el-table-column>
      <el-table-column
        v-if="!readonly"
        label="操作"
        width="76"
        fixed="right"
      >
        <template #default="{ $index }"
          ><el-button
            link
            type="danger"
            :disabled="disabled || confirming"
            @click="removeRow($index)"
            >删除</el-button
          ></template
        >
      </el-table-column>
    </el-table>
    <div
      v-else
      class="empty-table"
    >
      {{ readonly ? '暂无内容' : '设置行列数量后生成表格' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, useId, watch } from 'vue';
import type { JsonTableData } from '@company/contracts';
import { EMessage } from '../utils/message';
import { RouteMessageBox } from '../utils/route-message-box';
const props = defineProps<{ modelValue: JsonTableData; readonly?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: JsonTableData): void }>();
const inputId = useId();
const columnCount = ref<number | undefined>(3);
const rowCount = ref<number | undefined>(1);
const confirming = ref(false);
let disposed = false;
onScopeDispose(() => (disposed = true));
watch(
  () => props.modelValue,
  (table, previous) => {
    // 单元格或表头编辑保留待生成的数量；整表替换或实际尺寸变化时重新同步。
    if (
      previous &&
      (table.columns === previous.columns || table.rows === previous.rows) &&
      table.columns.length === previous.columns.length &&
      table.rows.length === previous.rows.length
    )
      return;
    columnCount.value = table.columns.length || 3;
    rowCount.value = table.columns.length ? table.rows.length : 1;
  },
  { immediate: true },
);

const changeColumnLabel = (index: number, label: string): void => {
  emit('update:modelValue', {
    columns: props.modelValue.columns.map((column, i) =>
      i === index ? { ...column, label } : column,
    ),
    rows: props.modelValue.rows,
  });
};
const changeCell = (index: number, key: string, value: string): void => {
  emit('update:modelValue', {
    columns: props.modelValue.columns,
    rows: props.modelValue.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
  });
};
const replaceTable = async (next: JsonTableData, warning?: string): Promise<void> => {
  if (props.disabled || props.readonly || confirming.value) return;
  const previous = props.modelValue;
  if (warning) {
    confirming.value = true;
    try {
      await RouteMessageBox.confirm(warning, '删除表格内容', {
        type: 'warning',
        confirmButtonText: '确认删除',
      });
    } catch {
      return;
    } finally {
      confirming.value = false;
    }
  }
  if (!disposed && !props.disabled && !props.readonly && props.modelValue === previous)
    emit('update:modelValue', next);
};
const resizeTable = async (): Promise<void> => {
  const columnsCount = columnCount.value;
  const rowsCount = columnsCount === 0 ? 0 : rowCount.value;
  if (
    columnsCount === undefined ||
    !Number.isInteger(columnsCount) ||
    columnsCount < 0 ||
    columnsCount > 20 ||
    rowsCount === undefined ||
    !Number.isInteger(rowsCount) ||
    rowsCount < 0 ||
    rowsCount > 200
  ) {
    EMessage.warning('请填写 0–20 的列数和 0–200 的数据行数');
    return;
  }
  const current = props.modelValue;
  const columns = current.columns.slice(0, columnsCount);
  const keys = new Set(current.columns.map((column) => column.key));
  let number = 1;
  while (columns.length < columnsCount) {
    while (keys.has(`column_${number}`)) number += 1;
    const key = `column_${number++}`;
    keys.add(key);
    columns.push({ key, label: '' });
  }
  const rows = Array.from({ length: rowsCount }, (_, index) =>
    Object.fromEntries(columns.map(({ key }) => [key, current.rows[index]?.[key] ?? ''])),
  );
  const removedColumns = current.columns.slice(columnsCount);
  const losesContent =
    removedColumns.some((column) => column.label || current.rows.some((row) => row[column.key])) ||
    current.rows.slice(rowsCount).some((row) => Object.values(row).some(Boolean));
  await replaceTable(
    { columns, rows },
    losesContent ? '缩减行列会删除超出范围的末尾列、末尾行及其中内容，确认继续？' : undefined,
  );
};
const clearTable = (): Promise<void> =>
  replaceTable({ columns: [], rows: [] }, '将清除全部列名和行数据，确认继续？');
const removeRow = async (index: number): Promise<void> => {
  const row = props.modelValue.rows[index];
  await replaceTable(
    {
      columns: props.modelValue.columns,
      rows: props.modelValue.rows.filter((_, i) => i !== index),
    },
    row && Object.values(row).some(Boolean) ? `确认删除第 ${index + 1} 行及其中内容？` : undefined,
  );
};
</script>

<style scoped>
.table-actions,
.table-size {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.table-actions {
  justify-content: space-between;
  margin-bottom: 8px;
}
.table-size {
  gap: 8px;
}
.table-size .el-input-number {
  width: 96px;
}
.table-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.json-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.cell-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.column-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}
.required-mark {
  color: var(--el-color-danger);
}
.empty-table {
  padding: 20px 12px;
  text-align: center;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}
</style>
