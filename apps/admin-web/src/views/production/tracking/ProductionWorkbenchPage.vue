<template>
  <div class="workbench-workspace">
    <el-tabs
      :model-value="String(route.name)"
      @tab-change="changePanel"
    >
      <el-tab-pane
        label="工序作业"
        name="production-workbench-operations"
      />
      <el-tab-pane
        label="编码绑定"
        name="production-workbench-code-binding"
      />
    </el-tabs>
    <router-view v-slot="{ Component, route: panelRoute }">
      <keep-alive>
        <component
          :is="Component"
          v-if="isPanelRoute(panelRoute.name)"
          :key="panelRoute.name"
        />
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

defineOptions({ name: 'ProductionWorkbenchPage' });
const route = useRoute(),
  router = useRouter();
const panelNames = ['production-workbench-operations', 'production-workbench-code-binding'];
const isPanelRoute = (name: unknown): boolean =>
  typeof name === 'string' && panelNames.includes(name);
async function changePanel(name: string | number): Promise<void> {
  if (name !== route.name && isPanelRoute(name)) await router.push({ name: String(name) });
}
</script>
