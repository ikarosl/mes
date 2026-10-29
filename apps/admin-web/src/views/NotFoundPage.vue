<template>
  <el-result
    icon="warning"
    title="404"
    sub-title="页面不存在，请检查访问地址"
  >
    <template #extra>
      <el-button
        v-if="canAccessRoute({ name: 'dashboard' })"
        type="primary"
        @click="$router.replace({ name: 'dashboard' })"
        >返回首页</el-button
      >
    </template>
  </el-result>
</template>

<script setup lang="ts">
import { useRouteAccess } from '../composables/useRouteAccess';

defineOptions({ name: 'NotFoundPage' });
const { canAccessRoute } = useRouteAccess();
</script>
