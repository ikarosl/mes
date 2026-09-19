import { ref } from 'vue';
import { procurementApi } from '../../api/procurement';
import { useRefreshableOptions } from './useRefreshableOptions';

export function useSupplierOptions(selectedIds: () => string[]) {
  const keyword = ref('');
  const source = useRefreshableOptions(
    () =>
      procurementApi.supplierOptions({
        keyword: keyword.value.trim() || undefined,
        includeIds: selectedIds(),
      }),
    '供应商候选刷新失败，请重试后再保存',
  );
  const search = async (value: string): Promise<void> => {
    keyword.value = value;
    await source.refresh();
  };
  return { ...source, keyword, search };
}
