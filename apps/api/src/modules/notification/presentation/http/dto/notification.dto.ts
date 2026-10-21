import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { NOTIFICATION_READ_FILTERS } from '@company/constants';
import type { NotificationReadFilter } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(NOTIFICATION_READ_FILTERS) read?: NotificationReadFilter;
}
export class NotificationIdDto {
  @Matches(/^[1-9]\d{0,19}$/) id!: string;
}
export class ReadNotificationDto {
  @IsInt() @Min(0) @Max(2147483647) version!: number;
}
