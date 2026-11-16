<template>
  <main class="approval-flows-page">
    <section class="page-intro">
      <div>
        <p>按场景单独开启审批；关闭时新提交直接生效，开启前须先配置并发布流程。</p>
        <p>
          开关及新发布流程只影响新提交。在途申请继续原流程，关闭不会自动通过；发布不会自动开启审批。
        </p>
      </div>
      <el-button
        :icon="Refresh"
        :loading="loading"
        :disabled="busy || editorVisible"
        @click="loadScenes"
        >刷新</el-button
      >
    </section>

    <el-alert
      v-if="scenesError"
      :title="scenesError"
      type="error"
      :closable="false"
      show-icon
      class="scenes-error"
    />

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
          label="最终放行要求"
          min-width="180"
        >
          <template #default="{ row }">{{ finalAssigneeLabel(row) }}</template>
        </el-table-column>
        <el-table-column
          label="配置状态"
          width="140"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.configured ? 'success' : 'warning'"
              effect="light"
              >{{ row.configured ? `已发布 V${row.activeFlowVersion}` : '未发布' }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="审批开关"
          width="180"
        >
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled"
              active-text="开启"
              inactive-text="关闭"
              :aria-label="`${row.name}审批开关`"
              :loading="changingSceneCode === row.code"
              :disabled="
                !scenesReady ||
                loading ||
                busy ||
                flowLoading ||
                editorVisible ||
                (!row.isEnabled && !row.configured)
              "
              :before-change="() => changeEnabled(row)"
            />
            <div
              v-if="!row.configured"
              class="switch-hint"
            >
              先配置并发布流程
            </div>
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
              :disabled="!scenesReady || loading || flowLoading || busy"
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
      :user-options="userOptions"
      :saving="saving"
      :publishing="publishing"
      @update:visible="editorVisible = $event"
      @save="saveDraft"
      @publish="publish"
      @refresh-roles="loadRoleOptions"
      @refresh-users="loadUserOptions"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ApprovalFlowDetail,
  ApprovalRoleOption,
  ApprovalSceneItem,
  SaveApprovalFlowDraft,
  UserOption,
} from '@company/contracts';
import { approvalApi } from '../../api/approval';
import ApprovalFlowEditorDialog from './components/ApprovalFlowEditorDialog.vue';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';

defineOptions({ name: 'ApprovalFlowsPage' });

const scenes = ref<ApprovalSceneItem[]>([]);
const roleOptions = ref<ApprovalRoleOption[]>([]);
const userOptions = ref<UserOption[]>([]);
const loading = ref(false);
const flowLoading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const changingSceneCode = ref<string | null>(null);
const busy = computed(() => saving.value || publishing.value || changingSceneCode.value !== null);
const scenesReady = ref(false);
const scenesError = ref('');
const editorVisible = ref(false);
const selectedSceneCode = ref<string | null>(null);
const flowDetail = ref<ApprovalFlowDetail | null>(null);
const sceneReads = useLatestReadRequest(() => (loading.value = false));
const roleReads = useLatestReadRequest(() => {});
const userReads = useLatestReadRequest(() => {});
const flowReads = useLatestReadRequest(() => (flowLoading.value = false));
let editorEpoch = 0;

const finalAssigneeLabel = (scene: ApprovalSceneItem): string =>
  scene.requiredFinalAssigneeSourceCode
    ? (scene.businessAssigneeSources.find(
        (source) => source.code === scene.requiredFinalAssigneeSourceCode,
      )?.name ?? scene.requiredFinalAssigneeSourceCode)
    : '按配置节点审批';

