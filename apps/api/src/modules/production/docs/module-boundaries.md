# Production 职责与协作边界

本文维护用例职责及外部依赖。字段、状态和命令由[数据库专题](database/README.md)维护；跨模块事务规则见[跨模块规则](database/cross-module-rules.md)，全局分层遵守[总体架构](../../../../../../docs/architecture.md)。

## 1. 按业务职责组织，保留完整事务

Production 保持一个模块，当前 infrastructure 按以下职责组织；同层职责之间直接引用所需辅助，不通过转发文件维持旧路径。application ports 与 presentation 继续以用例为入口，目录分组不改变公开契约或表所有权。

| 职责 | infrastructure 目录 | 所有的业务 | 边界 |
| --- | --- | --- | --- |
| 工单与任务 | `tasks/` | 计划、负责人、任务、批量锁版、研发轮次 | Product 所有主数据与 BOM |
| 执行与异常 | `execution/` | 派工、报工、返工、工序报废、补产授权及齐套激活 | 不把报工直接视为最终质量或库存 |
| 需求与履约 | `demand/` | 需求、分配、关闭替代、领料履约、采购与预留当前资格 | 需求变更经统一 Writer；出库是履约，不改原量 |
| 收尾与产出 | `closeout/` | 逐项处理、物料实核、草稿、批准清单和更正 | Quality 保存检验；Approval 保存审批决定 |
| 生产物流 | `logistics/` | 领退料及批准成品的来源资格与确认编排 | Inventory 唯一写公共出入库四表与库存，独立负责盘点 |
| 查询与追溯 | `queries/` | 组合已有事实及状态投影、已登记的跨模块展示 SQL | 不新增业务状态、账本或写入口 |

`shared/` 仅容纳跨职责使用的连接类型、驱动错误映射、分页与占位符、时间映射、事务审计及读取快照基础设施。工单、任务、工序的行类型、查询、锁定与映射属于各自职责；分配锁辅助由 `demand/` 所有，退料分组及物流并发辅助由 `logistics/` 所有。展示 SQL 继续限制在已登记的 `queries/` 前缀，按需求、物流、追溯及共享名称读取细分；采购可执行需求与当前预留读取属于 `demand/`，不能借查询命名放入展示目录。

数量、状态与资格判断位于纯 domain 规则，infrastructure 负责在事务内取得事实、维持锁序并原子写入。具体分工为：

- [领料确认规则](../domain/production-material-outbound.policy.ts)核验当前分配资格与剩余额度、汇总需求及库存批次请求、判断库存数量和物料阶段，复用现有任务状态机；[领料展示读取](../infrastructure/logistics/mysql-production-material-outbound.read.ts)组装列表、候选及详情。
- [需求更正规则](../domain/production-demand-correction.policy.ts)处理更正阻断、关闭原因及零余量对补料履约与既有补产授权的影响；需求和授权事实加载、在审冻结与写入仍由 `demand/` 内完整事务办理。
- [收尾规则](../domain/production-closeout.policy.ts)处理逐项顺序、送审阻断和编辑资格；[收尾读取](../infrastructure/closeout/mysql-production-closeout.read.ts)在调用者连接内组装事实，锁定选项原样传递，不另开或提交事务，查询与写入复核共用纯判定。

同一业务命令保留完整事务。确认出库原子处理需求扣减、库存、物料状态、补料履约与补产资格，不能拆成多个 HTTP 请求或提交后通知。确认资格使用锁内当前事实，展示结果不作为后续写入依据；成功审计和核心写入同事务提交。

逐项收尾与草稿、清单更正是独立用例，不继续把产出功能加入通用事项分支。各职责共享 Production 所有权，代码目录或菜单名称不产生新模块；`common` 不放业务 SQL、库存规则和状态。端口不暴露 MySQL 连接，公共能力复用同池事务上下文。

## 2. 结案、审批与入库的连接方式

生产草稿 → Quality 独立检查 → 产线核对 → 工单负责人批准 → 仓管实际入库。

Production handler 解析工单负责人，Approval 不查询工单表；Quality 不改生产草稿，Production 不改检验记录。送审冻结所引用事实和清单。数量建议及当前/待实施的剩余复检边界见[结案设计](database/production-termination.md#数量质检与更正)，不在本篇重复定义。

批准清单授予实际入库资格，审批自身不记库存；仓管按当前轮计划内／外授权分次、多明细确认并选择目标批次。清单更正保留已入事实，剩余执行须使用新有效授权，非入库信息继续按更正审批留历史。[成品入库](database/finished-goods-inbound.md)维护源版本、冻结、授权余额和确认事务。

## 3. 报废与损耗按来源区分

| 场景 | 数量影响及所有者 |
| --- | --- |
| 工序产品报废 | 执行模块保留事实，按规则生成补料与产品补产授权 |
| 结案新增产品报废 | 产出清单与历史工序报废去重；不补料、不补产、不写库存 |
| 已领物料损耗（在产或收尾） | 复用损耗事实并占用可退额度，不再扣库存；需要用料另行提需 |
| 仓库库存报废 | 未开放，不能从上述入口顺带实现 |

原材料损耗和产品报废不能混合求和；页面组合既有单据不取得需求或库存所有权。详细来源、额度及不可变约束分别见[执行](database/execution-traceability-quality.md)、[结案](database/production-termination.md)、[物料损耗](database/return-scrap-and-stocktake.md)。

## 4. 成品与物料共用库存账本

成品使用显式成品身份，不能把成品 ID 填入物料外键或削弱物料精确版本约束。成品库存批次使用中性来源 `finished_product`，计划内／外类别沿实际明细的批准授权追溯；与物料共用 Inventory 的唯一账本，不建兼容影子表。物理身份与投影由 [Inventory](../../inventory/docs/database/inventory-ledger-and-inbound.md#成品身份与范围)维护，Production 维护批准来源。

## 5. 库存模块与采购接入边界

Inventory 不反向决定需求、补产或结案资格；生产用例先核验自己的来源，再在同池事务调用库存能力。盘点由 Inventory 独立办理。

其他出库保护预留时，经 API 组合根只读调用 Production 的当前有效分配公开端口；Production 只锁自有分配，Inventory 自己读取已确认领料。这个明确的反向协作仅提供预留事实值，不授予来源资格或分配写入，具体规则见[当前有效预留](database/demand-allocation-and-outbound.md#当前有效预留公开能力)。

外购来源由 Procurement 编排、Quality 检查；到货及检验不是库存。Production 只向采购公开需求资格和来源追溯，不复制采购、检验轮次或正式分配规则。协作入口见[采购技术设计](../../../../../../docs/procurement-inbound-technical-design.md)，模块不扩大销售、通用库存报废和完整质量范围。
