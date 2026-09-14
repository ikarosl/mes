-- 通知历史不能隐式丢弃；开发库需要时通过统一重置流程重建。
CREATE TEMPORARY TABLE tmp_notification_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_notification_rollback_empty CHECK (must_be_zero = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_notification_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM notifications) OR EXISTS (SELECT 1 FROM notification_recipients);
DROP TEMPORARY TABLE tmp_notification_rollback_guard;
DROP TABLE notification_recipients;
DROP TABLE notifications;
