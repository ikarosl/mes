# Company MES Next — Agent Rules

1. 本项目是轻量 MES 的模块化单体，不得擅自拆分微服务或引入完整 ERP/MES 范围。
2. 当前已迁移范围只有 RBAC、认证、操作日志和前端权限基础设施；产品、库存、生产、质量业务代码不得提前迁入。
3. 数据库业务设计以 `docs/new.md` 为唯一基准；`docs/newSqlDesign.md` 只是版本切换入口，不得作为字段依据。
4. 数据库变更只能通过 `packages/database/migrations` 追加迁移，已执行迁移不可修改。
5. 禁止重新引入 `item_type`、`item_info`、`product_bom`、`processes`、`material_batches`、`batch_material_usages`；统一使用 `product_categories`、`products`、`product_materials`、`process_steps`、`item_batch` 和新的需求/分配/出库模型。
6. 库存数量只以 `inventory_transaction` 为事实来源；生产需求只以 `production_item_demand` 为事实来源，汇总视图不得被写入。
7. 主数据、可变业务单据和不可变事实必须分别遵守 `docs/new.md` 的审计、快照、乐观锁和冲销规则。
8. 后端采用模块化单体与端口适配器：`presentation -> application -> domain`，`infrastructure` 实现 application ports。
9. Controller 不写 SQL，不直接处理 Token 密钥，不承担业务事务。
10. RBAC 后端校验是安全边界；前端路由、菜单和按钮权限只负责用户体验。
11. 匿名接口必须显式标记 `@Public()`；其余接口默认要求有效 Access Token。
12. Access Token 只保存在内存中；Refresh Token 只通过 HttpOnly Cookie 传输，不得写入 localStorage/sessionStorage。
13. 前端采用 Vue Router + Pinia 多标签页缓存；新增页面必须设置稳定的路由名和组件名。
14. 管理端必须遵守原项目 `design.md`：左侧菜单、顶部栏、内容区、表格优先、表单使用 Modal，不使用 Drawer。
15. 新增功能必须同时补充类型检查和测试；CI 不允许以 `--passWithNoTests` 掩盖零测试。
16. 单元测试和组件测试必须放在被测模块附近的 `__tests__` 目录，统一命名为 `*.test.ts`；跨模块集成、契约、E2E 和性能测试放在根目录 `tests` 对应分层中。
17. 核心操作必须写审计日志；日志和错误信息不得记录密码、Token、Cookie 或其他密钥。
18. 输出变更时必须说明文件、模块、数据库影响、迁移脚本和 design.md 符合性。
