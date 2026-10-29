<template>
  <main
    ref="contentRef"
    class="content"
  >
    <router-view v-slot="{ Component }"
      ><keep-alive :include="tabs.keepAliveNames">
        <component
          :is="Component"
          :key="$route.meta.tabName ?? $route.name"
        /> </keep-alive
    ></router-view>
  </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTabsStore } from '../../stores/tabs';

const props = defineProps<{ sidebarCollapsed: boolean }>();
const tabs = useTabsStore();
const contentRef = ref<HTMLElement>();
let contentObserver: ResizeObserver | undefined;

// 路由区统一提供视口坐标，让子树内的弹窗不受页面滚动或局部定位容器影响。
const updateOverlayBounds = (): void => {
  const content = contentRef.value;
  if (!content) return;
  const { top, left, width, height } = content.getBoundingClientRect();
  content.style.setProperty('--route-overlay-top', `${top}px`);
  content.style.setProperty('--route-overlay-left', `${left}px`);
  content.style.setProperty('--route-overlay-width', `${width}px`);
  content.style.setProperty('--route-overlay-height', `${height}px`);
};

watch(
  () => props.sidebarCollapsed,
  async () => {
    await nextTick();
    updateOverlayBounds();
  },
);

onMounted(() => {
  const content = contentRef.value;
  if (!content) return;
  updateOverlayBounds();
  contentObserver = new ResizeObserver(updateOverlayBounds);
  contentObserver.observe(content);
  window.addEventListener('resize', updateOverlayBounds);
});

onBeforeUnmount(() => {
  contentObserver?.disconnect();
  window.removeEventListener('resize', updateOverlayBounds);
});
</script>
