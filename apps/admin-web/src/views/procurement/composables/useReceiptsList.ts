import { ref } from 'vue';
import { procurementApi } from '../../../api/procurement';
import { useReceiptWorklist } from './useReceiptWorklist';

export function useReceiptsList() {
  const awaitingAcceptance = ref(false),
    keyword = ref('');
  const list = useReceiptWorklist({
    fetchPage: (page, signal) =>
      procurementApi.listReceiptLines(
        {
          ...page,
          awaitingAcceptance: awaitingAcceptance.value ? 'yes' : undefined,
          keyword: keyword.value.trim() || undefined,
        },
        signal,
      ),
    resetFilters: () => {
      keyword.value = '';
      awaitingAcceptance.value = false;
    },
    errorMessage: '采购到货列表加载失败',
  });
  return { awaitingAcceptance, keyword, ...list };
}
