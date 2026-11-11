-- Later manual role grants cannot be distinguished from this responsibility transfer.
-- Refuse a partial rollback that could silently revoke access or remove retained note history.
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Independent receipt handling permission transfer requires a forward migration; automatic rollback is unsupported';
