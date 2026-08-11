import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
} from '@company/contracts';

export class BatchIdParamDto {
  @IsString() @MaxLength(20) batchId!: string;
}
export class DemandIdParamDto {
  @IsString() @MaxLength(20) demandId!: string;
}
export class AllocationParamDto extends BatchIdParamDto {
  @IsString() @MaxLength(20) allocationId!: string;
}

export class CreateMaterialAllocationLineDto {
  @IsString() @MaxLength(20) demandId!: string;
  @IsString() @MaxLength(20) itemBatchId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) assignedQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreateMaterialAllocationsDto implements CreateMaterialAllocationsPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialAllocationLineDto)
  allocations!: CreateMaterialAllocationLineDto[];
}
export class CreateMaterialOutboundDetailDto {
  @IsString() @MaxLength(20) allocationId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) outboundQuantity!: number;
}
export class CreateMaterialOutboundDto implements CreateMaterialOutboundPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialOutboundDetailDto)
  details!: CreateMaterialOutboundDetailDto[];
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
