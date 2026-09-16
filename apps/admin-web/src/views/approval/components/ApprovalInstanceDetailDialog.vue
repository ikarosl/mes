<template>
  <el-dialog
    :model-value="visible"
    title="审批详情"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div
      v-if="detail"
      class="detail-body"
    >
      <section class="detail-header">
        <div>
          <div class="detail-title">{{ detail.title }}</div>
          <div class="detail-subtitle">申请编号：{{ detail.instanceNo }}</div>
        </div>
        <el-tag
          :type="statusMeta(detail.status).type"
          effect="light"
          >{{ statusMeta(detail.status).label }}</el-tag
        >
      </section>

      <el-alert
        v-if="detail.blocked"
        type="warning"
        :closable="false"
        show-icon
        class="blocked-alert"
        title="当前节点暂无合格审批人，申请已保留。角色成员或指定用户恢复审批资格后即可继续处理。"
      />

      <el-descriptions
        :column="3"
        border
        class="summary"
      >
        <el-descriptions-item label="审批事项">{{
          sceneLabel(detail.sceneCode)
        }}</el-descriptions-item>
        <el-descriptions-item label="申请人">{{ detail.applicantName }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{
          formatDateTime(detail.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item
          v-if="bomSnapshot"
          label="成品编码"
          >{{ bomSnapshot?.itemCode ?? '—' }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="bomSnapshot"
          label="成品名称"
          >{{ bomSnapshot?.productName ?? '—' }}</el-descriptions-item
        >
        <el-descriptions-item
          v-if="bomSnapshot"
          label="单位"
          >{{ bomSnapshot?.unit ?? '—' }}</el-descriptions-item
        >
      </el-descriptions>

      <div
        v-if="bomSnapshot?.specValues.length"
        class="spec-list"
      >
        <span class="spec-label">成品规格：</span>
        <span
          v-for="spec in bomSnapshot?.specValues"
          :key="`${spec.key}-${spec.value}`"
          class="spec-item"
          >{{ spec.key }}：{{ spec.value }}{{ spec.unit ? ` ${spec.unit}` : '' }}</span
        >
      </div>

      <section class="section-block">
        <div class="section-title">审批进度</div>
        <div class="steps-list">
          <div
            v-for="step in detail.steps"
            :key="step.id"
            class="step-card"
            :class="`step-${step.status}`"
          >
            <div class="step-card-header">
              <div>
                <span class="step-number">{{ step.stepNo }}</span>
                <strong>{{ step.name }}</strong>
                <span class="step-role"
                  >{{ APPROVAL_ASSIGNEE_TYPE_LABELS[step.assigneeType] }}：{{
                    step.roleName ?? step.assigneeUserName
                  }}</span
                >
              </div>
              <el-tag
                :type="stepStatusMeta(step.status).type"
                size="small"
                effect="light"
                >{{ stepStatusMeta(step.status).label }}</el-tag
              >
            </div>
            <div
              v-if="step.blockedReason"
              class="step-blocked"
            >
              暂无合格审批人，等待审批资格恢复
            </div>
            <div
              v-if="step.eligibleUsers.length"
              class="task-list"
            >
              <span
                v-for="user in step.eligibleUsers"
                :key="user.id"
                class="task-chip"
              >
                {{ user.displayName }} · 当前可处理
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="bomSnapshot"
        class="section-block"
      >
        <div class="section-title">BOM 受审内容</div>
        <el-table
          :data="bomSnapshot.materials"
          class="bom-table"
          size="small"
          empty-text="暂无 BOM 明细"
        >
          <el-table-column
            label="物料编码"
            min-width="160"
            prop="itemCode"
          />
          <el-table-column
            label="物料名称"
            min-width="180"
          >
            <template #default="{ row }">{{
              detail.materialNames[row.materialId] ?? '—'
            }}</template>
          </el-table-column>
          <el-table-column
            label="单位用量"
            width="120"
            prop="quantityPerUnit"
          />
          <el-table-column
            label="单位"
            width="100"
            prop="unit"
          />
          <el-table-column
            label="备注"
            min-width="180"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section
        v-if="correctionSnapshot"
        class="section-block"
      >
        <div class="section-title">需求更正受审内容</div>
        <DemandCorrectionEvidence
          :check="correctionSnapshot.check"
          :new-remaining-quantity="correctionSnapshot.newRemainingQuantity"
        />
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="更正后总量">{{
            correctionSnapshot.targetTotalQuantity
          }}</el-descriptions-item>
          <el-descriptions-item label="本次新建剩余量">{{
            correctionSnapshot.newRemainingQuantity
          }}</el-descriptions-item>
          <el-descriptions-item label="申请类型">{{
            DEMAND_CORRECTION_KIND_LABELS[correctionSnapshot.correctionKind]
          }}</el-descriptions-item>
          <el-descriptions-item
            label="原因"
            :span="3"
            >{{ correctionSnapshot.reason }}</el-descriptions-item
          >
        </el-descriptions>
      </section>
      <section
        v-if="closeoutSnapshot"
        class="section-block"
      >
        <BatchCloseoutEvidence :snapshot="closeoutSnapshot" />
      </section>
      <section class="section-block">
        <div class="section-title">处理记录</div>
        <el-timeline v-if="detail.actions.length">
          <el-timeline-item
            v-for="action in detail.actions"
            :key="action.id"
            :timestamp="formatDateTime(action.createdAt)"
            placement="top"
          >
            <div class="action-line">
              <strong>{{ action.actorName }}</strong>
              <span
                >{{ actionLabel(action.actionType)
                }}<template v-if="action.stepId && actionStepNo(action.stepId)"
                  >（第{{ actionStepNo(action.stepId) }}级）</template
                ></span
              >
            </div>
            <div
              v-if="action.comment"
              class="action-comment"
            >
              {{ action.comment }}
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty
          v-else
          :image-size="60"
          description="暂无处理记录"
        />
      </section>

      <section
        v-if="canOperate"
        class="operation-panel"
      >
        <div class="section-title">当前节点处理</div>
        <el-input
          v-model="comment"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          :placeholder="detail.canApprove ? '审批意见（驳回时必填）' : '撤回说明（可选）'"
        />
        <div class="operation-actions">
          <el-button
            v-if="detail.canApprove"
            type="success"
            :loading="submitting"
            @click="approve"
            >通过当前节点</el-button
          >
          <el-button
            v-if="detail.canApprove"
            type="danger"
            :loading="submitting"
            @click="reject"
            >驳回申请</el-button
          >
          <el-button
            v-if="detail.canWithdraw"
            :loading="submitting"
            @click="withdraw"
            >撤回申请</el-button
          >
        </div>
      </section>
      <el-alert
        v-else-if="detail.status === 'pending' && !detail.blocked"
        type="info"
        :closable="false"
        show-icon
        title="当前账号没有可处理的待办，审批仍需由当前节点的合格人员明确操作。"
      />
    </div>
    <el-empty
      v-else
      description="审批详情加载中"
    />
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  APPROVAL_ACTION_TYPE_LABELS,
  APPROVAL_INSTANCE_STATUS_LABELS,
  APPROVAL_STEP_STATUS_LABELS,
  APPROVAL_ASSIGNEE_TYPE_LABELS,
  APPROVAL_SCENE_LABELS,
  DEMAND_CORRECTION_KIND_LABELS,
} from '@company/constants';
import type {
  ApprovalActionType,
  ApprovalInstanceDetail,
  ApprovalInstanceStatus,
  ApprovalStepStatus,
} from '@company/contracts';
import DemandCorrectionEvidence from '../../production/components/DemandCorrectionEvidence.vue';
import BatchCloseoutEvidence from '../../production/components/BatchCloseoutEvidence.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

defineOptions({ name: 'ApprovalInstanceDetailDialog' });

const props = defineProps<{
  visible: boolean;
  detail: ApprovalInstanceDetail | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'approve', comment: string): void;
  (event: 'reject', comment: string): void;
  (event: 'withdraw', comment: string): void;
}>();

