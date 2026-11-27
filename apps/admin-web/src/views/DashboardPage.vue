<template>
  <ProductionDashboard
    v-if="canViewProduction"
    :key="auth.session?.user.id"
  />
  <el-card
    v-else
    shadow="never"
    ><el-empty
      description="欢迎使用 Easy MES，请从左侧菜单进入可访问的业务页面"
      :image-size="80"
  /></el-card>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouteAccess } from '../composables/useRouteAccess';
import { ProductionDashboard } from './production/public';
defineOptions({ name: 'DashboardPage' });
const auth = useAuthStore();
const { canAccessRoute } = useRouteAccess();
const canViewProduction = computed(() => canAccessRoute({ name: 'production-tasks' }));
</script>
