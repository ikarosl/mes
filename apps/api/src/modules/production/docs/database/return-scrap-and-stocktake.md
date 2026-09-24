# 退料、报废与盘点

> [返回 Production 数据库设计](README.md)。

本章退料、生产领料损耗和盘点数量均为整数：退料与损耗最小为 `1`，实盘数量允许为 `0`，盘点差异允许为负整数。数据库必须以整数 `CHECK` 拒绝小数，前后端不得用误差阈值比较或自动舍入小数。

退料、生产领料损耗和盘点均以精确物料版本为事实边界。明细必须同时保存 `item_id` 与
`material_variant_id`，并沿 allocation/batch 的组合外键校验一致；停用版本仍可在历史明细和
库存流水中展示，不能回落到基础物料或默认版本。

## 业务语义与写入职责

生产退料是现场多余物料（包括生产结束或订单中途关闭产生的余料）退回仓库的通道。仅处理已确认领料且仍可退的公共可用物料，固定回原库存批次。订单关闭和剩余需求关闭须由独立生命周期命令办理，退料不触发这些动作。

损耗列表、详情和候选的库存批号／物料编码展示由 `infrastructure/queries/material-loss-display.query.ts` 承担，只读访问登记的 Inventory 批次字段；当前物料名称仍读取 Product 当前名称，不过滤历史停用或删除记录。损耗创建、确认及取消的资格查询只读取 Production 自有损耗、分配、领料、退料和需求事实，不使用库存展示查询作为业务校验。结案核对需要共享锁时仅锁 `item_scrap` 事实，再批量读取不可变批次展示字段，不因展示联查锁定其他模块库存数据。查询拆分不改变原可退／损耗额度、分页、排序或 HTTP 响应。

| 所有者 | 可写职责 | 禁止混用 |
| --- | --- | --- |
| `ProductionReturnRepository` | 退料主单／明细和审计；同事务调用 Inventory 公开能力追加正流水 | 不创建/恢复/取消需求，不修改分配履约、批次状态、物料计划版本、短批授权，不调用需求计划 Writer |
| `ProductionMaterialLossRepository` | 现场损坏/丢失的损耗申报与确认，独立保存损坏事实 | 不把余料退回当损耗，不重复扣减仓库库存，不增加产品补产额度 |
| `ProductionCloseoutMaterialLossRepository` | 初次结案中的已领物料损坏立即确认，不补料，永久占用可退上限 | 不扩展在产损耗确认、不写库存、不改需求或补产 |
| 需求配置与需求计划 Writer | 明确的初始配置、人工追加、补料生成、剩余需求关闭及计划版本推进 | 不提供退料重开需求的接口，不通过净领用量反推需求 |
| 物料分配与出库 Repository | 分配预留、确认出库扣库存和需求余额 | 退料不减少既有履约量，也不恢复原分配可制单量 |
| 生产执行 Repository | 独立开工/完工校验 | 不因退料创建需求、产品补产额度或回退工序状态；短批授权及开工不读取退料 |
| 管理端与查询投影 | 展示来源、可退额度和明确操作提示 | 不将净领用量用作需求余额，不从损耗自动追加需求 |

所有退料一律不修改 `production_item_demand.need_number/remaining_number/business_status/fulfilled_by/fulfilled_at`。短批未开工也没有例外：退料不推进 `material_plan_version`，不作废已有授权；短批授权预览、员工任务按钮和开工命令只检查已发生确认领料及有效授权覆盖当前需求，不读取退料、不按净领用量判断。即使全部退回也不因此阻止短批开工。原有活动需求继续由领料履约或显式关闭管理动作处理。

## 3.7 退料表

---

### 14. `return_order`

