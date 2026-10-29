<template>
  <div class="shell">
    <AdminSidebar v-show="!isSidebarCollapsed" />
    <section class="main">
      <AdminTopbar
        :sidebar-collapsed="isSidebarCollapsed"
        @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed"
      />
      <AdminTabs />
      <AdminRouteContent :sidebar-collapsed="isSidebarCollapsed" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AdminRouteContent from './components/AdminRouteContent.vue';
import AdminSidebar from './components/AdminSidebar.vue';
import AdminTabs from './components/AdminTabs.vue';
import AdminTopbar from './components/AdminTopbar.vue';

defineOptions({ name: 'AdminLayout' });
const isSidebarCollapsed = ref(false);
</script>
