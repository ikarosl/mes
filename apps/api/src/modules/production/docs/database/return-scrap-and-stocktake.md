# 退料、报废与盘点

> [返回 Production 数据库设计](README.md)。

本章维护退料来源、可退额度及损耗表的职责与结构，并与[版本化 migration](../../../../../../../packages/database/migrations/)同步；公共字段、审计与数量遵守[数据库约定](../../../../../../../docs/database-conventions.md)。

退料和损耗只记录正数量，以原分配的精确物料版本为边界；任务、需求、物料、版本及库批须同源。停用版本仍保留真实历史身份，不能回落到基础物料或默认版本。

## 业务语义与写入职责

生产退料把已确认领料中仍可退的可用余料送回原库批，包括生产结束或订单关闭后的余料。退料不关闭或恢复需求、不回退履约、分配可领量或任务阶段；订单与剩余需求须另行关闭。净领用量不代表现场实存，也不参与任务开工判断。

Production 核验退料来源和额度，经 Inventory 公开能力办理实际回仓；损耗则由 Production 独立记录现场损坏或丢失，不再次扣库存、不自动增加需求、补料或产品补产授权。额外用料须另行提需，不能用余料退回代替损耗。

退料与损耗资格使用锁内的生产来源和实际领退料事实。结案共享读只锁损耗事实；批号、编码等展示读取不能顺带锁库存。

## 3.7 退料表

