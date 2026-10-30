# Template

拥有系统复用的表格模板主数据及其独立读写权限；模板内容采用共享 `JsonTableData`。业务模块复制并保存完整 JSON，各自拥有业务资料及其权限、状态和保存规则。

- [内容与公开契约](docs/template-scenes.md)：表格内容、权限、复制与并发约束。
- [数据库设计](docs/database.md)：模板表职责、字段、索引、约束及迁移边界。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)。
