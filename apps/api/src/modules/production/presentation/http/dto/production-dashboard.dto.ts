import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  PRODUCTION_BATCH_STATUSES,
  PRODUCTION_DASHBOARD_OPTION_KINDS,
  PRODUCTION_DASHBOARD_OUTPUT_GROUPS,
  PRODUCTION_DASHBOARD_ABNORMALITY_GROUPS,
} from '@company/constants';
import type {
  ProductionBatchStatus,
  ProductionDashboardOptionKind,
  ProductionDashboardOutputGroup,
  ProductionDashboardAbnormalityGroup,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class DashboardFilterDto extends PageQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) workOrderId?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) productId?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(PRODUCTION_BATCH_STATUSES) status?: ProductionBatchStatus;
}
export class DashboardQueryDto extends DashboardFilterDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) startDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) endDate!: string;
}
export class DashboardOptionParamDto {
  @IsIn(PRODUCTION_DASHBOARD_OPTION_KINDS) kind!: ProductionDashboardOptionKind;
}
export class DashboardOptionQueryDto extends DashboardFilterDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  onlyInProgress?: boolean;
}
export class DashboardBatchParamDto {
  @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
}
export class DashboardCardsDto extends PageQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) stepId?: string;
}
export class DashboardOutputDto extends DashboardQueryDto {
  @IsIn(PRODUCTION_DASHBOARD_OUTPUT_GROUPS) groupBy: ProductionDashboardOutputGroup = 'task';
}
export class DashboardAbnormalityDto extends DashboardQueryDto {
  @IsIn(PRODUCTION_DASHBOARD_ABNORMALITY_GROUPS) groupBy: ProductionDashboardAbnormalityGroup =
    'reason';
}
export class DashboardAbnormalityDetailDto extends DashboardAbnormalityDto {
  @IsString() @Matches(/^(?:[1-9]\d{0,19}|unassigned)$/) groupKey!: string;
}

export class DashboardPeriodQueryDto extends PageQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) startDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) endDate!: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) stepId?: string;
}
