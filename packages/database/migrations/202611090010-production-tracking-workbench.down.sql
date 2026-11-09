-- Tracking facts and their Inventory references cannot be discarded by a downgrade.
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking workbench downgrade requires restoring the paired pre-experiment backup';
