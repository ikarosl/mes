import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { NotificationService } from './application/notification.service.js';
import { NotificationRepository } from './application/ports/notification.repository.js';
import { NotificationAfterCommitHook } from './application/notification-publish.js';
import { MysqlNotificationRepository } from './infrastructure/mysql-notification.repository.js';
import { NoopNotificationHook } from './infrastructure/noop-notification-hook.js';
import { NotificationController } from './presentation/http/notification.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    { provide: NotificationRepository, useClass: MysqlNotificationRepository },
    { provide: NotificationAfterCommitHook, useClass: NoopNotificationHook },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
