import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class ReopenProductionStepDto extends VersionedCommandDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
