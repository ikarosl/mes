import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LoginRequest } from '@company/contracts';
import type { AuthSession } from '@company/auth-client';
import { permissionMatches } from '@company/constants';
import { createAuthClient } from '../api/auth';

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('company-mes-auth');
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
    if (event.data === 'logout') client.clearSession();
  });
  const login = async (payload: LoginRequest) => client.login(payload);
  const restore = () => {
    restoring.value ??= client.restoreSession().finally(() => {
      restoring.value = null;
    });
    return restoring.value;
  };
  const logout = async () => {
    channel?.postMessage('logout');
    await client.logout();
  };
  const can = (permission?: string) =>
    permissionMatches(session.value?.user.permissions ?? [], permission);
  return {
    session,
    authenticated: computed(() => Boolean(session.value)),
    login,
    restore,
    logout,
    clear: () => client.clearSession(),
    can,
  };
});
