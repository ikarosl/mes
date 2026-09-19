import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPLIER_NAME_MAX_LENGTH, SUPPLIER_OPTIONS_MAX_INCLUDE_IDS } from '@company/constants';
import type {
  CreateSupplierPayload,
  SupplierOptionQuery,
  SupplierQuery,
  UpdateSupplierPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SupplierQueryDto extends PageQueryDto implements SupplierQuery {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(SUPPLIER_NAME_MAX_LENGTH)
  keyword?: string;
}

export class SupplierOptionQueryDto implements SupplierOptionQuery {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(SUPPLIER_NAME_MAX_LENGTH)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMaxSize(SUPPLIER_OPTIONS_MAX_INCLUDE_IDS)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  includeIds?: string[];
}

export class SupplierIdParamDto {
  @Matches(/^[1-9]\d{0,19}$/)
  id!: string;
}

export class CreateSupplierDto implements CreateSupplierPayload {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SUPPLIER_NAME_MAX_LENGTH)
  supplierName!: string;
}

export class UpdateSupplierDto extends CreateSupplierDto implements UpdateSupplierPayload {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  version!: number;
}
