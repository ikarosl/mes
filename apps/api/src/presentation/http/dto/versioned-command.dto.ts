import { IsInt, Min } from 'class-validator';
import type { VersionedCommand } from '@company/contracts';

export class VersionedCommandDto implements VersionedCommand {
  @IsInt() @Min(0) version!: number;
}
