import {
  IsISO8601,
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
import { PROCESS_INSPECTION_METHODS, PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type {
  ProcessInspectionMethod,
  ProcessInspectionQuery,
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
export class ProcessInspectionQueryDto extends PageQueryDto implements ProcessInspectionQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) stepId?: string;
  @IsOptional() @IsIn(['true']) pendingOnly?: 'true';
}
export class ProcessInspectionStepParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) stepId!: string;
}
export class ProcessInspectionParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inspectionId!: string;
}
export class RecordProcessInspectionDto {
  @IsIn(PROCESS_INSPECTION_METHODS) inspectionMethod!: ProcessInspectionMethod;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) qualifiedQuantity!: number;
  @IsInt() @Min(0) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) unqualifiedQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) scopeNote!: string;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) inspectedAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) resultNote!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) evidenceReference!: string;
}
export class CreateProcessInspectionDto
  extends RecordProcessInspectionDto
  implements CreateProcessInspectionPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) stepId!: string;
}
export class CorrectProcessInspectionDto
  extends RecordProcessInspectionDto
  implements CorrectProcessInspectionPayload
{
  @IsInt() @Min(0) version!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class ReverseProcessInspectionDto
  extends VersionedCommandDto
  implements ReverseProcessInspectionPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
