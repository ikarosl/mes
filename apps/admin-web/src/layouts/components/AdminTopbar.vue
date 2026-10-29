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
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Expand, Fold } from '@element-plus/icons-vue';
import NotificationBell from '../../components/notification/NotificationBell.vue';
import { useAuthStore } from '../../stores/auth';

const props = defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ (event: 'toggle-sidebar'): void }>();
const auth = useAuthStore();
const router = useRouter();
const sidebarToggleLabel = computed(() => (props.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'));
const signOut = async (): Promise<void> => {
  await auth.logout();
  await router.replace('/login');
};
</script>
