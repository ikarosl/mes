# 退料、报废与盘点

> [返回 Production 数据库设计](README.md)。

本章退料、生产领料损耗和盘点数量均为整数：退料与损耗最小为 `1`，实盘数量允许为 `0`，盘点差异允许为负整数。数据库必须以整数 `CHECK` 拒绝小数，前后端不得用误差阈值比较或自动舍入小数。

退料、生产领料损耗和盘点均以精确物料版本为事实边界。明细必须同时保存 `item_id` 与
`material_variant_id`，并沿 allocation/batch 的组合外键校验一致；停用版本仍可在历史明细和
库存流水中展示，不能回落到基础物料或默认版本。

## 业务语义与写入职责

生产退料是现场多余物料（包括生产结束或订单中途关闭产生的余料）退回仓库的通道。仅处理已确认领料且仍可退的公共可用物料，固定回原库存批次。订单关闭和剩余需求关闭须由独立生命周期命令办理，退料不触发这些动作。

损耗列表、详情和候选的库存批号／物料编码展示由 `infrastructure/queries/material-loss-display.query.ts` 承担，只读访问登记的 Inventory 批次字段；当前物料名称仍读取 Product 当前名称，不过滤历史停用或删除记录。损耗创建、确认及取消读取 Production 自有损耗、分配和需求事实，通过 Inventory 公开当前读取得实际领退料；不使用库存展示查询作为业务校验。结案核对需要共享锁时仅锁 `item_scrap` 事实，再批量读取不可变批次展示字段，不因展示联查锁定其他模块库存数据。

| 所有者 | 可写职责 | 禁止混用 |
| --- | --- | --- |
| `ProductionReturnRepository` | 退料来源、额度与命令编排和审计；同事务调用 Inventory 创建／确认／取消公共入库单 | 不创建/恢复/取消需求，不修改分配履约、批次状态，不调用需求计划 Writer |
| `ProductionMaterialLossRepository` | 现场损坏/丢失的损耗申报与确认，独立保存损坏事实 | 不把余料退回当损耗，不重复扣减仓库库存，不增加产品补产额度 |
| `ProductionCloseoutMaterialLossRepository` | 初次结案中的已领物料损坏立即确认，不补料，永久占用可退上限 | 不扩展在产损耗确认、不写库存、不改需求或补产 |
| 需求配置与需求计划 Writer | 明确的初始配置、人工追加、补料生成、剩余需求关闭及计划版本推进 | 不提供退料重开需求的接口，不通过净领用量反推需求 |
| 物料分配与出库 Repository | 分配预留、确认出库扣库存和需求余额 | 退料不减少既有履约量，也不恢复原分配可制单量 |
| 生产执行 Repository | 独立开工/完工校验 | 不因退料创建需求、产品补产额度或回退工序状态；开工不按退料推算现场余额 |
| 管理端与查询投影 | 展示来源、可退额度和明确操作提示 | 不将净领用量用作需求余额，不从损耗自动追加需求 |

所有退料不修改 `production_item_demand.need_number/remaining_number/business_status/fulfilled_by/fulfilled_at`，不改变任务开工资格。开工只展示正式需求缺口，不按净领用量推算现场余额。原活动需求继续由领料履约或显式关闭管理动作处理。

## 3.7 退料表

生产退料使用 Inventory 所有的 `inbound_order/detail(source_type=return_inbound)`，不保留第二份主从或退料数量。公共字段、外键、审计及完成守卫见 [Inventory 数据库](../../../inventory/docs/database.md)。Production 只拥有退料来源资格、额度和办理编排，不能直接写入或锁定公共单据。

