# Easy MES Next — Agent Rules

1. 本项目是 50 人以内轻量 MES 的模块化单体，不得擅自拆微服务或引入完整 ERP/MES 范围。
2. 当前正式范围包括认证、RBAC、操作日志、前端权限基础设施、产品主数据、技术文件、工序和工艺路线，以及分阶段迁移的 Production：生产工单、生产批次、工序报工追溯和其依赖的生产物料需求、分配、领料出库、外购物料窄入库、生产退料和现有库存批次盘点链路。外购物料入库仅支持 `purchased` 来源；生产退料仅覆盖已确认领料退回公共可用库存；盘点仅覆盖现有 `item_batch × stock_status`。通用 Inventory 的其他出入库与库存报废、Quality 和全链路 Traceability 后端不得提前迁入。
3. 数据库业务设计只以 `docs/database/README.md` 及其列出的领域章节为准；代码架构以 `docs/architecture.md` 为准；管理端前端分层、数据所有权、共享状态和异步生命周期以 `docs/frontend-architecture.md` 为准；接口以 `docs/api-conventions.md` 为准；编码以 `docs/coding-standards.md` 为准；管理端视觉交互以 `design.md` 为准。
4. 数据库变更只能在 `packages/database/migrations` 追加 migration，已执行文件不可修改。
5. 库存只以 `inventory_transaction` 为事实来源；生产需求只以 `production_item_demand` 为事实来源；汇总视图不得写入。
6. 主数据、可变业务单据和不可变事实遵守 `docs/database/00-foundations.md` 及对应领域章节的审计、快照、乐观锁和冲销规则。
7. 后端依赖为 `presentation -> application -> domain`，infrastructure 实现 application ports；application port 不得暴露数据库或 SDK 类型。
8. 跨模块只能引用目标模块 `public.ts`；禁止访问其他模块内部层或直接查询、修改其他模块拥有的表。唯一豁免是操作日志审计写入，统一由 `common/audit/transactional-audit-writer` 承担，不经过任何模块 public 能力转发（见 `docs/architecture.md` §4）。
9. Controller 不写 SQL、不处理 Token 密钥、不承担业务事务。
10. RBAC 后端校验是安全边界；前端只按页面权限控制菜单、路由和整页可见性，不要求对页面内操作按钮做细粒度权限隐藏；每个后端接口仍须独立鉴权。匿名接口必须显式 `@Public()`。
11. Access Token 只在内存；Refresh Token 只通过 HttpOnly Cookie，不得写入 Web Storage。
12. 前端使用 Vue Router、Pinia 和多标签页缓存；页面必须有稳定路由名和组件名。
13. 状态、类型和结果代码集中在 `packages/constants`，在 `packages/contracts` 使用字符串联合类型；Vue 文件不得重复业务编码与中文映射。
14. HTTP body、query、param 必须使用 class DTO；分页和错误结构遵守 `docs/api-conventions.md`。
15. 核心写操作与成功审计同事务；通用请求、安全拒绝和失败日志为 best-effort。日志和错误不得记录密码、Token、Cookie、签名或凭证。
16. 新功能和 bug 修复必须补类型检查与测试；禁止 `--passWithNoTests`。
17. 单元/组件测试放相邻 `__tests__/*.test.ts`；跨模块集成、契约、E2E、性能和架构测试放根 `tests` 对应目录。
18. 输出变更必须说明文件、模块、数据库影响、migration 和 `design.md` 符合性。
