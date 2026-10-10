import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BATCH_CLOSEOUT_ITEM_KINDS } from '@company/constants';
import type {
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  BatchCloseoutItemKind,
  WithdrawBatchCloseoutPayload,
} from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';
class CloseoutReasonDto extends VersionedCommandDto {
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class BeginBatchCloseoutDto extends CloseoutReasonDto implements BeginBatchCloseoutPayload {
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  closeoutVersion!: number | null;
}
export class WithdrawBatchCloseoutDto
  extends CloseoutReasonDto
  implements WithdrawBatchCloseoutPayload
{
  @IsInt() @Min(0) @Max(2_147_483_647) closeoutVersion!: number;
}
export class HandleBatchCloseoutItemDto
  extends CloseoutReasonDto
  implements HandleBatchCloseoutItemPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsIn(BATCH_CLOSEOUT_ITEM_KINDS) kind!: BatchCloseoutItemKind;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) targetId!: string;
  @IsInt() @Min(0) @Max(2_147_483_647) targetVersion!: number;
}
