import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PRODUCTION_REPORT_QUANTITY_MAX } from '@company/constants';
import type { AcceptProcessInspectionPayload } from '@company/contracts';
import { BatchStepReportReadParamDto } from './production-reporting.dto.js';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class AcceptProcessInspectionDto
  extends VersionedCommandDto
  implements AcceptProcessInspectionPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inspectionId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) recordId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(PRODUCTION_REPORT_QUANTITY_MAX) quantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}

export class ProductionProcessInspectionParamDto extends BatchStepReportReadParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inspectionId!: string;
}