const bomSnapshot = computed(() =>
  props.detail && 'productId' in props.detail.subjectSnapshot ? props.detail.subjectSnapshot : null,
);
const correctionSnapshot = computed(() =>
  props.detail &&
  'kind' in props.detail.subjectSnapshot &&
  props.detail.subjectSnapshot.kind === 'demand_correction'
    ? props.detail.subjectSnapshot
    : null,
);
const closeoutSnapshot = computed(() =>
  props.detail &&
  'kind' in props.detail.subjectSnapshot &&
  props.detail.subjectSnapshot.kind === 'batch_closeout'
    ? props.detail.subjectSnapshot
    : null,
);
const comment = ref('');
const canOperate = computed(() =>
  Boolean(
    props.detail &&
    props.detail.status === 'pending' &&
    (props.detail.canApprove || props.detail.canWithdraw),
  ),
);
const currentStepId = computed(
  () =>
    props.detail?.steps.find((step) => step.status === 'pending' || step.status === 'blocked')
      ?.id ?? null,
);
watch(
  () => [props.visible, props.detail?.id, currentStepId.value] as const,
  ([visible], previous) => {
    if (!visible || previous?.[1] !== props.detail?.id || previous?.[2] !== currentStepId.value) {
      comment.value = '';
    }
  },
  { immediate: true },
);

