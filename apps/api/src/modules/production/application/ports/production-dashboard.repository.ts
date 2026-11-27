import type {
  PageResult,
  ProductionDashboardOptionQuery,
  ProductionDashboardQuery,
  ProductionDashboardScheduleItem,
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

export abstract class ProductionDashboardRepository {
  abstract abnormalityDetails(
    query: ProductionDashboardAbnormalityDetailQuery,
  ): Promise<PageResult<ProductionDashboardAbnormalityDetail>>;
  abstract schedule(
    query: ProductionDashboardQuery,
  ): Promise<PageResult<ProductionDashboardScheduleItem>>;
  abstract options(
    kind: ProductionDashboardOptionKind,
    query: ProductionDashboardOptionQuery,
  ): Promise<PageResult<ProductionDashboardOption>>;
  abstract periodFlow(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): Promise<ProductionDashboardPeriodFlow>;
  abstract periodVisits(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): Promise<PageResult<ProductionDashboardPeriodVisit>>;
  abstract flow(batchId: string): Promise<ProductionDashboardFlow>;
  abstract cards(
    batchId: string,
    query: ProductionDashboardCardQuery,
  ): Promise<PageResult<ProductionDashboardCard>>;
  abstract output(
    query: ProductionDashboardOutputQuery,
  ): Promise<PageResult<ProductionDashboardOutputItem>>;
  abstract abnormalities(
    query: ProductionDashboardAbnormalityQuery,
  ): Promise<ProductionDashboardAbnormalityResult>;
}
