import { ref } from 'vue';
import type {
  InventoryMaterialDemandTraceItem,
  InventoryMaterialSupplyDemandItem,
} from '@company/contracts';
import { productionApi } from '../../../api/production';
import { EMessage } from '../../../utils/message';

/** 活动物料需求溯源：按物料分页，并避免较旧响应覆盖新打开的物料。 */
export function useInventoryMaterialDemandTrace() {
  const visible = ref(false);
  const loading = ref(false);
  const selectedItem = ref<InventoryMaterialSupplyDemandItem | null>(null);
  const items = ref<InventoryMaterialDemandTraceItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let requestToken = 0;

  const load = async (): Promise<void> => {
    if (!selectedItem.value) return;
    const token = ++requestToken;
    loading.value = true;
    try {
      const result = await productionApi.listInventoryMaterialDemandTrace(
        selectedItem.value.itemId,
        { page: currentPage.value, pageSize: pageSize.value },
      );
      if (token !== requestToken) return;
      items.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== requestToken) return;
      EMessage.error(error, '物料需求来源加载失败');
    } finally {
      if (token === requestToken) loading.value = false;
    }
  };

  const open = async (item: InventoryMaterialSupplyDemandItem): Promise<void> => {
    selectedItem.value = item;
    currentPage.value = 1;
    items.value = [];
    total.value = 0;
    visible.value = true;
    await load();
  };

  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    currentPage.value = 1;
    await load();
  };

  const changePage = async (value: number): Promise<void> => {
    currentPage.value = value;
    await load();
  };

  return {
    visible,
    loading,
    selectedItem,
    items,
    total,
    currentPage,
    pageSize,
    open,
    changePageSize,
    changePage,
  };
}
