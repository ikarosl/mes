# 未解决冲突索引

本索引只维护当前仍存在的业务定义冲突、文档与代码或 migration 差异，记录双方证据、影响和待处理问题，不另行定义业务规则。已有明确取代依据且当前文档与实现一致的事项退出本索引，既有引用改指所属模块或 ADR；未批准设想及待验收、待正式测试事项见[路线图](roadmap.md)。实现存在不代表设计获批或用户验收通过。

| 编号 | 主题 | 类型／当前状态 | 待处理 |
| --- | --- | --- | --- |
| [CO-11](#co-11) | 暂缓测试期间的占位方式 | 测试策略禁止可执行占位，tests 入口说明与存量用例仍使用 it.todo | 核对存量保留依据并统一说明与入口，保留重要覆盖缺口 |
| [CO-12](#co-12) | 产出数量列的物理类型 | 公共单条数量 INT 约定与部分 BIGINT 列不一致 | 明确为设计例外，或通过追加迁移统一类型 |

## CO-11

**暂缓正式测试期间，文字 TODO 与可执行占位的维护方式不一致。**

- 规范：[测试策略](testing-strategy.md#暂缓完善测试集期间的存量清理)要求重要旧覆盖原位仅保留文字恢复说明，不保留 `it.todo` 等可执行占位。
- 入口说明与实现：[tests README](../tests/README.md#当前内容)声明逐场景登记 `it.todo`；[库存流水入口](../tests/integration/inventory/inventory-ledger.mysql.test.ts)及[生产报工入口](../tests/integration/production/execution/production-reporting-facts.mysql.test.ts)仍包含相应注册。
- 影响与待处理：入口说明和实际测试发现方式可能使后续维护采用不同的暂停方案。核对存量占位的保留依据并统一 README 与入口，保留测试目的、重要性及恢复条件；不得将 TODO 计为通过，也不据此启动尚未获授权的正式测试补全。

## CO-12

**部分产出单条数量及计划快照仍为 BIGINT，公共规范要求 INT。**

- 规范：[统一类型规则](database-conventions.md#统一类型与状态规则)规定单条数量采用 `INT`，汇总余额按容量使用 `BIGINT`。
- 现行结构：[结案设计](../apps/api/src/modules/production/docs/database/production-termination.md)如实列出 `production_batch_closeout.available_quantity/extra_quantity/additional_scrap_quantity` 及 `production_output_revision.planned_quantity/additional_scrap_quantity` 为 `BIGINT UNSIGNED`。现行[生产基线](../packages/database/migrations/202611020111-baseline-production-tables.up.sql)保留该物理类型；基线合并不改变未裁决的业务类型取舍。
- 影响与待决：这些列仍受 `99999999` 上限约束，类型差异不授予更大业务数量范围，也不直接证明数量计算错误。需明确保留为类型例外，还是按不可变迁移规则追加成对迁移统一；不通过改文档字段类型掩盖现行结构。历史累计 `existing_scrap_quantity` 的容量用途另行区分，不与上述单条量一并推断。
