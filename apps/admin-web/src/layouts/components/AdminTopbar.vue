<template>
  <header class="topbar">
    <div class="topbar-heading">
      <el-button
        class="sidebar-toggle"
        text
        :icon="sidebarCollapsed ? Expand : Fold"
        :title="sidebarToggleLabel"
        :aria-label="sidebarToggleLabel"
        :aria-expanded="!sidebarCollapsed"
        aria-controls="admin-sidebar"
        @click="$emit('toggle-sidebar')"
      />
      <span>{{ String($route.meta.title ?? '') }}</span>
    </div>
    <div>
      <SerialScannerSettings
        v-if="auth.session"
        :key="auth.session.user.id"
        :user-id="auth.session.user.id"
      />
      <NotificationBell />
      <span class="user">{{ auth.session?.user.displayName }}</span
      ><el-button
        link
        type="primary"
        @click="signOut"
        >退出登录</el-button
      >
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Expand, Fold } from '@element-plus/icons-vue';
import NotificationBell from '../../components/notification/NotificationBell.vue';
import { useSerialScanner } from '../../composables/use-serial-scanner';
import { useAuthStore } from '../../stores/auth';
import { EMessage } from '../../utils/message';
import SerialScannerSettings from './SerialScannerSettings.vue';

const props = defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ (event: 'toggle-sidebar'): void }>();
const auth = useAuthStore();
const router = useRouter();
const { disconnect } = useSerialScanner();
const sidebarToggleLabel = computed(() => (props.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'));

function releaseScanner(): void {
  void disconnect().catch(() => EMessage.error('关闭扫码串口失败，请拔插扫码枪后重试。'));
}

watch(
  () => auth.session?.user.id,
  (_, previousUserId) => {
    if (previousUserId !== undefined) releaseScanner();
  },
  { flush: 'sync' },
);
onBeforeUnmount(releaseScanner);

const signOut = async (): Promise<void> => {
  await auth.logout();
  await router.replace('/login');
};
</script>
