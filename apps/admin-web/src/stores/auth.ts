import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LoginRequest } from '@company/contracts';
import type { AuthSession } from '@company/auth-client';
import { permissionMatches } from '@company/constants';
import { createAuthClient } from '../api/auth';
import { useReferenceOptionsStore } from './reference-options';

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('company-mes-auth');
/** 登出 / 切换用户 / 权限变化时清空跨页共享候选，避免复用它人缓存 */
const resetReferenceOptions = (): void => {
  useReferenceOptionsStore().$reset();
};
export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null);
  const restoring = ref<Promise<AuthSession> | null>(null);
  const client = createAuthClient({
    getSession: () => session.value,
    setSession: (value) => {
      session.value = value;
    },
  });
  channel?.addEventListener('message', (event) => {
    if (event.data === 'logout') {
      client.clearSession();
      resetReferenceOptions();
    }
  });
  const login = async (payload: LoginRequest) => {
    const result = await client.login(payload);
    resetReferenceOptions();
    return result;
  };
  const restore = () => {
    restoring.value ??= client.restoreSession().finally(() => {
      restoring.value = null;
    });
    return restoring.value;
  };
  const logout = async () => {
    channel?.postMessage('logout');
    await client.logout();
    resetReferenceOptions();
  };
  const can = (permission?: string) =>
    permissionMatches(session.value?.user.permissions ?? [], permission);
  return {
    session,
    authenticated: computed(() => Boolean(session.value)),
    login,
    restore,
    logout,
    clear: () => {
      client.clearSession();
      resetReferenceOptions();
    },
    can,
  };
});
