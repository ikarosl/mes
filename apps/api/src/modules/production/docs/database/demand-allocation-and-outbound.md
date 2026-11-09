# 生产需求、分配与领料出库

production_item_demand 是唯一生产需求事实。批量初始需求按冻结 BOM 单耗乘任务计划量生成，乘积超过单条整数上限即拒绝；研发初次与后续均手工提需。版本、BOM、初配完整性与任务计划由[工单与任务](work-orders-and-batches.md)维护。实际出入库及库存流水归 Inventory，汇总视图不得写入。

## 物料办理资格

任务处于 material_pending/material_assigned/material_partially_outbound/material_outbound/doing 时，有效活动需求可以分次分配、释放尚未出库预留、制单和确认领料，不要求全任务齐套。需求更正在审、关闭、取消或已履约时按自身资格保护。命令事务重新校验任务、精确版本、批次、可用库存、有效分配、待出库占用、数量和版本。

领料与开工独立；有正式配置但未领齐可以说明原因开工，执行后领料不回退材料阶段。任务结束原子关闭剩余需求、释放预留和取消未领料单，不以补产额度放宽执行，也不因异常或损耗自动加需求。未满足的活动需求在[人工结束](production-termination.md)同事务收口。

批量初配完整确认全部 BOM 行的单一精确版本、数量及可选提示，基础与初始需求同事务建立，不允许部分成功。基础保存不可变 BOM 公式、版本、单耗、任务计划量和供应商提示，初始需求等于 required_number。后续追加可超过初始量，但沿该任务冻结版本；研发需求的基础／BOM／单耗／计划快照成组为空，直接选择有效物料与版本。

## 正式需求更正与替代

原始需求数量、身份、版本及单位不可修改。数量更正或单条关闭通过审批关闭旧剩余并按需创建替代需求，不重算或删除真实领料。当前只允许更正人工追加需求，批量初始 BOM normal 需求不开放更正；更多用料另行追加。

更正目标是原来源沿替代链的累计总需求，已确认领料按整条链合计，新目标不得小于已领；新剩余为目标减链上已领。新剩余为零只关闭旧需求，不生成零量需求、不伪造履约。实际退料不加回需求或分配可领量。

送审前必须先处理涉及旧需求的待领料单，预留释放范围、领退料、损耗和旧需求版本进入审批证据。送审后冻结证据，影响证据的操作受控；最终批准在同事务重新核验，再由统一 Writer 关闭旧需求、建立替代需求、释放未领预留、推进任务版本并完成审批和成功审计。失败回滚；撤回或驳回保留原事实。混合多需求领料单不能因更正一条需求而无提示取消其他安排。

替代需求继承原 manual_addition_id，生成键沿原来源追加 CORRECTION:<申请ID>，同一旧需求只能有一条生效替代。历史详情保留逐次旧新关系、受审证据及真实领退料；当前缺口只计活动末端需求，不重复累加历史总量。更正不创建补产授权、报废或补料单。

## 分配数量查询

分配仅预留库存，实际确认领料才减少需求 remaining_number。已出库只汇总 production_material + completed 公共出库明细，待确认占用只计 pending_picking 的有效明细。剩余可领量为 assigned_number 减已完成量，可制单量再减待确认占用，下限均为零。取消出库只释放制单占用；释放／取消分配后即使历史计算仍有余额也不能制单。

真实余料退回公共库存，不恢复原分配的可领量或需求履约；已领物料损耗不再次扣库存。实际领料不足时另行人工提需，不把净领用量解释为现场实存。

## 生产领料出库表

outbound_order/detail 由 [Inventory](../../../inventory/docs/database.md)唯一拥有；来源 production_material，一单一个任务／工单，可包含不同生成组、需求、物料及原库批，每分配同单一行。不同交接时间另制单，整单确认或取消，不提供部分确认。

创建待出库单不记库存；确认经 Inventory 公开能力追加负数 production_material_outbound 流水，同时推进需求履约、任务阶段和版本。取消仅待出库态，无库存流水；取消来源 manual/production_batch/production_termination 表示人工、任务取消或任务结束。Production 不直接写或锁公共库存主从。

### HTTP 权限与消费者

任务内需求、分配候选与领料记录按 production:materials:view、production:tasks:view 或相应 material-demands:view 读取。仓储领料列表、详情、任务候选和可制单分配只要求 warehouse:outbound:view，不依赖生产任务页面。写动作分别使用 production:materials:allocate、production:materials:correct-demand、production:material-demands:configure/add-manual 及 warehouse:outbound:create/confirm/cancel；只读 any-of 不授予写动作。完整路径、DTO 与分页结构以各[Controller](../../presentation/http/production-material.controller.ts)和[需求 Controller](../../presentation/http/production-material-demand.controller.ts)为准。

