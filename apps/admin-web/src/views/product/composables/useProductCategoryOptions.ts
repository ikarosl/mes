import { ref } from 'vue';
import type { ProductCategoryOption } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

/**
 * 产品页共享分类候选（列表筛选 + 产品表单），页面级 options composable。
 * 只请求 /categories/options；best-effort，失败置空并单个 warning，不拖累列表。
 */
export function useProductCategoryOptions() {
  const categoryOptions = ref<ProductCategoryOption[]>([]);
  let request: Promise<void> | null = null;

  const loadCategoryOptions = (): Promise<void> => {
    if (!request) {
      request = productApi
        .categoryOptions()
        .then((list) => {
          categoryOptions.value = list;
        })
        .catch(() => {
          categoryOptions.value = [];
          EMessage.warning('产品分类选项加载失败，筛选和表单分类可能为空');
        })
        .finally(() => {
          request = null;
        });
    }
    return request;
  };

  return { categoryOptions, loadCategoryOptions };
}
