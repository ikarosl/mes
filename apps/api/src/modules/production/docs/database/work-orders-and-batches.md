# 工单与生产任务

工单表示一项成品生产计划，任务将该计划拆成可独立用料和执行的工作。工单与任务分别按[统一编号](../../../../../docs/business-numbering.md)生成不可修改的编号；创建要求 Idempotency-Key。字段、数量、时间和审计遵守[数据库公共规则](../../../../../../../docs/database-conventions.md)。

## 工单类型与物料版本规则

批量工单和研发工单共用计划与负责人规则，下达后类型固定。批量任务必须显式选择 Product 当前启用路线，且成品 BOM 已批准并永久锁定；任务创建冻结路线、工序及 SOP，不从默认路线或首条候选猜选。研发只要求有效自制成品，不读取 BOM、不选择路线、不创建工序。

批量任务初配完整覆盖 BOM，每种基础物料在本任务只选一个精确版本，单耗乘任务计划量形成初始需求；确认后的需求基础及供应商提示冻结。后续人工追加仍使用原基础及版本，不同任务可以独立选版。研发每次手工提需明确有效物料、版本、正整数数量和可选供应商提示，不保存 BOM 基础。供应商提示仅供采购参考，不限制实际供应商。更多用料须独立人工提需，不由异常或损耗自动生成。

创建任务仅允许 released/doing 工单。任务计划加已有非取消任务计划不得超过工单计划量；人工结束的任务仍占用原计划，取消任务释放计划额度。任务计划日期必须在工单日期范围内，创建后不可改计划数量或替换冻结路线。当前路线后来停用不改写历史任务，也不阻止对 pending 任务编辑负责人、日期和备注。

## 研发轮次关联与资料带出

研发工单可在创建时关联一个前序研发工单，之后永久不变。前序必须为 completed/closed 的研发工单，新轮成品须与前序不同；不能自指，外键和不可变触发器保护关系。一个前序可有多个后续方向，不建立项目、轮次计数或成功／失败状态。

下一轮可以预填可编辑的计划量、负责人、客户、质量等级、外部订单号和备注，成品与计划日期须重新选择。只关联来源，不复制需求、分配、任务、库存、报工、BOM 批准或产出事实；新成品沿 Product 正常建立。列表及详情返回直接前序和后续引用，允许逐轮追溯，取消后保留来源。

## 工单负责人候选与历史展示

工单负责人使用 Identity 受控场景 production.work_order_owner，任务负责人使用独立场景 production.task_owner。角色配置和资格规则由[Identity](../../../identity/docs/user-candidates.md)唯一拥有；无配置或无有效角色默认无候选，不回退到管理员、当前用户、通用目录或其他场景。

工单草稿允许暂缺负责人；非空时创建及编辑均在写事务内复核保留的最终负责人，下达要求非空且当前合格。下达后不提供负责人转交。任务创建必须选合格负责人，编辑只允许 pending，不能清空，未改负责人也重新复核；其他任务命令不因候选配置后来变化自动改派。

工单和任务 owner-options 分别固定上述场景，返回完整 UserOption[]、不分页或截断，仅接受本场景消费权限：工单页 production:orders:view，任务页 production:tasks:view。历史姓名通过 Identity 历史引用批量解析，停用或软删除不抹去历史显示；无法解析或未选择时为空。负责人仍是管理账号身份，与现场人员目录的扫码登记人分别建模。

创建在幂等首次执行事务内锁工单根后核验人员与产品资格；编辑先锁根再复核最终人员。成功重放保存原响应及姓名，不因后来资格变化失败。

## 生产工单状态与管理动作

工单保持 draft/released/doing/completed/cancelled/closed。草稿可编辑、取消或直接下达；取消须原因且尚无任务。首次任务实际开始同事务把 released 工单推进 doing，创建任务和物料分配不表示开工。