### 当前有效预留公开能力

ProductionReservationQuery.currentAllocations(batchIds) 要求调用者活跃同池事务，仅以分配 ID 顺序 FOR SHARE NOWAIT 读取本模块有效分配的 id/batchId/assignedNumber/allocationStatus，排除 released/cancelled，不读或锁公共出库，不改变来源资格。

Inventory 使用其当前实际出库逐分配计算 max(assigned-issued,0) 后按库批合计预留；其他出库不得侵占有效预留。新增分配先持库存批次锁，反向当前读冲突整体回滚；锁序及有限重试见[库存协作](../../../../../../../docs/inventory-extraction-design.md)。

## 采购来源公开能力

ProductionProcurementQuery 是 Procurement 读取和复核正式需求来源的唯一业务入口，不回写需求、关闭状态或履约。按需采购固定一个工单，可以选其多个任务的正式需求；现有库存、分配和已关联采购不是候选门禁，采购数量不分摊成需求履约。

listCandidates 先按有效工单、活动任务、active 且剩余大于零和无在审更正筛选，再通过 Product 可采购资格过滤后计数／分页，支持关键词、工单、任务、物料及需求类型。resolveDemands 最多解析100项并保留输入顺序；历史已结束来源仍返回原身份及当前状态，不存在才为null。requirePurchasableDemands 要求活动事务，按数字ID升序锁工单、任务、需求后复核归属和资格；Product 资格由采购在锁自身根和行后另行核验。

公开结果保留任务／工单状态、需求类型、精确版本、编码、单位、需求量、未领量及供应商提示；物料名称按稳定ID读取当前名称，提示不限制实际供应商。失败使用稳定结果联合，不泄漏内部异常，采购相关单据由 Procurement 自己投影。采购候选必须指定单一工单，任务不得跨工单。

### 研发手工提需与候选

研发物料 options 采用关键词窗口50项并解析最多100个 includeIds，版本通过 Product 启用版本公开能力读取；窗口缺失不等于已选项失效。批量初配完整覆盖BOM，手工additions按物料提交版本拆分和正整数数量。两类命令均 HTTP 幂等。研发 pending 可以首次提需，后续沿活动任务规则；换版另行关闭旧剩余及提新需求，不回写原事实。

## 数据库逐表设计

本章唯一拥有 production_material_requirement_basis、production_manual_demand_addition、production_item_demand、production_item_allocation、production_demand_correction。公共审计与数量规则见[数据库约定](../../../../../../../docs/database-conventions.md)。202611090040 移除旧补产来源、补料及收尾审批引用，需求类型只保留 normal/manual_additional，任务结束使用 task_finished；不转换旧执行历史。

## production_material_requirement_basis

保存批量任务初配时的BOM公式、精确版本及供应商提示。它是不可变配置基础，正式可分配需求仍来自production_item_demand。

每任务每BOM行及每基础物料唯一，版本组合外键保证属于该物料。required_number=单耗×任务计划由应用同事务验证；研发禁止插入。初配完整覆盖BOM后禁止更新或删除。

### 字段