实际退料使用 Inventory 所有的 `inbound_order/detail(source_type=return_inbound)`，不保留第二份退料主从或数量。单据状态、目标与流水规则见[公共入库](../../../inventory/docs/database/inventory-ledger-and-inbound.md#34-入库表)。

每单只处理一个任务，每个原分配同单只出现一次。退料固定回原批次的 available 库存；原批次冻结或停用仍可真实回仓，但不解除该状态。待确认退料占额度，确认形成实际回仓，取消释放占用；不开放编辑、部分确认、终态恢复或退料报废。

同一分配的可新增退料量为：已完成生产领料 − 待确认及已完成退料 − 待确认及已确认损耗。人工其他入库不参与额度。候选、创建、确认和损耗共用此口径；确认核对包括本单的全部占用，不重复减本次数量。

来源写命令先锁任务和原分配，经 Inventory 公开能力当前读实际单据，再锁损耗事实；库存侧按[公共锁序](../../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)办理，来源审计与实际回仓同事务提交。

退料 HTTP 沿用 `returnNo/returnAt/returnQuantity`；其 `returned` 映射公共完成态 `completed`，其余状态为 pending、cancelled。列表、详情和打印只读取 return_inbound 场景，响应不添加固定库存状态或释放标记。

`occupiedLossQuantity` 表示同分配待确认及已确认损耗合计。取消待确认损耗释放占用；确认后持续扣减可退上限，另行需求的取消或关闭不撤销损耗，当前不支持已确认损耗冲销。

## 3.8 报废表

### 16. `item_scrap`

当前只记录 `production_consumed` 已领物料损耗，不包含产品报废、仓库报废或退料后报废。`loss_purpose` 区分在产登记 `production_record` 与初次结案登记 `closeout_record`；用途、来源、数量和损耗原因创建后不可改写，记录不可删除。损耗数量不等于应追加需求，也不回收既有产品数量授权。

在产损耗只允许来自 `material_partially_outbound/material_outbound/doing` 任务的真实已领分配：尚未开工的现场暂存或搬运也可能损坏。物料、版本、库批和单位沿服务端来源取得，不接受自由拼接；批量任务遵守任务物料锁版，研发任务可独立选择版本。

在产登记先为 pending，之后只能按版本确认或取消；确认记录实际管理员和时间，待确认或取消状态不带确认信息。取消原因独立于原损耗原因与制单备注，历史未记录的取消人、时间或原因可为空。确认与成功审计、幂等结果同事务提交，不推进任务版本或改变产品数量授权。终态不可更新，已确认错误须另行设计冲销，不能改量或取消。

结案登记直接形成确认事实，关联同任务收尾根并保留损坏原因。仅初次未送审的 closing 根可登记；具体办理、锁序和审批证据由[收尾物料损坏登记](production-termination.md#收尾物料损坏登记)维护，不借此放宽在产损耗资格。

两种用途都在创建和确认时锁内核对[可退额度](#37-退料表)，不产生补料单或需求。历史自动补料数据不得推测转换；升级及回退的空数据、审批证据守卫见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。

**`item_scrap` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `scrap_no` | `VARCHAR(100) NOT NULL` | 损耗单号 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 生产批次 ID，非空 |
| `demand_id` | `BIGINT UNSIGNED NOT NULL` | 来源需求 ID，非空 |
| `allocation_id` | `BIGINT UNSIGNED NOT NULL` | 来源分配明细 ID，非空 |
| `item_id` | `BIGINT UNSIGNED NOT NULL` | 发生损耗的物料 ID |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 发生损耗的精确物料版本 ID |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 已确认领料的库存批次 ID，非空 |
| `scrap_scene` | `VARCHAR(40) NOT NULL DEFAULT 'production_consumed'` | 当前固定为 `production_consumed` |
| `loss_purpose` | `VARCHAR(30) NOT NULL DEFAULT 'production_record'` | `production_record/closeout_record`，创建后不可改 |
| `closeout_id` | `BIGINT UNSIGNED NULL` | 结案登记必填；在产损耗为空，与生产批次组成来源外键 |
| `scrap_number` | `INT NOT NULL` | 损耗数量 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 登记损耗时的单位快照 |
| `reason_type` | `VARCHAR(50) NOT NULL` | 损耗原因 |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'pending'` | 状态，默认 `pending` |
| `confirmed_by` | `BIGINT UNSIGNED NULL` | 确认损耗的管理员；待处理或取消时为空 |
| `confirmed_at` | `DATETIME NULL` | 确认时间；待处理或取消时为空 |
| `remark` | `TEXT NULL` | 备注 |
| `cancel_reason` | `TEXT NULL` | 取消申报原因；不得覆盖损耗原因或制单备注 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消人；历史未记录数据可为空 |
| `cancelled_at` | `DATETIME NULL` | 取消时间；历史未记录数据可为空 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`item_scrap` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_item_scrap_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)` |
| 外键 | `CONSTRAINT fk_item_scrap_demand_batch FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_item_scrap_allocation FOREIGN KEY ( allocation_id, demand_id, production_batch_id, item_id, batch_id ) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)` |
| 外键 | `CONSTRAINT fk_item_scrap_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_scrap_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_scrap_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_scrap_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_scrap_allocation_variant FOREIGN KEY ( allocation_id, demand_id, production_batch_id, item_id, batch_id, material_variant_id ) REFERENCES production_item_allocation ( id, demand_id, production_batch_id, item_id, batch_id, material_variant_id )` |
| 外键 | `CONSTRAINT fk_item_scrap_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id)` |
| 外键 | `CONSTRAINT fk_item_scrap_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id)` |
| 外键 | `CONSTRAINT fk_item_scrap_closeout_batch FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_item_scrap_no (scrap_no)` |
| 唯一键 | `UNIQUE KEY uk_item_scrap_id_batch (id, production_batch_id)` |
| 索引 | `KEY idx_item_scrap_status_created (status, created_at)` |
| 索引 | `KEY idx_item_scrap_batch_status (production_batch_id, status, created_at)` |
| 索引 | `KEY idx_item_scrap_allocation_status (allocation_id, status, created_at)` |
| 索引 | `KEY idx_item_scrap_cancelled_by (cancelled_by)` |
| 索引 | `KEY idx_item_scrap_closeout_batch (closeout_id,production_batch_id)` |
| CHECK | `CONSTRAINT chk_item_scrap_current_scene CHECK (scrap_scene = 'production_consumed')` |
| CHECK | `CONSTRAINT chk_item_scrap_quantity CHECK (scrap_number > 0)` |
| CHECK | `CONSTRAINT chk_item_scrap_reason CHECK (CHAR_LENGTH(TRIM(reason_type)) > 0)` |
| CHECK | `CONSTRAINT chk_item_scrap_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_item_scrap_state CHECK ( (status = 'pending' AND confirmed_by IS NULL AND confirmed_at IS NULL) OR (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) OR (status = 'cancelled' AND confirmed_by IS NULL AND confirmed_at IS NULL) )` |
| CHECK | `CONSTRAINT chk_item_scrap_quantity_integer CHECK (scrap_number = TRUNCATE(scrap_number, 0))` |
| CHECK | `CONSTRAINT chk_integer_storage_item_scrap CHECK ( scrap_number BETWEEN 0 AND 99999999 )` |
| CHECK | `CONSTRAINT chk_item_scrap_loss_purpose CHECK ( (loss_purpose='production_record' AND closeout_id IS NULL) OR (loss_purpose='closeout_record' AND closeout_id IS NOT NULL AND status='confirmed' AND reason_type='closeout_damage' AND remark IS NOT NULL AND CHAR_LENGTH(TRIM(remark))>0) )` |

**`item_scrap` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_closeout_material_loss_insert](../../../../../../../packages/database/migrations/202609170006-closeout-material-loss.up.sql) | `BEFORE INSERT` | 结案损坏须关联同任务初次、未送审的 closing 根 |
| [trg_closeout_material_loss_no_update](../../../../../../../packages/database/migrations/202609200004-material-loss-record-only.up.sql) | `BEFORE UPDATE` | 仅允许待确认损耗推进确认／取消并递增版本，冻结来源、数量、用途及原因 |
| [trg_closeout_material_loss_no_delete](../../../../../../../packages/database/migrations/202609200004-material-loss-record-only.up.sql) | `BEFORE DELETE` | 损耗事实不可删除 |

#### 后续库存报废设想（须先评审，不是当前写入规则）

以下场景尚未进入物理结构、命令或页面范围，不能因已有代码值而开放；未完成事项见[路线图](../../../../../../../docs/roadmap.md)。原设想仅保留以下来源边界，均须另行评审：

| 场景 | 来源及数量范围 | 确认后的拟议影响 |
| --- | --- | --- |
| `warehouse_allocated` | 仍有效分配中未出库、未释放的数量 | 负数报废流水，影响分配可再次出库量 |
| `return_after_outbound` | 已确认退料明细中尚未处置的数量 | 负数报废流水，影响分配可再次出库量 |
| `in_stock` | 实际库存批次，不虚构任务或需求 | 负数报废流水，不涉及分配 |

这些未来库存报废拟使用 `scrap_outbound`，汇总仅计 confirmed 事实；当前生产领料损耗的库存已在领料时扣减，不能再次生成库存流水。

## 3.9 盘点表

`stock_check_order/detail` 由 Inventory 所有，范围、快照和差异流水见[盘点设计](../../../inventory/docs/database/stock-check.md)。Production 不直接写盘点或库存表。
