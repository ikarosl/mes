import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingCardQuery,
  ProductionTrackingReportQuery,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ABNORMALITY_STATUSES,
  PRODUCTION_TRACKING_CARD_STATUSES,
  PRODUCTION_TASK_FINISH_MODES,
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
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) affectedQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) description!: string;
}
export class ProductionTrackingScrapReferenceDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) handlingId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantity!: number;
}
export class HandleProductionTrackingAbnormalityDto
  extends VersionedCommandDto
  implements HandleProductionTrackingAbnormalityPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) content!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(99999999) repairedQuantity!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(99999999) scrappedQuantity!: number;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((reference: ProductionTrackingScrapReferenceDto | null) => reference?.handlingId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ProductionTrackingScrapReferenceDto)
  scrapReferences!: ProductionTrackingScrapReferenceDto[];
}
export class ConfirmProductionTrackingOutputDto
  extends VersionedCommandDto
  implements ConfirmProductionTrackingOutputPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class ConfirmProductionResearchOutputDto
  extends ConfirmProductionTrackingOutputDto
  implements ConfirmProductionResearchOutputPayload
{
  @Type(() => Number) @IsInt() @Min(0) @Max(99999999) availableQuantity!: number;
}
export class FinishProductionTrackingTaskDto
  extends VersionedCommandDto
  implements FinishProductionTrackingTaskPayload
{
  @IsIn(PRODUCTION_TASK_FINISH_MODES) mode!: FinishProductionTrackingTaskPayload['mode'];
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class ReopenProductionTrackingTaskDto
  extends VersionedCommandDto
  implements ReopenProductionTrackingTaskPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class StartProductionTrackingTaskDto extends VersionedCommandDto {
  @IsOptional() @IsString() @MaxLength(5000) reason?: string | null;
}
