import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PRODUCTION_WORKER_TASK_STATUSES } from '@company/constants';
import type { ProductionWorkerTaskQuery } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

const trimFilter = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ProductionWorkerTaskQueryDto
  extends PageQueryDto
  implements ProductionWorkerTaskQuery
{
  @IsOptional()
  @IsIn(PRODUCTION_WORKER_TASK_STATUSES, { message: '请选择有效的工序状态' })
  status?: ProductionWorkerTaskQuery['status'];

  @Transform(trimFilter)
  @IsOptional()
  @IsString({ message: '任务单号必须是文本' })
  @MaxLength(100, { message: '任务单号不能超过 100 个字符' })
  batchNo?: string;

  @Transform(trimFilter)
  @IsOptional()
  @IsString({ message: '工单号必须是文本' })
  @MaxLength(100, { message: '工单号不能超过 100 个字符' })
  workOrderNo?: string;
}
