import { ref } from 'vue';
import type { ReceiptLineStage } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useReceiptWorklist } from './useReceiptWorklist';

export function useInboundInspectionsList() {
  const keyword = ref(''),
    stage = ref<ReceiptLineStage | ''>('');
  const list = useReceiptWorklist({
    fetchPage: (page, signal) =>
      procurementApi.listInspections(
        {
          ...page,
          keyword: keyword.value.trim() || undefined,
          stage: stage.value || undefined,
        },
        signal,
      ),
    resetFilters: () => {
      keyword.value = '';
      stage.value = '';
    },
    errorMessage: '来料检验待办加载失败',
  });
  return { keyword, stage, ...list };
}