管理员显式确认工单完工时，事务核验所有非取消任务均已 completed，且最终确认可用产出合计不少于工单计划，才进入 completed；超计划产出如实计入，不拆计划内外类型。数量不足时可以先结束所有任务，再填写原因提前关闭工单；没有任务或只有取消任务也可按未生产关闭。completed 后关闭属于归档。

下达后不再允许取消。提前关闭不得自动结束或取消任务，存在未结束任务即返回摘要要求先办理。close_type 只区分 unproduced、underproduced、completed_archive；关闭／取消原因、账号、时间和版本同事务保存，不覆盖原 remark，也不从操作日志还原业务事实。

## 生产任务状态与查询

任务准备阶段为 pending、material_pending、material_assigned、material_partially_outbound、material_outbound；明确开始后 doing，人工结束后 completed，未执行取消后 cancelled。材料阶段只表达安排和实际领料进度，不代表现场库存；doing 后领料不回退准备阶段。

[开始与结束](production-termination.md)维护开工前提、短产／零产、提前结束及原子收口。任务不按数量自动完成，不再进入收尾审批状态。取消仅用于未开始且未实际领料的任务；当前读摘要和提交均校验需求更正在途、待领料单和真实领料，不能由前端状态绕过。

任务与工单 finalOutput 都从不可变 production_tracking_output 汇总，库存后续调整不回写。任务返回 availableQuantity、confirmedOutputCount；无确认事实为 0 和 0，显式零产出则数量仍为 0、确认笔数大于 0。工单另返回已结束任务数和计划缺口，缺口允许负值表示超产。工序交接历史按站表达，不汇总成第二份任务产出。

任务列表分页；详情、首次开工记录、取消影响摘要和追踪工作台按用途读取，不在概览中携带全部卡或事实。查询和命令结构以[contracts](../../../../../../../packages/contracts/src/production/index.ts)为准。

GET /production/batches 同时服务任务页、现场工作台和追踪卡页的任务定位，按 production:tasks:view、production:workbench:view、production:tracking:view 任一权限放行。该列表不携带负责人候选或可变业务明细，不授予任务详情、编辑、开始、结束或建卡权限，各命令继续独立鉴权。

## 工单审批接入目标结构（尚未实施）

[ADR-0006](../../../../../../../docs/adr/0006-approval-workflow-boundaries.md)中工单下达审批的未来范围保留，当前仍直接下达。拟新增可空 release_approval_instance_id 并复用工单 version：draft 且关联申请时禁止普通编辑、取消和直通下达，驳回／撤回清空当前关联并递增版本；最终批准保留依据并进入 released。

送审需冻结全部可编辑工单资料，包括成品身份、数量、客户、质量要求、日期、负责人和备注。最终批准在同事务核对当前关联、申请结果、冻结版本和成品资格，不能替换受审身份。下达审批不要求 BOM 已批准，批量任务创建仍独立核验 BOM 与路线；接入时须关闭平行直通入口。目标约束需追加 migration，并明确已有工单批准依据的处理，不伪造历史审批。

## 数据库逐表设计

本章唯一拥有 work_orders 和 production_batches 的结构；冻结工序及每盘事实见[追踪卡](execution-traceability-quality.md)。基线保持不变，实验增量 202611090010/0040 追加任务结束原因、移除旧执行完成阶段并收窄终态。实验不转换旧生产历史，降级恢复配套备份。

## work_orders

维护成品生产计划、批量或研发类型、管理负责人、计划日期、下达和关闭事实；不缓存实际产出。前序研发关系在创建后永久不变。

工单按显式命令转态，草稿可编辑；下达后产品快照和类型固定。编号与研发前序关系由触发器保护，前序只能指向既有研发工单。负责人当前资格由Identity公开能力在同事务核验；实际产出由production_tracking_output只读汇总。

### 字段

