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
        title="每一级选择一个角色；该角色下任意一名合格人员处理即可。已发布版本用于在途申请，保存新草稿不会改变已发布流程。"
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
          min-width="220"
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
          label="审批角色"
          min-width="300"
        >
          <template #default="{ row }">
            <el-select
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
          </template>
        </el-table-column>
        <el-table-column
          label="处理方式"
          width="150"
        >
          <template #default>任意一人通过</template>
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
import type {
  ApprovalFlowDetail,
  ApprovalRoleOption,
  SaveApprovalFlowDraft,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

defineOptions({ name: 'ApprovalFlowEditorDialog' });

type EditorStep = {
  rowKey: string;
  nodeCode?: string;
  name: string;
  roleId: string;
};

const props = defineProps<{
  visible: boolean;
  detail: ApprovalFlowDetail | null;
  roleOptions: ApprovalRoleOption[];
  saving: boolean;
  publishing: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'save', value: SaveApprovalFlowDraft): void;
  (event: 'publish', value: SaveApprovalFlowDraft): void;
  (event: 'refresh-roles'): void;
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
    roleId: step.roleId,
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
    steps.value.every((step) => step.name.trim() && step.roleId),
  ),
);

const addStep = (): void => {
  steps.value.push({ rowKey: `new-${rowSequence++}`, name: '', roleId: '' });
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

const buildPayload = (): SaveApprovalFlowDraft | null => {
  if (!props.detail || !formName.value.trim()) {
    EMessage.warning('请输入流程名称');
    return null;
  }
  if (!steps.value.length) {
    EMessage.warning('请至少添加一个审批节点');
    return null;
  }
  if (steps.value.some((step) => !step.name.trim() || !step.roleId)) {
    EMessage.warning('请补全每个节点名称和审批角色');
    return null;
  }
  if (
    steps.value.some((step) =>
      hasUnavailableSelection(props.roleOptions, [step.roleId], (role) => role.id),
    )
  ) {
    EMessage.warning('审批角色已失效，请重新选择');
    return null;
  }
  return {
    name: formName.value.trim(),
    draftId: props.detail.draft?.id ?? null,
    version: props.detail.draft?.version ?? null,
    steps: steps.value.map((step) => ({
      ...(step.nodeCode ? { nodeCode: step.nodeCode } : {}),
      name: step.name.trim(),
      roleId: step.roleId,
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
.version-tip {
  margin-top: 12px;
  color: #6b7280;
  font-size: 12px;
}
</style>