const loadScenes = async (): Promise<void> => {
  if (!sceneReads.isActive() || busy.value) return;
  const { isCurrent, signal } = sceneReads.begin();
  loading.value = true;
  scenesReady.value = false;
  scenesError.value = '';
  try {
    const result = await approvalApi.scenes({ signal, skipErrorHandling: true });
    if (!isCurrent()) return;
    scenes.value = result;
    scenesReady.value = true;
  } catch (error) {
    if (!isCurrent()) return;
    scenesError.value = '审批场景加载失败，请刷新后再操作。';
    EMessage.error(error, '审批场景加载失败');
  } finally {
    if (isCurrent()) loading.value = false;
  }
};

const loadRoleOptions = async (): Promise<void> => {
  if (!roleReads.isActive() || !editorVisible.value) return;
  const { isCurrent, signal } = roleReads.begin(() => editorVisible.value);
  try {
    const result = await approvalApi.roleOptions({ signal });
    if (isCurrent()) roleOptions.value = result;
  } catch (error) {
    if (isCurrent()) EMessage.error(error, '审批角色加载失败');
  }
};

const openEditor = async (sceneCode: string): Promise<void> => {
  if (
    !flowReads.isActive() ||
    !scenesReady.value ||
    loading.value ||
    flowLoading.value ||
    busy.value
  )
    return;
  const epoch = ++editorEpoch;
  selectedSceneCode.value = sceneCode;
  flowDetail.value = null;
  editorVisible.value = true;
  const { isCurrent, signal } = flowReads.begin(
    () => editorVisible.value && selectedSceneCode.value === sceneCode && editorEpoch === epoch,
  );
  flowLoading.value = true;
  try {
    const [detail] = await Promise.all([
      approvalApi.flow(sceneCode, { signal, skipErrorHandling: true }),
      loadRoleOptions(),
      loadUserOptions(),
    ]);
    if (!isCurrent()) return;
    flowDetail.value = detail;
    syncScene(detail);
  } catch (error) {
    if (!isCurrent()) return;
    editorVisible.value = false;
    EMessage.error(error, '审批流程加载失败');
  } finally {
    if (isCurrent()) flowLoading.value = false;
  }
};

const loadUserOptions = async (): Promise<void> => {
  if (!userReads.isActive() || !editorVisible.value) return;
  const { isCurrent, signal } = userReads.begin(() => editorVisible.value);
  try {
    const result = await approvalApi.userOptions({ signal });
    if (isCurrent()) userOptions.value = result;
  } catch (error) {
    if (isCurrent()) EMessage.error(error, '审批用户加载失败');
  }
};

const syncScene = (detail: ApprovalFlowDetail): void => {
  scenes.value = scenes.value.map((scene) =>
    scene.code === detail.sceneCode
      ? {
          ...scene,
          isEnabled: detail.isEnabled,
          definitionVersion: detail.definitionVersion,
          configured: Boolean(detail.published),
          activeFlowVersion: detail.published?.versionNo ?? null,
        }
      : scene,
  );
};

const changeEnabled = async (scene: ApprovalSceneItem): Promise<boolean> => {
  if (
    !sceneReads.isActive() ||
    !scenesReady.value ||
    loading.value ||
    busy.value ||
    flowLoading.value ||
    editorVisible.value ||
    (!scene.isEnabled && !scene.configured)
  )
    return false;
  const isEnabled = !scene.isEnabled;
  changingSceneCode.value = scene.code;
  try {
    try {
      await RouteMessageBox.confirm(
        isEnabled
          ? `开启「${scene.name}」审批后，新提交按已发布流程审批。在途申请继续原流程。确认开启？`
          : `关闭「${scene.name}」审批后，新提交直接生效。在途申请继续原流程，不会自动通过。确认关闭？`,
        isEnabled ? '开启场景审批' : '关闭场景审批',
        { type: 'warning', confirmButtonText: isEnabled ? '开启审批' : '关闭审批' },
      );
    } catch {
      // 取消确认或离开路由时不改变当前开关。
      return false;
    }
    const current = scenes.value.find((item) => item.code === scene.code);
    if (
      !sceneReads.isActive() ||
      !scenesReady.value ||
      !current ||
      current.definitionVersion !== scene.definitionVersion ||
      current.isEnabled !== scene.isEnabled
    )
      return false;
    sceneReads.invalidate();
    try {
      const detail = await approvalApi.setFlowEnabled(scene.code, {
        isEnabled,
        version: scene.definitionVersion,
      });
      if (sceneReads.isActive()) {
        syncScene(detail);
        EMessage.success(
          isEnabled ? '审批已开启，新提交将按已发布流程审批' : '审批已关闭，新提交将直接生效',
        );
      } else {
        scenesReady.value = false;
        scenesError.value = '审批开关已更新，请刷新核对当前配置。';
      }
    } catch (error) {
      scenesReady.value = false;
      scenesError.value = '审批开关更新未完成核对，请刷新后再操作。';
      if (sceneReads.isActive()) EMessage.error(error, '审批开关更新失败');
    }
  } finally {
    changingSceneCode.value = null;
  }
  // 使用服务端返回值更新开关，避免确认或请求失败时先显示为成功。
  return false;
};

