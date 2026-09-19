import { IsIn, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DEMAND_CORRECTION_KINDS } from '@company/constants';
import type { SubmitDemandCorrectionPayload, DemandCorrectionKind } from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';
export class DemandCorrectionParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) demandId!: string;
}
export class SubmitDemandCorrectionDto
  extends VersionedCommandDto
  implements SubmitDemandCorrectionPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsIn(DEMAND_CORRECTION_KINDS) kind!: DemandCorrectionKind;
  @IsInt() @Min(0) @Max(99_999_999) targetTotalQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
