import { it } from 'vitest';

// TODO(inventory-migration): 高重要性：完整迁移链下历史投影回填及目标 down/up 兼容性。
// 用户明确启动正式测试后，以现行公共入库构造合法来源恢复，保持完整迁移链。
it.todo('rebuilds the legacy item-balance projection on down and removes it again on up');
