<template>
  <div class="json-table-editor">
    <div
      v-if="canDesign"
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
    <div
      v-if="mode === 'design' && !readonly"
      class="column-rules"
    >
      <el-switch
        :model-value="columnRules !== null"
        :disabled="disabled || confirming"
        active-text="启用填写规则"
        @change="toggleColumnRules"
      />
      <template v-if="columnRules !== null">
        <el-button
          :disabled="disabled || confirming || !hasInputColumns"
          @click="changeInputColumnModes(BUSINESS_TEMPLATE_COLUMN_MODE.required)"
          >全部输入列必填</el-button
        >
        <el-button
          :disabled="disabled || confirming || !hasInputColumns"
          @click="changeInputColumnModes(BUSINESS_TEMPLATE_COLUMN_MODE.optional)"
          >全部输入列可空</el-button
        >
      </template>
    </div>
    <p
      v-if="!readonly"
      class="table-hint"
    >
      <template v-if="mode === 'fill'">固定内容已锁定，请填写输入列；带 * 的列每行必填。</template>
      <template v-else-if="mode === 'design' && columnRules !== null">
        固定列保留模板内容；必填列和可空列供业务填写，使用模板时会清空预设值。
      </template>
      <template v-else>首行为列名（必填），数据行数不含表头。调整行列会保留已有内容。</template>
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
          <span v-if="readonly || mode === 'fill'">
            <span
              v-if="
                !readonly && columnRules?.[column.key] === BUSINESS_TEMPLATE_COLUMN_MODE.required
              "
              class="required-mark"
              aria-hidden="true"
              >*</span
            >
            {{ column.label }}
          </span>
          <div
            v-else
            class="column-heading"
          >
            <div class="column-label">
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
            <el-select
              v-if="mode === 'design' && columnRules !== null"
              :model-value="columnRules[column.key]"
              :disabled="disabled || confirming"
              :aria-label="`${column.label || `第 ${index + 1} 列`}填写规则`"
              @update:model-value="changeColumnMode(column.key, $event)"
            >
              <el-option
                v-for="columnMode in BUSINESS_TEMPLATE_COLUMN_MODES"
                :key="columnMode"
                :value="columnMode"
                :label="BUSINESS_TEMPLATE_COLUMN_MODE_LABELS[columnMode]"
              />
            </el-select>
          </div>
        </template>
        <template #default="{ row, $index }">
          <span
            v-if="readonly || isFixedColumn(column.key)"
            class="cell-text"
            >{{ row[column.key] || '—' }}</span
          >
          <el-input
            v-else
            :model-value="row[column.key] ?? ''"
            :disabled="disabled || confirming"
            maxlength="1000"
            :aria-label="`${column.label || `第 ${index + 1} 列`}，第 ${$index + 1} 行`"
            :aria-required="columnRules?.[column.key] === BUSINESS_TEMPLATE_COLUMN_MODE.required"
            @update:model-value="changeCell($index, column.key, $event)"
          />
        </template>
      </el-table-column>
      <el-table-column
        v-if="canDesign"
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
      {{ readonly || mode === 'fill' ? '暂无内容' : '设置行列数量后生成表格' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, useId, watch } from 'vue';
import {
  BUSINESS_TEMPLATE_COLUMN_MODE,
  BUSINESS_TEMPLATE_COLUMN_MODES,
  BUSINESS_TEMPLATE_COLUMN_MODE_LABELS,
} from '@company/constants';
import type {
  BusinessTemplateColumnMode,
  BusinessTemplateColumnRules,
  JsonTableData,
} from '@company/contracts';
import { EMessage } from '../utils/message';
import { RouteMessageBox } from '../utils/route-message-box';
const props = withDefaults(
  defineProps<{
    modelValue: JsonTableData;
    readonly?: boolean;
    disabled?: boolean;
    mode?: 'free' | 'design' | 'fill';
    columnRules?: BusinessTemplateColumnRules | null;
  }>(),
  { mode: 'free', columnRules: null },
);
const emit = defineEmits<{
  (event: 'update:modelValue', value: JsonTableData): void;
  (event: 'update:columnRules', value: BusinessTemplateColumnRules | null): void;
}>();
const canDesign = computed(() => !props.readonly && props.mode !== 'fill');
const hasInputColumns = computed(() =>
  Object.values(props.columnRules ?? {}).some(
    (mode) => mode !== BUSINESS_TEMPLATE_COLUMN_MODE.fixed,
  ),
);
const isFixedColumn = (key: string): boolean =>
  props.mode === 'fill' && props.columnRules?.[key] === BUSINESS_TEMPLATE_COLUMN_MODE.fixed;
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
  if (!canDesign.value || props.disabled || confirming.value) return;
  emit('update:modelValue', {
    columns: props.modelValue.columns.map((column, i) =>
      i === index ? { ...column, label } : column,
    ),
    rows: props.modelValue.rows,
  });
};
const changeCell = (index: number, key: string, value: string): void => {
  if (props.readonly || props.disabled || confirming.value || isFixedColumn(key)) return;
  emit('update:modelValue', {
    columns: props.modelValue.columns,
    rows: props.modelValue.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
  });
};
const toggleColumnRules = (enabled: boolean | string | number): void => {
  if (!canDesign.value || props.disabled || confirming.value) return;
  emit(
    'update:columnRules',
    enabled
      ? Object.fromEntries(
          props.modelValue.columns.map(({ key }) => [key, BUSINESS_TEMPLATE_COLUMN_MODE.optional]),
        )
      : null,
  );
};
const changeColumnMode = (key: string, mode: BusinessTemplateColumnMode): void => {
  if (!canDesign.value || props.disabled || confirming.value || props.columnRules === null) return;
  emit('update:columnRules', { ...props.columnRules, [key]: mode });
};
const changeInputColumnModes = (mode: BusinessTemplateColumnMode): void => {
  if (!canDesign.value || props.disabled || confirming.value || props.columnRules === null) return;
  emit(
    'update:columnRules',
    Object.fromEntries(
      props.modelValue.columns.map(({ key }) => [
        key,
        props.columnRules?.[key] === BUSINESS_TEMPLATE_COLUMN_MODE.fixed
          ? BUSINESS_TEMPLATE_COLUMN_MODE.fixed
          : mode,
      ]),
    ),
  );
};
const replaceTable = async (next: JsonTableData, warning?: string): Promise<void> => {
  if (props.disabled || !canDesign.value || confirming.value) return;
  const previous = props.modelValue;
  const previousRules = props.columnRules;
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
  if (
    !disposed &&
    !props.disabled &&
    canDesign.value &&
    props.modelValue === previous &&
    props.columnRules === previousRules
  ) {
    if (props.mode === 'design' && previousRules !== null)
      emit(
        'update:columnRules',
        Object.fromEntries(
          next.columns.map(({ key }) => [
            key,
            previousRules[key] ?? BUSINESS_TEMPLATE_COLUMN_MODE.optional,
          ]),
        ),
      );
    emit('update:modelValue', next);
  }
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
.table-size,
.column-rules {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.column-rules {
  margin-bottom: 8px;
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
  display: grid;
  gap: 6px;
}
.column-label {
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
