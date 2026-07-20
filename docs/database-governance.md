# 数据库迁移与设计治理

## 唯一设计依据

业务 schema 以原项目 `docs/newSqlDesign.md` 为最新来源。开始编码迁移前，先给该文档打基线版本并完成评审；本样板不含业务 SQL。

## 迁移目录约定

```text
packages/database/
  src/data-source.ts
  migrations/
    0000000000000-baseline.ts
    <timestamp>-<bounded-change>.ts
  seeds/
    development/
    test/
  scripts/
    migrate-status.ts
    verify-schema.ts
```

## 强制规则

1. 已进入共享环境的迁移不可修改，只能追加修复迁移。
2. 迁移必须具备唯一编号、目的、影响表、数据修复策略、前滚恢复策略和预计锁表时间。
3. 禁止把数据库备份文件当迁移文件；备份进入受控备份系统，不进入正常迁移链。
4. 破坏性变更使用 expand -> migrate data -> contract，至少跨两个发布完成。
5. 大表变更先评估在线 DDL、索引建立时间和回滚风险。
6. n 对 n 必须使用中间表；不以 JSON/数组/逗号 ID 替代。
7. 核心生产、物料、质量、返工和成品流转表保留审计字段与日志链路。

## CI 数据库门禁

- fresh：启动空 MySQL，顺序执行全部迁移，再运行 schema 验证和集成测试。
- upgrade：从上一发布的匿名化结构快照升级到当前版本。
- drift：比较迁移计算结果与声明的 schema snapshot，不允许手工改库漂移。
- rollback：业务迁移优先前滚修复；只有明确安全的结构迁移才要求 down。

## 首次基线策略

1. 冻结 `newSqlDesign.md` 版本号。
2. 从设计生成一个可重复执行到空库的 baseline migration。
3. 对现有数据库做结构 diff，形成显式 reconcile migrations。
4. 在副本上验证数据、外键、唯一键、索引和视图。
5. 备份并演练恢复后，才允许切换生产迁移体系。
