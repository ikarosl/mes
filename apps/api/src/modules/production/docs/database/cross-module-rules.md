# 跨模块协作规则

> [返回 Production 数据库设计](README.md)。本篇维护 Production 与外部事实的关系，以及尚未实施的协作边界；模块内部规则由对应专题维护。

## 3.11 跨模块引用说明

| 所有者 | Production 使用的事实／能力 | 规则来源 |
| --- | --- | --- |
| Product | 成品、BOM、物料版本、路线及技术文件；历史身份不授予新生产用途资格 | [产品规则](../../../product/docs/product-rules.md) |
| Identity | 人员身份与实时资格；人员身份不自动授予业务权限 | [身份模块](../../../identity/README.md) |
| Inventory | Production 核验来源、推进履约，Inventory 写实际领退料、成品入库及库存事实 | [公开能力](../../../inventory/docs/public-contracts.md) |
| Quality | 不可变检查及专检处理额度；检查不替代生产产出或自动修改报工 | [统一检验模型](../../../quality/docs/unified-inspection-model.md) |
| Approval | Production 提供受审证据、业务校验和具体负责人，Approval 管理流程与决定 | [场景接入](../../../approval/docs/subject-integration.md) |

跨模块访问与展示读取遵守[项目架构](../../../../../../../docs/architecture.md)，来源和库存的原子性、完整锁序及预留读取例外由[库存协作协议](../../../../../../../docs/inventory-extraction-design.md)维护。生产需求、执行及结案的具体资格见[所属专题](README.md)。

## 报废与损耗边界

| 场景 | 数量影响与所有者 |
| --- | --- |
| 工序产品报废 | [执行专题](execution-traceability-quality.md#441-工序报废与补产授权)保存报废和产品补产授权；[需求专题](demand-allocation-and-outbound.md#batch_step_scrap_records-与半自动补料)维护物料补料与履约 |
| 结案新增产品报废 | [结案](production-termination.md)与历史工序报废去重，不补料、不补产、不写库存 |
| 已领物料损耗 | [退料与损耗](return-scrap-and-stocktake.md)占用可退额度，不再次扣库存；额外用料另提需求 |
| 仓库库存报废 | 未开放，不能从上述入口顺带实现 |

原材料损耗与产品报废不能合计，物料补料数量也不是产品补产数量。

## 库存状态转换（尚未实施）

以下是未来接口边界，不能据此开放待检入库或质量状态转换：

- 状态变化以同事务等量反向流水表达，物料、版本、批次与单位一致；待检转可用分别记待检负数和可用正数。
- 两条流水共用 `transaction_group_key`，各自有唯一幂等键；分组键用于成对核查，不替代单条防重。
- 来源必须指向未来已定稿的质量放行事实，不能预设旧草案 `inspection_records` 或提前创建 `finished_flow_records`。
- 质量结论、人员和报告归质量模型，库存仅表达数量及状态；即使增加流转里程碑也不能成为第二库存账本。
