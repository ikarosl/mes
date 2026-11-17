import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  STOCK_DOCUMENT_DIRECTIONS,
  STOCK_DOCUMENT_ITEM_KINDS,
  STOCK_DOCUMENT_SOURCE_TYPES,
  STOCK_DOCUMENT_STATUSES,
} from '@company/constants';
import type { StockDocumentDirection, StockDocumentQuery } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class StockDocumentQueryDto extends PageQueryDto implements StockDocumentQuery {
  @IsIn(STOCK_DOCUMENT_DIRECTIONS) direction!: StockDocumentQuery['direction'];
  @IsIn(STOCK_DOCUMENT_ITEM_KINDS) itemKind!: StockDocumentQuery['itemKind'];
  @IsOptional() @IsIn(STOCK_DOCUMENT_SOURCE_TYPES) sourceType?: StockDocumentQuery['sourceType'];
  @IsOptional() @IsIn(STOCK_DOCUMENT_STATUSES) status?: StockDocumentQuery['status'];
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}

export class StockDocumentIdParamDto {
  @IsIn(STOCK_DOCUMENT_DIRECTIONS) direction!: StockDocumentDirection;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) id!: string;
}
