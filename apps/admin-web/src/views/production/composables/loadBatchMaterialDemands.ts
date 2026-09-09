import type { MaterialDemandManagementRow } from '@company/contracts';
import { productionApi } from '../../../api/production';

/** 全部分页成功后才交付完整 BOM，禁止用截断或部分成功的数据生成需求。 */
export async function loadBatchMaterialDemands(
  productionBatchId: string,
): Promise<MaterialDemandManagementRow[]> {
  const rows: MaterialDemandManagementRow[] = [];
  let total: number | undefined;
  for (let page = 1; ; page += 1) {
    const result = await productionApi.listMaterialDemandManagement({
      productionBatchId,
      page,
      pageSize: 100,
    });
    total ??= result.total;
    if (result.total !== total || (result.items.length === 0 && rows.length < total)) {
      throw new Error('任务物料需求已变化，请重新打开弹窗');
    }
    rows.push(...result.items);
    if (rows.length >= total) {
      if (rows.length !== total || new Set(rows.map((row) => row.id)).size !== total) {
        throw new Error('任务物料需求不完整，请重新打开弹窗');
      }
      return rows;
    }
  }
}
