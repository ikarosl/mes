# Migration 顺序与注册规则

> [返回数据库基础设施包](../README.md)。业务表语义不在本文件维护。

## 事实来源

`packages/database/migrations/*.up.sql` 按文件名升序组成唯一 migration 注册表；同名
`.down.sql` 提供配对回滚。`src/migration-utils.ts` 负责读取和计算校验和，`src/migrate.ts` 按顺序执行，
`src/migrate-status.ts` 报告 `pending`、`applied` 或 `checksum-mismatch`。

文档不重复枚举 migration 文件或完成状态，避免注册表演进后产生第二份过期清单。查看当前顺序使用：

```text
corepack pnpm db:migrate:status
```

## 追加规则

1. 文件名使用可排序且全局唯一的时间序号与稳定名称，并同时添加 `.up.sql`、`.down.sql`。
2. 已进入注册表或已在任一环境执行的 migration 不得修改、重命名或重排；修正只能追加新文件。
3. 被引用表、唯一键和必要索引必须先创建；循环外键在两侧对象存在后通过后续 migration 追加。
4. 数据回填先于非空、唯一键、外键或收紧后的 `CHECK`；无法无损推导时应失败并要求人工处置，禁止猜测业务事实。
5. 破坏性 down migration 必须设置数据守卫。回滚会覆盖后续业务进度时，应明确拒绝回滚。
6. migration 的物理集中不改变表所有权；字段、约束和状态语义必须同步到所属模块的数据库文档。

## 所有者与验证

- Identity：[数据库设计](../../../apps/api/src/modules/identity/docs/database.md)
- Product：[数据库设计](../../../apps/api/src/modules/product/docs/database.md)
- Production：[数据库设计](../../../apps/api/src/modules/production/docs/database/README.md)
- 平台表：[操作审计](../../../apps/api/docs/audit.md)、[HTTP 幂等](../../../apps/api/docs/idempotency.md)
- 公共字段与约束：[数据库公共约定](../../../docs/database-conventions.md)

提交前执行：

```text
corepack pnpm migration:check
corepack pnpm --filter @company/database test
```

升级和回滚的部署级约束见[迁移安全](migration-safety.md)，静态注册门禁见[迁移就绪检查](migration-readiness.md)。
