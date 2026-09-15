import {
  Equals,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { TerminateProductionBatchPayload } from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class TerminateProductionBatchDto
  extends VersionedCommandDto
  implements TerminateProductionBatchPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsInt() @Min(0) @Max(99_999_999) availableQuantity!: number;
  @IsInt() @Min(0) @Max(99_999_999) additionalScrapQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) materialReviewNote!: string;
  @IsBoolean() @Equals(true) confirmImpacts!: boolean;
}

export class TerminationBatchParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
}
