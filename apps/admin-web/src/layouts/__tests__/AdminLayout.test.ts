import { describe, it } from 'vitest';

// TODO(admin-layout): 保留审批菜单权限隔离场景；正式测试获准并迁移路由权限夹具后恢复。

describe('AdminLayout approval permissions', () => {
  it.todo(
    'shows the inbox for any approved inbox permission and hides flow configuration without configure',
  );
  it.todo('shows the inbox for the product BOM permission without a reassignment permission');
  it.todo('shows flow configuration only when approval:configure is granted');
});
