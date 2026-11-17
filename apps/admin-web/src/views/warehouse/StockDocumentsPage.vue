<template>
  <div class="stock-documents-page">
    <el-tabs
      :model-value="String(route.name)"
      @tab-change="changeDirection"
    >
      <el-tab-pane
        v-for="scope in scopes"
        :key="scope.name"
        :name="scope.name"
        :label="STOCK_DOCUMENT_DIRECTION_LABELS[scope.direction]"
      />
    </el-tabs>
    <router-view v-slot="{ Component, route: scopeRoute }">
      <keep-alive
        ><component
          :is="Component"
          v-if="isScopeRoute(scopeRoute.name)"
          :key="scopeRoute.name"
      /></keep-alive>
    </router-view>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { STOCK_DOCUMENT_DIRECTION_LABELS } from '@company/constants';
import type { StockDocumentItemKind } from '@company/contracts';
import { useRouteAccess } from '../../composables/useRouteAccess';
import { STOCK_DOCUMENT_ROUTES } from './stock-document-navigation';
defineOptions({ name: 'StockDocumentsPage' });
const props = defineProps<{ itemKind: StockDocumentItemKind }>();
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const scopes = computed(() =>
  STOCK_DOCUMENT_ROUTES.filter(
    (scope) => scope.itemKind === props.itemKind && canAccessRoute({ name: scope.name }),
  ),
);
// 失活的父页仍可观察全局路由，只允许所属对象进入它自己的方向缓存。
const isScopeRoute = (name: unknown): boolean => scopes.value.some((scope) => scope.name === name);
async function changeDirection(value: string | number): Promise<void> {
  if (value !== route.name && scopes.value.some((scope) => scope.name === value))
    await router.push({ name: String(value) });
}
</script>
