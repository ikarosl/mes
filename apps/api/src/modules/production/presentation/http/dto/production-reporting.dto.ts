import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_BATCH_STEP_REPORT_REVERSALS,
  PRODUCTION_REPORT_QUANTITY_MAX,
} from '@company/constants';
import type {
  BatchReverseStepReportSelection,
  BatchReverseStepReportsPayload,
  HistoricalBatchStepReportPayload,
  PreviewBatchReverseStepReportsPayload,
} from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class BatchStepReportReadParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) recordId!: string;
}

export class BatchStepReportDetailParamDto extends BatchStepReportReadParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) reportId!: string;
}

export class HistoricalBatchStepReportDto
  extends VersionedCommandDto
  implements HistoricalBatchStepReportPayload
{
  @Type(() => Number) @IsInt() @Min(1) @Max(PRODUCTION_REPORT_QUANTITY_MAX) normalQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}

export class BatchReverseStepReportSelectionDto
  extends VersionedCommandDto
  implements BatchReverseStepReportSelection
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) reportId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) stepRecordId!: string;
}

export class PreviewBatchReverseStepReportsDto implements PreviewBatchReverseStepReportsPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_STEP_REPORT_REVERSALS)
  @ArrayUnique((item: BatchReverseStepReportSelectionDto) => item.reportId)
  @ValidateNested({ each: true })
  @Type(() => BatchReverseStepReportSelectionDto)
  reports!: BatchReverseStepReportSelectionDto[];
}

export class BatchReverseStepReportsDto
  extends PreviewBatchReverseStepReportsDto
  implements BatchReverseStepReportsPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) previewToken!: string;
}
