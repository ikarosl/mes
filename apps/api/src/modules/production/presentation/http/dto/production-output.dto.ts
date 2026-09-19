import { Type } from 'class-transformer';
import {
  IsDateString,
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
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type {
  ProductionOutputQuantities,
  ReviewProductionOutputMaterialPayload,
  SaveProductionOutputPayload,
  RecordProductionOutputInspectionPayload,
  SubmitProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
} from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';
export class ProductionOutputQuantitiesDto implements ProductionOutputQuantities {
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) availableQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) extraQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) additionalScrapQuantity!: number;
}
export class SaveProductionOutputDto
  extends VersionedCommandDto
  implements SaveProductionOutputPayload
{
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) availableQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) extraQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) additionalScrapQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) materialReviewNote!: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) inspectionRecordId: string | null = null;
}
export class RecordProductionOutputInspectionDto
  extends VersionedCommandDto
  implements RecordProductionOutputInspectionPayload
{
  @IsObject()
  @ValidateNested()
  @Type(() => ProductionOutputQuantitiesDto)
  inspected!: ProductionOutputQuantitiesDto;
  @IsDateString() inspectedAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) resultNote!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) evidenceReference!: string;
}
export class SubmitProductionOutputDto
  extends VersionedCommandDto
  implements SubmitProductionOutputPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) submissionToken!: string;
}
export class BeginProductionOutputCorrectionDto
  extends VersionedCommandDto
  implements BeginProductionOutputCorrectionPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) currentRevisionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}

export class ReviewProductionOutputMaterialDto
  extends VersionedCommandDto
  implements ReviewProductionOutputMaterialPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) targetId!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
