-- Old release/round/case semantics cannot be reconstructed from an independent report.
-- Preserve all reports; restore a matching backup/application or initialize another explicitly authorized empty database.
SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Independent incoming reports cannot downgrade; restore matching backup or use an authorized empty database';
