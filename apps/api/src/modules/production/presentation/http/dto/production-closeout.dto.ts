import { IsIn, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BATCH_CLOSEOUT_ITEM_KINDS } from '@company/constants';
import type {
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  SaveBatchCloseoutOutputPayload,
  SubmitBatchCloseoutPayload,
  BatchCloseoutItemKind,
} from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';
export class BeginBatchCloseoutDto
  extends VersionedCommandDto
  implements BeginBatchCloseoutPayload
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class HandleBatchCloseoutItemDto
  extends BeginBatchCloseoutDto
  implements HandleBatchCloseoutItemPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
  @IsIn(BATCH_CLOSEOUT_ITEM_KINDS) kind!: BatchCloseoutItemKind;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) targetId!: string;
  @IsInt() @Min(0) @Max(2_147_483_647) targetVersion!: number;
}
export class SaveBatchCloseoutOutputDto
  extends BeginBatchCloseoutDto
  implements SaveBatchCloseoutOutputPayload
{
  @IsInt() @Min(0) @Max(99_999_999) availableQuantity!: number;
  @IsInt() @Min(0) @Max(99_999_999) additionalScrapQuantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(5000) materialReviewNote!: string;
}
export class SubmitBatchCloseoutDto
  extends VersionedCommandDto
  implements SubmitBatchCloseoutPayload
{
  @IsString() @Matches(/^[a-f0-9]{64}$/) checkToken!: string;
}
