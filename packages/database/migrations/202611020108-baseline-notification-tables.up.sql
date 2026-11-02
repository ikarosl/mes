-- One-time 20261102 baseline: phase 1, notification.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

CREATE TABLE `notification_recipients` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` bigint unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_recipients_user` (`notification_id`,`user_id`),
  KEY `idx_notification_recipients_unread` (`user_id`,`read_at`,`created_at`,`id`),
  KEY `idx_notification_recipients_list` (`user_id`,`created_at`,`id`),
  KEY `fk_notification_recipients_creator` (`created_by`),
  KEY `fk_notification_recipients_updater` (`updated_by`),
  CONSTRAINT `chk_notification_recipients_read` CHECK ((((`read_at` is null) and (`version` = 0) and (`updated_by` is null)) or ((`read_at` is not null) and (`version` = 1) and (`updated_by` is not null) and (`updated_by` = `user_id`)))),
  CONSTRAINT `chk_notification_recipients_version` CHECK ((`version` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_key` varchar(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `event_type` varchar(50) NOT NULL,
  `source_type` varchar(50) DEFAULT NULL,
  `source_id` bigint unsigned DEFAULT NULL,
  `target_type` varchar(50) DEFAULT NULL,
  `target_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notifications_event` (`event_key`),
  KEY `fk_notifications_creator` (`created_by`),
  CONSTRAINT `chk_notifications_source` CHECK ((((`source_type` is null) and (`source_id` is null)) or ((`source_type` is not null) and (`source_id` is not null) and (`source_id` > 0)))),
  CONSTRAINT `chk_notifications_target` CHECK ((((`target_type` is null) and (`target_id` is null)) or ((`target_type` is not null) and (`target_id` is not null) and (`target_id` > 0))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