const saveDraft = async (payload: SaveApprovalFlowDraft): Promise<void> => {
  if (
    !selectedSceneCode.value ||
    !editorVisible.value ||
    !flowReads.isActive() ||
    flowLoading.value ||
    busy.value
  )
    return;
  const sceneCode = selectedSceneCode.value;
  const epoch = editorEpoch;
  saving.value = true;
  try {
    const result = await approvalApi.saveFlowDraft(sceneCode, payload);
    syncScene(result);
    if (epoch !== editorEpoch || selectedSceneCode.value !== sceneCode || !editorVisible.value)
      return;
    flowDetail.value = result;
    if (flowReads.isActive()) EMessage.success('审批流程草稿已保存');
  } catch (error) {
    if (
      epoch === editorEpoch &&
      selectedSceneCode.value === sceneCode &&
      editorVisible.value &&
      flowReads.isActive()
    ) {
      EMessage.error(error, '审批流程草稿保存失败');
    }
  } finally {
    saving.value = false;
  }
};

const publish = async (payload: SaveApprovalFlowDraft): Promise<void> => {
  if (
    !selectedSceneCode.value ||
    !editorVisible.value ||
    !flowReads.isActive() ||
    flowLoading.value ||
    busy.value
  )
    return;
  const sceneCode = selectedSceneCode.value;
  const epoch = editorEpoch;
  publishing.value = true;
  try {
    // Save the current editor state first. A publish click must never publish
    // a stale draft after the administrator changed a role or node order.
    const saved = await approvalApi.saveFlowDraft(sceneCode, payload);
    syncScene(saved);
    if (!saved.draft) return;
    if (editorEpoch === epoch && selectedSceneCode.value === sceneCode && editorVisible.value) {
      flowDetail.value = saved;
    }
    const published = await approvalApi.publishFlow(sceneCode, {
      draftId: saved.draft.id,
      version: saved.draft.version,
    });
    syncScene(published);
    if (editorEpoch !== epoch || selectedSceneCode.value !== sceneCode || !editorVisible.value)
      return;
    flowDetail.value = published;
    if (!flowReads.isActive()) return;
    editorVisible.value = false;
    EMessage.success(
      published.isEnabled
        ? '审批流程已发布，新提交将使用新流程'
        : '审批流程已发布；审批仍关闭，可在场景开关中开启',
    );
  } catch (error) {
    if (flowReads.isActive()) EMessage.error(error, '审批流程发布失败');
  } finally {
    publishing.value = false;
  }
};

watch(editorVisible, (visible) => {
  if (visible) return;
  editorEpoch += 1;
  flowReads.invalidate();
  roleReads.invalidate();
  userReads.invalidate();
});

onMounted(() => {
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
.page-intro p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.page-intro p + p {
  margin-top: 6px;
}
.scenes-error {
  margin-bottom: 16px;
}
.switch-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
