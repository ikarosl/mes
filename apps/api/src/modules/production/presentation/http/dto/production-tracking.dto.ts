import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  ConfirmProductionTrackingOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingCardQuery,
  ProductionTrackingReportQuery,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ABNORMALITY_SEVERITIES,
  PRODUCTION_TRACKING_ABNORMALITY_STATUSES,
  PRODUCTION_TRACKING_CARD_STATUSES,
} from '@company/constants';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class TrackingCardParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) cardId!: string;
}
export class TrackingAbnormalityParamDto extends TrackingCardParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) abnormalityId!: string;
}
export class TrackingBatchParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
}
export class ProductionTrackingCardQueryDto
  extends PageQueryDto
  implements ProductionTrackingCardQuery
{
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @IsIn(PRODUCTION_TRACKING_CARD_STATUSES)
  status?: ProductionTrackingCardQuery['status'];
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId?: string;
  @IsOptional()
  @IsIn(PRODUCTION_TRACKING_ABNORMALITY_STATUSES)
  abnormalityStatus?: ProductionTrackingCardQuery['abnormalityStatus'];
}
export class ProductionTrackingReportQueryDto
  extends PageQueryDto
  implements ProductionTrackingReportQuery
{
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId?: string;
}
export class CreateProductionTrackingCardDto implements CreateProductionTrackingCardPayload {
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantity!: number;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class ScanProductionTrackingCardDto implements ScanProductionTrackingCardPayload {
  @IsString() @IsNotEmpty() @MaxLength(100) cardNo!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
}
export class CorrectProductionTrackingQuantityDto
  extends VersionedCommandDto
  implements CorrectProductionTrackingQuantityPayload
{
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class VoidProductionTrackingCardDto
  extends VersionedCommandDto
  implements VoidProductionTrackingCardPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class CreateProductionTrackingAbnormalityDto
  extends VersionedCommandDto
  implements CreateProductionTrackingAbnormalityPayload
{
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId?: string | null;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsIn(PRODUCTION_TRACKING_ABNORMALITY_SEVERITIES)
  severity!: CreateProductionTrackingAbnormalityPayload['severity'];
  @IsString() @IsNotEmpty() @MaxLength(5000) description!: string;
}
export class HandleProductionTrackingAbnormalityDto
  extends VersionedCommandDto
  implements HandleProductionTrackingAbnormalityPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) content!: string;
  @IsBoolean() resolve!: boolean;
}
export class ConfirmProductionTrackingOutputDto
  extends VersionedCommandDto
  implements ConfirmProductionTrackingOutputPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(99999999) availableQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class FinishProductionTrackingTaskDto
  extends VersionedCommandDto
  implements FinishProductionTrackingTaskPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class StartProductionTrackingTaskDto extends VersionedCommandDto {
  @IsOptional() @IsString() @MaxLength(5000) reason?: string | null;
}
