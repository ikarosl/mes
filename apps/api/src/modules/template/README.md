# Template

拥有系统复用的表格模板主数据及其独立读写权限；模板内容采用共享 `JsonTableData`。业务模块复制并保存完整 JSON，各自拥有业务资料及其权限、状态和保存规则。

- [内容与公开契约](docs/template-scenes.md)：表格内容、权限、复制与并发约束。
- [数据库设计](docs/database.md)：`business_templates` 的字段、约束及迁移边界。

执行受影响的 API 类型检查、构建和启动验证；正式测试阶段遵守根 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)及[测试策略](../../../../../docs/testing-strategy.md)。
