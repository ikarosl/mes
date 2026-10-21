<template>
  <div class="outbound-page">
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

defineOptions({ name: 'OutboundOrdersPage' });
const route = useRoute();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const categories = computed(() =>
  [
    { name: 'warehouse-outbound', label: '生产领料' },
    { name: 'warehouse-other-outbounds', label: '其他出库' },
  ].filter((category) => canAccessRoute({ name: category.name })),
);
async function changeCategory(name: string | number): Promise<void> {
  if (name === route.name || !categories.value.some((category) => category.name === name)) return;
  await router.push({ name: String(name) });
}
</script>
