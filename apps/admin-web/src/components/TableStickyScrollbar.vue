<template>
  <div
    ref="container"
    class="table-scroll-area"
  >
    <slot />
    <el-scrollbar
      v-show="hasOverflow"
      ref="scrollbar"
      class="table-sticky-scrollbar"
      height="12px"
      always
      :tabindex="0"
      role="region"
      :aria-label="ariaLabel"
      @scroll="scrollTable"
    >
      <div :style="{ width: `${contentWidth}px`, height: '1px' }" />
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import type { ScrollbarInstance, TableInstance } from 'element-plus';

const props = withDefaults(defineProps<{ table?: TableInstance; ariaLabel?: string }>(), {
  table: undefined,
  ariaLabel: '表格横向滚动',
});
const container = ref<HTMLElement>();
const scrollbar = ref<ScrollbarInstance>();
const hasOverflow = ref(false);
const contentWidth = ref(0);
let tableViewport: HTMLElement | undefined;
let resizeObserver: ResizeObserver | undefined;
let measureFrame = 0;
let isActive = false;
let lastTableScrollLeft = 0;
let lastScrollbarScrollLeft = 0;

const syncScrollbar = (): void => {
  const proxy = scrollbar.value;
  if (!tableViewport?.clientWidth || !proxy?.wrapRef?.clientWidth) return;
  lastTableScrollLeft = tableViewport.scrollLeft;
  lastScrollbarScrollLeft = lastTableScrollLeft;
  if (Math.abs(proxy.wrapRef.scrollLeft - tableViewport.scrollLeft) > 0.5) {
    proxy.setScrollLeft(tableViewport.scrollLeft);
  }
};

const tableScrolled = (): void => {
  // Ignore mirrored events so native smooth scrolling keeps control of its source.
  if (!tableViewport || Math.abs(tableViewport.scrollLeft - lastTableScrollLeft) <= 0.5) return;
  syncScrollbar();
};

const scrollTable = ({ scrollLeft }: { scrollLeft: number }): void => {
  if (!hasOverflow.value || !tableViewport?.clientWidth || !scrollbar.value?.wrapRef?.clientWidth) {
    return;
  }
  if (Math.abs(scrollLeft - lastScrollbarScrollLeft) <= 0.5) return;
  lastScrollbarScrollLeft = scrollLeft;
  lastTableScrollLeft = scrollLeft;
  if (Math.abs(tableViewport.scrollLeft - scrollLeft) > 0.5) {
    props.table?.setScrollLeft(scrollLeft);
  }
};

const measure = (): void => {
  if (!container.value?.clientWidth || !tableViewport?.clientWidth) {
    hasOverflow.value = false;
    return;
  }
  const scrollRange = tableViewport.scrollWidth - tableViewport.clientWidth;
  hasOverflow.value = scrollRange > 1;
  // Keep both scroll ranges equal even when the table has a border or gutter.
  const proxyWidth = scrollbar.value?.wrapRef?.clientWidth || container.value.clientWidth;
  contentWidth.value = proxyWidth + scrollRange;
  syncScrollbar();
};

const scheduleMeasure = (): void => {
  if (measureFrame) return;
  measureFrame = requestAnimationFrame(() => {
    measureFrame = 0;
    measure();
  });
};

const disconnect = (): void => {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  tableViewport?.removeEventListener('scroll', tableScrolled);
  tableViewport = undefined;
  cancelAnimationFrame(measureFrame);
  measureFrame = 0;
};

const connect = (): void => {
  disconnect();
  if (!isActive) return;
  const tableElement: unknown = props.table?.$el;
  if (!(tableElement instanceof HTMLElement) || !container.value) {
    hasOverflow.value = false;
    return;
  }
  const viewport = tableElement.querySelector<HTMLElement>(
    ':scope > .el-table__inner-wrapper > .el-table__body-wrapper > .el-scrollbar > .el-scrollbar__wrap',
  );
  if (!viewport) {
    hasOverflow.value = false;
    return;
  }
  tableViewport = viewport;
  viewport.addEventListener('scroll', tableScrolled, { passive: true });
  resizeObserver = new ResizeObserver(scheduleMeasure);
  resizeObserver.observe(container.value);
  resizeObserver.observe(viewport);
  const body = tableElement.querySelector<HTMLElement>('.el-table__body');
  if (body) resizeObserver.observe(body);
  scheduleMeasure();
};

const activate = (): void => {
  isActive = true;
  connect();
};

const deactivate = (): void => {
  isActive = false;
  disconnect();
};

watch(() => props.table, connect, { flush: 'post' });
watch(
  [hasOverflow, contentWidth],
  () => {
    scrollbar.value?.update();
    syncScrollbar();
  },
  { flush: 'post' },
);
onMounted(activate);
onActivated(activate);
onDeactivated(deactivate);
onScopeDispose(deactivate);
</script>

<style scoped>
.table-sticky-scrollbar {
  position: sticky;
  bottom: 0;
  z-index: 4;
  background: var(--el-bg-color);
}

/* Keep the table's clipped bar from duplicating the sticky bar. */
.table-scroll-area
  :deep(
    > .el-table
      > .el-table__inner-wrapper
      > .el-table__body-wrapper
      > .el-scrollbar
      > .el-scrollbar__bar.is-horizontal
  ) {
  display: none;
}
</style>
