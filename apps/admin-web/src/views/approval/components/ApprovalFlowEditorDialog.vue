<template>
  <el-dialog
    :model-value="visible"
    title="配置审批流程"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="detail">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="flow-tip"
        title="每级选择一个角色或一个指定用户。角色成员随当前资格变化，指定用户由本人处理；新发布流程只用于新申请。"
      />
      <el-form
        label-width="90px"
        class="flow-form"
      >
        <el-form-item label="流程名称">
          <el-input
            v-model="formName"
            maxlength="100"
            show-word-limit
            placeholder="请输入流程名称"
          />
        </el-form-item>
      </el-form>

      <div class="step-heading">
        <div>
          <strong>审批节点</strong>
          <span class="step-caption">按顺序依次处理，至少配置一级</span>
        </div>
        <el-button
          type="primary"
          plain
          @click="addStep"
          >添加节点</el-button
        >
      </div>
      <el-table
        :data="steps"
        row-key="rowKey"
        class="step-table"
        empty-text="尚未配置审批节点"
      >
        <el-table-column
          label="顺序"
          width="76"
          align="center"
        >
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column
          label="节点名称"
          min-width="180"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.name"
              maxlength="100"
              placeholder="例如：技术审核"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="审批对象"
          min-width="360"
        >
          <template #default="{ row }">
            <div class="assignee-fields">
              <el-select
                v-model="row.assigneeType"
                @change="changeAssigneeType(row)"
              >
                <el-option
                  v-for="value in APPROVAL_ASSIGNEE_TYPES"
                  :key="value"
                  :value="value"
                  :label="APPROVAL_ASSIGNEE_TYPE_LABELS[value]"
                />
              </el-select>
              <el-select
                v-if="row.assigneeType === APPROVAL_ASSIGNEE_TYPE.role"
                v-model="row.roleId"
                filterable
                placeholder="请选择角色"
                class="role-select"
                @visible-change="(open: boolean) => open && $emit('refresh-roles')"
              >
                <el-option
                  v-for="choice in roleChoices(row.roleId)"
                  :key="choice.value"
                  :value="choice.value"
                  :disabled="choice.isUnavailable"
                  :label="
                    choice.option
                      ? `${choice.option.name}（${choice.option.eligibleUserCount}人可审批）`
                      : `${choice.value}（已失效）`
                  "
                />
              </el-select>
              <el-select
                v-else
                v-model="row.assigneeUserId"
                filterable
                placeholder="请选择用户"
                class="role-select"
                @visible-change="(open: boolean) => open && $emit('refresh-users')"
              >
                <el-option
                  v-for="choice in userChoices(row.assigneeUserId)"
                  :key="choice.value"
                  :value="choice.value"
                  :disabled="choice.isUnavailable"
                  :label="choice.option ? choice.option.displayName : '已失效，请重新选择'"
                />
              </el-select>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="180"
          align="center"
        >
          <template #default="{ $index }">
            <el-button
              link
              type="primary"
              :disabled="$index === 0"
              @click="moveStep($index, -1)"
              >上移</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="$index === steps.length - 1"
              @click="moveStep($index, 1)"
              >下移</el-button
            >
            <el-button
              link
              type="danger"
              @click="removeStep($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <div
        v-if="detail.draft"
        class="version-tip"
      >
        当前编辑的是未发布草稿 V{{ detail.draft.versionNo }}，保存时会校验版本。
      </div>
    </template>
    <el-empty
      v-else
      description="流程详情加载中"
    />
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!canSave"
        @click="save"
        >保存草稿</el-button
      >
      <el-button
        type="success"
        :loading="publishing"
        :disabled="!canPublish"
        @click="publish"
        >发布流程</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  APPROVAL_ASSIGNEE_TYPE,
  APPROVAL_ASSIGNEE_TYPES,
  APPROVAL_ASSIGNEE_TYPE_LABELS,
} from '@company/constants';
import type {
  ApprovalFlowDetail,
  ApprovalRoleOption,
  SaveApprovalFlowDraft,
  ApprovalAssigneeType,
  UserOption,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

defineOptions({ name: 'ApprovalFlowEditorDialog' });

type EditorStep = {
  rowKey: string;
  nodeCode?: string;
  name: string;
  assigneeType: ApprovalAssigneeType;
  roleId: string;
  assigneeUserId: string;
};

const props = defineProps<{
  visible: boolean;
  detail: ApprovalFlowDetail | null;
  roleOptions: ApprovalRoleOption[];
  userOptions: UserOption[];
  saving: boolean;
  publishing: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'save', value: SaveApprovalFlowDraft): void;
  (event: 'publish', value: SaveApprovalFlowDraft): void;
  (event: 'refresh-roles'): void;
  (event: 'refresh-users'): void;
}>();

const formName = ref('');
const steps = ref<EditorStep[]>([]);
let rowSequence = 0;

