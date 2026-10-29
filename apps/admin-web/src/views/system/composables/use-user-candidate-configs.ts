import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import type {
  SystemRoleOption,
  UserCandidateConfigItem,
  UserCandidateSceneCode,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { systemApi } from '../../../api/system';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

export interface UserCandidateConfigDraft {
  basis: UserCandidateConfigItem;
  roleIds: string[];
  latest: UserCandidateConfigItem | null;
  conflict: boolean;
  needsReview: boolean;
  saving: boolean;
}

export interface UserCandidateRoleChoice {
  id: string;
  label: string;
  unavailable: boolean;
}

interface UserCandidateConfigs {
  drafts: Ref<UserCandidateConfigDraft[]>;
  loading: Ref<boolean>;
  configError: Ref<boolean>;
  rolesLoading: Ref<boolean>;
  rolesVerified: Ref<boolean>;
  rolesError: Ref<boolean>;
  anySaving: ComputedRef<boolean>;
  roleChoices: ComputedRef<Record<string, UserCandidateRoleChoice[]>>;
  isDirty: (draft: UserCandidateConfigDraft) => boolean;
  hasUnavailableRoles: (draft: UserCandidateConfigDraft) => boolean;
  canSave: (draft: UserCandidateConfigDraft) => boolean;
  refreshConfigs: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  saveConfig: (draft: UserCandidateConfigDraft) => Promise<void>;
  discardAndReload: (draft: UserCandidateConfigDraft) => Promise<void>;
}

const sameRoleIds = (left: string[], right: string[]): boolean => {
  const sortedRight = [...right].sort();
  return (
    left.length === right.length && [...left].sort().every((id, index) => id === sortedRight[index])
  );
};

const cloneConfig = (config: UserCandidateConfigItem): UserCandidateConfigItem => ({
  ...config,
  roleIds: [...config.roleIds],
  roles: config.roles.map((role) => ({ ...role })),
});

const createDraft = (config: UserCandidateConfigItem): UserCandidateConfigDraft => ({
  basis: cloneConfig(config),
  roleIds: [...config.roleIds],
  latest: null,
  conflict: false,
  needsReview: false,
  saving: false,
});

const changedConfig = (basis: UserCandidateConfigItem, latest: UserCandidateConfigItem): boolean =>
  basis.configId !== latest.configId ||
  basis.version !== latest.version ||
  !sameRoleIds(basis.roleIds, latest.roleIds);

export function useUserCandidateConfigs(): UserCandidateConfigs {
  const drafts = ref<UserCandidateConfigDraft[]>([]);
  const loading = ref(false);
  const configError = ref(false);
  const roles = ref<SystemRoleOption[]>([]);
  const selectedRoleLabels = ref<SystemRoleOption[]>([]);
  const rolesLoading = ref(false);
  const rolesVerified = ref(false);
  const rolesError = ref(false);
  const anySaving = computed(() => drafts.value.some((draft) => draft.saving));
  const configsReader = useLatestReadRequest(() => {
    loading.value = false;
  });
  const rolesReader = useLatestReadRequest(() => {
    rolesLoading.value = false;
  });

  const isDirty = (draft: UserCandidateConfigDraft): boolean =>
    !sameRoleIds(draft.roleIds, draft.basis.roleIds);

  const activeRoleIds = computed(() => new Set(roles.value.map((role) => role.id)));
  const hasUnavailableRoles = (draft: UserCandidateConfigDraft): boolean =>
    rolesVerified.value && draft.roleIds.some((id) => !activeRoleIds.value.has(id));

  const roleChoices = computed(() => {
    const result: Record<string, UserCandidateRoleChoice[]> = {};
    for (const draft of drafts.value) {
      const savedRoles = new Map(
        [...draft.basis.roles, ...(draft.latest?.roles ?? []), ...selectedRoleLabels.value].map(
          (role) => [role.id, role],
        ),
      );
      const choices = roles.value.map((role) => ({
        id: role.id,
        label: `${role.name}（${role.code}）`,
        unavailable: false,
      }));
      for (const id of draft.roleIds) {
        if (activeRoleIds.value.has(id)) continue;
        const role = savedRoles.get(id);
        const name = role ? `${role.name}（${role.code}）` : id;
        const state = rolesVerified.value ? '已失效' : '待核验';
        choices.push({ id, label: `${name}（${state}）`, unavailable: rolesVerified.value });
      }
      result[draft.basis.sceneCode] = choices;
    }
    return result;
  });

  const loadConfigs = async (discardSceneCode?: UserCandidateSceneCode): Promise<void> => {
    if (!configsReader.isActive() || anySaving.value) return;
    const request = configsReader.begin();
    loading.value = true;
    configError.value = false;
    try {
      const result = await systemApi.userCandidateConfigs(request.signal);
      if (!request.isCurrent()) return;
      const previous = new Map(drafts.value.map((draft) => [draft.basis.sceneCode, draft]));
      const next = result.map((config) => {
        const draft = previous.get(config.sceneCode);
        previous.delete(config.sceneCode);
        if (!draft || config.sceneCode === discardSceneCode || !isDirty(draft)) {
          return createDraft(config);
        }
        if (changedConfig(draft.basis, config)) {
          draft.latest = cloneConfig(config);
          draft.conflict = true;
        } else {
          // 人数和名称不构成配置版本变化，草稿及原 CAS 依据继续由本地持有。
          draft.basis = cloneConfig(config);
          draft.latest = null;
          draft.conflict = false;
        }
        draft.needsReview = false;
        return draft;
      });
      for (const draft of previous.values()) {
        if (!isDirty(draft) && !draft.needsReview) continue;
        draft.conflict = true;
        next.push(draft);
      }
      drafts.value = next;
    } catch (cause) {
      if (!request.isCurrent()) return;
      configError.value = true;
      EMessage.error(cause, '业务人员配置读取失败，本次修改已保留');
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  };

  const refreshConfigs = (): Promise<void> => loadConfigs();

  const refreshRoles = async (): Promise<void> => {
    if (!rolesReader.isActive()) return;
    const request = rolesReader.begin();
    rolesLoading.value = true;
    rolesVerified.value = false;
    rolesError.value = false;
    try {
      const result = await systemApi.roleOptions(request.signal);
      if (!request.isCurrent()) return;
      const selectedIds = new Set(drafts.value.flatMap((draft) => draft.roleIds));
      const previousRoles = new Map(
        [...selectedRoleLabels.value, ...roles.value].map((role) => [role.id, role]),
      );
      selectedRoleLabels.value = [...previousRoles.values()].filter((role) =>
        selectedIds.has(role.id),
      );
      roles.value = result;
      rolesVerified.value = true;
    } catch (cause) {
      if (!request.isCurrent()) return;
      rolesError.value = true;
      EMessage.error(cause, '角色候选读取失败，请刷新后再保存');
    } finally {
      if (request.isCurrent()) rolesLoading.value = false;
    }
  };

  const canSave = (draft: UserCandidateConfigDraft): boolean =>
    configsReader.isActive() &&
    !loading.value &&
    !configError.value &&
    rolesVerified.value &&
    !rolesLoading.value &&
    !anySaving.value &&
    !draft.conflict &&
    !draft.needsReview &&
    !hasUnavailableRoles(draft) &&
    (draft.basis.configId === null || isDirty(draft));

  const saveConfig = async (draft: UserCandidateConfigDraft): Promise<void> => {
    if (!canSave(draft)) return;
    draft.saving = true;
    const sceneCode = draft.basis.sceneCode;
    try {
      const result = await systemApi.updateUserCandidateConfig(sceneCode, {
        version: draft.basis.version,
        roleIds: [...draft.roleIds],
      });
      if (result.sceneCode !== sceneCode) {
        throw new Error('保存结果与当前业务场景不一致，请刷新配置核对');
      }
      Object.assign(draft, createDraft(result));
      EMessage.success('业务人员配置已保存');
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 409) draft.conflict = true;
      if (!(cause instanceof RequestError) || cause.status === 0 || cause.status >= 500) {
        draft.needsReview = true;
      }
      EMessage.error(cause, '业务人员配置保存失败，本次修改已保留');
    } finally {
      draft.saving = false;
    }
  };

  const discardAndReload = async (draft: UserCandidateConfigDraft): Promise<void> => {
    if (anySaving.value || !configsReader.isActive()) return;
    try {
      await RouteMessageBox.confirm(
        '重新载入会放弃本次角色修改，并使用服务端最新配置。确认继续吗？',
        '重新载入配置',
        { confirmButtonText: '放弃修改并载入', cancelButtonText: '保留修改', type: 'warning' },
      );
    } catch {
      // 取消确认或切换标签均保留原草稿。
      return;
    }
    if (!configsReader.isActive() || anySaving.value) return;
    await loadConfigs(draft.basis.sceneCode);
  };

  const unregisterCloseGuard = useTabsStore().registerCloseGuard(
    'system-user-candidates',
    async () => {
      if (anySaving.value) return false;
      if (!drafts.value.some((draft) => isDirty(draft) || draft.needsReview)) return true;
      try {
        await RouteMessageBox.confirm(
          '业务人员配置仍有未保存或保存结果待核对的修改。关闭标签会放弃本次修改，请先核对配置。确认关闭吗？',
          '关闭配置页面',
          { confirmButtonText: '放弃并关闭', cancelButtonText: '保留修改', type: 'warning' },
        );
        return true;
      } catch {
        // 关闭保护取消时继续保留标签及草稿。
        return false;
      }
    },
  );
  onScopeDispose(unregisterCloseGuard);

  return {
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
  };
}