- 一单一个任务，关联工单；每条明细以 `return_allocation_id`、`demand_id`、任务、物料精确版本、原库存批次和单位指向原已领料分配。一个分配在同单只出现一次。
- 创建 `pending` 时占可退额度，不记库存；整单确认 `pending → completed`，每条有效明细生成一条 `material_return_inbound` 正流水，引用 `inbound_detail.id`；取消 `pending → cancelled` 释放占用。单据不开放编辑、部分确认、终态恢复或退料报废。
- 退料固定原批次、`stock_status=available`；原批次即使冻结或停用，历史真实回仓仍可办理，但不解除批次状态。回仓不恢复原需求、履约、分配可领量或任务阶段。
- 可新增数量为同分配已完成生产领料累计，减 `pending/completed` 生产退料累计，再减 `pending/confirmed` 生产领料损耗。人工其他入库不参与退料额度。确认核对包括本单的全部占用，不重复减本次数量。
- 候选、创建、确认和损耗共用该额度。写命令先锁任务和原分配，经 `InventoryProductionDocumentCommand.facts` 当前读真实单据，再锁自身损耗事实；Inventory 自己按公共锁序执行批次、单据、流水与完成守卫。来源命令成功审计与实际回仓同事务提交。
- 退料 HTTP 使用 `returnNo/returnAt/returnQuantity` 和 `pending/returned/cancelled`；`returned` 映射公共完成态 `completed`。固定原批次可用库存回仓由上述业务规则表达，响应不附带固定状态或释放标记，也不提供退料报废状态。列表、详情和打印展示由已登记查询读取公共入库，只限定 `return_inbound`。
- `occupiedLossQuantity` 是同分配待确认及已确认损耗合计；取消待确认损耗释放占用，确认后持续扣可退上限，另行需求的取消或关闭均不撤销损耗。当前不支持已确认损耗冲销。

## 3.8 报废表

---

### 16. `item_scrap`

设计类型：可变业务单据；确认后业务事实不可覆盖，错误处理留给后续冲销设计。

职责：当前只维护 `production_consumed` 生产领料损耗。仓库侧报废、退料后报废和库存内报废仍是未来场景，不在本表当前物理结构与应用能力中预建。

