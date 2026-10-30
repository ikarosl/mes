# 未解决冲突索引

本索引只维护当前仍存在的业务定义冲突、文档与代码或 migration 差异，记录双方证据、影响和待处理问题，不另行定义业务规则。已有明确取代依据且当前文档与实现一致的事项退出本索引，既有引用改指所属模块或 ADR；未批准设想及待验收、待正式测试事项见[路线图](roadmap.md)。实现存在不代表设计获批或用户验收通过。

| 编号 | 主题 | 类型／当前状态 | 待处理 |
| --- | --- | --- | --- |
| [CO-04](#co-04) | 部署迁移停写与失败恢复 | 迁移执行约束未落实到发布流程 | 明确停写责任及恢复旧应用的资格与顺序 |
| [CO-08](#co-08) | 业务审批证据版本 | Approval 旧版说明与 Product／Production 文档、解析代码不一致 | Approval 改为引用业务所有者的当前证据契约 |
| [CO-10](#co-10) | 历史完整 down 链 | 逆序回滚重复添加已有外键 | 确定符合不可变迁移规则的回滚准备与边界执行方案 |
| [CO-11](#co-11) | 暂缓测试期间的占位方式 | 测试策略禁止可执行占位，tests 入口说明与存量用例仍使用 it.todo | 核对存量保留依据并统一说明与入口，保留重要覆盖缺口 |
| [CO-12](#co-12) | 缓存页面返回的刷新时机 | 手册与采购专题的返回刷新说明不符合公共生命周期约定 | 区分普通缓存返回、新定位、显式刷新及提交前核验 |
| [CO-13](#co-13) | 新库存批次的请求示例 | 结构示例仍含已取消的手填批号字段 | 按已批准编号契约修正示例，保留归批关系说明 |

## CO-04

**部署流程未保证迁移期间停写，也未核验失败后恢复旧应用的 schema 兼容资格。**

- 执行约束：[迁移安全](../packages/database/docs/migration-safety.md)要求结构或写入契约变更前暂停受影响写入，迁移后切换匹配应用；旧应用不得继续写入已变更结构，迁移建议锁只互斥迁移运行器。
- 实现：[deploy-api.sh](../ops/scripts/deploy-api.sh)在旧 API 未停止时使用候选镜像迁移；迁移成功后若新 API 启动或健康检查失败，`restore_previous_api` 直接恢复旧镜像，不回滚 schema，也不核验旧应用与新结构是否兼容。[部署手册](../ops/runbooks/compose-server-deployment.md)已提示停写缺口，但维护责任及失败恢复方案尚未闭合。
- 影响与待决：破坏性 DDL 可能与旧业务写入重叠；新版启动失败还可能恢复不匹配的旧写入方。需明确维护窗口、人工与脚本责任、失败时保持停写的条件及恢复顺序，再同步运维实现与手册。

## CO-08

**Approval 仍复制旧版 Product／Production 审批证据说明。**

- 文档声明：[Approval 数据库 §4.1](../apps/api/src/modules/approval/docs/database.md#41-approval_instances)仍写 BOM 版本 2、需求更正版本 1、结案产出版本 6。
- Product 所有者与实现：[BOM 证据契约](../apps/api/src/modules/product/docs/product-rules.md#bom-命令与审批)及 [ProductBomApprovalHandler](../apps/api/src/modules/product/application/product-bom-approval.handler.ts)均使用版本 3，生成与读取校验一致；Approval 的版本 2 说明未覆盖当前完整 JSON 表格快照。
- Production 所有者与实现：[需求更正](../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)明确版本 2，[结案设计](../apps/api/src/modules/production/docs/database/production-termination.md)明确仅接受版本 10；[快照 schema](../apps/api/src/modules/production/application/production-approval-snapshot.schema.ts)按 2／10 执行。当前结案证据包含任务进入／撤回行动等后续字段，[ADR-0019](adr/0019-finished-inspection-measurement-simplification.md#数据与取代边界)记录的版本 8 是当时成品质检简化的升级说明，不是当前解析版本。
- 影响与待处理：旧版本及字段摘要可能误导审批接入和正式测试夹具。应将 Approval 的重复说明改为引用 Product／Production 当前证据契约；无需重新裁决版本数字，也不能为消除文档差异引入旧证据兼容分支或改写历史快照。

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

**普通缓存返回是否自动重读，在公共规则、业务专题和手册中表述不一致。**

- 返回刷新说明：[成品操作手册](manuals/finished-output-inspection-inbound.md#查询与追溯)写返回会刷新资格和版本；[采购交互](../apps/admin-web/docs/procurement-inbound.md#采购单分块与状态操作)写返回页面或手动刷新重读已展开单据。
- 公共规则与实现：[管理端生命周期](../apps/admin-web/docs/architecture.md#6-生命周期与定向刷新)规定普通 KeepAlive 返回保留展示与草稿，不自动读取；[成品专题](../apps/admin-web/docs/finished-inspections.md#查询与跨页引用)要求显式刷新或提交前重核。采购的 [usePurchaseOrderExpansion](../apps/admin-web/src/views/procurement/composables/usePurchaseOrderExpansion.ts)激活时只恢复读取资格，[PurchaseOrdersPage](../apps/admin-web/src/views/procurement/PurchaseOrdersPage.vue)不重复消费旧定位。
- 影响与待处理：用户可能把缓存返回误认为资格已更新，维护者也可能重新引入自动读取。统一普通返回、新定位、显式刷新和提交前核验的表述，保留跨页草稿与冻结依据保护；公共生命周期规则只由管理端架构维护。

## CO-13

**成品入库结构示例仍把库存批号作为新批次请求输入。**

- 示例：[查询与实际批号](finished-inbound-redesign-proposal.md#27-查询与实际批号)仍给出含 `batchCode` 的新批次 target。
- 已批准契约：[ADR-0017](adr/0017-business-numbering-and-beijing-time.md#取代范围)已明确取消 `target.batchCode`；[当前目标类型](../packages/contracts/src/production/inventory-target.ts)的新建分支只含 `mode/clientKey`，批号在确认事务内按[平台编号规则](../apps/api/docs/business-numbering.md#库存批次与单据)分配。
- 影响与待处理：复制示例会构造包含废弃字段的请求。按已批准取代范围修正示例并引用当前目标契约；保留 new/existing、同请求共用新批次及来源授权与库批分离的说明，不恢复手填批号。
