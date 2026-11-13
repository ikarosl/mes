import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PRODUCTION_OUTPUT_STATUSES } from '@company/constants';
import type {
  CreateProductionOutputInboundPayload,
  ProductionOutputQuery,
  RevokeProductionOutputPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class ProductionOutputParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) outputId!: string;
}
export class ProductionOutputQueryDto extends PageQueryDto implements ProductionOutputQuery {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(PRODUCTION_OUTPUT_STATUSES) status?: ProductionOutputQuery['status'];
}
export class RevokeProductionOutputDto implements RevokeProductionOutputPayload {
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
}
export class ProductionOutputInboundTargetDto {
  @IsIn(['new_batch', 'existing_batch']) mode!: 'new_batch' | 'existing_batch';
  @ValidateIf(
    (value: ProductionOutputInboundTargetDto) =>
      value.mode === 'existing_batch' || value.itemBatchId !== undefined,
  )
  @IsString()
  @Matches(/^[1-9]\d{0,19}$/)
  itemBatchId?: string;
  @ValidateIf(
    (value: ProductionOutputInboundTargetDto) =>
      value.mode === 'existing_batch' || value.version !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}
export class CreateProductionOutputInboundDto implements CreateProductionOutputInboundPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  outputIds!: string[];
  @IsObject()
  @ValidateNested()
  @Type(() => ProductionOutputInboundTargetDto)
  target!: CreateProductionOutputInboundPayload['target'];
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