| 字段                               | SQL定义                                       | 含义                                                                |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `id`                               | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，自增                                                          |
| `production_batch_id`              | `bigint unsigned NOT NULL`                    | 生产批次 ID                                                         |
| `product_material_id`              | `bigint unsigned NOT NULL`                    | 冻结的产品 BOM 行                                                   |
| `material_id`                      | `bigint unsigned NOT NULL`                    | 基础物料 ID                                                         |
| `locked_material_variant_id`       | `bigint unsigned NOT NULL`                    | 本任务本物料唯一精确版本                                            |
| `supplier_hint`                    | `varchar(500) DEFAULT NULL`                   | 随初配冻结的供应商或采购要求提示                                    |
| `material_code_snapshot`           | `varchar(100) NOT NULL`                       | 基础物料编码快照                                                    |
| `unit_snapshot`                    | `varchar(20) NOT NULL`                        | BOM 用量单位快照                                                    |
| `quantity_per_unit_snapshot`       | `int NOT NULL`                                | 单件 BOM 用量快照                                                   |
| `planned_output_quantity_snapshot` | `int NOT NULL`                                | 批次计划产量快照                                                    |
| `required_number`                  | `int NOT NULL`                                | 该 BOM 行在本批次的初始应需量，锁定版本的初始正常需求量必须等于此值 |
| `created_by`                       | `bigint unsigned NOT NULL`                    | 确认需求配置并创建基础记录的操作者，引用 `users.id`                 |
| `created_at`                       | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 基础记录创建时间                                                    |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_material_requirement_basis_batch_bom` (`production_batch_id`,`product_material_id`);
UNIQUE KEY `uk_material_requirement_basis_reference` (`id`,`production_batch_id`,`product_material_id`,`material_id`);
UNIQUE KEY `uk_requirement_basis_batch_material` (`production_batch_id`,`material_id`);
UNIQUE KEY `uk_requirement_basis_locked_reference` (`id`,`production_batch_id`,`product_material_id`,`material_id`,`locked_material_variant_id`);
KEY `idx_material_requirement_basis_material` (`material_id`,`production_batch_id`,`id`);
KEY `fk_material_requirement_basis_created_by` (`created_by`);
KEY `fk_material_requirement_basis_bom` (`product_material_id`,`material_id`);
KEY `fk_requirement_basis_locked_variant` (`locked_material_variant_id`,`material_id`);
CONSTRAINT `fk_material_requirement_basis_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_material_requirement_basis_bom` FOREIGN KEY (`product_material_id`, `material_id`) REFERENCES `product_materials` (`id`, `material_id`);
CONSTRAINT `fk_material_requirement_basis_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_material_requirement_basis_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`);
CONSTRAINT `fk_requirement_basis_locked_variant` FOREIGN KEY (`locked_material_variant_id`, `material_id`) REFERENCES `material_variants` (`id`, `material_id`);
CONSTRAINT `chk_integer_storage_production_material_requirement_basis` CHECK (((`quantity_per_unit_snapshot` between 0 and 99999999) and (`planned_output_quantity_snapshot` between 0 and 99999999) and (`required_number` between 0 and 99999999)));
CONSTRAINT `chk_material_requirement_basis_integer` CHECK (((`quantity_per_unit_snapshot` = truncate(`quantity_per_unit_snapshot`,0)) and (`planned_output_quantity_snapshot` = truncate(`planned_output_quantity_snapshot`,0)) and (`required_number` = truncate(`required_number`,0))));
CONSTRAINT `chk_material_requirement_basis_quantity` CHECK (((`quantity_per_unit_snapshot` > 0) and (`planned_output_quantity_snapshot` > 0) and (`required_number` > 0)));
```

数据库触发器：trg_requirement_basis_mass_insert、trg_requirement_basis_immutable_update、trg_requirement_basis_immutable_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_manual_demand_addition

一次人工追加动作的单头，关联任务和必填原因，生成一组正式需求；不表示审批、补料单或对既有需求的改写。

编号唯一；原始动作保留，后续需求更正以独立更正申请及新需求追加，不更新该动作。研发和批量分别遵守本章版本规则。

### 字段

| 字段                  | SQL定义                                       | 含义                 |
| --------------------- | --------------------------------------------- | -------------------- |
| `id`                  | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，自增           |
| `addition_no`         | `varchar(100) NOT NULL`                       | 追加单号，全局唯一   |
| `production_batch_id` | `bigint unsigned NOT NULL`                    | 本次追加所属生产任务 |
| `reason`              | `text NOT NULL`                               | 非空人工追加原因     |
| `created_by`          | `bigint unsigned NOT NULL`                    | 操作人               |
| `created_at`          | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 操作时间             |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_production_manual_demand_addition_no` (`addition_no`);
UNIQUE KEY `uk_production_manual_demand_addition_batch` (`id`,`production_batch_id`);
KEY `idx_manual_demand_addition_batch_created` (`production_batch_id`,`created_at`,`id`);
KEY `fk_manual_demand_addition_created_by` (`created_by`);
CONSTRAINT `fk_manual_demand_addition_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_manual_demand_addition_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_production_manual_demand_addition_reason` CHECK ((char_length(trim(`reason`)) > 0));
```

## production_item_demand

唯一生产需求事实，保存原始数量、精确版本、生成分组及当前剩余和业务生命周期。normal为批量初配，manual_additional为人工提需。

物料和版本组合外键、BOM来源CHECK与插入触发器共同保证批量／研发边界。原始数量和身份不可改，remaining_number仅真实领料扣减；更正通过旧需求关闭和独立替代行表达。生成键和替代唯一键防重；任务结束关闭剩余时close_cause=task_finished，不伪装履约。

