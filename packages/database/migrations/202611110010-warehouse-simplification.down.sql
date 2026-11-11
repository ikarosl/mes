-- Experimental business replacement does not support restoring the retired authorization workflow.
-- Keep the isolated database for evidence; initialize another empty database with its matching branch.
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EXPERIMENTAL_WAREHOUSE_REQUIRES_EMPTY_DATABASE_REBUILD';
