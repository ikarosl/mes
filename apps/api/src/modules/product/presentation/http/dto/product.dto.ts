import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PROCESS_ROUTE_STATUSES,
  PRODUCT_ACQUIRE_METHODS,
  PRODUCT_ITEM_KINDS,
  SYSTEM_STATUS,
} from '@company/constants';
import type { ProcessRouteStatus, ProductAcquireMethod, ProductItemKind } from '@company/contracts';

export class ProductIdParamDto {
  @IsNumberString() id!: string;
}
export class ProductCategoryDto {
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsNumberString() parentId?:
    string | null;
  @IsString() @IsNotEmpty() @MaxLength(64) categoryCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) categoryName!: string;
  @IsIn(PRODUCT_ITEM_KINDS) itemKind!: ProductItemKind;
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled]) status!: number;
  @IsOptional() @IsString() remark?: string | null;
}
export class StatusDto {
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled]) status!: number;
}
export class ProductSpecValueDto {
  @IsString() @IsNotEmpty() @MaxLength(100) key!: string;
  @IsString() @MaxLength(255) value!: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
}
export class ProductDto {
  @IsString() @IsNotEmpty() @MaxLength(100) itemCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) productName!: string;
  @IsNumberString() categoryId!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) unit!: string;
  @IsIn(PRODUCT_ACQUIRE_METHODS) acquireMethod!: ProductAcquireMethod;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecValueDto)
  specValues?: ProductSpecValueDto[];
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled]) status!: number;
  @IsOptional() @IsString() remark?: string | null;
}
export class ProductMaterialDto {
  @IsNumberString() materialProductId!: string;
  @IsNumber() @Min(0.0001) quantityPerUnit!: number;
  @IsString() @IsNotEmpty() @MaxLength(20) unit!: string;
  @IsBoolean() isKeyMaterial!: boolean;
  @IsBoolean() needBatchRecord!: boolean;
  @IsOptional() @IsIn([0, 1]) status?: number;
  @IsOptional() @IsString() remark?: string | null;
}
export class ReplaceProductMaterialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMaterialDto)
  items!: ProductMaterialDto[];
}
export class DefaultRouteDto {
  @ValidateIf((_, value) => value !== null) @IsNumberString() routeId!: string | null;
}
export class ProcessStepDto {
  @IsString() @IsNotEmpty() @MaxLength(100) stepCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) stepName!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string | null;
  @IsIn([0, 1]) status!: number;
  @IsOptional() @IsString() remark?: string | null;
}
export class ProcessRouteDto {
  @IsString() @IsNotEmpty() @MaxLength(64) routeCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) routeName!: string;
  @IsNumberString() productId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) versionNo!: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string | null;
}
export class ProcessRouteStatusDto {
  @IsIn(PROCESS_ROUTE_STATUSES) status!: ProcessRouteStatus;
}
export class ProcessRouteStepDto {
  @IsNumberString() processStepId!: string;
  @IsInt() @Min(1) stepOrder!: number;
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsNumberString()
  defaultOwnerId?: string | null;
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsNumberString()
  sopFileId?: string | null;
  @IsBoolean() needInspection!: boolean;
  @IsBoolean() needRecord!: boolean;
  @IsOptional() @IsIn([0, 1]) status?: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  productMaterialIds?: string[];
}
export class ReplaceProcessRouteStepsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessRouteStepDto)
  items!: ProcessRouteStepDto[];
}
