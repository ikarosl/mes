<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">MES 追溯系统</div>
      <el-menu
        router
        :default-active="$route.path"
      >
        <el-menu-item index="/"><span>首页</span></el-menu-item>
        <el-sub-menu
          v-if="systemItems.length"
          index="system"
          ><template #title>系统管理</template
          ><el-menu-item
            v-for="item in systemItems"
            :key="item.path"
            :index="item.path"
            >{{ item.title }}</el-menu-item
          ></el-sub-menu
        >
        <el-sub-menu
          v-if="productItems.length"
          index="product"
          ><template #title>产品资料</template
          ><el-menu-item
            v-for="item in productItems"
            :key="item.path"
            :index="item.path"
            >{{ item.title }}</el-menu-item
          ></el-sub-menu
        >
        <el-sub-menu
          v-if="productionItems.length"
          index="production"
          ><template #title>生产管理</template
          ><el-menu-item
            v-for="item in productionItems"
            :key="item.path"
            :index="item.path"
            >{{ item.title }}</el-menu-item
          ></el-sub-menu
        >
        <el-sub-menu
          v-if="warehouseItems.length"
          index="warehouse"
          ><template #title>仓储管理</template
          ><el-menu-item
            v-for="item in warehouseItems"
            :key="item.path"
            :index="item.path"
            >{{ item.title }}</el-menu-item
          ></el-sub-menu
        >
      </el-menu>
    </aside>
    <section class="main">
      <header class="topbar">
        <span>{{ String($route.meta.title ?? '') }}</span>
        <div>
          <span class="user">{{ auth.session?.user.displayName }}</span
          ><el-button
            link
            type="primary"
            @click="signOut"
            >退出登录</el-button
          >
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
          ><button
            v-if="tab.closable"
            @click.stop="tabs.close(tab.path, $route.fullPath, $router)"
          >
            ×
          </button>
        </div>
      </nav>
      <main class="content">
        <router-view v-slot="{ Component }"
          ><keep-alive :include="tabs.keepAliveNames">
            <component
              :is="Component"
              :key="$route.name"
            /> </keep-alive
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

const productMenus = [
  { title: '产品管理', path: '/product/products', permission: PERMISSIONS.product.products.view },
  {
    title: '产品分类',
    path: '/product/categories',
    permission: PERMISSIONS.product.categories.view,
  },
  { title: '工序管理', path: '/product/processes', permission: PERMISSIONS.product.processes.view },
  {
    title: '工艺路线',
    path: '/product/process-routes',
    permission: PERMISSIONS.product.routes.view,
  },
];
const productItems = computed(() => productMenus.filter((item) => auth.can(item.permission)));

const productionMenus = [
  { title: '工单管理', path: '/production/orders', permission: PERMISSIONS.production.orders.view },
  { title: '生产任务', path: '/production/tasks', permission: PERMISSIONS.production.tasks.view },
];
const productionItems = computed(() => productionMenus.filter((item) => auth.can(item.permission)));

const warehouseMenus = [
  {
    title: '库存查询',
    path: '/warehouse/inventory',
    permission: PERMISSIONS.warehouse.inventory.view,
  },
  {
    title: '入库管理',
    path: '/warehouse/inbound-orders',
    permission: PERMISSIONS.warehouse.inbound.view,
  },
  {
    title: '出库管理',
    path: '/warehouse/outbound-orders',
    permission: PERMISSIONS.warehouse.outbound.view,
  },
  {
    title: '退料管理',
    path: '/warehouse/return-orders',
    permission: PERMISSIONS.warehouse.returns.view,
  },
  { title: '报废管理', path: '/warehouse/scraps', permission: PERMISSIONS.warehouse.scraps.view },
  {
    title: '盘点管理',
    path: '/warehouse/stock-checks',
    permission: PERMISSIONS.warehouse.stockChecks.view,
  },
];
const warehouseItems = computed(() => warehouseMenus.filter((item) => auth.can(item.permission)));
const signOut = async () => {
  await auth.logout();
  await router.replace('/login');
};
</script>
