<template>
  <section>
    <div class="page-title">
      <div>
        <h2>首页</h2>
        <p>RBAC 与认证模块迁移验证入口</p>
      </div>
    </div>
    <el-card
      ><el-descriptions :column="2" border
        ><el-descriptions-item label="当前用户">{{
          auth.session?.user.displayName
        }}</el-descriptions-item
        ><el-descriptions-item label="角色">{{
          auth.session?.user.roles.join('、') || '-'
        }}</el-descriptions-item
        ><el-descriptions-item label="权限数量">{{
          auth.session?.user.permissions.length
        }}</el-descriptions-item
        ><el-descriptions-item label="会话策略"
          >内存 Access Token + HttpOnly Refresh Cookie</el-descriptions-item
        ></el-descriptions
      ></el-card
    >
  </section>
</template>
<script setup lang="ts">
import { useAuthStore } from '../stores/auth';
defineOptions({ name: 'DashboardPage' });
const auth = useAuthStore();
</script>
