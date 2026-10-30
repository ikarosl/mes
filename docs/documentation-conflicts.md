# 未解决冲突索引

本索引只维护当前仍存在的业务定义冲突、文档与代码或 migration 差异，记录双方证据、影响和待处理问题，不另行定义业务规则。已有明确取代依据且当前文档与实现一致的事项退出本索引，既有引用改指所属模块或 ADR；未批准设想及待验收、待正式测试事项见[路线图](roadmap.md)。实现存在不代表设计获批或用户验收通过。

| 编号 | 主题 | 类型／当前状态 | 待处理 |
| --- | --- | --- | --- |
| [CO-04](#co-04) | 部署迁移停写与失败恢复 | 迁移执行约束未落实到发布流程 | 明确停写责任及恢复旧应用的资格与顺序 |
| [CO-10](#co-10) | 历史完整 down 链 | 逆序回滚重复添加已有外键 | 确定符合不可变迁移规则的回滚准备与边界执行方案 |
| [CO-11](#co-11) | 暂缓测试期间的占位方式 | 测试策略禁止可执行占位，tests 入口说明与存量用例仍使用 it.todo | 核对存量保留依据并统一说明与入口，保留重要覆盖缺口 |
| [CO-12](#co-12) | 产出数量列的物理类型 | 公共单条数量 INT 约定与部分 BIGINT 列不一致 | 明确为设计例外，或通过追加迁移统一类型 |

## CO-04

**部署流程未保证迁移期间停写，也未核验失败后恢复旧应用的 schema 兼容资格。**

- 执行约束：[迁移安全](../packages/database/docs/migration-safety.md)要求结构或写入契约变更前暂停受影响写入，迁移后切换匹配应用；旧应用不得继续写入已变更结构，迁移建议锁只互斥迁移运行器。
- 实现：[deploy-api.sh](../ops/scripts/deploy-api.sh)在旧 API 未停止时使用候选镜像迁移；迁移成功后若新 API 启动或健康检查失败，`restore_previous_api` 直接恢复旧镜像，不回滚 schema，也不核验旧应用与新结构是否兼容。[部署手册](../ops/runbooks/compose-server-deployment.md)已提示停写缺口，但维护责任及失败恢复方案尚未闭合。
- 影响与待决：破坏性 DDL 可能与旧业务写入重叠；新版启动失败还可能恢复不匹配的旧写入方。需明确维护窗口、人工与脚本责任、失败时保持停写的条件及恢复顺序，再同步运维实现与手册。

## CO-10

**完整逆序回滚在 `202609240001` 重复添加已有外键。**

- 执行目标：[迁移安全](../packages/database/docs/migration-safety.md#202609240001202609240002统一分次入库及权限回滚准备)要求空数据、停写后按边界连续回滚，完整 up/down/up 覆盖逆序执行与索引恢复。
- SQL 差异：[该版本 up](../packages/database/migrations/202609240001-unified-inbound-allocation-target.up.sql)已重建 `fk_inbound_detail_batch_item`、`fk_inbound_detail_batch_product`、`fk_inbound_detail_batch_variant` 及 `fk_inventory_transaction_finished_detail`；[配对 down](../packages/database/migrations/202609240001-unified-inbound-allocation-target.down.sql)未删除这些约束即再次添加同名外键。后续公共出入库迁移的 down 仍恢复这些约束，未提供消除重复的回滚准备。
- 影响与待决：该边界会触发 `ER_FK_DUP_NAME`，正向初始化或重复 up 不能证明完整 down 链可用。已执行 migration 不可修改，需确定回滚准备与边界执行方案；整链及索引一致性覆盖缺口仍由[存量测试恢复](roadmap.md#存量测试恢复待正式测试授权)维护。

## CO-11

**暂缓正式测试期间，文字 TODO 与可执行占位的维护方式不一致。**

- 规范：[测试策略](testing-strategy.md#暂缓完善测试集期间的存量清理)要求重要旧覆盖原位仅保留文字恢复说明，不保留 `it.todo` 等可执行占位。
- 入口说明与实现：[tests README](../tests/README.md#当前内容)声明逐场景登记 `it.todo`；[库存流水入口](../tests/integration/inventory/inventory-ledger.mysql.test.ts)及[生产报工入口](../tests/integration/production/execution/production-reporting-facts.mysql.test.ts)仍包含相应注册。
- 影响与待处理：入口说明和实际测试发现方式可能使后续维护采用不同的暂停方案。核对存量占位的保留依据并统一 README 与入口，保留测试目的、重要性及恢复条件；不得将 TODO 计为通过，也不据此启动尚未获授权的正式测试补全。

## CO-12

**部分产出单条数量及计划快照仍为 BIGINT，公共规范要求 INT。**

- 规范：[统一类型规则](database-conventions.md#统一类型与状态规则)规定单条数量采用 `INT`，汇总余额按容量使用 `BIGINT`。
- 现行结构：[结案设计](../apps/api/src/modules/production/docs/database/production-termination.md)如实列出 `production_batch_closeout.available_quantity/extra_quantity/additional_scrap_quantity` 及 `production_output_revision.planned_quantity/additional_scrap_quantity` 为 `BIGINT UNSIGNED`。前者由[收尾建表](../packages/database/migrations/202609150001-production-demand-correction-and-closeout.up.sql)及[批准版迁移](../packages/database/migrations/202609170001-production-output-revisions.up.sql)建立，后续 migration 未统一为 `INT`。
- 影响与待决：这些列仍受 `99999999` 上限约束，类型差异不授予更大业务数量范围，也不直接证明数量计算错误。需明确保留为类型例外，还是按不可变迁移规则追加成对迁移统一；不通过改文档字段类型掩盖现行结构。历史累计 `existing_scrap_quantity` 的容量用途另行区分，不与上述单条量一并推断。
