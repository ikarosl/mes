-- Independent on-site personnel are not login accounts. Add missing demo identities only.
SET @demo_personnel_actor = (SELECT id FROM users WHERE username='admin' AND deleted_at IS NULL LIMIT 1);
INSERT INTO personnel (code,name,personnel_group,status,created_by,updated_by)
SELECT sample.code,sample.name,sample.personnel_group,'active',@demo_personnel_actor,@demo_personnel_actor
FROM (
 SELECT 'DEMO-P-001' code,'现场生产员甲' name,'production' personnel_group UNION ALL
 SELECT 'DEMO-P-002','现场生产员乙','production' UNION ALL
 SELECT 'DEMO-Q-001','现场质检员甲','quality'
) sample
WHERE NOT EXISTS (SELECT 1 FROM personnel p WHERE p.code=sample.code);
