<template>
  <aside
    id="admin-sidebar"
    class="sidebar"
  >
    <div class="brand">MES 追溯系统</div>
    <el-menu
      router
      :default-active="$route.meta.menuPath ?? $route.path"
    >
      <el-menu-item
        v-if="navigation.home"
        :index="navigation.home.path"
        :route="navigation.home.route"
        ><span>{{ navigation.home.title }}</span></el-menu-item
      >
      <el-sub-menu
        v-for="group in navigation.groups"
        :key="group.key"
        :index="group.key"
      >
        <template #title>{{ group.title }}</template>
        <el-menu-item
          v-for="item in group.items"
          :key="item.path"
          :index="item.path"
          :route="item.route"
          >{{ item.title }}</el-menu-item
        >
      </el-sub-menu>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { getVisibleNavigation } from '../../router/navigation';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const navigation = computed(() => getVisibleNavigation(router, auth.can));
</script>