职责：维护生产退料主单，记录某个生产批次的一次退料动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `return_no`           | `VARCHAR(100)`    | 退料单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存                         |
| `status`              | `VARCHAR(30)`     | 退料单状态，默认 `pending`                |
| `return_at`           | `DATETIME`        | 实际退料时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| `cancel_reason`       | `TEXT`            | 取消原因；历史未记录数据可为空            |
| `cancelled_by`        | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空              |
| `cancelled_at`        | `DATETIME`        | 取消时间；历史未记录数据可为空            |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (return_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (cancelled_by) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('pending', 'returned', 'scrapped', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于退料单状态分页

说明：

- 退料主单表达一次退料动作。
- 具体退回哪个分配行、哪个批次、多少数量，由 `return_detail` 记录。
- 确认退料后回到原库存批次，释放为公共可用库存；原生产任务关联仅用于来源追溯，不代表继续占用。
- 当前已实现的最小退料只接受已确认生产领料，固定退回 `available` 并设置 `release_after_return = 1` 释放公共库存。不提供退回后保留给原生产任务的模式，也不开放退料报废命令。

---

### 15. `return_detail`

职责：维护生产退料明细，记录某个分配行按原精确版本退回原库存批次的数量，固定释放为公共可用库存。

| 字段                   | 类型              | 说明                                     |
| ---------------------- | ----------------- | ---------------------------------------- |
| `id`                   | `BIGINT UNSIGNED` | 主键                                     |
| `return_id`            | `BIGINT UNSIGNED` | 退料主单 ID，关联 `return_order.id`      |
| `production_batch_id`  | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存                    |
| `demand_id`            | `BIGINT UNSIGNED` | 需求 ID                                  |
| `allocation_id`        | `BIGINT UNSIGNED` | 分配明细 ID                              |
| `item_id`              | `BIGINT UNSIGNED` | 退料对象 ID                              |
| `material_variant_id`  | `BIGINT UNSIGNED` | 退料精确物料版本 ID                      |
| `batch_id`             | `BIGINT UNSIGNED` | 退料库存批次 ID                          |
| `return_number`        | `INT`   | 本次退料数量                             |
| `unit_snapshot`        | `VARCHAR(20)`     | 退料时单位快照                           |
| `return_stock_status`  | `VARCHAR(20)`     | 退回后的库存状态，固定 `available`       |
| `release_after_return` | `TINYINT`         | 固定为 `1`，退回后释放给公共库存 |
| `remark`               | `TEXT`            | 备注                                     |
| `created_by`           | `BIGINT UNSIGNED` | 创建人                                   |
| `created_at`           | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`       |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (return_id, production_batch_id) REFERENCES return_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id, material_variant_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id, material_variant_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 检查约束：`CHECK (return_number > 0)`
- 检查约束：`chk_return_detail_current_scope CHECK (return_stock_status = 'available' AND release_after_return = 1)`，只允许退回公共可用库存。
- 整数约束：`chk_return_detail_quantity_integer CHECK (return_number = TRUNCATE(return_number, 0))`
- 唯一约束：`UNIQUE (return_id, allocation_id)`
- 组合候选键：`uk_return_detail_source UNIQUE (id, allocation_id, demand_id, production_batch_id, item_id, batch_id)`。该物理键为六列；精确版本由上述分配来源及库存批次组合外键保证，不能将本键解释为未约束版本，也不据此开放退料后报废。

说明：

- `return_stock_status = available` 的退料会增加库存流水中的可用库存。
- `release_after_return = 1` 表示退回后释放给公共库存，不再继续占用原生产批次。
- 退料入库应生成 `inventory_transaction`，类型为 `material_return_inbound`。
- 创建待退料单时即占用可退数量；可退数量为同一 allocation 已确认领料累计减去其他 `pending/returned` 退料明细累计，再减去 `pending/confirmed` 的 `production_consumed` 损耗累计。取消待退料单释放占用。
- 退料候选、创建和确认使用相同额度口径；创建及确认先锁定来源 allocation，再以当前读校验领料、退料与损耗占用，避免旧事务快照遗漏并发占用。
- 退料候选返回 `occupiedLossQuantity`，为同一分配来源的待确认及已确认损耗合计；管理端并列展示已确认领料、退料占用、损耗占用及可退数量。待确认损耗取消后释放占用，已确认损耗持续扣减本来源的可退上限，另行追加需求的取消或关闭均不撤销损耗；当前不支持已确认损耗冲销。
- 确认退料按 `item_batch.id` 升序锁定涉及批次，重新校验可退数量，并将主单更新、正库存流水和成功审计放在同一事务。

---

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
- 损耗确认与成功审计、HTTP 幂等结果同事务提交，不推进物料计划版本或改变产品数量授权。已确认损耗不得改量或取消，错误修正须独立冲销设计。
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