const resetFromDetail = (detail: ApprovalFlowDetail | null): void => {
  formName.value = detail?.name ?? '';
  // A draft is authoritative even when the administrator intentionally removed
  // every node; only a missing draft falls back to the published version.
  const source = detail?.draft ? detail.draft.steps : (detail?.published?.steps ?? []);
  steps.value = source.map((step) => ({
    rowKey: `${step.nodeCode || 'new'}-${rowSequence++}`,
    nodeCode: step.nodeCode || undefined,
    name: step.name,
    assigneeType: step.assigneeType,
    roleId: step.roleId ?? '',
    assigneeUserId: step.assigneeUserId ?? '',
  }));
};

watch(
  () => [props.visible, props.detail] as const,
  ([visible, detail]) => {
    if (visible) resetFromDetail(detail);
  },
  { immediate: true },
);

const canSave = computed(() =>
  Boolean(
    props.detail &&
    !props.saving &&
    !props.publishing &&
    formName.value.trim() &&
    steps.value.length,
  ),
);
const canPublish = computed(() =>
  Boolean(
    props.detail &&
    !props.saving &&
    !props.publishing &&
    formName.value.trim() &&
    steps.value.length &&
    steps.value.every((step) => step.name.trim() && selectedAssigneeId(step)),
  ),
);

const addStep = (): void => {
  steps.value.push({
    rowKey: `new-${rowSequence++}`,
    name: '',
    assigneeType: APPROVAL_ASSIGNEE_TYPE.role,
    roleId: '',
    assigneeUserId: '',
  });
};

const selectedAssigneeId = (step: EditorStep): string =>
  step.assigneeType === APPROVAL_ASSIGNEE_TYPE.role ? step.roleId : step.assigneeUserId;

const changeAssigneeType = (step: EditorStep): void => {
  step.roleId = '';
  step.assigneeUserId = '';
  if (step.assigneeType === APPROVAL_ASSIGNEE_TYPE.role) emit('refresh-roles');
  else emit('refresh-users');
};

const removeStep = (index: number): void => {
  steps.value.splice(index, 1);
};

const moveStep = (index: number, offset: -1 | 1): void => {
  const target = index + offset;
  if (target < 0 || target >= steps.value.length) return;
  const [step] = steps.value.splice(index, 1);
  steps.value.splice(target, 0, step);
};

const roleChoices = (selectedId: string) =>
  buildLiveOptions(props.roleOptions, selectedId ? [selectedId] : [], (role) => role.id);
const userChoices = (selectedId: string) =>
  buildLiveOptions(props.userOptions, selectedId ? [selectedId] : [], (user) => user.id);

const buildPayload = (): SaveApprovalFlowDraft | null => {
  if (!props.detail || !formName.value.trim()) {
    EMessage.warning('请输入流程名称');
    return null;
  }
  if (!steps.value.length) {
    EMessage.warning('请至少添加一个审批节点');
    return null;
  }
  if (steps.value.some((step) => !step.name.trim() || !selectedAssigneeId(step))) {
    EMessage.warning('请补全每个节点名称和审批对象');
    return null;
  }
  if (
    steps.value.some((step) =>
      step.assigneeType === APPROVAL_ASSIGNEE_TYPE.role
        ? hasUnavailableSelection(props.roleOptions, [step.roleId], (role) => role.id)
        : hasUnavailableSelection(props.userOptions, [step.assigneeUserId], (user) => user.id),
    )
  ) {
    EMessage.warning('审批对象已失效，请重新选择');
    return null;
  }
  return {
    name: formName.value.trim(),
    draftId: props.detail.draft?.id ?? null,
    version: props.detail.draft?.version ?? null,
    steps: steps.value.map((step) => ({
      ...(step.nodeCode ? { nodeCode: step.nodeCode } : {}),
      name: step.name.trim(),
      assigneeType: step.assigneeType,
      roleId: step.assigneeType === APPROVAL_ASSIGNEE_TYPE.role ? step.roleId : null,
      assigneeUserId:
        step.assigneeType === APPROVAL_ASSIGNEE_TYPE.user ? step.assigneeUserId : null,
    })),
  };
};

const save = (): void => {
  const payload = buildPayload();
  if (payload) emit('save', payload);
};

const publish = (): void => {
  const payload = buildPayload();
  if (!payload) return;
  // Publishing always sends the current form through save-draft first. This
  // prevents a newly edited role/order from being silently omitted in favor of
  // an older saved draft.
  emit('publish', payload);
};
</script>

<style scoped>
.flow-tip {
  margin-bottom: 18px;
}
.flow-form {
  max-width: 720px;
}
.step-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0;
}
.step-caption {
  margin-left: 12px;
  color: #6b7280;
  font-size: 13px;
}
.step-table {
  width: 100%;
}
.step-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.role-select {
  width: 100%;
}
.assignee-fields {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 8px;
}
.version-tip {
  margin-top: 12px;
  color: #6b7280;
  font-size: 12px;
}
</style>
