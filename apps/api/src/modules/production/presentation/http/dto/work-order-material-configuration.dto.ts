import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { SaveWorkOrderMaterialConfigurationPayload } from '@company/contracts';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

class WorkOrderMaterialSelectionDto {
  @IsString() @Matches(/^[1-9]\d*$/) @MaxLength(20) materialId!: string;
  @IsString() @Matches(/^[1-9]\d*$/) @MaxLength(20) materialVariantId!: string;
}

export class SaveWorkOrderMaterialConfigurationDto
  extends VersionedCommandDto
  implements SaveWorkOrderMaterialConfigurationPayload
{
  @IsString() @Matches(/\S/) @MaxLength(5000) reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkOrderMaterialSelectionDto)
  selections!: WorkOrderMaterialSelectionDto[];
}
