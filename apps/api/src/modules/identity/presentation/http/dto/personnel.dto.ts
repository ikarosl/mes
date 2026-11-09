import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PERSONNEL_GROUPS, PERSONNEL_STATUSES } from '@company/constants';
import type { PersonnelGroup, PersonnelStatus } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
export class PersonnelListQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(PERSONNEL_GROUPS) group?: PersonnelGroup;
  @IsOptional() @IsIn(PERSONNEL_STATUSES) status?: PersonnelStatus;
}
export class PersonnelOptionsQueryDto {
  @IsOptional() @IsIn(PERSONNEL_GROUPS) group?: PersonnelGroup;
}
export class PersonnelParamDto {
  @Matches(/^[1-9]\d{0,19}$/) id!: string;
}
export class SavePersonnelDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) code!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) name!: string;
  @IsIn(PERSONNEL_GROUPS) group!: PersonnelGroup;
  @IsIn(PERSONNEL_STATUSES) status!: PersonnelStatus;
}
export class UpdatePersonnelDto extends SavePersonnelDto {
  @IsInt() @Min(0) @Max(2147483646) version!: number;
}
