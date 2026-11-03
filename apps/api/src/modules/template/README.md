# Template

拥有系统复用的表格模板、列填写规则及已登记业务场景的默认模板配置。模板内容采用共享 `JsonTableData`，业务模块保存独立的完整 JSON，各自拥有业务资料及其权限、状态和保存规则。

- [内容与公开契约](docs/template-scenes.md)：设计与填写、自由复制、场景默认及并发边界。
- [数据库设计](docs/database.md)：模板和默认配置的职责、字段、索引、约束及迁移边界。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)。