| 字段                         | SQL定义                                                                   | 含义                                                             |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                         | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                                       |
| `work_order_no`              | `varchar(100) NOT NULL`                                                   | 工单编号                                                         |
| `order_type`                 | `varchar(30) NOT NULL`                                                    | 必填：`mass_production` 批量生产、`research` 研发任务            |
| `previous_research_order_id` | `bigint unsigned DEFAULT NULL`                                            | 前序研发工单，可空；仅新建时关联，之后不可改                     |
| `product_id`                 | `bigint unsigned NOT NULL`                                                | 计划生产对象 ID                                                  |
| `product_code_snapshot`      | `varchar(100) NOT NULL`                                                   | 下达时产品编码快照                                               |
| `product_name_snapshot`      | `varchar(200) NOT NULL`                                                   | 下达时产品名称快照                                               |
| `unit_snapshot`              | `varchar(20) NOT NULL`                                                    | 下达时单位快照                                                   |
| `planned_quantity`           | `int NOT NULL`                                                            | 工单计划生产数量                                                 |
| `customer_name`              | `varchar(255) DEFAULT NULL`                                               | 客户名称，可为空                                                 |
| `quality_level`              | `varchar(50) DEFAULT NULL`                                                | 客户自定义质量等级代码，可为空                                   |
| `work_order_owner_id`        | `bigint unsigned DEFAULT NULL`                                            | 工单负责人；草稿可为空，下达必须符合工单负责人场景资格           |
| `plan_start_date`            | `date DEFAULT NULL`                                                       | 计划开始日期，可为空                                             |
| `plan_end_date`              | `date DEFAULT NULL`                                                       | 计划完工日期，可为空                                             |
| `status`                     | `varchar(30) NOT NULL DEFAULT 'draft'`                                    | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at`                | `datetime DEFAULT NULL`                                                   | 下达时间                                                         |
| `cancel_reason`              | `text`                                                                    | 草稿工单取消原因；历史未记录数据可为空                           |
| `cancelled_by`               | `bigint unsigned DEFAULT NULL`                                            | 草稿工单取消人；历史未记录数据可为空                             |
| `cancelled_at`               | `datetime DEFAULT NULL`                                                   | 草稿工单取消时间；历史未记录数据可为空                           |
| `close_type`                 | `varchar(30) DEFAULT NULL`                                                | `unproduced`、`underproduced`、`completed_archive`               |
| `close_reason`               | `text`                                                                    | 提前关闭原因；正常完工归档及历史未记录数据可为空                 |
| `closed_by`                  | `bigint unsigned DEFAULT NULL`                                            | 关闭人；历史未记录数据可为空                                     |
| `closed_at`                  | `datetime DEFAULT NULL`                                                   | 关闭时间；历史未记录数据可为空                                   |
| `external_order_no`          | `varchar(100) DEFAULT NULL`                                               | 外部订单号，可为空                                               |
| `remark`                     | `text`                                                                    | 备注                                                             |
| `version`                    | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                                           |
| `created_by`                 | `bigint unsigned DEFAULT NULL`                                            | 创建人                                                           |
| `created_at`                 | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                                         |
| `updated_by`                 | `bigint unsigned DEFAULT NULL`                                            | 最近修改人                                                       |
| `updated_at`                 | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                                     |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_work_orders_no` (`work_order_no`);
UNIQUE KEY `uk_work_orders_product_reference` (`id`,`product_id`);
KEY `idx_work_orders_status_created_at` (`status`,`created_at`);
KEY `idx_work_orders_owner_status_created_at` (`work_order_owner_id`,`status`,`created_at`);
KEY `idx_work_orders_plan_start_date` (`plan_start_date`);
KEY `fk_work_orders_product` (`product_id`);
KEY `fk_work_orders_created_by` (`created_by`);
KEY `fk_work_orders_updated_by` (`updated_by`);
KEY `idx_work_orders_external_order_no` (`external_order_no`);
KEY `idx_work_orders_cancelled_by` (`cancelled_by`);
KEY `idx_work_orders_closed_by` (`closed_by`);
KEY `idx_work_orders_previous_research` (`previous_research_order_id`,`id`);
CONSTRAINT `fk_work_orders_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_work_orders_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_work_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_work_orders_owner` FOREIGN KEY (`work_order_owner_id`) REFERENCES `users` (`id`);
CONSTRAINT `fk_work_orders_previous_research` FOREIGN KEY (`previous_research_order_id`) REFERENCES `work_orders` (`id`);
CONSTRAINT `fk_work_orders_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);
CONSTRAINT `fk_work_orders_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_integer_storage_work_orders` CHECK ((`planned_quantity` between 0 and 99999999));
CONSTRAINT `chk_work_orders_close_type` CHECK (((`close_type` is null) or (`close_type` in ('unproduced','underproduced','completed_archive'))));
CONSTRAINT `chk_work_orders_plan_dates` CHECK (((`plan_start_date` is null) or (`plan_end_date` is null) or (`plan_end_date` >= `plan_start_date`)));
CONSTRAINT `chk_work_orders_quantity` CHECK ((`planned_quantity` > 0));
CONSTRAINT `chk_work_orders_quantity_integer` CHECK ((`planned_quantity` = truncate(`planned_quantity`,0)));
CONSTRAINT `chk_work_orders_research_lineage_type` CHECK (((`previous_research_order_id` is null) or (`order_type` = 'research')));
CONSTRAINT `chk_work_orders_status` CHECK ((`status` in ('draft','released','doing','completed','cancelled','closed')));
CONSTRAINT `chk_work_orders_type` CHECK ((`order_type` in ('mass_production','research')));
CONSTRAINT `chk_work_orders_version` CHECK ((`version` >= 0));
```

