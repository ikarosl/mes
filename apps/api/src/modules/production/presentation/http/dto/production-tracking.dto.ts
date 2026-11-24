import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  BindProductionTrackingItemMarkPayload,
  CancelProductionTrackingItemMarkPayload,
  CorrectProductionTrackingItemMarkPayload,
  ProductionTrackingItemMarkQuery,
  ProductionTrackingItemMarkWorkspaceChange,
  ProductionTrackingItemMarkWorkspaceQuery,
  SaveProductionTrackingItemMarkWorkspacePayload,
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingAbnormalityScrapPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingCardQuery,
  ProductionTrackingAbnormalityDescriptionQuery,
  ProductionTrackingReportQuery,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingAbnormalityPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import {
  PRODUCTION_TRACKING_ABNORMALITY_STATUSES,
  PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS,
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT,
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
  PRODUCTION_TRACKING_CARD_STATUSES,
  PRODUCTION_TASK_FINISH_MODES,
  PRODUCTION_TRACKING_ITEM_MARK_STATUSES,
  PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE,
  PRODUCTION_TRACKING_MARK_WORKSPACE_STATUSES,
} from '@company/constants';
import {
  MAX_PERSISTED_INTEGER_QUANTITY,
  normalizeTrackingItemMarkCode,
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
  TRACKING_ITEM_MARK_CODE_PATTERN,
} from '@company/utils';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
import {
  ReasonedVersionedCommandDto,
  VersionedCommandDto,
} from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class TrackingCardParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) cardId!: string;
}
export class TrackingAbnormalityParamDto extends TrackingCardParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) abnormalityId!: string;
}
export class TrackingItemMarkParamDto extends TrackingCardParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) markId!: string;
}
export class ProductionTrackingItemMarkCodeAvailabilityDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeTrackingItemMarkCode(value) : value,
  )
  @Matches(TRACKING_ITEM_MARK_CODE_PATTERN, { message: TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE })
  markCode!: string;
}
export class OccupiedTrackingItemMarkCodesDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').map(normalizeTrackingItemMarkCode) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE)
  @Matches(TRACKING_ITEM_MARK_CODE_PATTERN, {
    each: true,
    message: TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
  })
  markCodes!: string[];
}
class TrackingItemMarkFiltersDto extends PageQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) cardId?: string;
  @IsOptional() @IsString() @MaxLength(100) cardNo?: string;
  @IsOptional() @IsString() @MaxLength(160) keyword?: string;
}
export class ProductionTrackingItemMarkQueryDto
  extends TrackingItemMarkFiltersDto
  implements ProductionTrackingItemMarkQuery
{
  @IsOptional()
  @IsIn(PRODUCTION_TRACKING_ITEM_MARK_STATUSES)
  status?: ProductionTrackingItemMarkQuery['status'];
}
export class TrackingItemMarkWorkspaceQueryDto
  extends TrackingItemMarkFiltersDto
  implements ProductionTrackingItemMarkWorkspaceQuery
{
  @IsOptional()
  @IsIn(PRODUCTION_TRACKING_MARK_WORKSPACE_STATUSES)
  status?: ProductionTrackingItemMarkWorkspaceQuery['status'];
}
export class TrackingItemMarkWorkspaceChangeDto implements ProductionTrackingItemMarkWorkspaceChange {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) cardId!: string;
  @IsInt() @Min(0) cardVersion!: number;
  @ValidateIf((_, v: unknown) => v !== null) @IsString() @Matches(/^[1-9]\d{0,19}$/) markId!:
    string | null;
  @ValidateIf((_, v: unknown) => v !== null) @IsString() @Matches(/^\d{1,32}$/) previousMarkCode!:
    string | null;
  @ValidateIf((_, v: unknown) => v !== null) @IsInt() @Min(0) version!: number | null;
  @ValidateIf((_, v: unknown) => v !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeTrackingItemMarkCode(value) : value,
  )
  @IsString()
  @Matches(TRACKING_ITEM_MARK_CODE_PATTERN, { message: TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE })
  markCode!: string | null;
}
export class SaveTrackingItemMarkWorkspaceDto implements SaveProductionTrackingItemMarkWorkspacePayload {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsOptional() @IsString() @MaxLength(5000) reason?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PERSISTED_INTEGER_QUANTITY)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TrackingItemMarkWorkspaceChangeDto)
  changes!: TrackingItemMarkWorkspaceChangeDto[];
}
export class BindProductionTrackingItemMarkDto
  extends VersionedCommandDto
  implements BindProductionTrackingItemMarkPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeTrackingItemMarkCode(value) : value,
  )
  @Matches(TRACKING_ITEM_MARK_CODE_PATTERN, { message: TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE })
  markCode!: string;
}
export class CancelProductionTrackingItemMarkDto
  extends VersionedCommandDto
  implements CancelProductionTrackingItemMarkPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class CorrectProductionTrackingItemMarkDto
  extends VersionedCommandDto
  implements CorrectProductionTrackingItemMarkPayload
{
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeTrackingItemMarkCode(value) : value,
  )
  @Matches(TRACKING_ITEM_MARK_CODE_PATTERN, { message: TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE })
  markCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
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
export class ProductionTrackingAbnormalityDescriptionQueryDto
  extends PageQueryDto
  implements ProductionTrackingAbnormalityDescriptionQuery
{
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) keyword?: string;
}
export class CreateProductionTrackingCardDto implements CreateProductionTrackingCardPayload {
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantity!: number;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreateProductionTrackingCardsDto implements CreateProductionTrackingCardsPayload {
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) totalQuantity!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantityPerCard!: number;
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
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_PERSISTED_INTEGER_QUANTITY)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  scrappedItemMarkIds?: string[];
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId?: string | null;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) affectedQuantity!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH, { each: true })
  descriptionLabels!: string[];
  @IsIn(PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS)
  resolution!: CreateProductionTrackingAbnormalityPayload['resolution'];
}
export class ProductionTrackingScrapReferenceDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) handlingId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99999999) quantity!: number;
}
export class HandleProductionTrackingAbnormalityDto
  extends VersionedCommandDto
  implements HandleProductionTrackingAbnormalityPayload
{
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_PERSISTED_INTEGER_QUANTITY)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  scrappedItemMarkIds?: string[];
  @IsString() @Matches(/^[1-9]\d{0,19}$/) personnelId!: string;
  @IsOptional()
  @IsIn(PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS)
  resolution?: HandleProductionTrackingAbnormalityPayload['resolution'];
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) content?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99999999) repairedQuantity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99999999) scrappedQuantity?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((reference: ProductionTrackingScrapReferenceDto | null) => reference?.handlingId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ProductionTrackingScrapReferenceDto)
  scrapReferences?: ProductionTrackingScrapReferenceDto[];
}
export class CorrectProductionTrackingAbnormalityScrapDto
  extends ReasonedVersionedCommandDto
  implements CorrectProductionTrackingAbnormalityScrapPayload
{
  @IsInt() @Min(0) cardVersion!: number;
  @IsInt() @Min(1) @Max(MAX_PERSISTED_INTEGER_QUANTITY) scrappedQuantity!: number;
  @IsArray()
  @ArrayMaxSize(MAX_PERSISTED_INTEGER_QUANTITY)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  scrappedItemMarkIds!: string[];
}
export class VoidProductionTrackingAbnormalityDto
  extends ReasonedVersionedCommandDto
  implements VoidProductionTrackingAbnormalityPayload
{
  @IsInt() @Min(0) cardVersion!: number;
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