### 字段

| 字段                               | SQL定义                                                                   | 含义                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                               | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                                             |
| `production_batch_id`              | `bigint unsigned NOT NULL`                                                | 生产批次 ID，关联 `production_batches.id`                              |
| `requirement_basis_id`             | `bigint unsigned DEFAULT NULL`                                            | 批量冻结的 BOM 基础 ID，研发为空                                       |
| `product_material_id`              | `bigint unsigned DEFAULT NULL`                                            | 批量 BOM 明细，研发为空                                                |
| `item_id`                          | `bigint unsigned NOT NULL`                                                | 需求对象 ID，关联 `materials.id`                                       |
| `material_variant_id`              | `bigint unsigned NOT NULL`                                                | 需求选中的精确物料版本 ID                                              |
| `item_code_snapshot`               | `varchar(100) NOT NULL`                                                   | 生成需求时的物料编码快照                                               |
| `material_variant_code_snapshot`   | `varchar(180) NOT NULL`                                                   | 需求选中的版本编码快照                                                 |
| `supplier_hint`                    | `varchar(500) DEFAULT NULL`                                               | 研发本次需求提示；批量为空，展示读取基础提示                           |
| `quantity_per_unit_snapshot`       | `int DEFAULT NULL`                                                        | 批量 BOM 单件用量快照，研发为空                                        |
| `unit_snapshot`                    | `varchar(20) NOT NULL`                                                    | 生成需求时的用量单位快照                                               |
| `planned_output_quantity_snapshot` | `int DEFAULT NULL`                                                        | 批量计算所用计划产量快照，研发为空                                     |
| `need_number`                      | `int NOT NULL`                                                            | 需求数量                                                               |
| `remaining_number`                 | `bigint NOT NULL`                                                         | 尚未确认领用的整数数量，可从出库事实重建                               |
| `demand_type`                      | `varchar(30) NOT NULL DEFAULT 'normal'`                                   | 需求类型，默认 `normal`                                                |
| `generation_group_key`             | `varchar(150) NOT NULL`                                                   | 同一次需求生成动作的稳定分组键                                         |
| `idempotency_key`                  | `varchar(150) NOT NULL`                                                   | 幂等键，同一键重复提交返回既有结果                                     |
| `manual_addition_id`               | `bigint unsigned DEFAULT NULL`                                            | 人工追加记录 ID；其他类型为空                                          |
| `business_status`                  | `varchar(30) NOT NULL DEFAULT 'active'`                                   | 业务状态，默认 `active`                                                |
| `cancel_source`                    | `varchar(40) DEFAULT NULL`                                                | 仅 `production_batch`，未执行任务取消                                  |
| `cancel_reason`                    | `text`                                                                    | 未执行任务取消原因                                                     |
| `cancelled_by`                     | `bigint unsigned DEFAULT NULL`                                            | 取消操作人                                                             |
| `cancelled_at`                     | `datetime DEFAULT NULL`                                                   | 取消时间                                                               |
| `fulfilled_by`                     | `bigint unsigned DEFAULT NULL`                                            | 最后一笔确认领用操作人；未满足时为空                                   |
| `fulfilled_at`                     | `datetime DEFAULT NULL`                                                   | 需求全部确认领用时间；未满足时为空                                     |
| `version`                          | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                                                 |
| `created_by`                       | `bigint unsigned NOT NULL`                                                | 创建人                                                                 |
| `created_at`                       | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                                               |
| `updated_by`                       | `bigint unsigned NOT NULL`                                                | 最近修改人                                                             |
| `updated_at`                       | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                                           |
| `pending_correction_id`            | `bigint unsigned DEFAULT NULL`                                            | 当前在审申请指针，终态为空                                             |
| `replaces_demand_id`               | `bigint unsigned DEFAULT NULL`                                            | 新需求的直接前驱，永久保留                                             |
| `close_cause`                      | `varchar(30) DEFAULT NULL`                                                | correction_replaced、correction_exhausted、single_close、task_finished |
| `close_reason`                     | `text`                                                                    | 需求关闭说明                                                           |
| `closed_by`                        | `bigint unsigned DEFAULT NULL`                                            | 需求关闭人，关联用户                                                   |
| `closed_at`                        | `datetime DEFAULT NULL`                                                   | 需求关闭时间                                                           |
| `close_correction_id`              | `bigint unsigned DEFAULT NULL`                                            | 正式需求更正关闭的申请依据；任务结束关闭时为空                         |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_production_item_demand_idempotency` (`idempotency_key`);
UNIQUE KEY `uk_production_item_demand_item_reference` (`id`,`item_id`);
UNIQUE KEY `uk_production_item_demand_batch_reference` (`id`,`production_batch_id`);
UNIQUE KEY `uk_production_item_demand_variant_reference` (`id`,`item_id`,`material_variant_id`);
UNIQUE KEY `uk_production_item_demand_group_variant` (`generation_group_key`,`item_id`,`material_variant_id`);
UNIQUE KEY `uk_production_item_demand_parent_reference` (`id`,`production_batch_id`,`product_material_id`,`item_id`);
UNIQUE KEY `uk_production_item_demand_basis_reference` (`id`,`production_batch_id`,`requirement_basis_id`);
UNIQUE KEY `uk_demand_replacement` (`replaces_demand_id`);
KEY `idx_production_item_demand_batch_status` (`production_batch_id`,`business_status`);
KEY `fk_production_item_demand_created_by` (`created_by`);
KEY `fk_production_item_demand_updated_by` (`updated_by`);
KEY `idx_production_item_demand_status_item` (`business_status`,`item_id`,`id`);
KEY `fk_production_item_demand_fulfilled_by` (`fulfilled_by`);
KEY `idx_production_item_demand_cancelled_by` (`cancelled_by`);
KEY `idx_production_item_demand_generation_group` (`production_batch_id`,`generation_group_key`,`id`);
KEY `idx_production_item_demand_manual_addition` (`manual_addition_id`);
KEY `fk_production_item_demand_variant` (`material_variant_id`,`item_id`);
KEY `fk_production_item_demand_item` (`item_id`);
KEY `fk_production_item_demand_manual_addition` (`manual_addition_id`,`production_batch_id`);
KEY `idx_demand_pending` (`pending_correction_id`,`id`);
KEY `idx_demand_close_correction` (`close_correction_id`,`id`);
KEY `fk_demand_closer` (`closed_by`);
KEY `fk_production_item_demand_material` (`product_material_id`,`item_id`);
KEY `fk_production_item_demand_basis` (`requirement_basis_id`,`production_batch_id`,`product_material_id`,`item_id`,`material_variant_id`);
CONSTRAINT `fk_demand_close_correction` FOREIGN KEY (`close_correction_id`, `id`) REFERENCES `production_demand_correction` (`id`, `old_demand_id`);
CONSTRAINT `fk_demand_closer` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_demand_pending_correction` FOREIGN KEY (`pending_correction_id`, `id`) REFERENCES `production_demand_correction` (`id`, `old_demand_id`);
CONSTRAINT `fk_demand_replacement` FOREIGN KEY (`replaces_demand_id`) REFERENCES `production_item_demand` (`id`);
CONSTRAINT `fk_production_item_demand_basis` FOREIGN KEY (`requirement_basis_id`, `production_batch_id`, `product_material_id`, `item_id`, `material_variant_id`) REFERENCES `production_material_requirement_basis` (`id`, `production_batch_id`, `product_material_id`, `material_id`, `locked_material_variant_id`);
CONSTRAINT `fk_production_item_demand_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_production_item_demand_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_item_demand_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_item_demand_fulfilled_by` FOREIGN KEY (`fulfilled_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_item_demand_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`);
CONSTRAINT `fk_production_item_demand_manual_addition` FOREIGN KEY (`manual_addition_id`, `production_batch_id`) REFERENCES `production_manual_demand_addition` (`id`, `production_batch_id`);
CONSTRAINT `fk_production_item_demand_material` FOREIGN KEY (`product_material_id`, `item_id`) REFERENCES `product_materials` (`id`, `material_id`);
CONSTRAINT `fk_production_item_demand_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_item_demand_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);
CONSTRAINT `chk_demand_bom_source` CHECK ((((`requirement_basis_id` is not null) and (`product_material_id` is not null) and (`quantity_per_unit_snapshot` is not null) and (`planned_output_quantity_snapshot` is not null) and (`quantity_per_unit_snapshot` > 0) and (`planned_output_quantity_snapshot` > 0) and (`supplier_hint` is null)) or ((`requirement_basis_id` is null) and (`product_material_id` is null) and (`quantity_per_unit_snapshot` is null) and (`planned_output_quantity_snapshot` is null) and (`demand_type` = 'manual_additional'))));
CONSTRAINT `chk_demand_pending` CHECK (((`pending_correction_id` is null) or (`business_status` = 'active')));
CONSTRAINT `chk_demand_replacement` CHECK (((`replaces_demand_id` is null) or (`demand_type` = 'manual_additional')));
CONSTRAINT `chk_integer_storage_production_item_demand` CHECK (((`quantity_per_unit_snapshot` between 0 and 99999999) and (`planned_output_quantity_snapshot` between 0 and 99999999) and (`need_number` between 0 and 99999999)));
CONSTRAINT `chk_production_item_demand_cancel_facts` CHECK ((((`business_status` = 'cancelled') and (`cancel_source` = 'production_batch') and (`cancel_reason` is not null) and (char_length(trim(`cancel_reason`)) > 0) and (`cancelled_by` is not null) and (`cancelled_at` is not null)) or ((`business_status` <> 'cancelled') and (`cancel_source` is null) and (`cancel_reason` is null) and (`cancelled_by` is null) and (`cancelled_at` is null))));
CONSTRAINT `chk_production_item_demand_generation_group_key` CHECK (((`idempotency_key` like concat(`generation_group_key`,':%')) and (((`demand_type` = 'normal') and (`generation_group_key` like 'NORMAL:%')) or ((`demand_type` = 'manual_additional') and (`generation_group_key` like 'ADDITIONAL:%')))));
CONSTRAINT `chk_production_item_demand_quantities_integer` CHECK (((`quantity_per_unit_snapshot` = truncate(`quantity_per_unit_snapshot`,0)) and (`planned_output_quantity_snapshot` = truncate(`planned_output_quantity_snapshot`,0)) and (`need_number` = truncate(`need_number`,0))));
CONSTRAINT `chk_production_item_demand_quantity` CHECK ((`need_number` > 0));
CONSTRAINT `chk_production_item_demand_remaining` CHECK (((`remaining_number` >= 0) and (`remaining_number` <= `need_number`)));
CONSTRAINT `chk_production_item_demand_status` CHECK ((`business_status` in ('active','fulfilled','cancelled','closed')));
CONSTRAINT `chk_production_item_demand_terminal` CHECK ((((`business_status` = 'active') and (`remaining_number` > 0) and (`fulfilled_by` is null) and (`fulfilled_at` is null)) or ((`business_status` = 'fulfilled') and (`remaining_number` = 0) and (`fulfilled_by` is not null) and (`fulfilled_at` is not null)) or ((`business_status` in ('cancelled','closed')) and (`fulfilled_by` is null) and (`fulfilled_at` is null))));
CONSTRAINT `chk_production_item_demand_type` CHECK ((`demand_type` in ('normal','manual_additional')));
CONSTRAINT `chk_production_item_demand_version` CHECK ((`version` >= 0));
CONSTRAINT `chk_tracking_demand_close` CHECK ((((`business_status` = 'closed') and (`remaining_number` > 0) and (`close_reason` is not null) and (char_length(trim(`close_reason`)) > 0) and (`closed_by` is not null) and (`closed_at` is not null) and (((`close_cause` in ('correction_replaced','correction_exhausted','single_close')) and (`close_correction_id` is not null)) or ((`close_cause` = 'task_finished') and (`close_correction_id` is null)))) or ((`business_status` <> 'closed') and (`close_cause` is null) and (`close_reason` is null) and (`closed_by` is null) and (`closed_at` is null) and (`close_correction_id` is null))));
CONSTRAINT `chk_tracking_demand_source` CHECK ((((`demand_type` = 'normal') and (`manual_addition_id` is null)) or ((`demand_type` = 'manual_additional') and (`manual_addition_id` is not null))));
```

