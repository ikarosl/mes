# Easy MES Next — Agent Rules

## 数据库与交付约定

- 本项目处于开发阶段，数据库结构可以调整，开发测试数据库允许完全清空或重建，无需保留兼容性数据。重置后通过版本化 migration／seed 和统一初始化入口恢复，不依赖已有业务数据。
- 禁止为兼容旧版或过渡建立双写、影子表等冗余结构；数据库变更只追加成对 migration，不修改已执行文件。
- 功能实现或修复后完成类型检查、构建和 API／管理端启动验证，供用户手工黑盒及 UI 验收；根据反馈完成修正。正式测试集须在用户确认设计无问题并明确通知后编写／调整，再由 Luna MAX 子代理全量验证并修复至通过。类型、构建及启动通过不代表测试或用户验收通过。

## 架构与编码规则

1. 本项目是 50 人以内轻量 MES 的模块化单体，不得擅自拆微服务或引入完整 ERP/MES 范围。
2. 业务范围与明确排除项由 [产品范围](docs/product-scope.md) 维护，专题和模块入口由 [文档索引](docs/README.md) 查找；新增场景须先确认范围、所有权和公开边界，不得因已有 UI 原型、预留字段或状态提前实现。
3. 数据库公共规则以 `docs/database-conventions.md` 为准，业务表设计以各 API 模块的 `docs/database.md` 或 `docs/database/` 为准；`packages/database` 只负责连接、事务和 migration/seed 运行。代码架构以 `docs/architecture.md` 为准；管理端规则以 `apps/admin-web/docs/` 为准；接口以 `docs/api-conventions.md` 为准；编码以 `docs/coding-standards.md` 为准。
4. 库存只以 `inventory_transaction` 为事实来源；生产需求只以 `production_item_demand` 为事实来源；汇总视图不得写入。
5. 主数据、可变业务单据和不可变事实遵守 `docs/database-conventions.md` 及所属模块数据库章节的审计、快照、乐观锁和冲销规则。
6. 后端依赖为 `presentation -> application -> domain`，infrastructure 实现 application ports；application port 不得暴露数据库或 SDK 类型。
7. 跨模块代码导入只能引用目标模块 `public.ts`；禁止访问其他模块内部层或直接修改其他模块拥有的表。业务命令的权限、状态、选版及写入资格校验继续通过所属模块公开能力。展示、搜索、排序、分页查询允许在已登记的 `infrastructure/queries/` 专用目录中只读访问其他模块批准的表/字段，依赖登记于 `scripts/api-data-ownership.mjs`，禁止借此写入、锁定目标模块数据或绕过业务校验；未登记读取仍禁止。操作日志审计写入例外统一由 `common/audit/transactional-audit-writer` 承担，不经过任何模块 public 能力转发（见 `docs/architecture.md` §4）。
8. Controller 不写 SQL、不处理 Token 密钥、不承担业务事务。
9. RBAC 后端校验是安全边界；前端只按页面权限控制菜单、路由和整页可见性，不要求对页面内操作按钮做细粒度权限隐藏；每个后端接口仍须独立鉴权。匿名接口必须显式 `@Public()`。
10. Access Token 只在内存；Refresh Token 只通过 HttpOnly Cookie，不得写入 Web Storage。
11. 前端使用 Vue Router、Pinia 和多标签页缓存；页面必须有稳定路由名和组件名。
12. 状态、类型和结果代码集中在 `packages/constants`，在 `packages/contracts` 使用字符串联合类型；Vue 文件不得重复业务编码与中文映射。
13. HTTP body、query、param 必须使用 class DTO；分页和错误结构遵守 `docs/api-conventions.md`。
14. 核心写操作与成功审计同事务；通用请求、安全拒绝和失败日志为 best-effort。日志和错误不得记录密码、Token、Cookie、签名或凭证。
15. 新功能和 bug 修复须按“数据库与交付约定”的顺序完成验证与测试，遵守 `docs/testing-strategy.md`；禁止 `--passWithNoTests`。
16. 单元/组件测试放相邻 `__tests__/*.test.ts`；跨模块集成、契约、E2E、性能和架构测试放根 `tests` 对应目录。
17. 输出变更必须说明文件、模块、数据库影响、migration 和所有者文档符合性。

## 文档读取与维护

- 当前实现、已批准但未实施的目标、未批准设想及待验收须分别标注；所有权登记须与实际代码、契约和 migration 一致。未完成事项集中在 [路线图](docs/roadmap.md)，实现存在不代表设计获批或用户验收通过。
- 修改任意目录前，必须读取从仓库根到目标目录沿途存在的 README.md。
- 目标目录或其最近所有者目录存在 docs/ 时，必须读取与本次变更直接相关的专题文档。
- 越接近目标代码的文档描述越具体，但不得违反根级架构、API、编码和测试规范。
- 改变公开契约、业务不变量、数据所有权、状态机、配置方式或验证命令时，必须同步更新最近的所有者文档。
- 同一规则只在所属文档维护完整正文，其他入口简述职责并链接；README 负责入口，ADR 保存选择理由与取代关系。前端文档记录交互约束，不逐页复述布局、接口清单或通用语言知识。
- 活跃设计文档不记录已完成实施流水；未完成事项写根 docs/roadmap.md，其余历史由 Git 保存。更新现有规则时替换原段，避免在文末追加另一套说明。
- 文档与代码、测试或 migration 出现冲突时，不得自行选择新的业务语义；保留双方证据、影响及待决问题，按文档索引登记未解决冲突，明确裁决后再同步权威设计。ADR 的取代只作用于明确范围，不能以文件新旧或代码存在自动撤销其他有效原则。
