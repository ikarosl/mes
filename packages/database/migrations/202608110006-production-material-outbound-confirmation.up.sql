ALTER TABLE outbound_order
  MODIFY outbound_at DATETIME NULL,
  MODIFY operator_id BIGINT UNSIGNED NULL;

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '确认生产领料出库', 'production:materials:outbound-confirm', 'api', NULL, 'POST', '/api/production/material-outbounds/:outboundId/actions/confirm', 229, 1 FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '取消待确认领料单', 'production:materials:outbound-cancel', 'api', NULL, 'POST', '/api/production/material-outbounds/:outboundId/actions/cancel', 230, 1 FROM permissions WHERE code='production:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
