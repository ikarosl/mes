<template>
  <section
    v-for="(group, groupIndex) in columnGroups"
    :key="group.key"
    class="report-sheet"
  >
    <div class="report-no">检验单号：{{ report.reportNo }}{{ group.label }}</div>
    <h1>{{ QUALITY_INCOMING_INSPECTION_REPORT_TITLE }}</h1>
    <div class="inspection-date">检验日期：{{ inspectionDate }}</div>
    <table class="metadata">
      <colgroup>
        <col style="width: 17.5%" />
        <col style="width: 39.7%" />
        <col style="width: 12.2%" />
        <col style="width: 30.6%" />
      </colgroup>
      <tbody>
        <tr
          v-for="[leftLabel, leftValue, rightLabel, rightValue] in headerRows"
          :key="leftLabel"
        >
          <th scope="row">{{ leftLabel }}</th>
          <td>{{ leftValue }}</td>
          <th scope="row">{{ rightLabel }}</th>
          <td>{{ rightValue }}</td>
        </tr>
      </tbody>
    </table>
    <table
      class="records"
      :class="{ 'reference-columns': group.columns.length === 5 }"
    >
      <colgroup>
        <col style="width: 6.4%" />
        <col
          v-for="(column, columnIndex) in group.columns"
          :key="column.key"
          :style="{ width: `${group.widths[columnIndex]}%` }"
        />
      </colgroup>
      <thead>
        <tr>
          <th class="record-band">检 验</th>
          <th
            v-for="column in group.columns"
            :key="column.key"
            scope="col"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- 左栏保留真实行序并逐行去除内部横线，让长表自然分页。 -->
        <tr
          v-for="(row, rowIndex) in report.inspectionDetails.rows"
          :key="rowIndex"
          :class="{ 'packaging-row': isPackagingRow(row) }"
        >
          <td class="record-band">{{ rowIndex === 0 ? '记录' : '' }}</td>
          <td
            v-for="column in group.columns"
            :key="column.key"
          >
            {{ row[column.key] }}
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="groupIndex === columnGroups.length - 1"
      class="signatures"
    >
      <div
        v-for="label in QUALITY_INCOMING_INSPECTION_REPORT_SIGNATURE_LABELS"
        :key="label"
        class="signature"
      >
        {{ label }}：
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { JsonTableColumn, QualityIncomingInspectionReportItem } from '@company/contracts';
import {
  QUALITY_INCOMING_INSPECTION_REPORT_DEFAULT_ITEMS,
  QUALITY_INCOMING_INSPECTION_REPORT_SIGNATURE_LABELS,
  QUALITY_INCOMING_INSPECTION_REPORT_TITLE,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';

defineOptions({ name: 'IncomingInspectionReport' });
// Printing uses saved headers and cells; current master data and unsigned users are never substituted.
const props = defineProps<{ report: QualityIncomingInspectionReportItem }>();

const headerRows = computed<Array<[string, string | null, string, string | null]>>(() => [
  ['材料名称', props.report.itemName, '供应商', props.report.supplierName],
  ['规格型号', props.report.materialVariantCode, '采购单号', props.report.purchaseNo],
  ['批次号', props.report.batchNo, '有效期', props.report.expiresOn],
]);
const inspectionDate = computed(() =>
  formatDateTimeForDisplay(props.report.inspectedAt, '').slice(0, 10),
);
const columnGroups = computed(() => {
  const { columns } = props.report.inspectionDetails;
  const groups: JsonTableColumn[][] = [];
  const firstColumn = columns[0];
  if (columns.length <= 6) groups.push(columns);
  else if (firstColumn) {
    // 宽表分栏保留首列和真实行序，避免将全部列压缩到一张纸上。
    for (let offset = 1; offset < columns.length; offset += 5)
      groups.push([firstColumn, ...columns.slice(offset, offset + 5)]);
  }
  return groups.map((group, index) => ({
    key: group.map((column) => column.key).join('\u0000'),
    columns: group,
    widths:
      group.length === 5 ? [11.1, 27.5, 12.2, 28.6, 14.2] : group.map(() => 93.6 / group.length),
    label: groups.length > 1 ? `（分栏 ${index + 1}/${groups.length}）` : '',
  }));
});
function isPackagingRow(row: Record<string, string>): boolean {
  const firstColumn = props.report.inspectionDetails.columns[0];
  return Boolean(
    firstColumn && row[firstColumn.key] === QUALITY_INCOMING_INSPECTION_REPORT_DEFAULT_ITEMS[1],
  );
}
</script>
