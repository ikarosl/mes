<template>
  <section class="candidate-configs">
    <div class="config-panel">
      <TableToolbar>
        <template #actions>
          <span class="config-intro">按业务场景配置可选人员所属的启用角色，可选择多个角色。</span>
        </template>
        <template #tools>
          <el-button
            :icon="Refresh"
            :loading="rolesLoading"
            :disabled="anySaving"
            @click="refreshRoles"
            >刷新角色</el-button
          >
          <el-button
            :icon="Refresh"
            :loading="loading"
            :disabled="anySaving"
            @click="refreshConfigs"
            >刷新配置</el-button
          >
        </template>
      </TableToolbar>

      <div class="config-content">
        <el-alert
          v-if="configError"
          title="配置读取失败，本次修改已保留，请刷新配置后再保存。"
          type="error"
          :closable="false"
          show-icon
        />
        <el-alert
          v-if="rolesError"
          title="角色候选读取失败，请刷新角色后再保存。"
          type="error"
          :closable="false"
          show-icon
        />
        <el-skeleton
          v-if="loading && !drafts.length"
          :rows="5"
          animated
        />
        <el-empty
          v-else-if="!drafts.length"
          :description="configError ? '未能读取业务场景配置' : '暂无业务场景'"
        />

        <article
          v-for="draft in drafts"
          :key="draft.basis.sceneCode"
          class="scene-config"
        >
          <div class="scene-heading">
            <strong>{{ USER_CANDIDATE_SCENE_LABELS[draft.basis.sceneCode] }}</strong>
            <el-tag
              v-if="isDirty(draft)"
              type="warning"
              effect="plain"
              >未保存</el-tag
            >
          </div>
          <p class="saved-count">
            已保存配置候选人数：
            <strong>{{ (draft.latest ?? draft.basis).candidateCount }}</strong> 人
            <span v-if="isDirty(draft)">；本次修改保存后更新</span>
          </p>
          <p
            v-if="(draft.latest ?? draft.basis).roles.length"
            class="saved-roles"
          >
            已保存角色：{{
              (draft.latest ?? draft.basis).roles.map((role) => role.name).join('、')
            }}
          </p>

          <el-alert
            v-if="!(draft.latest ?? draft.basis).roleIds.length"
            title="尚未配置候选角色，当前没有可选人员。请选择启用角色后保存。"
            type="info"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="(draft.latest ?? draft.basis).candidateCount === 0"
            title="已保存的角色下暂无启用人员，请核对角色状态及成员。"
            type="warning"
            :closable="false"
            show-icon
          />
          <el-alert
            v-if="draft.conflict"
            title="服务端配置已变化，本次修改仍保留。请核对后重新载入配置，再进行修改。"
            type="warning"
            :closable="false"
            show-icon
          />
          <el-alert
            v-if="draft.needsReview"
            title="保存结果尚未确认，本次修改已保留。请刷新配置核对结果后再继续。"
            type="warning"
            :closable="false"
            show-icon
          />

          <el-form
            class="scene-form"
            label-position="top"
            :model="draft"
            :disabled="loading || draft.saving || draft.needsReview"
            @submit.prevent
          >
            <el-form-item label="候选人员角色">
              <el-select
                v-model="draft.roleIds"
                class="role-select"
                multiple
                clearable
                filterable
                placeholder="请选择启用角色"
                :loading="rolesLoading"
              >
                <el-option
                  v-for="choice in roleChoices[draft.basis.sceneCode]"
                  :key="choice.id"
                  :label="choice.label"
                  :value="choice.id"
                  :class="{ 'unavailable-role': choice.unavailable }"
                />
                <template #empty>
                  <div class="candidate-empty">
                    {{ rolesVerified ? '暂无可选启用角色' : '请刷新角色后重试' }}
                  </div>
                </template>
              </el-select>
            </el-form-item>
            <p
              v-if="hasUnavailableRoles(draft)"
              class="selection-warning"
              role="status"
            >
              已选角色中存在失效角色，原选择已保留。请移除后再保存。
            </p>
            <p class="field-note">同一人员属于多个所选角色时只计一次；清空角色后将没有可选人员。</p>
          </el-form>

          <div class="scene-actions">
            <el-button
              type="primary"
              :loading="draft.saving"
              :disabled="!canSave(draft)"
              @click="saveConfig(draft)"
              >保存配置</el-button
            >
            <el-button
              :disabled="loading || anySaving"
              @click="discardAndReload(draft)"
              >重新载入配置</el-button
            >
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { USER_CANDIDATE_SCENE_LABELS } from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import { useUserCandidateConfigs } from './composables/use-user-candidate-configs';

defineOptions({ name: 'SystemUserCandidates' });

const {
  drafts,
  loading,
  configError,
  rolesLoading,
  rolesVerified,
  rolesError,
  anySaving,
  roleChoices,
  isDirty,
  hasUnavailableRoles,
  canSave,
  refreshConfigs,
  refreshRoles,
  saveConfig,
  discardAndReload,
} = useUserCandidateConfigs();

onMounted(() => {
  void refreshConfigs();
  void refreshRoles();
});
</script>

<style scoped>
.config-panel {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.config-intro,
.saved-count,
.field-note {
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.config-content {
  display: grid;
  gap: 16px;
  padding: 20px;
}
.scene-config {
  display: grid;
  gap: 12px;
}
.scene-config + .scene-config {
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.scene-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scene-heading strong,
.saved-count strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.saved-count,
.saved-roles,
.field-note,
.selection-warning {
  margin: 0;
}
.scene-form {
  max-width: 760px;
}
.scene-form :deep(.el-form-item) {
  margin-bottom: 8px;
}
.role-select {
  width: 100%;
}
.field-note,
.saved-roles,
.selection-warning {
  font-size: 12px;
  line-height: 1.6;
}
.selection-warning,
.unavailable-role {
  color: var(--el-color-warning);
}
.scene-actions {
  display: flex;
  gap: 12px;
}
.scene-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.candidate-empty {
  padding: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  text-align: center;
}
</style>
