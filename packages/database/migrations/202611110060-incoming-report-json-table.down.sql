-- Arbitrary saved column definitions and cells cannot be represented by the former five fixed fields.
-- Preserve the new reports and restore a matching pre-migration backup/application when downgrading.
SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Incoming report JSON tables cannot downgrade; restore matching backup and application';
