import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { ProductionTraceQuery } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class ProductionTraceQueryDto extends PageQueryDto implements ProductionTraceQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
