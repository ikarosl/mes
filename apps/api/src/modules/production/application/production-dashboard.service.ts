import { Injectable } from '@nestjs/common';
import { PRODUCTION_DASHBOARD_MAX_DAYS } from '@company/constants';
import type {
  ProductionDashboardQuery,
  ProductionDashboardPeriodQuery,
  ProductionDashboardOptionQuery,
  ProductionDashboardOptionKind,
  ProductionDashboardCardQuery,
  ProductionDashboardOutputQuery,
  ProductionDashboardAbnormalityQuery,
  ProductionDashboardAbnormalityDetailQuery,
} from '@company/contracts';
import { ProductionDashboardRepository } from './ports/production-dashboard.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionDashboardService {
  constructor(private readonly repository: ProductionDashboardRepository) {}
  abnormalityDetails(
    query: ProductionDashboardAbnormalityDetailQuery,
  ): ReturnType<ProductionDashboardRepository['abnormalityDetails']> {
    if (
      !/^[1-9]\d{0,19}$/.test(query.groupKey) &&
      !(query.groupBy === 'step' && query.groupKey === 'unassigned')
    )
      throw new ProductionDomainError('INVALID_INPUT', '异常分组标识无效');
    return this.repository.abnormalityDetails(this.range(query));
  }
  private range<T extends ProductionDashboardQuery>(query: T): T {
    const start = Date.parse(query.startDate + 'T00:00:00+08:00');
    const end = Date.parse(query.endDate + 'T00:00:00+08:00');
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      (end - start) / 86400000 >= PRODUCTION_DASHBOARD_MAX_DAYS
    )
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '请选择起止顺序正确、跨度不超过366天的日期范围',
      );
    return { ...query, keyword: query.keyword?.trim() || undefined };
  }
  schedule(query: ProductionDashboardQuery): ReturnType<ProductionDashboardRepository['schedule']> {
    return this.repository.schedule(this.range(query));
  }
  options(
    kind: ProductionDashboardOptionKind,
    query: ProductionDashboardOptionQuery,
  ): ReturnType<ProductionDashboardRepository['options']> {
    return this.repository.options(kind, {
      ...query,
      keyword: query.keyword?.trim() || undefined,
      search: query.search?.trim() || undefined,
    });
  }
  periodFlow(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): ReturnType<ProductionDashboardRepository['periodFlow']> {
    return this.repository.periodFlow(batchId, this.range(query));
  }
  periodVisits(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): ReturnType<ProductionDashboardRepository['periodVisits']> {
    return this.repository.periodVisits(batchId, this.range(query));
  }
  flow(batchId: string): ReturnType<ProductionDashboardRepository['flow']> {
    return this.repository.flow(batchId);
  }
  cards(
    batchId: string,
    query: ProductionDashboardCardQuery,
  ): ReturnType<ProductionDashboardRepository['cards']> {
    return this.repository.cards(batchId, query);
  }
  output(
    query: ProductionDashboardOutputQuery,
  ): ReturnType<ProductionDashboardRepository['output']> {
    return this.repository.output(this.range(query));
  }
  abnormalities(
    query: ProductionDashboardAbnormalityQuery,
  ): ReturnType<ProductionDashboardRepository['abnormalities']> {
    return this.repository.abnormalities(this.range(query));
  }
}
