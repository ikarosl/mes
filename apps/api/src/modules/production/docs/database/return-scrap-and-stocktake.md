# 退料与已领物料损耗

本章维护真实领料来源、可退额度和 Production 的 item_scrap 表；公共出入库、库批与盘点由 [Inventory](../../../inventory/docs/database.md)拥有。任务、需求、原分配、物料、精确版本和库批必须同源，不回落到基础物料或默认版本。

## 退料表

实际退料使用 Inventory 的 inbound_order/detail，来源 return_inbound，不保留第二套主从或数量。每单一个任务，每个原分配同单只出现一次；固定回原库批 available 库存。原库批冻结或停用仍可真实回仓，但不解除其状态。待确认退料占额度，确认回仓，取消释放占用；不开放编辑、部分确认、终态恢复或退料报废。

可新增退料量＝已确认生产领料－待确认及已确认退料－待确认及已确认损耗。同分配共用这一口径，确认时包含本单占用，不重复减本次数量；人工其他入库不改变额度。

Production 核验来源与额度，经 Inventory 公开命令同事务记实际回仓和成功审计。来源命令先锁工单、任务和原分配，再由 Inventory 当前读公共单据并锁损耗事实；完整锁序见[库存协作](../../../../../../../docs/inventory-extraction-design.md)。

退料允许在任务或工单结束后按真实余料办理，不关闭或恢复需求、不回退履约或任务阶段、不加回原分配可领量。净领用量不代表现场实存，也不参与任务开工判断。HTTP 返回 returnNo/returnAt/returnQuantity，returned 对应公共 completed；列表、详情和打印只读 return_inbound 场景。

## item_scrap

职责：记录 production_consumed 已领物料的现场损坏或丢失，独立占用可退额度；不包含产品或仓库报废。它不再次扣库存、不自动加需求或补产授权；额外用料另行人工提需。

仅 material_partially_outbound/material_outbound/doing 任务的真实已领分配可新增，数量正整数且不超过当前可申报额度；物料、版本、库批和单位沿服务端来源取得。pending 记录只能按版本确认或取消，确认保留账号和时间，取消独立保留原因、账号和时间；不覆盖原损耗原因和备注。

确认与成功审计、启用的幂等结果同事务，不推进任务版本或修改需求履约。来源、数量和终态由触发器保护，不允许更新或删除；已确认错误不通过改量或取消掩盖，反向更正能力尚未开放。任务人工结束前须先确认或取消 pending 损耗。

本表是本章唯一拥有的逐表结构；202611090040 移除旧结案用途和审批根引用，保留在产损耗和可退额度不变量。字段、审计、数量和时间见[数据库公共规则](../../../../../../../docs/database-conventions.md)。

## item_scrap

记录已领物料损耗并占用原分配可退额度，不产生库存扣减或自动追加需求。

来源组合外键保证任务、需求、分配、物料、版本和原库批一致。pending只可确认或取消，终态、数量和来源不可改；不可删除。可退额度需与Inventory实际领退料在同事务核验。

### 字段

