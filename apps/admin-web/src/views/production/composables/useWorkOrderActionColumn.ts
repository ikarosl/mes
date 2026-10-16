import { onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { WorkOrderItem } from '@company/contracts';

interface WorkOrderActionColumn {
  tablePanel: Ref<HTMLElement | undefined>;
  actionColumnWidth: Ref<number | undefined>;
}

export function useWorkOrderActionColumn(orders: Ref<WorkOrderItem[]>): WorkOrderActionColumn {
  const tablePanel = ref<HTMLElement>();
  const actionColumnWidth = ref<number>();
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  let active = false;
  const horizontalExtra = (element: Element | null): number => {
    if (!element) return 0;
    const style = getComputedStyle(element);
    return [
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth,
    ].reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
  };
  const measure = (): void => {
    if (!active || !tablePanel.value) return;
    let width = 0;
    for (const element of tablePanel.value.querySelectorAll<HTMLElement>(
      '.order-row-actions, .order-actions-heading',
    )) {
      const contentWidth = element.getBoundingClientRect().width;
      if (!contentWidth) continue;
      const cell = element.closest('.cell');
      width = Math.max(
        width,
        contentWidth + horizontalExtra(cell) + horizontalExtra(cell?.parentElement ?? null),
      );
    }
    const nextWidth = Math.ceil(width);
    if (nextWidth > 0 && nextWidth !== actionColumnWidth.value) actionColumnWidth.value = nextWidth;
  };
  const schedule = (): void => {
    if (!active || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      measure();
    });
  };
  const rebind = (): void => {
    observer?.disconnect();
    if (!active || !tablePanel.value) return;
    observer?.observe(tablePanel.value);
    for (const element of tablePanel.value.querySelectorAll(
      '.order-row-actions, .order-actions-heading',
    ))
      observer?.observe(element);
    schedule();
  };
  const start = (): void => {
    if (active) return;
    active = true;
    if (typeof ResizeObserver !== 'undefined') observer ??= new ResizeObserver(schedule);
    rebind();
  };
  const stop = (): void => {
    active = false;
    observer?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  watch([orders, tablePanel], rebind, { flush: 'post' });
  onMounted(start);
  onActivated(start);
  onDeactivated(stop);
  onScopeDispose(stop);
  return { tablePanel, actionColumnWidth };
}
