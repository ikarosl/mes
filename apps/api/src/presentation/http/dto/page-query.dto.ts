import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PageQueryDto {
  @Type(() => Number)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码必须大于等于 1' })
  page = 1;

  @Type(() => Number)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数必须大于等于 1' })
  @Max(100, { message: '每页条数不能超过 100' })
  pageSize = 10;
}
