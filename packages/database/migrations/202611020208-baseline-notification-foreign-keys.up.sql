-- One-time 20261102 baseline: phase 2, notification.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `notification_recipients`
  ADD CONSTRAINT `fk_notification_recipients_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_notification_recipients_message` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`),
  ADD CONSTRAINT `fk_notification_recipients_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_notification_recipients_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
