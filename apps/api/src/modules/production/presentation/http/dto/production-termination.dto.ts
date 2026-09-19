import { IsString, Matches } from 'class-validator';

export class TerminationBatchParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) batchId!: string;
}
