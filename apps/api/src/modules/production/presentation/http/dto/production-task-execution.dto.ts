import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type {
  StartProductionExecutionPayload,
  CompleteProductionExecutionPayload,
} from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class StartProductionExecutionDto
  extends VersionedCommandDto
  implements StartProductionExecutionPayload
{
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string | null;
}

export class CompleteProductionExecutionDto
  extends VersionedCommandDto
  implements CompleteProductionExecutionPayload
{
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  closeoutVersion!: number | null;
}
