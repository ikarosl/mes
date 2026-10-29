<template>
  <el-dialog
    :model-value="editor.visible"
    title="专检不合格处理"
    :width="DialogWidth.workbench"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!editor.submitting"
    :close-on-press-escape="!editor.submitting"
  >
    <strong>{{ editor.context?.label }}</strong>
    <InlineHint class="notice">
      产线核实现场不合格实物后处理，生成当前工序的异常处置待办。检查填写有误请由质检人员更正。
    </InlineHint>
    <el-alert
      v-if="!editor.contextReady"
      title="当前任务工序依据不可用，请先刷新执行记录后核对。已保留本地填写。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <h3 class="section-heading">待处理检查</h3>
    <el-alert
      v-if="editor.listError"
      :title="editor.listError"
      type="error"
      :closable="false"
      class="notice"
    />
    <el-table
      v-loading="editor.listLoading"
      :data="editor.entries"
      row-key="id"
      border
      empty-text="当前工序没有待处理的检查"
      :row-class-name="rowClassName"
    >
      <el-table-column
        label="现场范围 / 方式"
        min-width="240"
      >
        <template #default="{ row }">
          <div>{{ row.currentRecord?.scopeNote }}</div>
          <div class="secondary">
            {{
              row.currentRecord
                ? QUALITY_INSPECTION_METHOD_LABELS[
                    row.currentRecord
                      .inspectionMethod as ProcessInspectionRecord['inspectionMethod']
                  ]
                : '无有效结果'
            }}
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="合格 / 不合格"
        min-width="160"
      >
        <template #default="{ row }">
          <template v-if="row.currentRecord">
            <InspectionQuantity
              :value="row.currentRecord.qualifiedQuantity"
              kind="qualified"
            />
            /
            <InspectionQuantity
              :value="row.currentRecord.unqualifiedQuantity"
              kind="unqualified"
              :unit="row.unit"
            />
          </template>
        </template>
      </el-table-column>
      <el-table-column
        prop="acceptedQuantity"
        label="已处理"
        min-width="90"
      />
      <el-table-column
        prop="pendingQuantity"
        label="待处理"
        min-width="90"
      />
      <el-table-column
        label="检验时间 / 人员"
        min-width="175"
      >
        <template #default="{ row }">
          <div>{{ formatDateTimeForDisplay(row.currentRecord?.inspectedAt) }}</div>
          <div class="secondary">{{ row.currentRecord?.createdByName }}</div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="110"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="warning"
            :disabled="
              editor.locked || !editor.contextReady || editor.listLoading || !!editor.listError
            "
            @click="editor.select(row.id)"
            >核实 / 处理</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="editor.total"
      :current-page="editor.page"
      :page-size="editor.pageSize"
      @page-change="editor.changePage"
      @update:page-size="editor.changePageSize"
    />
    <section
      v-if="editor.selectedId"
      v-loading="editor.detailLoading"
      class="acceptance-editor"
    >
      <h3>本次处理</h3>
      <el-alert
        v-if="editor.detailError"
        :title="editor.detailError"
        type="error"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="editor.unresolved"
        title="提交结果尚未确认。请先核对下方历史处理及当前工序异常处置记录；原样重试将复用首次数量、版本和提交标识。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-alert
        v-if="editor.stale"
        title="检查依据已变化，填写内容已保留。请先核对变化，再明确放弃旧填写并采用最新依据。"
        type="warning"
        :closable="false"
        class="notice"
      />
      <el-button
        v-if="editor.stale && !editor.unresolved"
        :disabled="editor.submitting || !editor.contextReady"
        @click="editor.select(editor.selectedId)"
        >放弃填写并采用最新依据</el-button
      >
      <el-descriptions
        v-if="editor.detail"
        :column="3"
        border
      >
        <el-descriptions-item label="检查记录 ID">{{ editor.detail.id }}</el-descriptions-item>
        <el-descriptions-item label="已处理"
          >{{ editor.detail.acceptedQuantity }} {{ editor.detail.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="待处理"
          >{{ editor.detail.pendingQuantity }} {{ editor.detail.unit }}</el-descriptions-item
        >
        <el-descriptions-item
          label="现场范围"
          :span="3"
          >{{ editor.detail.currentRecord?.scopeNote || '无有效检查结果' }}</el-descriptions-item
        >
        <el-descriptions-item
          label="检查说明"
          :span="3"
          >{{ editor.detail.currentRecord?.resultNote || '未填写' }}</el-descriptions-item
        >
        <el-descriptions-item
          label="凭据"
          :span="3"
          >{{ editor.detail.currentRecord?.evidenceReference || '未填写' }}</el-descriptions-item
        >
      </el-descriptions>
      <InlineHint
        v-if="editor.detail?.acceptBlockedReason"
        class="notice"
        >{{ editor.detail.acceptBlockedReason }}</InlineHint
      >
      <el-form
        label-width="100px"
        :disabled="editor.locked"
        class="notice"
        @submit.prevent="editor.submit"
      >
        <el-form-item
          label="本次处理量"
          required
        >
          <el-input
            :model-value="editor.form.quantity"
            inputmode="numeric"
            placeholder="填写现场核实的不合格数量"
            @update:model-value="editor.setQuantity"
          />
        </el-form-item>
        <el-form-item label="现场说明">
          <el-input
            :model-value="editor.form.remark"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            placeholder="现场核实结果、实物位置或交接说明"
            @update:model-value="editor.setRemark"
          />
        </el-form-item>
      </el-form>
      <InlineHint
        >处理后，该次检查的不合格数量不能低于累计已处理量；后续返工或报废不会释放已处理量。</InlineHint
      >
    </section>
    <ProductionInspectionHistory :history="editor.history" />
    <template #footer>
      <el-button
        :disabled="editor.submitting"
        @click="editor.close"
        >关闭</el-button
      >
      <el-button
        :disabled="editor.submitting"
        @click="editor.refresh"
        >刷新核对</el-button
      >
      <el-button
        v-if="editor.unresolved"
        type="warning"
        :loading="editor.submitting"
        :disabled="editor.intentStatus !== 'pending' || !editor.contextReady"
        @click="editor.retry"
        >原样重试处理</el-button
      >
      <el-button
        v-else
        type="warning"
        :loading="editor.submitting"
        :disabled="!editor.canSubmit"
        @click="editor.submit"
        >确认处理</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { QUALITY_INSPECTION_METHOD_LABELS } from '@company/constants';
import type { ProcessInspectionEntry, ProcessInspectionRecord } from '@company/contracts';
import InlineHint from '../../../../components/InlineHint.vue';
import PaginationFooter from '../../../../components/PaginationFooter.vue';
import InspectionQuantity from '../../../quality/components/InspectionQuantity.vue';
import { formatDateTimeForDisplay } from '../../../../utils/date';
import { DialogWidth } from '../../../../utils/dialog';
import type { useProductionInspectionAcceptance } from './use-production-inspection-acceptance';
import ProductionInspectionHistory from './ProductionInspectionHistory.vue';

const props = defineProps<{ editor: ReturnType<typeof useProductionInspectionAcceptance> }>();
async function beforeClose(done: () => void): Promise<void> {
  if (await props.editor.close()) done();
}
function rowClassName({ row }: { row: ProcessInspectionEntry }): string {
  return row.id === props.editor.selectedId ? 'selected-inspection' : '';
}
</script>

<style scoped>
.notice {
  margin: 12px 0;
}
.section-heading {
  margin: 16px 0 12px;
  font-size: 14px;
}
.secondary {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.acceptance-editor {
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 12px;
}
.acceptance-editor h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
:deep(.selected-inspection) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
:deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
</style>
