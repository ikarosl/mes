<template>
  <el-dialog
    :model-value="editor.visible"
    :title="editor.mode === 'create' ? '登记检查' : '单次检查详情'"
    :width="DialogWidth.xl"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!editor.submitting"
    :show-close="!editor.submitting"
  >
    <el-alert
      v-if="editor.error"
      :title="editor.error"
      type="error"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="editor.unresolved"
      title="提交结果尚未确认。已保留原请求，请先核对专检历史；原样重试复用同一提交标识。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="editor.stale"
      title="专检依据已变化，当前填写已保留。请放弃填写并核对最新结果后重新办理。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="editor.mode === 'create' && editor.step?.createBlockedReason"
      :title="editor.step.createBlockedReason"
      type="warning"
      :closable="false"
    />
    <div v-loading="editor.loading">
      <el-descriptions
        v-if="editor.detail"
        :column="3"
        border
      >
        <el-descriptions-item label="工单">{{ editor.detail.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="任务">{{ editor.detail.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="工序"
          >{{ editor.detail.stepOrder }} · {{ editor.detail.stepName }}</el-descriptions-item
        >
        <el-descriptions-item label="成品"
          >{{ editor.detail.productCode }} · {{ editor.detail.productName }}</el-descriptions-item
        >
        <el-descriptions-item label="状态">{{
          PROCESS_INSPECTION_STATUS_LABELS[editor.detail.status]
        }}</el-descriptions-item>
        <el-descriptions-item label="检查记录 ID">{{ editor.detail.id }}</el-descriptions-item>
        <el-descriptions-item label="当前合格"
          ><InspectionQuantity
            v-if="editor.detail.currentRecord"
            :value="editor.detail.currentRecord.qualifiedQuantity"
            kind="qualified"
            :unit="editor.detail.unit"
          /><span v-else>已冲销</span></el-descriptions-item
        >
        <el-descriptions-item label="当前不合格"
          ><InspectionQuantity
            v-if="editor.detail.currentRecord"
            :value="editor.detail.currentRecord.unqualifiedQuantity"
            kind="unqualified"
            :unit="editor.detail.unit"
          /><span v-else>已冲销</span></el-descriptions-item
        >
        <el-descriptions-item label="待处理"
          >{{ editor.detail.pendingQuantity }} {{ editor.detail.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="累计已处理"
          >{{ editor.detail.acceptedQuantity }} {{ editor.detail.unit }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="editor.detail.currentRecord"
          label="现场范围"
          :span="2"
          >{{ editor.detail.currentRecord.scopeNote }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="editor.detail.currentRecord"
          label="检验方式"
          >{{
            QUALITY_INSPECTION_METHOD_LABELS[editor.detail.currentRecord.inspectionMethod]
          }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="editor.detail.currentRecord"
          label="检验时间"
          :span="2"
          >{{
            formatDateTimeForDisplay(editor.detail.currentRecord.inspectedAt)
          }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="editor.detail.currentRecord"
          label="检查说明"
          :span="3"
          >{{ editor.detail.currentRecord.resultNote || '未填写' }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="editor.detail.currentRecord"
          label="凭据"
          :span="3"
          >{{ editor.detail.currentRecord.evidenceReference || '未填写' }}</el-descriptions-item
        >
      </el-descriptions>
      <el-form
        v-if="editor.mode !== 'view'"
        label-width="110px"
        :disabled="editor.locked"
        class="inspection-form"
        @submit.prevent="editor.submit"
      >
        <template v-if="editor.mode === 'create'">
          <el-form-item
            label="任务工序"
            required
          >
            <span v-if="editor.step"
              >{{ editor.step.batchNo }} / {{ editor.step.stepOrder }} ·
              {{ editor.step.stepName }}</span
            >
          </el-form-item>
          <InlineHint
            >按现场实物范围登记，不需选择报工。已有不合格实物的重复检查不得再次登记为新增待办。</InlineHint
          >
        </template>
        <template v-if="editor.mode === 'create' || editor.mode === 'correct'">
          <el-form-item
            label="检验方式"
            required
          >
            <el-radio-group v-model="editor.form.inspectionMethod"
              ><el-radio
                v-for="method in PROCESS_INSPECTION_METHODS"
                :key="method"
                :value="method"
                >{{ QUALITY_INSPECTION_METHOD_LABELS[method] }}</el-radio
              ></el-radio-group
            >
          </el-form-item>
          <el-form-item
            label="现场范围"
            required
            ><el-input
              v-model="editor.form.scopeNote"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
              placeholder="例如：2 号周转箱待流转实物；全检仅指此范围"
          /></el-form-item>
          <div class="quantity-fields">
            <el-form-item
              label="合格数量"
              required
              ><el-input
                v-model="editor.form.qualifiedQuantity"
                inputmode="numeric"
                placeholder="请输入整数，允许 0"
            /></el-form-item>
            <el-form-item
              label="不合格数量"
              required
              ><el-input
                v-model="editor.form.unqualifiedQuantity"
                inputmode="numeric"
                placeholder="请输入整数，允许 0"
            /></el-form-item>
          </div>
          <InlineHint
            >实际检查总数：<strong>{{ editor.inspected ?? '待填写' }}</strong
            >。抽检只记录样本结果，不推算整批合格量。</InlineHint
          >
          <InlineHint v-if="editor.mode === 'correct' && editor.detail"
            >本次检查已处理 <strong>{{ editor.detail.acceptedQuantity }}</strong
            >，更正后不合格数量不得小于此值。原结果通过冲销和替代保留历史。</InlineHint
          >
          <el-form-item
            label="检验时间"
            required
            ><el-date-picker
              v-model="editor.form.inspectedAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="北京时间"
          /></el-form-item>
          <el-form-item
            label="检查说明"
            required
            ><el-input
              v-model="editor.form.resultNote"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
          /></el-form-item>
          <el-form-item
            label="凭据"
            required
            ><el-input
              v-model="editor.form.evidenceReference"
              type="textarea"
              :rows="2"
              maxlength="5000"
              placeholder="现场单据、照片或其他可追溯依据的说明"
          /></el-form-item>
        </template>
        <el-form-item
          v-if="editor.mode === 'correct' || editor.mode === 'reverse'"
          label="原因"
          required
          ><el-input
            v-model="editor.form.reason"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
        /></el-form-item>
      </el-form>
      <template v-if="editor.detail">
        <div class="history-heading">
          <strong>结果历史</strong
          ><span>原始检查、冲销和替代均保留；数量不重复累计为独立实物。</span>
        </div>
        <el-alert
          v-if="editor.historyError"
          :title="editor.historyError"
          type="error"
          :closable="false"
        />
        <el-table
          v-loading="editor.historyLoading"
          :data="editor.records"
          row-key="id"
          border
        >
          <el-table-column type="expand"
            ><template #default="{ row }"
              ><el-descriptions
                :column="2"
                border
                class="record-description"
              >
                <el-descriptions-item
                  label="检查范围"
                  :span="2"
                  >{{ row.scopeNote }}</el-descriptions-item
                >
                <el-descriptions-item
                  label="检查说明"
                  :span="2"
                  >{{ row.resultNote || '未填写' }}</el-descriptions-item
                >
                <el-descriptions-item
                  label="凭据"
                  :span="2"
                  >{{ row.evidenceReference || '未填写' }}</el-descriptions-item
                >
                <el-descriptions-item
                  label="更正 / 冲销原因"
                  :span="2"
                  >{{ row.reason || '—' }}</el-descriptions-item
                >
                <el-descriptions-item label="冲销原记录 ID">{{
                  row.reversalOfRecordId || '—'
                }}</el-descriptions-item>
                <el-descriptions-item label="替代原记录 ID">{{
                  row.replacesRecordId || '—'
                }}</el-descriptions-item>
                <el-descriptions-item label="登记人">{{ row.createdByName }}</el-descriptions-item>
                <el-descriptions-item label="登记时间">{{
                  formatDateTimeForDisplay(row.createdAt)
                }}</el-descriptions-item>
              </el-descriptions></template
            ></el-table-column
          >
          <el-table-column
            prop="id"
            label="结果记录 ID"
            width="110"
          />
          <el-table-column
            label="类型"
            width="120"
            ><template #default="{ row }"
              >{{
                PROCESS_INSPECTION_RECORD_TYPE_LABELS[
                  row.recordType as ProcessInspectionRecord['recordType']
                ]
              }}<el-tag
                v-if="row.id === editor.detail?.currentRecord?.id"
                size="small"
                >当前</el-tag
              ></template
            ></el-table-column
          >
          <el-table-column
            label="方式"
            width="80"
            ><template #default="{ row }">{{
              QUALITY_INSPECTION_METHOD_LABELS[
                row.inspectionMethod as ProcessInspectionRecord['inspectionMethod']
              ]
            }}</template></el-table-column
          >
          <el-table-column
            label="合格 / 不合格"
            min-width="135"
            ><template #default="{ row }"
              ><span v-if="row.recordType === 'reversal'"
                >{{ row.qualifiedQuantity ? `−${row.qualifiedQuantity}` : '0' }} /
                {{ row.unqualifiedQuantity ? `−${row.unqualifiedQuantity}` : '0' }}</span
              ><template v-else
                ><InspectionQuantity
                  :value="row.qualifiedQuantity"
                  kind="qualified" />
                /
                <InspectionQuantity
                  :value="row.unqualifiedQuantity"
                  kind="unqualified" /></template></template
          ></el-table-column>
          <el-table-column
            label="检验时间"
            min-width="170"
            ><template #default="{ row }">{{
              formatDateTimeForDisplay(row.inspectedAt)
            }}</template></el-table-column
          >
        </el-table>
        <PaginationFooter
          :total="editor.historyTotal"
          :current-page="editor.historyPage"
          :page-size="editor.historyPageSize"
          @update:page-size="editor.changeHistoryPageSize"
          @page-change="editor.changeHistoryPage"
        />
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="editor.submitting"
        @click="editor.refresh()"
        >刷新核对</el-button
      >
      <el-button
        :disabled="editor.submitting"
        @click="editor.close"
        >返回工序</el-button
      >
      <el-button
        v-if="editor.mode !== 'view' && editor.mode !== 'create'"
        :disabled="editor.submitting"
        @click="editor.cancelEdit"
        >放弃填写</el-button
      >
      <el-button
        v-if="editor.unresolved"
        type="warning"
        :disabled="editor.submitting || editor.intentStatus !== 'pending'"
        :loading="editor.submitting"
        @click="editor.retry"
        >原样重试</el-button
      >
      <el-button
        v-else-if="editor.mode !== 'view'"
        type="primary"
        :disabled="!editor.valid"
        :loading="editor.submitting"
        @click="editor.submit"
        >确认提交</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { reactive } from 'vue';
import {
  PROCESS_INSPECTION_METHODS,
  PROCESS_INSPECTION_STATUS_LABELS,
  PROCESS_INSPECTION_RECORD_TYPE_LABELS,
  QUALITY_INSPECTION_METHOD_LABELS,
} from '@company/constants';
import type { ProcessInspectionRecord } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InspectionQuantity from './InspectionQuantity.vue';
import { useProcessInspectionEntry } from '../composables/useProcessInspectionEntry';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
const emit = defineEmits<{ changed: [inspectionId: string, created: boolean] }>();
const editor = reactive(
  useProcessInspectionEntry((inspectionId, created) => emit('changed', inspectionId, created)),
);
async function beforeClose(done: () => void): Promise<void> {
  if (await editor.close()) done();
}
defineExpose({ open: editor.open, openCreate: editor.openCreate, close: editor.close });
</script>
<style scoped>
.history-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}
.history-heading span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.inspection-form {
  margin-top: 16px;
}
.quantity-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.el-alert {
  margin-bottom: 12px;
}
.record-description {
  margin: 8px 16px;
}
:deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
</style>
