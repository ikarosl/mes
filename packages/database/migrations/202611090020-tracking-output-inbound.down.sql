-- Experimental schema replacement has no history-compatible rollback. Recreate the isolated database with the matching branch.
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EXPERIMENTAL_TRACKING_REQUIRES_EMPTY_DATABASE_REBUILD';
