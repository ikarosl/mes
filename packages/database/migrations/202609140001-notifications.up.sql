CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  source_type VARCHAR(50) NULL,
  source_id BIGINT UNSIGNED NULL,
  target_type VARCHAR(50) NULL,
  target_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notifications_event (event_key),
  CONSTRAINT fk_notifications_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_notifications_source CHECK ((source_type IS NULL AND source_id IS NULL) OR (source_type IS NOT NULL AND source_id IS NOT NULL AND source_id > 0)),
  CONSTRAINT chk_notifications_target CHECK ((target_type IS NULL AND target_id IS NULL) OR (target_type IS NOT NULL AND target_id IS NOT NULL AND target_id > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notification_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notification_recipients_user (notification_id,user_id),
  KEY idx_notification_recipients_unread (user_id,read_at,created_at,id),
  KEY idx_notification_recipients_list (user_id,created_at,id),
  CONSTRAINT fk_notification_recipients_message FOREIGN KEY (notification_id) REFERENCES notifications(id),
  CONSTRAINT fk_notification_recipients_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notification_recipients_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_notification_recipients_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT chk_notification_recipients_version CHECK (version >= 0),
  CONSTRAINT chk_notification_recipients_read CHECK (
    (read_at IS NULL AND version=0 AND updated_by IS NULL) OR
    (read_at IS NOT NULL AND version=1 AND updated_by IS NOT NULL AND updated_by=user_id)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
