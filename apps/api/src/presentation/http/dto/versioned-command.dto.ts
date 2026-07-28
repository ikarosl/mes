import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import type { IdempotentCommand, VersionedCommand } from '@company/contracts';

export class VersionedCommandDto implements VersionedCommand {
  @IsInt() @Min(0) version!: number;
}

export class IdempotentCommandDto implements IdempotentCommand {
  @IsString() @IsNotEmpty() @MaxLength(150) idempotencyKey!: string;
}
