<template>
  <nav class="tabs">
    <div
      v-for="tab in tabs.tabs"
      :key="tab.name"
      class="tab"
      :class="{ active: tab.name === ($route.meta.tabName ?? $route.name) }"
      @click="tab.path !== $route.fullPath && $router.push(tab.path)"
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
</template>

<script setup lang="ts">
import { useTabsStore } from '../../stores/tabs';

const tabs = useTabsStore();
</script>
