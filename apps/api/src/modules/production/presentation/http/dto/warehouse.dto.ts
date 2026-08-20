import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  RETURN_ORDER_STATUSES,
  SCRAP_STATUSES,
  STOCK_CHECK_STATUSES,
  STOCK_STATUSES,
} from '@company/constants';
import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  CreateMaterialLossPayload,
  MaterialLossQuery,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateQuery,
  StockCheckOrderQuery,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class ReturnIdParamDto {
  @IsString() @MaxLength(20) returnId!: string;
}
export class ScrapIdParamDto {
  @IsString() @MaxLength(20) scrapId!: string;
}
export class StockCheckIdParamDto {
  @IsString() @MaxLength(20) stockCheckId!: string;
}
export class WarehouseBatchIdParamDto {
  @IsString() @MaxLength(20) batchId!: string;
}
export class ReturnOrderQueryDto extends PageQueryDto implements ReturnOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(RETURN_ORDER_STATUSES) status?: ReturnOrderQuery['status'];
}
export class CreateReturnOrderLineDto {
  @IsString() @MaxLength(20) allocationId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) returnQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreateReturnOrderDto implements CreateReturnOrderPayload {
  @IsString() @MaxLength(20) productionBatchId!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnOrderLineDto)
  details!: CreateReturnOrderLineDto[];
}
export class MaterialLossQueryDto extends PageQueryDto implements MaterialLossQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(SCRAP_STATUSES) status?: MaterialLossQuery['status'];
}
export class CreateMaterialLossDto implements CreateMaterialLossPayload {
  @IsString() @MaxLength(20) productionBatchId!: string;
  @IsString() @MaxLength(20) allocationId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) scrapQuantity!: number;
  @IsString() @MaxLength(50) reasonType!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class StockCheckOrderQueryDto extends PageQueryDto implements StockCheckOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(STOCK_CHECK_STATUSES) status?: StockCheckOrderQuery['status'];
}
export class StockCheckCandidateQueryDto extends PageQueryDto implements StockCheckCandidateQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(STOCK_STATUSES) stockStatus?: StockCheckCandidateQuery['stockStatus'];
}
export class CreateStockCheckLineDto {
  @IsString() @MaxLength(20) itemBatchId!: string;
  @IsIn(STOCK_STATUSES) stockStatus!: CreateStockCheckPayload['details'][number]['stockStatus'];
}
export class CreateStockCheckDto implements CreateStockCheckPayload {
  @IsOptional() @IsString() @MaxLength(100) checkNo?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateStockCheckLineDto)
  details!: CreateStockCheckLineDto[];
}
export class SaveStockCheckCountLineDto {
  @IsString() @MaxLength(20) detailId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) actualQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class SaveStockCheckCountsDto implements SaveStockCheckCountsPayload {
  @Type(() => Number) @IsInt() @Min(0) version!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaveStockCheckCountLineDto)
  details!: SaveStockCheckCountLineDto[];
}