const statusMeta = (status: ApprovalInstanceStatus) =>
  ({
    label: APPROVAL_INSTANCE_STATUS_LABELS[status],
    type:
      status === 'approved'
        ? 'success'
        : status === 'rejected' || status === 'withdrawn'
          ? 'danger'
          : 'warning',
  }) as const;
const stepStatusMeta = (status: ApprovalStepStatus) =>
  ({
    label: APPROVAL_STEP_STATUS_LABELS[status],
    type:
      status === 'approved'
        ? 'success'
        : status === 'rejected' || status === 'cancelled'
          ? 'danger'
          : status === 'blocked'
            ? 'warning'
            : status === 'pending'
              ? 'primary'
              : 'info',
  }) as const;
const actionLabel = (type: ApprovalActionType) => APPROVAL_ACTION_TYPE_LABELS[type];
const sceneLabel = (sceneCode: string) => APPROVAL_SCENE_LABELS[sceneCode] ?? sceneCode;
const actionStepNo = (stepId: string): number | null =>
  props.detail?.steps.find((step) => step.id === stepId)?.stepNo ?? null;
const formatDateTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

const requireComment = (message: string): string | null => {
  const value = comment.value.trim();
  if (!value) {
    EMessage.warning(message);
    return null;
  }
  return value;
};
const approve = (): void => emit('approve', comment.value.trim());
const reject = (): void => {
  const value = requireComment('驳回申请必须填写原因');
  if (value) emit('reject', value);
};
const withdraw = (): void => emit('withdraw', comment.value.trim());
</script>

<style scoped>
.detail-body {
  max-height: 68vh;
  overflow-y: auto;
  padding-right: 4px;
}
.detail-header,
.step-card-header,
.operation-actions,
.action-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.detail-header {
  margin-bottom: 16px;
}
.detail-title {
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
}
.detail-subtitle,
.step-role {
  color: #6b7280;
  font-size: 12px;
}
.detail-subtitle {
  margin-top: 4px;
}
.blocked-alert {
  margin-bottom: 16px;
}
.summary {
  margin-bottom: 20px;
}
.spec-list {
  margin-top: -8px;
  color: #374151;
  font-size: 13px;
}
.spec-label {
  color: #6b7280;
}
.spec-item {
  display: inline-block;
  margin-right: 14px;
}
.section-block {
  margin-top: 20px;
}
.section-title {
  margin-bottom: 10px;
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
}
.steps-list {
  display: grid;
  gap: 8px;
}
.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px 14px;
  background: #fff;
}
.step-card.step-pending {
  border-color: #93c5fd;
  background: #eff6ff;
}
.step-card.step-blocked {
  border-color: #fcd34d;
  background: #fffbeb;
}
.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 12px;
}
.step-role {
  margin-left: 12px;
}
.step-blocked {
  margin-top: 8px;
  color: #b45309;
  font-size: 12px;
}
.task-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.task-chip {
  border-radius: 4px;
  padding: 3px 7px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
}
.bom-table :deep(.el-table__header th) {
  background: #f9fafb;
  color: #1f2937;
}
.action-line {
  justify-content: flex-start;
}
.action-line span {
  color: #374151;
}
.action-comment {
  margin-top: 5px;
  color: #6b7280;
  white-space: pre-wrap;
}
.operation-panel {
  margin-top: 20px;
  border-top: 1px solid #e5e7eb;
  padding-top: 18px;
}
.operation-actions {
  justify-content: flex-start;
  margin-top: 12px;
}
</style>
