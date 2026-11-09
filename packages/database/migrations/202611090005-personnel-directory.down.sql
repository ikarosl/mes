CREATE TEMPORARY TABLE tmp_personnel_down_guard (invalid_count INT NOT NULL CHECK(invalid_count=0));
INSERT INTO tmp_personnel_down_guard SELECT COUNT(*) FROM personnel;
DROP TEMPORARY TABLE tmp_personnel_down_guard;
DROP TABLE personnel;
