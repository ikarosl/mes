<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">MES 追溯系统</div>
      <el-menu router :default-active="$route.path">
        <el-menu-item index="/"><span>首页</span></el-menu-item>
        <el-sub-menu v-if="systemItems.length" index="system"
          ><template #title>系统管理</template
          ><el-menu-item v-for="item in systemItems" :key="item.path" :index="item.path">{{
            item.title
          }}</el-menu-item></el-sub-menu
        >
      </el-menu>
    </aside>
    <section class="main">
      <header class="topbar">
        <span>{{ String($route.meta.title ?? '') }}</span>
        <div>
          <span class="user">{{ auth.session?.user.displayName }}</span
          ><el-button link type="primary" @click="signOut">退出登录</el-button>
        </div>
      </header>
      <nav class="tabs">
        <div
          v-for="tab in tabs.tabs"
          :key="tab.path"
          class="tab"
          :class="{ active: tab.path === $route.fullPath }"
          @click="$router.push(tab.path)"
        >
          <span>{{ tab.title }}</span
          ><button v-if="tab.closable" @click.stop="tabs.close(tab.path, $route.fullPath, $router)">
            ×
          </button>
        </div>
      </nav>
      <main class="content">
        <router-view v-slot="{ Component }"
          ><keep-alive :include="tabs.keepAliveNames">
            <component :is="Component" :key="$route.name" /> </keep-alive
        ></router-view>
      </main>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../stores/auth';
import { useTabsStore } from '../stores/tabs';
defineOptions({ name: 'AdminLayout' });
const auth = useAuthStore();
const tabs = useTabsStore();
const router = useRouter();
const all = [
  { title: '用户管理', path: '/system/users', permission: PERMISSIONS.system.users.view },
  { title: '角色管理', path: '/system/roles', permission: PERMISSIONS.system.roles.view },
  {
    title: '权限管理',
    path: '/system/permissions',
    permission: PERMISSIONS.system.permissions.view,
  },
  { title: '操作日志', path: '/system/logs', permission: PERMISSIONS.system.logs.view },
];
const systemItems = computed(() => all.filter((item) => auth.can(item.permission)));
const signOut = async () => {
  await auth.logout();
  await router.replace('/login');
};
</script>
