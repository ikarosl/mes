# MES Monorepo Architecture Blueprint

这是一个**不包含任何业务代码、业务 SQL 或历史上传文件**的工程架构样板，用于规划 `company_mes` 的下一阶段迁移。

## 定位

- 目标规模：一期约 50 名用户，优先采用可水平扩展的模块化单体，不提前拆微服务。
- 后端：NestJS；按领域模块组织，每个模块内部区分 domain / application / infrastructure / presentation。
- 前端：Vue 3 管理端为主，工作站端保留为轻量入口；遵守原项目 `design.md` 的左侧菜单、顶部栏、表格和 Modal 规则。
- 数据库：MySQL；所有变更必须进入可排序、不可修改的迁移文件，并由 CI 从空库和升级库双向验证。
- Redis：可选基础设施，不作为 50 人规模的强制依赖；通过端口适配器预留缓存、限流、分布式锁和队列能力。
- 文件存储：业务只依赖 StoragePort，开发环境可用本地或 MinIO，生产可替换 S3/OSS/COS。

## 重要边界

1. 最新数据库设计依据是原项目 `docs/newSqlDesign.md`，本样板不复制其业务表。
2. 旧 DOCX 需求说明书已被明确废弃。
3. 本目录只描述架构、质量门禁和迁移流程，不代表已经完成项目迁移。
4. 业务代码应按“模块逐个迁移 + 特征测试保护”进入，而不是整体复制。

## 目录入口

- `docs/current-project-audit.md`：现有项目审计结论。
- `docs/architecture.md`：目标架构与依赖规则。
- `docs/migration-roadmap.md`：迁移顺序、退出条件与回滚策略。
- `docs/database-governance.md`：数据库迁移体系。
- `docs/testing-strategy.md`：测试金字塔与 CI 门禁。
- `infra/compose/compose.dev.yml`：本地 MySQL、Redis、MinIO 可选基础设施样板。
- `.github/workflows/ci.yml`：CI 流程模板。

## 建议启动顺序

先评审并冻结 `newSqlDesign.md` 的基线版本，再实现工程底座、数据库基线迁移和最小测试样例。任何业务模块进入新仓库前，都必须先有迁移、契约测试和回滚说明。
