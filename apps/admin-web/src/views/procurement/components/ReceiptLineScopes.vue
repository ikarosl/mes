<template>
  <div>
    <div class="scope-heading">
      <strong>当前未处置范围</strong
      ><el-button
        link
        type="primary"
        @click="$emit('history', 'scopes')"
        >范围变更历史</el-button
      >
    </div>
    <el-table
      :data="line.scopes"
      row-key="id"
      empty-text="没有尚待处置的实物范围"
    >
      <el-table-column
        prop="id"
        label="范围"
        min-width="165"
      />
      <el-table-column
        label="数量"
        width="110"
        ><template #default="{ row }"
          >{{ Number(row.quantity) }} {{ line.unit }}</template
        ></el-table-column
      >
      <el-table-column
        label="当前状态"
        min-width="175"
        ><template #default="{ row }"
          ><el-tag :type="row.disposition === 'reviewing' ? 'warning' : 'info'">{{
            RECEIPT_SCOPE_DISPOSITION_LABELS[row.disposition as ReceiptScopeDisposition]
          }}</el-tag></template
        ></el-table-column
      >
      <el-table-column
        prop="terminationReason"
        label="终止约束"
        min-width="200"
      />
      <el-table-column
        label="办理"
        min-width="220"
        ><template #default="{ row }">
          <span
            v-if="row.disposition === 'reviewing'"
            class="help"
            >复核中，暂停入库 / 退回</span
          >
          <template v-else-if="quality">
            <el-button
              v-if="
                !row.terminationRootScopeId &&
                ['uninspected', 'approved', 'quality_return'].includes(row.disposition)
              "
              link
              type="primary"
              :disabled="disabled || Number(row.quantity) <= 0"
              @click="$emit('review', row)"
              >{{ row.inspectionId ? '主动复检 / 更正' : '发起初检' }}</el-button
            >
            <span
              v-else
              class="help"
              >采购终止待退，保留终止约束</span
            >
          </template>
          <template v-else>
            <el-button
              v-if="
                row.disposition === 'quality_return' || row.disposition === 'termination_return'
              "
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('return', row)"
              >确认全部退回</el-button
            >
            <el-button
              v-if="row.disposition === 'uninspected' || row.disposition === 'approved'"
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('terminate', row)"
              >指定终止待退</el-button
            >
          </template>
        </template></el-table-column
      >
    </el-table>
    <div
      v-if="reviews.length"
      class="review-block"
    >
      <strong>待完成检验 / 复核</strong>
      <el-table
        :data="reviews"
        row-key="id"
        ><el-table-column
          label="办理类型"
          width="165"
          ><template #default="{ row }">{{
            QUALITY_INBOUND_CASE_TYPE_LABELS[row.caseType as QualityInboundCaseType]
          }}</template></el-table-column
        ><el-table-column
          label="覆盖量"
          width="110"
          ><template #default="{ row }"
            >{{ Number(row.coveredQuantity) }} {{ line.unit }}</template
          ></el-table-column
        ><el-table-column
          prop="reason"
          label="原因"
          min-width="230"
        /><el-table-column
          label="状态"
          width="110"
          ><template #default
            ><el-tag type="warning">{{
              QUALITY_INBOUND_CASE_STATUS_LABELS.reviewing
            }}</el-tag></template
          ></el-table-column
        ><el-table-column
          v-if="quality"
          label="操作"
          width="135"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('inspect', row)"
              >填写检验结论</el-button
            ></template
          ></el-table-column
        ></el-table
      >
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type {
  ProcurementReceiptLine,
  ReceiptScopeItem,
  ReceiptScopeDisposition,
  QualityInboundCaseItem,
  QualityInboundCaseType,
  ReceiptHistoryKind,
} from '@company/contracts';
import {
  RECEIPT_SCOPE_DISPOSITION_LABELS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
} from '@company/constants';
const props = defineProps<{ line: ProcurementReceiptLine; quality: boolean; disabled: boolean }>();
defineEmits<{
  review: [ReceiptScopeItem];
  return: [ReceiptScopeItem];
  terminate: [ReceiptScopeItem];
  inspect: [QualityInboundCaseItem];
  history: [ReceiptHistoryKind];
}>();
const reviews = computed(() => props.line.cases.filter((item) => item.status === 'reviewing'));
</script>
<style scoped>
.scope-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16px 0 8px;
}
.review-block {
  margin-top: 20px;
}
.help {
  color: #9a6700;
  font-size: 13px;
}
</style>
