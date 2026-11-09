-- This experimental migration has no automatic structural downgrade.
-- The old production inspection model is retired and its sources are removed by a later migration.
-- Restore a matching backup and old application, or initialize a separately authorized empty
-- experimental database. Do not fabricate old inspection facts or migration registration.
SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Production quality retirement cannot downgrade; restore backup or rebuild an authorized empty experimental database';
