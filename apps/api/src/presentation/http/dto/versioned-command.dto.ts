import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import type { ReasonedVersionedCommand, VersionedCommand } from '@company/contracts';

export class VersionedCommandDto implements VersionedCommand {
  @IsInt() @Min(0) version!: number;
}

export class ReasonedVersionedCommandDto
  extends VersionedCommandDto
  implements ReasonedVersionedCommand
{
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