数据库触发器：trg_demand_task_policy_insert、trg_demand_material_facts_update。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_item_allocation

将一条正式需求的精确版本预留到公共库存批次。分配不产生实际出库，剩余可领和可制单量从Inventory事实只读计算。

任务／需求／物料／库批／版本通过组合外键保持同源。有效预留读取排除released/cancelled，释放不回退真实领料。创建、释放和领料确认均按版本及库存当前读核验。

### 字段

| 字段                  | SQL定义                                                                   | 含义                                                                  |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`                  | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                                            |
| `demand_id`           | `bigint unsigned NOT NULL`                                                | 需求 ID，关联 `production_item_demand.id`                             |
| `production_batch_id` | `bigint unsigned NOT NULL`                                                | 生产批次 ID，冗余保存，便于查询和约束                                 |
| `item_id`             | `bigint unsigned NOT NULL`                                                | 库存对象 ID，冗余保存，用于约束需求对象与批次对象一致（materials 表） |
| `material_variant_id` | `bigint unsigned NOT NULL`                                                | 精确物料版本 ID，必须与需求和库存批次一致                             |
| `batch_id`            | `bigint unsigned NOT NULL`                                                | 分配的库存批次 ID，关联 `item_batch.id`                               |
| `assigned_number`     | `int NOT NULL`                                                            | 分配数量                                                              |
| `unit_snapshot`       | `varchar(20) NOT NULL`                                                    | 分配时单位快照                                                        |
| `allocation_status`   | `varchar(30) NOT NULL DEFAULT 'active'`                                   | 分配业务状态，默认 `active`                                           |
| `version`             | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                                                |
| `remark`              | `text`                                                                    | 备注                                                                  |
| `created_by`          | `bigint unsigned DEFAULT NULL`                                            | 创建人                                                                |
| `created_at`          | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                                              |
| `updated_by`          | `bigint unsigned DEFAULT NULL`                                            | 最近修改人                                                            |
| `updated_at`          | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                                          |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_production_item_allocation_id_demand` (`id`,`demand_id`);
UNIQUE KEY `uk_production_item_allocation_id_batch` (`id`,`production_batch_id`);
UNIQUE KEY `uk_production_item_allocation_id_item` (`id`,`item_id`);
UNIQUE KEY `uk_production_item_allocation_reference` (`id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`);
UNIQUE KEY `uk_production_item_allocation_variant_reference` (`id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`);
KEY `idx_production_item_allocation_batch_status` (`production_batch_id`,`allocation_status`);
KEY `idx_production_item_allocation_stock_batch` (`batch_id`,`allocation_status`);
KEY `fk_production_item_allocation_demand_batch` (`demand_id`,`production_batch_id`);
KEY `fk_production_item_allocation_created_by` (`created_by`);
KEY `fk_production_item_allocation_updated_by` (`updated_by`);
KEY `fk_production_item_allocation_demand_variant` (`demand_id`,`item_id`,`material_variant_id`);
KEY `fk_production_item_allocation_batch_variant` (`batch_id`,`item_id`,`material_variant_id`);
CONSTRAINT `fk_production_item_allocation_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`);
CONSTRAINT `fk_production_item_allocation_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_item_allocation_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`);
CONSTRAINT `fk_production_item_allocation_demand_item` FOREIGN KEY (`demand_id`, `item_id`) REFERENCES `production_item_demand` (`id`, `item_id`);
CONSTRAINT `fk_production_item_allocation_demand_variant` FOREIGN KEY (`demand_id`, `item_id`, `material_variant_id`) REFERENCES `production_item_demand` (`id`, `item_id`, `material_variant_id`);
CONSTRAINT `fk_production_item_allocation_stock_batch` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`);
CONSTRAINT `fk_production_item_allocation_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_integer_storage_production_item_allocation` CHECK ((`assigned_number` between 0 and 99999999));
CONSTRAINT `chk_production_item_allocation_quantity` CHECK ((`assigned_number` > 0));
CONSTRAINT `chk_production_item_allocation_quantity_integer` CHECK ((`assigned_number` = truncate(`assigned_number`,0)));
CONSTRAINT `chk_production_item_allocation_status` CHECK ((`allocation_status` in ('active','released','cancelled','frozen','abnormal')));
CONSTRAINT `chk_production_item_allocation_version` CHECK ((`version` >= 0));
```

