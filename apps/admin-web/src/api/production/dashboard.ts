import type {
  PageResult,
  ProductionDashboardQuery,
  ProductionDashboardScheduleItem,
  ProductionDashboardOptionQuery,
  ProductionDashboardOptionKind,
  ProductionDashboardOption,
  ProductionDashboardFlow,
  ProductionDashboardPeriodQuery,
  ProductionDashboardPeriodFlow,
  ProductionDashboardPeriodVisit,
  ProductionDashboardCardQuery,
  ProductionDashboardCard,
  ProductionDashboardOutputQuery,
  ProductionDashboardOutputItem,
  ProductionDashboardAbnormalityQuery,
  ProductionDashboardAbnormalityResult,
  ProductionDashboardAbnormalityDetailQuery,
  ProductionDashboardAbnormalityDetail,
} from '@company/contracts';
import { request, type ReadRequestOptions } from './request';
const base = '/production/dashboard';
export const productionDashboardApi = {
  abnormalityDetails: (
    params: ProductionDashboardAbnormalityDetailQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardAbnormalityDetail>> =>
    request({ ...options, url: `${base}/abnormalities/details`, params }),
  schedule: (
    params: ProductionDashboardQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardScheduleItem>> =>
    request({ ...options, url: `${base}/schedule`, params }),
  options: (
    kind: ProductionDashboardOptionKind,
    params: ProductionDashboardOptionQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardOption>> =>
    request({ ...options, url: `${base}/options/${kind}`, params }),
  periodFlow: (
    batchId: string,
    params: ProductionDashboardPeriodQuery,
    options: ReadRequestOptions = {},
  ): Promise<ProductionDashboardPeriodFlow> =>
    request({ ...options, url: `${base}/tasks/${batchId}/period-flow`, params }),
  periodVisits: (
    batchId: string,
    params: ProductionDashboardPeriodQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardPeriodVisit>> =>
    request({ ...options, url: `${base}/tasks/${batchId}/period-visits`, params }),
  flow: (batchId: string, options: ReadRequestOptions = {}): Promise<ProductionDashboardFlow> =>
    request({ ...options, url: `${base}/tasks/${batchId}/flow` }),
  cards: (
    batchId: string,
    params: ProductionDashboardCardQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardCard>> =>
    request({ ...options, url: `${base}/tasks/${batchId}/cards`, params }),
  output: (
    params: ProductionDashboardOutputQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionDashboardOutputItem>> =>
    request({ ...options, url: `${base}/output`, params }),
  abnormalities: (
    params: ProductionDashboardAbnormalityQuery,
    options: ReadRequestOptions = {},
  ): Promise<ProductionDashboardAbnormalityResult> =>
    request({ ...options, url: `${base}/abnormalities`, params }),
};
