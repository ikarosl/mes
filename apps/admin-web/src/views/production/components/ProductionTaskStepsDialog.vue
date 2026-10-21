<template>
  <el-dialog
    :model-value="visible"
    title="工序管理"
    :width="DialogWidth.workbench"
    workbench
    :before-close="close"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <div class="workbench-toolbar">
      <div
        v-if="batch"
        class="task-summary"
      >
        <div class="summary-heading">
          <strong>{{ batch.batchNo }}</strong>
          <el-tag
            :type="taskTypeTagType(batch.orderType)"
            effect="light"
            >{{ WORK_ORDER_TYPE_LABELS[batch.orderType] }}</el-tag
          >
          <el-tag :type="batchStatusMeta(batch.status).type">
            {{ batchStatusMeta(batch.status).label }}
          </el-tag>
          <span>{{ batch.productName }} · {{ batch.productCode }}</span>
        </div>
        <div class="summary-caption">
          工单 {{ batch.workOrderNo }} · 计划 {{ formatQuantity(batch.plannedQuantity) }}
          <template v-if="batch.routeCode">
            · 路线 {{ batch.routeCode }}
            <template v-if="batch.routeVersion">（版本 {{ batch.routeVersion }}）</template>
          </template>
        </div>
      </div>
      <strong v-else>{{ batchLabel || '工序管理' }}</strong>
      <el-button
        :loading="loading"
        :disabled="submitting || !readActive"
        @click="loadStepRecords"
        >刷新工序</el-button
      >
    </div>

    <el-alert
      v-if="error"
      class="section-gap"
      :title="error"
      description="保留上次展示；操作已暂停，可手动刷新重试。"
      type="error"
      :closable="false"
      show-icon
    />
    <el-alert
      v-else-if="batch && !detailReady && !loading"
      class="section-gap"
      title="当前工序信息待刷新"
      description="请手动刷新工序，再核对办理资格。"
      type="warning"
      :closable="false"
      show-icon
    />

    <div v-loading="loading">
      <el-table
        v-if="batch?.orderType !== 'research' && stepRecords.length"
        :data="stepRecords"
        row-key="id"
        class="steps-table"
      >
        <el-table-column
          prop="stepOrder"
          label="序号"
          width="62"
        />
        <el-table-column
          label="工序"
          min-width="156"
        >
          <template #default="{ row }">
            <strong>{{ row.stepName }}</strong>
            <div class="secondary-text">{{ row.stepCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          min-width="148"
        >
          <template #default="{ row }">
            <div>{{ taskStepResponsibleName(row) }}</div>
            <div class="secondary-text">默认 {{ taskStepResponsibleName(row, 'default') }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="生效参考文件"
          min-width="182"
        >
          <template #default="{ row }">
            <div class="file-name">
              {{ taskStepReferenceFileName(row) }}
            </div>
            <div
              v-if="row.actualSopFileId ? row.actualSopVersionNo : row.defaultSopVersionNo"
              class="secondary-text"
            >
              版本 {{ row.actualSopFileId ? row.actualSopVersionNo : row.defaultSopVersionNo }}
            </div>
            <div class="secondary-text">
              {{ row.actualSopFileId ? '现场设置' : '路线默认' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="需检验"
          width="72"
        >
          <template #default="{ row }">{{ row.needInspection ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column
          label="状态 / 直接报工"
          min-width="248"
        >
          <template #default="{ row }">
            <el-tag
              class="step-status"
              :type="stepStatusMeta(row.status).type"
              >{{ stepStatusMeta(row.status).label }}</el-tag
            >
            <ProductionStepProgress
              :reported-quantity="row.effectiveDirectReportedQuantity"
              :upper-limit-quantity="row.upperLimitQuantity"
              :direct-normal-quantity="row.effectiveDirectNormalQuantity"
              :direct-abnormal-quantity="row.effectiveDirectAbnormalQuantity"
              :unit="row.unit"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="累计正常 / 异常"
          min-width="146"
        >
          <template #default="{ row }">
            {{ formatQuantity(row.normalQuantity) }} / {{ formatQuantity(row.abnormalQuantity) }}
            {{ row.unit }}
            <div class="secondary-text">正常含{{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="210"
          fixed="right"
        >
          <template #default="{ row }">
            <div class="step-actions">
              <el-button
                v-if="row.status === 'pending'"
                link
                type="primary"
                :disabled="!canOperate || !row.canAssign"
                @click="openAction(row, 'assign')"
                >派工</el-button
              >
              <el-button
                v-else-if="
                  row.status === 'assigned' || row.status === 'doing' || row.status === 'completed'
                "
                link
                type="primary"
                :disabled="!canOperate || !row.canReassign"
                @click="openAction(row, 'reassign')"
                >改派</el-button
              >
              <el-button
                v-if="row.status === 'assigned'"
                link
                type="danger"
                :disabled="!canOperate || !row.canUnassign"
                @click="openAction(row, 'unassign')"
                >撤回</el-button
              >
              <el-tooltip
                :disabled="row.canEditExecution || !row.executionEditBlockedReason"
                :content="row.executionEditBlockedReason || ''"
                placement="top"
              >
                <span>
                  <el-button
                    link
                    type="primary"
                    :disabled="!canOperate || !row.canEditExecution"
                    @click="openAction(row, 'execution')"
                    >参考文件</el-button
                  >
                </span>
              </el-tooltip>
            </div>
            <div
              v-if="row.status === 'pending' && row.assignBlockedReason"
              class="blocked-reason"
            >
              {{ row.assignBlockedReason }}
            </div>
            <div
              v-else-if="!row.canReassign && row.reassignBlockedReason"
              class="blocked-reason"
            >
              {{ row.reassignBlockedReason }}
            </div>
            <div
              v-if="row.status === 'assigned' && !row.canUnassign && row.unassignBlockedReason"
              class="blocked-reason"
            >
              {{ row.unassignBlockedReason }}
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-skeleton
        v-else-if="loading && !batch"
        :rows="5"
        animated
      />
      <el-empty
        v-else-if="!loading && !error"
        :image-size="64"
        :description="batch?.orderType === 'research' ? '研发任务不使用路线工序' : '暂无工序记录'"
      />
    </div>

    <InlineHint
      v-if="stepRecords.length"
      class="section-gap"
      >工序状态由明确的开完工动作维护；报工比例用于数量核对，累计正常量含返工恢复。</InlineHint
    >
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="close()"
        >关闭</el-button
      >
    </template>
  </el-dialog>

  <el-dialog
    :model-value="visible && !!editor"
    :title="editorTitle"
    :width="DialogWidth.md"
    :before-close="closeCommandDialog"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <template v-if="editor">
      <div class="command-identity">
        <strong
          >{{ editor.batchLabel }} · {{ editor.step.stepOrder }}. {{ editor.step.stepName }}</strong
        >
        <div class="secondary-text">{{ editor.step.stepCode }}</div>
      </div>
      <InlineHint
        v-if="editor.action === 'reassign'"
        class="section-gap"
        >改派只切换当前办理人；保留工序状态、开完工时间、报工数量和历史录入人。</InlineHint
      >
      <InlineHint
        v-else-if="editor.action === 'unassign'"
        class="section-gap"
        >撤回后清空当前负责人，工序回到待派工。提交时重新核对开工和报工事实。</InlineHint
      >
      <el-alert
        v-if="unknownResult"
        class="section-gap"
        title="本次操作结果未知"
        description="原请求与选择已保留。请先核对当前工序的实际结果，再明确采用当前依据；不会自动重新提交。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="writeError"
        class="section-gap"
        :title="writeError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="editorBlockedReason && !unknownResult && !writeError"
        class="section-gap"
        :title="editorBlockedReason"
        type="warning"
        :closable="false"
        show-icon
      />

      <el-form
        label-width="112px"
        :disabled="submitting || unknownResult"
        @submit.prevent
      >
        <template v-if="isAssignment">
          <el-form-item label="默认负责人">
            {{ taskStepResponsibleName(editor.step, 'default') }}
          </el-form-item>
          <el-form-item label="当前负责人">
            {{ taskStepResponsibleName(editor.step) }}
          </el-form-item>
          <el-form-item
            label="派工员工"
            required
          >
            <div class="selection-control">
              <el-select
                :model-value="responsibleUserId"
                filterable
                :loading="usersLoading"
                placeholder="请选择现场执行员工"
                @update:model-value="selectUser"
              >
                <el-option
                  v-if="responsibleUserId && !users.some((user) => user.id === responsibleUserId)"
                  :label="userFallbackLabel"
                  :value="responsibleUserId"
                  disabled
                />
                <el-option
                  v-for="user in users"
                  :key="user.id"
                  :label="user.displayName"
                  :value="user.id"
                />
              </el-select>
              <span
                v-if="selectedUserMissing"
                class="selection-warning"
                >原选择已保留，请选择当前可用员工。</span
              >
            </div>
          </el-form-item>
        </template>
        <template v-else-if="editor.action === 'execution'">
          <el-form-item label="默认参考文件">
            <div>
              {{
                editor.step.defaultSopFileName ||
                (editor.step.defaultSopFileId ? '文件名暂不可用' : '未配置')
              }}
              <div
                v-if="editor.step.defaultSopVersionNo"
                class="secondary-text"
              >
                版本 {{ editor.step.defaultSopVersionNo }}
              </div>
            </div>
          </el-form-item>
          <el-form-item label="实际参考文件">
            <div class="selection-control">
              <el-select
                :model-value="actualSopFileId"
                clearable
                filterable
                :loading="sopLoading"
                placeholder="留空则使用默认文件"
                @update:model-value="selectFile"
              >
                <el-option
                  v-if="actualSopFileId && !sopFiles.some((file) => file.id === actualSopFileId)"
                  :label="fileFallbackLabel"
                  :value="actualSopFileId"
                  disabled
                />
                <el-option
                  v-for="file in sopFiles"
                  :key="file.id"
                  :label="technicalFileLabel(file)"
                  :value="file.id"
                />
              </el-select>
              <span
                v-if="selectedFileMissing"
                class="selection-warning"
                >原文件名与选择已保留，请选择当前可用文件或使用默认文件。</span
              >
            </div>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="当前负责人">
            {{ taskStepResponsibleName(editor.step) }}
          </el-form-item>
          <el-form-item label="当前工序状态">
            {{ stepStatusMeta(editor.step.status).label }}
          </el-form-item>
        </template>
      </el-form>

      <div
        v-if="isAssignment || editor.action === 'execution'"
        class="candidate-toolbar"
      >
        <el-button
          v-if="isAssignment"
          :loading="usersLoading"
          :disabled="submitting || !readActive"
          @click="refreshUsers"
          >刷新员工候选</el-button
        >
        <el-button
          v-else
          :loading="sopLoading"
          :disabled="submitting || !readActive"
          @click="refreshSopFiles"
          >刷新参考文件</el-button
        >
        <span class="secondary-text">刷新保留本次选择。</span>
      </div>
      <el-alert
        v-if="
          (isAssignment || editor.action === 'execution') && (isAssignment ? usersError : sopError)
        "
        class="section-gap"
        :title="isAssignment ? usersError : sopError"
        description="候选未完成核对，提交已暂停，可手动刷新重试。"
        type="error"
        :closable="false"
        show-icon
      />

      <div class="current-step-section">
        <div class="current-step-toolbar">
          <strong>当前工序核对</strong>
          <el-button
            link
            type="primary"
            :loading="loading"
            :disabled="submitting || !readActive || batchId !== editor.batchId"
            @click="loadStepRecords"
            >刷新工序</el-button
          >
        </div>
        <template v-if="currentStep && detailReady && !loading">
          <div class="current-step-summary">
            状态 {{ stepStatusMeta(currentStep.status).label }} · 负责人
            {{ taskStepResponsibleName(currentStep) }}
          </div>
          <div class="current-step-summary">
            生效参考文件
            {{ taskStepReferenceFileName(currentStep) }}
          </div>
        </template>
        <div
          v-else
          class="current-step-summary"
        >
          {{ error || '当前工序信息待核对，请手动刷新。' }}
        </div>
        <el-button
          v-if="unknownResult || needsRecheck || basisChanged"
          class="recheck-button"
          :loading="loading"
          :disabled="submitting || !readActive || batchId !== editor.batchId"
          @click="adoptCurrentBasis"
          >重新核对，保留选择</el-button
        >
      </div>
    </template>

    <template #footer>
      <el-button
        :disabled="submitting"
        @click="closeCommandDialog()"
        >取消</el-button
      >
      <el-button
        :type="editor?.action === 'unassign' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{
          editor?.action === 'unassign'
            ? '确认撤回'
            : editor?.action === 'assign'
              ? '确认派工'
              : editor?.action === 'reassign'
                ? '确认改派'
                : '保存参考文件'
        }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { BATCH_STEP_REWORK_RESULT_LABELS, WORK_ORDER_TYPE_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import InlineHint from '../../../components/InlineHint.vue';
import { batchStatusMeta, formatQuantity, stepStatusMeta } from '../production-status';
import { taskTypeTagType } from '../production-task-presentation';
import {
  technicalFileLabel,
  taskStepResponsibleName,
  taskStepReferenceFileName,
  useProductionTaskStepsDialog,
} from '../composables/useProductionTaskStepsDialog';
import ProductionStepProgress from './ProductionStepProgress.vue';

const props = defineProps<{
  visible: boolean;
  batchId: string | null;
  batchLabel?: string;
}>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'changed', batchId: string): void;
}>();
const {
  batch,
  stepRecords,
  loading,
  error,
  detailReady,
  readActive,
  submitting,
  editor,
  editorTitle,
  isAssignment,
  currentStep,
  basisChanged,
  unknownResult,
  needsRecheck,
  writeError,
  responsibleUserId,
  actualSopFileId,
  users,
  usersLoading,
  usersError,
  sopFiles,
  sopLoading,
  sopError,
  selectedUserMissing,
  selectedFileMissing,
  userFallbackLabel,
  fileFallbackLabel,
  canOperate,
  canSubmit,
  editorBlockedReason,
  loadStepRecords,
  refreshUsers,
  refreshSopFiles,
  selectUser,
  selectFile,
  openAction,
  adoptCurrentBasis,
  submit,
  closeEditor,
  close,
} = useProductionTaskStepsDialog(props, {
  changed: (batchId) => emit('changed', batchId),
  closed: () => emit('update:visible', false),
});

async function closeCommandDialog(done?: () => void): Promise<void> {
  if (await closeEditor()) done?.();
}

defineExpose({ close });
</script>

<style scoped>
.workbench-toolbar,
.summary-heading,
.current-step-toolbar,
.candidate-toolbar,
.step-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.workbench-toolbar,
.current-step-toolbar {
  justify-content: space-between;
}
.workbench-toolbar {
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.summary-heading {
  flex-wrap: wrap;
  color: var(--el-text-color-primary);
}
.summary-heading strong {
  font-size: 16px;
}
.summary-caption {
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.secondary-text {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.file-name {
  overflow-wrap: anywhere;
}
.steps-table :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.steps-table :deep(.el-table__cell) {
  padding: 12px 0;
  border-bottom-color: var(--el-border-color-lighter);
}
.steps-table :deep(.el-table__body tr:hover > td) {
  background: var(--el-fill-color);
}
.step-status {
  margin-bottom: 8px;
}
.step-actions {
  flex-wrap: wrap;
}
.step-actions :deep(.el-button) {
  margin-left: 0;
}
.blocked-reason {
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}
.section-gap {
  margin-bottom: 16px;
}
.steps-table + .section-gap {
  margin-top: 12px;
}
.command-identity {
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}
.selection-control,
.selection-control :deep(.el-select) {
  width: 100%;
}
.selection-warning {
  display: block;
  margin-top: 8px;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
  line-height: 1.5;
}
.candidate-toolbar {
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.current-step-section {
  padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.current-step-toolbar {
  margin-bottom: 8px;
}
.current-step-summary {
  color: var(--el-text-color-regular);
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.recheck-button {
  margin-top: 12px;
}
</style>
