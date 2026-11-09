-- Retired facts have no reversible transformation into tracking cards.
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Restore the paired pre-experiment backup to downgrade production execution';
