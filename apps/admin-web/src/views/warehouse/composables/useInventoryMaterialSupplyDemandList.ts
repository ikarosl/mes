import { reactive, ref } from 'vue';
import type { InventoryMaterialSupplyDemandItem } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { EMessage } from '../../../utils/message';

/** 库存页物料供需正式列表：按活动需求分页，较旧响应不得覆盖较新查询。 */
export function useInventoryMaterialSupplyDemandList() {
  const items = ref<InventoryMaterialSupplyDemandItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive({ keyword: '' });
  let requestToken = 0;

  const loadSupplyDemand = async (): Promise<void> => {
    const token = ++requestToken;
    loading.value = true;
    try {
      const result = await productionApi.listInventoryMaterialSupplyDemand({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
      });
      if (token !== requestToken) return;
      items.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== requestToken) return;
      EMessage.error(error, '物料供需预警查询失败');
    } finally {
      if (token === requestToken) loading.value = false;
    }
  };

  const searchSupplyDemand = async (): Promise<void> => {
    currentPage.value = 1;
    await loadSupplyDemand();
  };

  const resetSupplyDemandQuery = async (): Promise<void> => {
    query.keyword = '';
    currentPage.value = 1;
    await loadSupplyDemand();
  };

  const changeSupplyDemandPageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    currentPage.value = 1;
    await loadSupplyDemand();
  };

  const changeSupplyDemandPage = async (value: number): Promise<void> => {
    currentPage.value = value;
    await loadSupplyDemand();
  };

  return {
    items,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadSupplyDemand,
    searchSupplyDemand,
    resetSupplyDemandQuery,
    changeSupplyDemandPageSize,
    changeSupplyDemandPage,
  };
}
