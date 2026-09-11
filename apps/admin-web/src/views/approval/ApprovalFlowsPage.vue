<template>
  <main class="approval-flows-page">
    <section class="page-intro">
      <div>
        <p>为每项审批配置审核顺序和审批角色，发布后用于新申请。</p>
      </div>
      <el-button
        :icon="Refresh"
        :loading="loading"
        @click="loadScenes"
        >刷新</el-button
      >
    </section>

    <section class="table-panel">
      <el-table
        v-loading="loading"
        :data="scenes"
        class="data-table"
        empty-text="暂无可配置的审批场景"
      >
        <el-table-column
          label="模块"
          prop="module"
          width="140"
        />
        <el-table-column
          label="审批事项"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="scene-name">{{ row.name }}</div>
            <div class="scene-code">{{ row.code }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="说明"
          min-width="300"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.description || '—' }}</template>
        </el-table-column>
        <el-table-column
          label="配置状态"
          width="140"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.configured ? 'success' : 'warning'"
              effect="light"
              >{{ row.configured ? `已发布 V${row.activeFlowVersion}` : '未配置' }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="140"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :loading="flowLoading && selectedSceneCode === row.code"
              :disabled="flowLoading || saving || publishing"
              @click="openEditor(row.code)"
              >配置流程</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </section>

    <ApprovalFlowEditorDialog
      :visible="editorVisible"
      :detail="flowDetail"
      :role-options="roleOptions"
      :saving="saving"
      :publishing="publishing"
      @update:visible="editorVisible = $event"
      @save="saveDraft"
      @publish="publish"
      @refresh-roles="loadRoleOptions"
    />
  </main>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ApprovalFlowDetail,
  ApprovalRoleOption,
  ApprovalSceneItem,
  SaveApprovalFlowDraft,
} from '@company/contracts';
import { approvalApi } from '../../api/approval';
import ApprovalFlowEditorDialog from './components/ApprovalFlowEditorDialog.vue';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'ApprovalFlowsPage' });

const scenes = ref<ApprovalSceneItem[]>([]);
const roleOptions = ref<ApprovalRoleOption[]>([]);
const loading = ref(false);
const flowLoading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const editorVisible = ref(false);
const selectedSceneCode = ref<string | null>(null);
const flowDetail = ref<ApprovalFlowDetail | null>(null);
let scenesRequestToken = 0;
let roleRequestToken = 0;
let flowRequestToken = 0;

const loadScenes = async (): Promise<void> => {
  const token = ++scenesRequestToken;
  loading.value = true;
  try {
    const result = await approvalApi.scenes();
    if (token === scenesRequestToken) scenes.value = result;
  } catch (error) {
    if (token === scenesRequestToken) EMessage.error(error, '审批场景加载失败');
  } finally {
    if (token === scenesRequestToken) loading.value = false;
  }
};

const loadRoleOptions = async (): Promise<void> => {
  const token = ++roleRequestToken;
  try {
    const result = await approvalApi.roleOptions();
    if (token === roleRequestToken) roleOptions.value = result;
  } catch (error) {
    if (token === roleRequestToken) EMessage.error(error, '审批角色加载失败');
  }
};

const openEditor = async (sceneCode: string): Promise<void> => {
  const token = ++flowRequestToken;
  selectedSceneCode.value = sceneCode;
  flowDetail.value = null;
  editorVisible.value = true;
  flowLoading.value = true;
  try {
    const [detail] = await Promise.all([approvalApi.flow(sceneCode), loadRoleOptions()]);
    if (token !== flowRequestToken) return;
    flowDetail.value = detail;
  } catch (error) {
    if (token !== flowRequestToken) return;
    editorVisible.value = false;
    EMessage.error(error, '审批流程加载失败');
  } finally {
    if (token === flowRequestToken) flowLoading.value = false;
  }
};

const saveDraft = async (payload: SaveApprovalFlowDraft): Promise<void> => {
  if (!selectedSceneCode.value) return;
  const sceneCode = selectedSceneCode.value;
  const token = flowRequestToken;
  saving.value = true;
  try {
    const result = await approvalApi.saveFlowDraft(sceneCode, payload);
    if (token !== flowRequestToken || selectedSceneCode.value !== sceneCode) return;
    flowDetail.value = result;
    EMessage.success('审批流程草稿已保存');
  } catch (error) {
    if (token === flowRequestToken && selectedSceneCode.value === sceneCode) {
      EMessage.error(error, '审批流程草稿保存失败');
    }
  } finally {
    saving.value = false;
  }
};

const publish = async (payload: SaveApprovalFlowDraft): Promise<void> => {
  if (!selectedSceneCode.value) return;
  const sceneCode = selectedSceneCode.value;
  publishing.value = true;
  try {
    // Save the current editor state first. A publish click must never publish
    // a stale draft after the administrator changed a role or node order.
    const saved = await approvalApi.saveFlowDraft(sceneCode, payload);
    if (selectedSceneCode.value !== sceneCode || !saved.draft) return;
    flowDetail.value = saved;
    const published = await approvalApi.publishFlow(sceneCode, {
      draftId: saved.draft.id,
      version: saved.draft.version,
    });
    if (selectedSceneCode.value !== sceneCode) return;
    flowDetail.value = published;
    editorVisible.value = false;
    await loadScenes();
    EMessage.success('审批流程已发布');
  } catch (error) {
    EMessage.error(error, '审批流程发布失败');
  } finally {
    publishing.value = false;
  }
};

onMounted(() => {
  void Promise.all([loadScenes(), loadRoleOptions()]);
});
onActivated(() => {
  void loadScenes();
});
</script>

<style scoped>
.approval-flows-page {
  min-width: 0;
}
.page-intro,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.page-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  padding: 18px 20px;
}
.page-intro h2 {
  margin: 0 0 6px;
  color: #1f2937;
  font-size: 18px;
}
.page-intro p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.scene-name {
  color: #1f2937;
  font-weight: 600;
}
.scene-code {
  margin-top: 3px;
  color: #9ca3af;
  font-size: 12px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
</style>
