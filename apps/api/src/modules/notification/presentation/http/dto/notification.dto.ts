import { Equals } from 'class-validator';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class NotificationQueryDto extends PageQueryDto {}

export class ReadAllNotificationsDto {
  // 空请求仍需校验元数据；此私有字段不接受任何 JSON 值，其余字段由白名单拒绝。
  @Equals(undefined, { message: '此操作不接受请求字段' })
  private readonly _empty?: never;
}