## production_demand_correction

保存人工追加需求的一次数量更正或剩余关闭申请、不可变审批证据和生效关系。旧需求不改量，批准后指向可空的新剩余需求。

active_slot生成列限制同旧需求仅一份未结束申请；申请、继任需求及审批身份各有唯一约束。CHECK保护目标不低于链上已领、新剩余公式及生效字段组合；审批最终批准与Writer、预留释放和审计同事务提交。

### 字段

| 字段                     | SQL定义                                                                                      | 含义                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `id`                     | `bigint unsigned NOT NULL AUTO_INCREMENT`                                                    | 主键，自增                                                        |
| `old_demand_id`          | `bigint unsigned NOT NULL`                                                                   | 本次被更正的原需求                                                |
| `production_batch_id`    | `bigint unsigned NOT NULL`                                                                   | 原需求所属任务                                                    |
| `correction_kind`        | `varchar(20) NOT NULL`                                                                       | quantity更正累计总量，close关闭人工追加需求的剩余                 |
| `target_total_quantity`  | `bigint unsigned NOT NULL`                                                                   | 更正后的目标总量，不小于替代链已领量                              |
| `issued_quantity`        | `bigint unsigned NOT NULL`                                                                   | 替代链累计实际已领量                                              |
| `old_remaining_quantity` | `bigint unsigned NOT NULL`                                                                   | 更正前的正剩余量                                                  |
| `new_remaining_quantity` | `bigint unsigned NOT NULL`                                                                   | 目标总量减替代链已领量                                            |
| `reason`                 | `text NOT NULL`                                                                              | 更正／关闭说明                                                    |
| `evidence`               | `json NOT NULL`                                                                              | 冻结的来源、需求链、预留及真实领退料／损耗事实                    |
| `evidence_hash`          | `char(64) NOT NULL`                                                                          | 冻结证据的 SHA-256 核对指纹                                       |
| `approval_instance_id`   | `bigint unsigned DEFAULT NULL`                                                               | 一次申请对应一次审批                                              |
| `new_demand_id`          | `bigint unsigned DEFAULT NULL`                                                               | 有剩余时的唯一后继                                                |
| `applied_by`             | `bigint unsigned DEFAULT NULL`                                                               | 实际生效人，未生效时为空                                          |
| `applied_at`             | `datetime DEFAULT NULL`                                                                      | 实际生效时间，未生效时为空                                        |
| `ended_at`               | `datetime DEFAULT NULL`                                                                      | 申请结束时间，驳回／撤回也填写                                    |
| `active_slot`            | `tinyint GENERATED ALWAYS AS ((case when (`ended_at` is null) then 1 else NULL end)) STORED` | ended_at 为空时为 1，UNIQUE(old_demand_id,active_slot) 防冲突申请 |
| `created_by`             | `bigint unsigned NOT NULL`                                                                   | 创建人                                                            |
| `created_at`             | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                                                | 创建时间                                                          |
| `updated_by`             | `bigint unsigned DEFAULT NULL`                                                               | 最近修改人                                                        |
| `updated_at`             | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                    | 最近修改时间                                                      |
| `version`                | `int NOT NULL DEFAULT '0'`                                                                   | 乐观锁版本                                                        |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_correction_reference` (`id`,`old_demand_id`);
UNIQUE KEY `uk_correction_active` (`old_demand_id`,`active_slot`);
UNIQUE KEY `uk_correction_approval` (`approval_instance_id`);
UNIQUE KEY `uk_correction_successor` (`new_demand_id`);
KEY `idx_correction_batch` (`production_batch_id`,`id`);
KEY `fk_correction_demand` (`old_demand_id`,`production_batch_id`);
KEY `fk_correction_successor` (`new_demand_id`,`production_batch_id`);
KEY `fk_correction_creator` (`created_by`);
KEY `fk_correction_updater` (`updated_by`);
KEY `fk_correction_applier` (`applied_by`);
CONSTRAINT `fk_correction_applier` FOREIGN KEY (`applied_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_correction_approval` FOREIGN KEY (`approval_instance_id`) REFERENCES `approval_instances` (`id`);
CONSTRAINT `fk_correction_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_correction_demand` FOREIGN KEY (`old_demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`);
CONSTRAINT `fk_correction_successor` FOREIGN KEY (`new_demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`);
CONSTRAINT `fk_correction_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_correction_effect` CHECK ((((`applied_at` is null) and (`applied_by` is null) and (`new_demand_id` is null)) or ((`applied_at` is not null) and (`applied_by` is not null) and (`ended_at` is not null) and (`approval_instance_id` is not null) and (((`new_remaining_quantity` = 0) and (`new_demand_id` is null)) or ((`new_remaining_quantity` > 0) and (`new_demand_id` is not null))))));
CONSTRAINT `chk_correction_kind` CHECK ((`correction_kind` in ('quantity','close')));
CONSTRAINT `chk_correction_quantities` CHECK (((`target_total_quantity` <= 99999999) and (`old_remaining_quantity` > 0) and (`target_total_quantity` >= `issued_quantity`) and (`new_remaining_quantity` = (`target_total_quantity` - `issued_quantity`)) and ((`correction_kind` <> 'close') or (`new_remaining_quantity` = 0))));
CONSTRAINT `chk_correction_reason` CHECK ((char_length(trim(`reason`)) > 0));
CONSTRAINT `chk_correction_version` CHECK ((`version` >= 0));
```
