import { Body, Controller, Get, HttpCode, Post, Query, UseFilters } from '@nestjs/common';
import type { NotificationReadAllResult, UserProfile } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  CurrentUser,
} from '../../../../common/security/auth.decorators.js';
import { NotificationService } from '../../application/notification.service.js';
import { NotificationDomainExceptionFilter } from './notification-domain-exception.filter.js';
import { NotificationQueryDto, ReadAllNotificationsDto } from './dto/notification.dto.js';

/** 全部接口由全局 AuthGuard 登录鉴权，并在仓储限定本人；不绑定目标业务权限。 */
@Controller('notifications')
@UseFilters(NotificationDomainExceptionFilter)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
  @Get()
  list(@Query() query: NotificationQueryDto, @CurrentUser() user: UserProfile) {
    return this.service.list(query, user.id);
  }
  @Get('unread-count')
  unreadCount(@CurrentUser() user: UserProfile) {
    return this.service.unreadCount(user.id);
  }
  @Post('read-all')
  @HttpCode(200)
  @AuditInApplication()
  readAll(
    @Body() _body: ReadAllNotificationsDto,
    @CurrentCommandContext() audit: CommandContext,
  ): Promise<NotificationReadAllResult> {
    return this.service.readAll(audit);
  }
}
