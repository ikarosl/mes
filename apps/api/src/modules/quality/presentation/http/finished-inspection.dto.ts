import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PRODUCTION_OUTPUT_QUANTITY_MAX,
  PRODUCTION_OUTPUT_INSPECTION_METHODS,
  PRODUCTION_OUTPUT_RELEASE_DECISIONS,
  FINISHED_INSPECTION_LIST_STATUSES,
} from '@company/constants';
import type {
  ProductionOutputInspectionMethod,
  ProductionOutputReleaseDecision,
  RecordFinishedInspectionPayload,
  FinishedInspectionTaskQuery,
  FinishedInspectionListStatus,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
export class FinishedInspectionTaskQueryDto
  extends PageQueryDto
  implements FinishedInspectionTaskQuery
{
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(FINISHED_INSPECTION_LIST_STATUSES) status?: FinishedInspectionListStatus;
}
export class FinishedInspectionBatchParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
}
export class RecordFinishedInspectionDto
  extends VersionedCommandDto
  implements RecordFinishedInspectionPayload
{
  @IsIn(PRODUCTION_OUTPUT_INSPECTION_METHODS) inspectionMethod!: ProductionOutputInspectionMethod;
  @ValidateIf(
    (object: RecordFinishedInspectionDto, value: unknown) =>
      object.inspectionMethod === 'sampling' || value !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(PRODUCTION_OUTPUT_QUANTITY_MAX)
  coveredQuantity?: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) qualifiedQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) unqualifiedQuantity!: number;
  @IsIn(PRODUCTION_OUTPUT_RELEASE_DECISIONS) releaseDecision!: ProductionOutputReleaseDecision;
  @IsDateString() inspectedAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) resultNote!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) evidenceReference!: string;
}
