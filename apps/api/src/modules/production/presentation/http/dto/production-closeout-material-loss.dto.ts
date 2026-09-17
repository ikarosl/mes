import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { RecordCloseoutMaterialLossPayload } from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class RecordCloseoutMaterialLossDto
  extends VersionedCommandDto
  implements RecordCloseoutMaterialLossPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) allocationId!: string;
  @IsInt() @Min(1) @Max(99_999_999) scrapQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
