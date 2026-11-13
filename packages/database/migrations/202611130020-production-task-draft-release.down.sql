-- The new lifecycle can leave released or cancelled tasks after their draft state is gone,
-- and successful create/release results remain immutable until idempotency housekeeping.
-- Reclassifying draft as pending or inventing route/start/release facts is not a downgrade.
-- Preserve all new task and replay facts; restore a verified pre-up backup and its matching
-- application when an incompatible downgrade is required. Never use down to compensate a
-- partially applied up.
SIGNAL SQLSTATE '45000'
 SET MESSAGE_TEXT='Production task draft release cannot downgrade; restore matching backup and application';
