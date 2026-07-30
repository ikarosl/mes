import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  UpdateBatchStepExecutionPayload,
  UpdateWorkOrderPayload,
  WorkOrderQuery,
} from '@company/contracts';
import { PRODUCTION_BATCH_STATUSES, WORK_ORDER_STATUSES } from '@company/constants';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class IdParamDto {
  @IsString() @MaxLength(20) id!: string;
}
export class BatchStepRecordParamDto {
  @IsString() @MaxLength(20) batchId!: string;
  @IsString() @MaxLength(20) recordId!: string;
}
export class WorkOrderQueryDto extends PageQueryDto implements WorkOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(20) productId?: string;
  @IsOptional() @IsIn(WORK_ORDER_STATUSES) status?: WorkOrderQuery['status'];
}
export class ProductionBatchQueryDto extends PageQueryDto implements ProductionBatchQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(20) workOrderId?: string;
  @IsOptional() @IsIn(PRODUCTION_BATCH_STATUSES) status?: ProductionBatchQuery['status'];
  @IsOptional() @IsString() @MaxLength(20) ownerId?: string;
}
export class CreateWorkOrderDto implements CreateWorkOrderPayload {
  @IsString() @MaxLength(100) workOrderNo!: string;
  @IsString() @MaxLength(20) productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) plannedQuantity!: number;
  @IsOptional() @IsString() @MaxLength(255) customerName?: string | null;
  @IsOptional() @IsString() @MaxLength(50) qualityLevel?: string | null;
  @IsOptional() @IsString() @MaxLength(20) workOrderOwnerId?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planStartDate?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planEndDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalOrderNo?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class UpdateWorkOrderDto extends VersionedCommandDto implements UpdateWorkOrderPayload {
  @IsOptional() @IsString() @MaxLength(20) productId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  plannedQuantity?: number;
  @IsOptional() @IsString() @MaxLength(255) customerName?: string | null;
  @IsOptional() @IsString() @MaxLength(50) qualityLevel?: string | null;
  @IsOptional() @IsString() @MaxLength(20) workOrderOwnerId?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planStartDate?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planEndDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalOrderNo?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreateBatchStepOverrideDto {
  @IsString() @MaxLength(20) routeStepId!: string;
  @IsOptional() @IsString() @MaxLength(20) actualSopFileId?: string | null;
  @IsOptional() @IsString() @MaxLength(20) responsibleUserId?: string | null;
}
export class CreateProductionBatchDto implements CreateProductionBatchPayload {
  @IsOptional() @IsString() @MaxLength(100) batchNo?: string | null;
  @IsOptional() @IsString() @MaxLength(20) routeId?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) plannedQuantity!: number;
  @IsOptional() @IsString() @MaxLength(20) ownerId?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planStartDate?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planEndDate?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBatchStepOverrideDto)
  stepOverrides?: CreateProductionBatchPayload['stepOverrides'];
}
export class UpdateProductionBatchDto
  extends VersionedCommandDto
  implements UpdateProductionBatchPayload
{
  @IsOptional() @IsString() @MaxLength(20) ownerId?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planStartDate?: string | null;
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  planEndDate?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class UpdateBatchStepExecutionDto
  extends VersionedCommandDto
  implements UpdateBatchStepExecutionPayload
{
  @IsOptional() @IsString() @MaxLength(20) actualSopFileId?: string | null;
  @IsOptional() @IsString() @MaxLength(20) responsibleUserId?: string | null;
}
