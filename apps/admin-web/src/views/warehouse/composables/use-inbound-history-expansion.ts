import { ref } from 'vue';

/** 展开选择归宿主持有，查询失败不消费下一次成功读取的首单初始化意图。 */
export function useInboundHistoryExpansion() {
  const expandedIds = ref<string[]>([]);
  let initializeExpansion = true;

  function initializeNextLoad(): void {
    initializeExpansion = true;
  }

  function retain(ids: readonly string[], locatedId?: string | null): void {
    const retainedIds = new Set(ids);
    if (locatedId) retainedIds.add(locatedId);
    expandedIds.value = expandedIds.value.filter((id) => retainedIds.has(id));
  }

  function sync(ids: readonly string[], locatedId?: string | null): void {
    if (initializeExpansion) {
      const initialId = locatedId || ids[0];
      expandedIds.value = initialId ? [initialId] : [];
      initializeExpansion = false;
      return;
    }
    retain(ids, locatedId);
  }

  function expand(id: string): void {
    if (!expandedIds.value.includes(id)) expandedIds.value = [...expandedIds.value, id];
  }

  function toggle(id: string): void {
    if (expandedIds.value.includes(id))
      expandedIds.value = expandedIds.value.filter((expandedId) => expandedId !== id);
    else expand(id);
  }

  return { expandedIds, initializeNextLoad, sync, retain, expand, toggle };
}