| 字段                  | SQL定义                                                                   | 含义                                     |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `id`                  | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                               |
| `scrap_no`            | `varchar(100) NOT NULL`                                                   | 损耗单号                                 |
| `production_batch_id` | `bigint unsigned NOT NULL`                                                | 生产批次 ID，非空                        |
| `demand_id`           | `bigint unsigned NOT NULL`                                                | 来源需求 ID，非空                        |
| `allocation_id`       | `bigint unsigned NOT NULL`                                                | 来源分配明细 ID，非空                    |
| `item_id`             | `bigint unsigned NOT NULL`                                                | 发生损耗的物料 ID                        |
| `material_variant_id` | `bigint unsigned NOT NULL`                                                | 发生损耗的精确物料版本 ID                |
| `batch_id`            | `bigint unsigned NOT NULL`                                                | 已确认领料的库存批次 ID，非空            |
| `scrap_scene`         | `varchar(40) NOT NULL DEFAULT 'production_consumed'`                      | 当前固定为 `production_consumed`         |
| `scrap_number`        | `int NOT NULL`                                                            | 损耗数量                                 |
| `unit_snapshot`       | `varchar(20) NOT NULL`                                                    | 登记损耗时的单位快照                     |
| `reason_type`         | `varchar(50) NOT NULL`                                                    | 损耗原因                                 |
| `status`              | `varchar(30) NOT NULL DEFAULT 'pending'`                                  | 状态，默认 `pending`                     |
| `confirmed_by`        | `bigint unsigned DEFAULT NULL`                                            | 确认损耗的管理员；待处理或取消时为空     |
| `confirmed_at`        | `datetime DEFAULT NULL`                                                   | 确认时间；待处理或取消时为空             |
| `remark`              | `text`                                                                    | 备注                                     |
| `cancel_reason`       | `text`                                                                    | 取消申报原因；不得覆盖损耗原因或制单备注 |
| `cancelled_by`        | `bigint unsigned DEFAULT NULL`                                            | 取消人；历史未记录数据可为空             |
| `cancelled_at`        | `datetime DEFAULT NULL`                                                   | 取消时间；历史未记录数据可为空           |
| `version`             | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                   |
| `created_by`          | `bigint unsigned NOT NULL`                                                | 创建人                                   |
| `created_at`          | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                 |
| `updated_by`          | `bigint unsigned NOT NULL`                                                | 最近修改人                               |
| `updated_at`          | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                             |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_item_scrap_no` (`scrap_no`);
UNIQUE KEY `uk_item_scrap_id_batch` (`id`,`production_batch_id`);
KEY `idx_item_scrap_status_created` (`status`,`created_at`);
KEY `idx_item_scrap_batch_status` (`production_batch_id`,`status`,`created_at`);
KEY `idx_item_scrap_allocation_status` (`allocation_id`,`status`,`created_at`);
KEY `fk_item_scrap_demand_batch` (`demand_id`,`production_batch_id`);
KEY `fk_item_scrap_confirmed_by` (`confirmed_by`);
KEY `fk_item_scrap_created_by` (`created_by`);
KEY `fk_item_scrap_updated_by` (`updated_by`);
KEY `idx_item_scrap_cancelled_by` (`cancelled_by`);
KEY `fk_item_scrap_allocation_variant` (`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`);
KEY `fk_item_scrap_batch_variant` (`batch_id`,`item_id`,`material_variant_id`);
CONSTRAINT `fk_item_scrap_allocation` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`);
CONSTRAINT `fk_item_scrap_allocation_variant` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`);
CONSTRAINT `fk_item_scrap_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_item_scrap_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`);
CONSTRAINT `fk_item_scrap_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`);
CONSTRAINT `fk_item_scrap_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_item_scrap_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_item_scrap_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_item_scrap_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`);
CONSTRAINT `fk_item_scrap_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_integer_storage_item_scrap` CHECK ((`scrap_number` between 0 and 99999999));
CONSTRAINT `chk_item_scrap_current_scene` CHECK ((`scrap_scene` = 'production_consumed'));
CONSTRAINT `chk_item_scrap_quantity` CHECK ((`scrap_number` > 0));
CONSTRAINT `chk_item_scrap_quantity_integer` CHECK ((`scrap_number` = truncate(`scrap_number`,0)));
CONSTRAINT `chk_item_scrap_reason` CHECK ((char_length(trim(`reason_type`)) > 0));
CONSTRAINT `chk_item_scrap_state` CHECK ((((`status` = 'pending') and (`confirmed_by` is null) and (`confirmed_at` is null)) or ((`status` = 'confirmed') and (`confirmed_by` is not null) and (`confirmed_at` is not null)) or ((`status` = 'cancelled') and (`confirmed_by` is null) and (`confirmed_at` is null))));
CONSTRAINT `chk_item_scrap_version` CHECK ((`version` >= 0));
```

数据库触发器：trg_material_loss_terminal_guard、trg_material_loss_no_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。
