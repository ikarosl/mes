<template>
  <el-result
    icon="warning"
    title="无权限"
    sub-title="当前账号没有访问此页面的权限"
    ><template #extra
      ><el-button
        v-if="canAccessRoute({ name: 'dashboard' })"
        type="primary"
        @click="$router.push('/')"
        >返回首页</el-button
      ></template
    ></el-result
  >
</template>
<script setup lang="ts">
import { useRouteAccess } from '../composables/useRouteAccess';

defineOptions({ name: 'NoPermissionPage' });
const { canAccessRoute } = useRouteAccess();
</script>
