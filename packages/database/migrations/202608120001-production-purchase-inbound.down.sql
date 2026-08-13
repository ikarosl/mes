DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('production:inventory:view','production:inbounds:view','production:inbounds:create','production:inbounds:confirm','production:inbounds:cancel'));
DELETE FROM permissions WHERE code IN ('production:inventory:view','production:inbounds:view','production:inbounds:create','production:inbounds:confirm','production:inbounds:cancel');
DROP TABLE inbound_detail;
DROP TABLE inbound_order;