数据库触发器：trg_work_orders_reject_released_type_update、trg_work_orders_reject_number_update、trg_work_orders_reject_research_lineage_update、trg_work_orders_reject_self_research。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_batches

将工单计划拆为任务，保存冻结路线身份、负责人、计划、首次开始快照及人工结束原因。任务不保存执行数量或实际产出累计。

同工单／产品组合外键保证来源；uk_tracking_batch_source供最终产出保持三者一致。完成并不表示足量，开始／结束和物料收口由应用事务完成。finish_reason与completed状态由CHECK绑定。

### 字段

| 字段                      | SQL定义                                                                   | 含义                                                               |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                                         |
| `work_order_id`           | `bigint unsigned NOT NULL`                                                | 工单 ID                                                            |
| `product_id`              | `bigint unsigned NOT NULL`                                                | 冗余产品 ID，与工单组合外键约束                                    |
| `batch_no`                | `varchar(100) NOT NULL`                                                   | 生产批号                                                           |
| `route_id`                | `bigint unsigned DEFAULT NULL`                                            | 工艺路线 ID，可为空                                                |
| `route_code_snapshot`     | `varchar(64) DEFAULT NULL`                                                | 路线编码快照                                                       |
| `route_version_snapshot`  | `varchar(64) DEFAULT NULL`                                                | 路线版本快照                                                       |
| `planned_quantity`        | `int NOT NULL`                                                            | 本批次计划生产数量                                                 |
| `plan_start_date`         | `date DEFAULT NULL`                                                       | 本批次计划开始日期，可为空                                         |
| `plan_end_date`           | `date DEFAULT NULL`                                                       | 本批次计划完工日期，可为空                                         |
| `started_at`              | `datetime DEFAULT NULL`                                                   | 首次管理员任务开工时间；之后永久保留                               |
| `started_by`              | `bigint unsigned DEFAULT NULL`                                            | 首次任务开工人，FK 用户                                            |
| `start_reason`            | `text`                                                                    | 开工说明；存在活动需求领料缺口时必填                               |
| `start_material_snapshot` | `json DEFAULT NULL`                                                       | 首次开工锁内读取的需求与领料缺口快照，仅提示和追溯，不形成产能额度 |
| `completed_at`            | `datetime DEFAULT NULL`                                                   | 人工结束任务时间，尚未结束为空                                     |
| `completed_by`            | `bigint unsigned DEFAULT NULL`                                            | 完工确认人，可为空                                                 |
| `cancel_reason`           | `text`                                                                    | 取消原因；历史未记录数据可为空                                     |
| `cancelled_by`            | `bigint unsigned DEFAULT NULL`                                            | 取消人；历史未记录数据可为空                                       |
| `cancelled_at`            | `datetime DEFAULT NULL`                                                   | 取消时间；历史未记录数据可为空                                     |
| `status`                  | `varchar(40) NOT NULL DEFAULT 'pending'`                                  | 生产批次状态                                                       |
| `batch_owner_id`          | `bigint unsigned DEFAULT NULL`                                            | 任务负责人；新建及编辑必须符合任务负责人场景资格，历史记录可为空   |
| `remark`                  | `text`                                                                    | 备注                                                               |
| `version`                 | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                                             |
| `created_by`              | `bigint unsigned DEFAULT NULL`                                            | 创建人                                                             |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                                           |
| `updated_by`              | `bigint unsigned DEFAULT NULL`                                            | 最近修改人                                                         |
| `updated_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                                       |
| `finish_reason`           | `text`                                                                    | 人工结束任务原因；completed状态必须非空且去空白后有内容            |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_production_batches_no` (`batch_no`);
UNIQUE KEY `uk_production_batches_work_order_reference` (`id`,`work_order_id`);
UNIQUE KEY `uk_production_batches_product_reference` (`id`,`product_id`);
UNIQUE KEY `uk_tracking_batch_source` (`id`,`work_order_id`,`product_id`);
KEY `idx_production_batches_work_order_status` (`work_order_id`,`status`);
KEY `fk_production_batches_work_order_product` (`work_order_id`,`product_id`);
KEY `fk_production_batches_route` (`route_id`);
KEY `fk_production_batches_owner` (`batch_owner_id`);
KEY `fk_production_batches_completed_by` (`completed_by`);
KEY `fk_production_batches_created_by` (`created_by`);
KEY `fk_production_batches_updated_by` (`updated_by`);
KEY `idx_production_batches_plan_start_date` (`plan_start_date`);
KEY `idx_production_batches_cancelled_by` (`cancelled_by`);
KEY `fk_production_batch_started_by` (`started_by`);
CONSTRAINT `fk_production_batch_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_batches_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_production_batches_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_batches_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_batches_owner` FOREIGN KEY (`batch_owner_id`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_batches_route` FOREIGN KEY (`route_id`) REFERENCES `process_routes` (`id`);
CONSTRAINT `fk_production_batches_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_production_batches_work_order_product` FOREIGN KEY (`work_order_id`, `product_id`) REFERENCES `work_orders` (`id`, `product_id`);
CONSTRAINT `chk_integer_storage_production_batches` CHECK ((`planned_quantity` between 0 and 99999999));
CONSTRAINT `chk_production_batch_start_facts` CHECK ((((`started_at` is null) and (`started_by` is null) and (`start_reason` is null) and (`start_material_snapshot` is null)) or ((`started_at` is not null) and (`started_by` is not null) and (`start_material_snapshot` is not null) and ((`start_reason` is null) or (char_length(trim(`start_reason`)) > 0)))));
CONSTRAINT `chk_production_batches_completed` CHECK (((`status` <> 'completed') or ((`completed_at` is not null) and (`completed_by` is not null))));
CONSTRAINT `chk_production_batches_plan_dates` CHECK (((`plan_start_date` is null) or (`plan_end_date` is null) or (`plan_end_date` >= `plan_start_date`)));
CONSTRAINT `chk_production_batches_quantities_integer` CHECK ((`planned_quantity` = truncate(`planned_quantity`,0)));
CONSTRAINT `chk_production_batches_quantity` CHECK ((`planned_quantity` > 0));
CONSTRAINT `chk_production_batches_status` CHECK ((`status` in ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled')));
CONSTRAINT `chk_production_batches_version` CHECK ((`version` >= 0));
CONSTRAINT `chk_tracking_task_finish` CHECK ((((`status` = 'completed') and (`finish_reason` is not null) and (char_length(trim(`finish_reason`)) > 0)) or ((`status` <> 'completed') and (`finish_reason` is null))));
```