同一实物损耗场景以 `loss_purpose` 区分登记阶段：`production_record` 为在产损耗，`closeout_record` 为初次结案损坏登记。两者都只记录损坏，不自动创建需求、补料单或补产授权；需要补料时管理员另行提需求。批量任务仍遵守任务物料版本锁，研发任务可独立选择版本。不能覆盖旧损耗数量或转换用途。对应结案命令及审批证据见[结案设计](production-termination.md#收尾物料损坏登记)。

生产数量授权与已领物料损坏独立；确认损坏不会回收既有产品授权，也不重复扣减库存。损耗量不等于需要追加的需求量。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `scrap_no`            | `VARCHAR(100)`    | 报废单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，非空                         |
| `demand_id`           | `BIGINT UNSIGNED` | 来源需求 ID，非空                         |
| `allocation_id`       | `BIGINT UNSIGNED` | 来源分配明细 ID，非空                     |
| `item_id`             | `BIGINT UNSIGNED` | 报废对象 ID                               |
| `material_variant_id` | `BIGINT UNSIGNED` | 报废精确物料版本 ID                       |
| `batch_id`            | `BIGINT UNSIGNED` | 已确认领料的库存批次 ID，非空             |
| `scrap_scene`         | `VARCHAR(40)`     | 当前固定为 `production_consumed`          |
| `loss_purpose`       | `VARCHAR(30)`     | `production_record/closeout_record`，创建后不可改 |
| `closeout_id`        | `BIGINT UNSIGNED` | 结案登记必填；在产损耗为空，与生产批次组成来源外键 |
| `scrap_number`        | `INT`   | 报废数量                                  |
| `unit_snapshot`       | `VARCHAR(20)`     | 报废时单位快照                            |
| `reason_type`         | `VARCHAR(50)`     | 报废原因                                  |
| `status`              | `VARCHAR(30)`     | 状态，默认 `pending`                      |
| `confirmed_by`        | `BIGINT UNSIGNED` | 确认损耗/报废的管理员；待处理或取消时为空 |
| `confirmed_at`        | `DATETIME`        | 确认时间；待处理或取消时为空              |
| `remark`              | `TEXT`            | 备注                                      |
| `cancel_reason`       | `TEXT`            | 取消申报原因；不得覆盖损耗原因或制单备注  |
| `cancelled_by`        | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空              |
| `cancelled_at`        | `DATETIME`        | 取消时间；历史未记录数据可为空            |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

以下是未开放的后续场景设想及当前 `production_consumed` 的对照，不表示其他值已进入当前 CHECK，也不构成新增命令授权：

| 值                      | 含义                                 | 是否影响 allocation 可再次出库量 |
| ----------------------- | ------------------------------------ | -------------------------------- |
| `warehouse_allocated`   | 已分配但未出库，在仓库侧报废         | 是                               |
| `return_after_outbound` | 出库后退回，再发生报废               | 是                               |
| `production_consumed`   | 已出库到生产后，在生产现场损坏或丢失 | 否                               |
| `in_stock`              | 库存内直接报废，例如成品库存报废     | 不涉及 allocation                |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (scrap_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id, material_variant_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id, material_variant_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 外键：`confirmed_by`、`cancelled_by` 及业务审计操作者字段关联 `users.id`
- 检查约束：`CHECK (scrap_number > 0)`
- 检查约束：`CHECK (scrap_scene = 'production_consumed')`
- 用途约束：在产登记要求 `closeout_id IS NULL`；结案登记要求非空 `closeout_id`、`status=confirmed`、固定 `reason_type=closeout_damage` 和非空 `remark` 损坏原因。
- 组合外键：`(closeout_id,production_batch_id) -> production_batch_closeout(id,production_batch_id)`；索引 `idx_item_scrap_closeout_batch` 支持根查询。
- 数据库触发器只允许在产待确认单按版本递增进入确认或取消终态，来源、数量、原因和用途不可改写，所有损耗禁止删除，终态禁止更新。结案登记只允许初次未送审的 `closing` 根，不能直接写入已结束任务。
- 检查约束：`CHECK (status IN ('pending', 'confirmed', 'cancelled'))`
- 检查约束：`pending` 要求 `confirmed_by/confirmed_at` 为空；`confirmed` 要求二者均非空；`cancelled` 要求二者为空
- 非空来源列和组合外键共同保证 `production_consumed` 必须来自同一生产批次、需求、分配行、物料和库存批次
- 组合索引：`INDEX (status, created_at)`，用于报废单状态分页

说明：

- 生产消耗报废不应直接扣减原 allocation 的可再次出库量。
- `production_consumed` 创建与确认时只允许选择状态为 `material_partially_outbound/material_outbound/doing` 的生产批次及其已确认领料分配行；部分出库后尚未开工时，现场暂存或搬运中的已领物料也可能发生损耗。物料、库存批次、需求、单位和生产批次都从服务端候选复制，不接受客户端自由拼接 ID 或单位。
- 同一分配行当前可申报损耗量为“累计确认出库量 - `pending/returned` 退料占用量 - `pending/confirmed` 的 `production_consumed` 损耗占用量”；创建和确认事务都必须重新锁定来源分配行并校验，损耗数量必须大于 `0` 且不得超过该上限。取消待确认损耗必须填写原因并释放占用。
- 在产 `production_record` 创建后为 `pending`；管理员确认只把本单变为 `confirmed`。结案登记由独立命令直接形成确认事实。两种用途均不产生补料单或需求。
- 损耗确认与成功审计、HTTP 幂等结果同事务提交，不推进任务版本或改变产品数量授权。已确认损耗不得改量或取消，错误修正须独立冲销设计。
- 损耗不自动补料；历史自动补料数据不得推测转换。升级及回退的空数据／审批证据守卫见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。
- 通用库存报废仍未进入当前正式范围。`warehouse_allocated/return_after_outbound/in_stock` 的命令、接口和页面操作继续禁用，不得因实现生产领料损耗而一并开放。

#### 后续库存报废设想（须先评审，不是当前写入规则）

以下保留原场景的来源与不重复扣库考虑，未完成事项统一见[路线图](../../../../../../../docs/roadmap.md)。它们不改变当前只支持 `production_consumed` 的结构与入口。

- 库存内报废应生成 `inventory_transaction`，类型为 `scrap_outbound`。
- 只有 `status = confirmed` 的报废记录参与视图汇总。
- `warehouse_allocated` 必须校验分配仍有效且存在尚未出库、未释放的可报废数量；确认后生成负数报废库存流水。
- `return_after_outbound` 必须校验来源退料已确认，且报废数量不超过该退料明细尚未处置数量；确认后生成负数报废库存流水。
- `production_consumed` 的库存已在领料时扣减，确认报废时不得再次生成库存流水。
- `in_stock` 不虚构生产批次或需求关系，确认后从对应库存批次生成负数报废库存流水。

---

## 3.9 盘点表

`stock_check_order/detail` 由 Inventory 所有，字段、状态、差异流水与当前库存快照规则见 [Inventory 盘点设计](../../../inventory/docs/database/stock-check.md)。Production 不直接写盘点或库存表；现有仓库 HTTP 路径和权限保持。
