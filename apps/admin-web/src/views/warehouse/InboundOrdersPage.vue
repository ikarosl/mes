<template>
  <div class="inbound-page">
    <el-tabs
      :model-value="String(route.name)"
      @tab-change="changeCategory"
    >
      <el-tab-pane
        v-for="category in categories"
        :key="category.name"
        :label="category.label"
        :name="category.name"
      />
    </el-tabs>
    <router-view v-slot="{ Component, route: categoryRoute }">
      <keep-alive>
        <component
          :is="Component"
          :key="categoryRoute.name"
        />
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRouteAccess } from '../../composables/useRouteAccess';

defineOptions({ name: 'InboundOrdersPage' });
const route = useRoute();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const categories = computed(() =>
  [
    { name: 'warehouse-inbound', label: '外购物料入库' },
    { name: 'warehouse-inbound-finished', label: '成品入库' },
    { name: 'warehouse-other-inbounds', label: '其他入库' },
  ].filter((category) => canAccessRoute({ name: category.name })),
);
async function changeCategory(name: string | number): Promise<void> {
  if (name === route.name || !categories.value.some((category) => category.name === name)) return;
  await router.push({ name: String(name) });
}
</script>
