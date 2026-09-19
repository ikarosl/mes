import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { STOCK_CHECK_STATUSES, STOCK_STATUSES } from '@company/constants';
import type {
  CreateStockCheckPayload,
  SaveStockCheckCountsPayload,
  StockCheckCandidateQuery,
  StockCheckOrderQuery,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
export class StockCheckIdParamDto {
  @IsString() @MaxLength(20) stockCheckId!: string;
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
  @Type(() => Number) @IsInt() @Min(0) @Max(99_999_999) actualQuantity!: number;
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
