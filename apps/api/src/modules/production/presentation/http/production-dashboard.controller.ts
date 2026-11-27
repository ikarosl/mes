import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { ProductionDashboardService } from '../../application/production-dashboard.service.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { DashboardAbnormalityDetailDto } from './dto/production-dashboard.dto.js';
import {
  DashboardQueryDto,
  DashboardPeriodQueryDto,
  DashboardOptionQueryDto,
  DashboardOptionParamDto,
  DashboardBatchParamDto,
  DashboardCardsDto,
  DashboardOutputDto,
  DashboardAbnormalityDto,
} from './dto/production-dashboard.dto.js';

@Controller('production/dashboard')
@UseFilters(ProductionDomainExceptionFilter)
@RequirePermission(PERMISSIONS.production.tasks.view)
export class ProductionDashboardController {
  constructor(private readonly service: ProductionDashboardService) {}
  @Get('abnormalities/details') abnormalityDetails(
    @Query() query: DashboardAbnormalityDetailDto,
  ): ReturnType<ProductionDashboardService['abnormalityDetails']> {
    return this.service.abnormalityDetails(query);
  }
  @Get('schedule') schedule(
    @Query() query: DashboardQueryDto,
  ): ReturnType<ProductionDashboardService['schedule']> {
    return this.service.schedule(query);
  }
  @Get('options/:kind') options(
    @Param() { kind }: DashboardOptionParamDto,
    @Query() query: DashboardOptionQueryDto,
  ): ReturnType<ProductionDashboardService['options']> {
    return this.service.options(kind, query);
  }
  @Get('tasks/:batchId/period-flow') periodFlow(
    @Param() { batchId }: DashboardBatchParamDto,
    @Query() query: DashboardPeriodQueryDto,
  ): ReturnType<ProductionDashboardService['periodFlow']> {
    return this.service.periodFlow(batchId, query);
  }
  @Get('tasks/:batchId/period-visits') periodVisits(
    @Param() { batchId }: DashboardBatchParamDto,
    @Query() query: DashboardPeriodQueryDto,
  ): ReturnType<ProductionDashboardService['periodVisits']> {
    return this.service.periodVisits(batchId, query);
  }
  @Get('tasks/:batchId/flow') flow(
    @Param() { batchId }: DashboardBatchParamDto,
  ): ReturnType<ProductionDashboardService['flow']> {
    return this.service.flow(batchId);
  }
  @Get('tasks/:batchId/cards') cards(
    @Param() { batchId }: DashboardBatchParamDto,
    @Query() query: DashboardCardsDto,
  ): ReturnType<ProductionDashboardService['cards']> {
    return this.service.cards(batchId, query);
  }
  @Get('output') output(
    @Query() query: DashboardOutputDto,
  ): ReturnType<ProductionDashboardService['output']> {
    return this.service.output(query);
  }
  @Get('abnormalities') abnormalities(
    @Query() query: DashboardAbnormalityDto,
  ): ReturnType<ProductionDashboardService['abnormalities']> {
    return this.service.abnormalities(query);
  }
}
