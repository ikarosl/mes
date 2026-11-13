# 追踪卡、工序交接与最终产出

Production 以任务下的追踪卡表示一盘实物。卡、到站、交接报工、随盘异常和最终确认产出由本模块唯一拥有；实际库存只由 [Inventory](../../../inventory/docs/database.md) 记账。工单及任务生命周期见[工单与任务](work-orders-and-batches.md)和[任务开始与结束](production-termination.md)。

## 执行身份与顺序

批量任务创建时冻结所选路线的工序顺序、编码、名称及 SOP。工序定义本身不再拥有派工、开工、完工或数量状态，每张卡分别流转。中间的检验工序与普通工序采用相同扫码操作；路线最后一道工序统一承担最终产出确认，不设置另一套成品检验轮次。

扫码输入是卡号、目标工序和现场登记人员。人员来自 Identity 的统一现场人员目录，扫码、报工、异常及最终产出确认均使用当前启用且未删除的人员，资格由[人员目录](../../../identity/docs/database.md#110-personnel)所有。业务事实保存所选人员 ID、编码、姓名快照，并独立保存实际登录操作者。

任务必须先由有权限的账号明确开始，只有 doing 批量任务可以建卡。卡首次只能扫路线首站，只形成到站事实，不计报工。下一站扫码须恰好是冻结路线的下一道工序，在同一事务中完成前站交接报工并登记本站到站；前站报工数量取交接时的当前剩余盘量，归属前站原登记人员，不归属本次扫码人员。已到过的工序再次扫码不重记到站、不重记数量、不换登记人员。未经过的工序不得跳站，不能用工序名称替代冻结工序 ID。

每站到站身份永久保留；交接完成时间、操作者和数量只允许由空值写入一次。任务级报工总量不作为最终产出，工作台逐站汇总已完成交接事实。

## 盘量更正与作废

建卡数量为正整数。非终态且当前盘量为正时，可按卡版本更正为另一正整数，必须填写原因并追加更正前量、新量、操作人和时间。手工盘量更正是独立纠错，不能代替异常报废结算；更正影响后续交接和最终确认，已完成站点的报工快照保持原值，不能静默覆盖。

盘量为正的未用卡和已用卡均可填写原因作废；已用卡保留到站、报工、异常和更正历史。作废停止后续流转，不冲销此前交接事实。已确认产出的卡只可通过未入库产出撤销恢复终检办理；整盘报废不恢复。已入库后的库存补差由 Inventory 独立业务处理，不回写原盘产出。

## 随盘异常

同一异常模型覆盖普通工序、中间检查、随机抽检和终检发现。登记包含卡、涉及工序、影响数量、说明、所选现场人员和实际操作者；影响数量必须是正整数且不超过登记时的当前盘量。省略涉及工序时采用当前站；显式指定的工序必须是本卡已经到站或经过的冻结工序，支持终检发现前道问题。尚未到站的卡可以登记不带工序的一般异常。

全部未处理异常均阻止整盘向后流转，`isPaused` 由是否存在 open 异常推导。每条异常只允许一次最终结算，保存处理说明、人员、操作者、时间和数量结果，不记录返修过程或多次处理。结算满足：返修数量 + 本次新增报废数量 + 各关联已有报废数量 = 原异常影响数量；返修与本次新增报废数量之和不得超过当前剩余盘量。只有本次新增报废扣减卡量，返修不加量，关联已有报废不再次扣量。

已有报废只可引用同一卡其他异常已完成结算中实际新增报废大于零的 handling。一次结算中同一 handling 只能出现一次，引用数量不得超过该来源实际新增报废数量，不允许自引、跨卡或引用仅有关联而无新增报废的处理。同一来源允许被不同异常各自引用，不跨异常累计消耗引用额度；这表达人工判断的实物重叠，系统不声称自动按单件去重。

异常和卡在同一事务锁定，异常 version 防止并发覆盖，唯一键限制一次处理；处理事实、引用、盘量扣减、状态、卡版本和成功审计原子提交。原始发现不可改写，open 只允许转为 resolved，不恢复。重复提交由幂等结果重放或已结状态拒绝保护，不会再次扣量。写后详情采用当前读，避免等锁后把新卡量与旧异常快照混合返回。

卡量扣为零但仍有 open 异常时，保留原 unused 或 in_progress 状态和当前位置，仅允许继续完成异常结算；此时只能关联已有报废等不增加新增处置数量的结果，不能扫码、改量、作废或新增异常。零量且全部异常已处理时自动转为 scrapped（整盘报废）终态，不生成产出、入库或末站完成事实；此前到站、报工及人员历史全部保留。任务结束也不能绕过零量未结卡。

卡最终确认前必须处理全部未完成异常。异常结算不自动创建返工单、补产授权、物料需求或审批；实际需要更多物料时按[需求规则](demand-allocation-and-outbound.md)另行提需。产品新增报废由本节结算表达，与已领物料损耗分开。

## 末站最终确认与入库

末站扫码仍只登记到站并完成前站交接，不自动确认产出。登记现场人员并显式确认完成，批量卡请求不接受最终数量；服务器使用锁定后的当前剩余盘量生成一次最终产出。实际盘量错误须先独立留痕更正，质量损失须先按异常结算。整盘报废不走最终产出确认。

确认命令在卡版本锁内复核任务仍在执行、卡位于冻结末站、全部异常已处理，并通过 Identity 公开能力核验所选人员当前启用且未删除。登录账号还必须独立具备最终确认权限，选择登记人员不授予业务权限。

确认事实写入 `production_tracking_output`；末站完成事实、卡 completed 状态及成功审计同事务提交，正数进入待入库，暂不创建库存单据或批次。工单及任务只汇总未撤销产出，不受计划量限制，不读取库存余额或后续调整作为产出依据。人工合批入库见[成品入库](finished-goods-inbound.md)。

研发任务不建追踪卡、路线或到站记录，在任务级登记现场人员、手填实际产出，可分多次确认。每次记录独立，允许零；正数待入库，零数不生成库存。`tracking_card_id` 为空，不设每任务一次的限制。

尚未入库的有效产出可填写原因撤销；命令在任务、卡及产出锁内核验没有实际入库，追加不可变撤销事实，不改原产出。批量卡回到末站 in_progress，原到站及首次末站完成快照保留；再次确认产生新产出，不能改写旧交接记录。已结束任务须先恢复执行；所属工单已终态时不再撤销生产事实。撤销与入库共享来源锁，二者互斥。

| 卡状态转换                     | 触发与边界                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| unused → in_progress           | 首站扫码，只记到站                                             |
| in_progress → in_progress      | 无 open 异常时按冻结顺序交接到下一站                           |
| unused／in_progress → 原状态   | 登记异常、独立改量、结算后仍有正量或零量未结异常；均推进卡版本 |
| unused／in_progress → scrapped | 结算后卡量为零且无 open 异常                                   |
| in_progress → completed        | 已到末站、无 open 异常、正量，登记现场人员并显式确认           |
| unused／in_progress → voided   | 正量卡明确作废，保留全部已形成事实；任务结束不自动作废         |
| completed → in_progress        | 未入库产出明确撤销，保留原末站到站与完成快照                   |

completed 仅可通过未入库产出撤销恢复；scrapped、voided 不恢复。scrapped 卡拒绝再次扫码，包括已到站的重复扫码。

## HTTP、权限与并发边界

请求和响应结构以 [tracking-card.ts](../../../../../../../packages/contracts/src/production/tracking-card.ts) 及 [class DTO](../../presentation/http/dto/production-tracking.dto.ts) 为准。异常详情返回单个 `handling|null`，关联只含来源 handlingId 和数量；终检的批量与研发输入分别建模。所有新写命令要求 Idempotency-Key，完整语义 path 和规范化 body 参与指纹，成功结果完整重放；scope 由[模块契约](../../application/idempotency/production-idempotency-scopes.contract.ts)唯一维护，沿用平台至少保证窗口。同键重放不重复审计、产出或库存。

| 接口                                                                                                                  | 权限与合法消费者                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| GET tracking-cards、tracking-cards/:cardId                                                                            | tracking:view 或 workbench:view；卡列表、追踪详情和工作台       |
| GET batches/:batchId/tracking-workbench                                                                               | tasks:view、tracking:view 或 workbench:view；任务内工作台和卡页 |
| GET tracking-reports                                                                                                  | tracking:view 或 workbench:view；逐站交接历史                   |
| POST batches/:batchId/tracking-cards、PATCH tracking-cards/:cardId/quantity、POST tracking-cards/:cardId/actions/void | tracking:manage；建卡、留痕更正和作废                           |
| POST tracking-cards/scan、卡下 abnormalities 和 abnormality handlings                                                 | workbench:operate；现场到站、异常发现及处理                     |
| POST tracking-cards/:cardId/actions/confirm-output、batches/:batchId/actions/confirm-research-output                  | tracking:confirm-output；登记现场人员并显式确认最终产出         |
| GET batches/:batchId/step-records/:recordId/sop                                                                       | tasks:view、tracking:view 或 workbench:view；冻结 SOP 下载      |

上表权限均带 production 前缀，多项为 any-of。卡列表的 keyword 搜索卡号、任务号、工单号、成品编码或名称；精确筛选包括任务、卡状态、当前工序及是否具有指定状态的异常。交接历史按完成时间、ID 倒序分页，可按任务、工序和登记人员筛选。列表筛选不授予任何命令资格。

命令按工单 → 任务 → 卡 → 现场人员资格及相关事实 → Inventory 所需库存对象锁定，共享同池事务。实际命令重新校验状态和版本，扫码用每卡每站唯一约束和卡根锁防重；不能依赖浏览器缓存。展示读取仅访问本模块表，不通过人员当前姓名覆盖历史快照。标签由管理端从真实卡号生成，不把条码解析为新的业务身份。

## 数据库逐表设计

本章是冻结工序与追踪事实表的唯一结构所有者。数量、ID、时间和审计列遵守[数据库公共规则](../../../../../../../docs/database-conventions.md)。迁移新增表为 `202611090010-production-tracking-workbench`，旧执行退役及不可变触发器为 `202611090040-retire-production-execution`，数量结算及关联事实为 `202611090060-tracking-abnormality-disposition`；均为追加，旧基线不改写。结构升级不转换旧报工、产出或无法推导影响数量的异常；0060 在任何追踪卡、追踪事实或研发产出非空时于 DDL 前拒绝，必须使用独立空库。0060 的配对 down 同样只允许追踪子系统为空；已有事实须恢复配套备份，不自动丢弃或重造。

## batch_step_records

仅保存创建批量任务时冻结的路线工序及SOP快照。每张卡独立流转，本表不承担派工、工序状态或数量。

一任务同一路线步骤唯一，id+production_batch_id供追踪事实组合引用。actual_sop_*仅表示创建时显式覆盖；下载优先该快照，否则使用默认SOP快照。当前主数据变化不回写历史。

### 字段

| 字段                             | SQL定义                                                                   | 含义                                                 |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                             | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                           |
| `production_batch_id`            | `bigint unsigned NOT NULL`                                                | 生产批次 ID                                          |
| `route_step_id`                  | `bigint unsigned NOT NULL`                                                | 路线步骤 ID                                          |
| `step_order_snapshot`            | `int NOT NULL`                                                            | 工序顺序快照                                         |
| `step_code_snapshot`             | `varchar(100) NOT NULL`                                                   | 工序编码快照                                         |
| `step_name_snapshot`             | `varchar(100) NOT NULL`                                                   | 工序名称快照                                         |
| `sop_file_id_snapshot`           | `bigint unsigned DEFAULT NULL`                                            | 路线默认 SOP 文件 ID 快照，可为空                    |
| `sop_file_name_snapshot`         | `varchar(255) DEFAULT NULL`                                               | 路线默认 SOP 文件名快照                              |
| `sop_object_key_snapshot`        | `varchar(500) DEFAULT NULL`                                               | 路线默认 SOP 对象键快照                              |
| `sop_version_no_snapshot`        | `varchar(64) DEFAULT NULL`                                                | 路线默认 SOP 版本号快照                              |
| `actual_sop_file_id`             | `bigint unsigned DEFAULT NULL`                                            | 创建任务时显式覆盖的 SOP 文件 ID；为空时使用默认快照 |
| `actual_sop_file_name_snapshot`  | `varchar(255) DEFAULT NULL`                                               | 创建任务时覆盖的 SOP 文件名快照                      |
| `actual_sop_object_key_snapshot` | `varchar(500) DEFAULT NULL`                                               | 创建任务时覆盖的 SOP 对象键快照                      |
| `actual_sop_version_no_snapshot` | `varchar(64) DEFAULT NULL`                                                | 创建任务时覆盖的 SOP 版本号快照                      |
| `unit_snapshot`                  | `varchar(20) NOT NULL`                                                    | 该任务逐站交接数量的单位快照                         |
| `remark`                         | `text`                                                                    | 冻结工序备注，不是单盘交接事实                       |
| `version`                        | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                               |
| `created_by`                     | `bigint unsigned DEFAULT NULL`                                            | 创建人                                               |
| `created_at`                     | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                             |
| `updated_by`                     | `bigint unsigned DEFAULT NULL`                                            | 最近修改人                                           |
| `updated_at`                     | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                         |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_batch_step_records_route_step` (`production_batch_id`,`route_step_id`);
UNIQUE KEY `uk_batch_step_records_id_batch` (`id`,`production_batch_id`);
KEY `fk_batch_step_records_route_step` (`route_step_id`);
KEY `fk_batch_step_records_sop` (`sop_file_id_snapshot`);
KEY `fk_batch_step_records_created_by` (`created_by`);
KEY `fk_batch_step_records_updated_by` (`updated_by`);
KEY `idx_batch_step_records_actual_sop` (`actual_sop_file_id`);
CONSTRAINT `fk_batch_step_records_actual_sop` FOREIGN KEY (`actual_sop_file_id`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_batch_step_records_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_batch_step_records_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_batch_step_records_route_step` FOREIGN KEY (`route_step_id`) REFERENCES `process_route_steps` (`id`);
CONSTRAINT `fk_batch_step_records_sop` FOREIGN KEY (`sop_file_id_snapshot`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_batch_step_records_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_batch_step_records_order` CHECK ((`step_order_snapshot` > 0));
CONSTRAINT `chk_batch_step_records_version` CHECK ((`version` >= 0));
```

## production_tracking_card

表示任务下一盘实物的稳定执行身份，维护当前剩余盘量、当前位置、五种状态和作废信息；历史事实另行追加。

卡号永久唯一；复合来源键供到站、异常和最终产出引用。completed 和 scrapped 卡不可再修改，后者数量必须为零；completed、voided 数量保持正数。unused、in_progress 的零量只用于等待剩余异常结算，由事务保证其 open 异常与最终状态一致。当前指针和盘量由卡根锁串行推进，已用卡不可删除。

### 字段

| 字段                      | SQL定义                                                                   | 含义                                                        |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，数据库自增                                            |
| `production_batch_id`     | `bigint unsigned NOT NULL`                                                | 所属生产任务；与其他来源ID通过组合外键保持同源              |
| `card_no`                 | `varchar(100) NOT NULL`                                                   | 不可修改、永久唯一的服务端追踪卡号                          |
| `quantity`                | `int NOT NULL`                                                            | 当前剩余盘量；建卡正数，结算可扣为零                        |
| `status`                  | `varchar(20) NOT NULL DEFAULT 'unused'`                                   | 本表的封闭业务状态，值域由下方CHECK限定，转换由应用命令校验 |
| `current_step_record_id`  | `bigint unsigned DEFAULT NULL`                                            | 当前到站工序，未到站为空；不替代不可变到站历史              |
| `personnel_id`            | `bigint unsigned NOT NULL`                                                | 登记时选择的现场人员ID，不是登录账号                        |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员编码快照                                      |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员姓名快照                                      |
| `remark`                  | `text`                                                                    | 原始备注，与后续处理或作废说明分别保存                      |
| `void_reason`             | `text`                                                                    | 作废原因；仅voided状态存在                                  |
| `voided_by`               | `bigint unsigned DEFAULT NULL`                                            | 执行作废命令的登录账号                                      |
| `voided_at`               | `datetime DEFAULT NULL`                                                   | 作废时间                                                    |
| `version`                 | `int NOT NULL DEFAULT '0'`                                                | 可变业务单据的乐观版本号，每次合法命令递增                  |
| `created_by`              | `bigint unsigned NOT NULL`                                                | 实际登录操作者，引用users.id                                |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 事实或单据创建时间，北京时间                                |
| `updated_by`              | `bigint unsigned NOT NULL`                                                | 最近一次合法命令的登录操作者                                |
| `updated_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间，北京时间，由数据库维护                        |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_card_no` (`card_no`);
UNIQUE KEY `uk_tracking_card_batch` (`id`,`production_batch_id`);
KEY `idx_tracking_card_batch_status` (`production_batch_id`,`status`,`created_at`,`id`);
KEY `fk_tracking_card_step` (`current_step_record_id`,`production_batch_id`);
KEY `fk_tracking_card_personnel` (`personnel_id`);
KEY `fk_tracking_card_created_by` (`created_by`);
KEY `fk_tracking_card_updated_by` (`updated_by`);
KEY `fk_tracking_card_voided_by` (`voided_by`);
CONSTRAINT `fk_tracking_card_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_tracking_card_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_card_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_card_step` FOREIGN KEY (`current_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_card_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_card_voided_by` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_tracking_card_quantity` CHECK ((`quantity` between 0 and 99999999));
CONSTRAINT `chk_tracking_card_status` CHECK ((`status` in ('unused','in_progress','completed','scrapped','voided')));
CONSTRAINT `chk_tracking_card_scrapped` CHECK (status<>'scrapped' OR quantity=0);
CONSTRAINT `chk_tracking_card_terminal_quantity` CHECK (status NOT IN ('completed','voided') OR quantity>0);
CONSTRAINT `chk_tracking_card_version` CHECK ((`version` >= 0));
CONSTRAINT `chk_tracking_card_void` CHECK ((((`status` = 'voided') and (`void_reason` is not null) and (`voided_by` is not null) and (`voided_at` is not null)) or ((`status` <> 'voided') and (`void_reason` is null) and (`voided_by` is null) and (`voided_at` is null))));
```

数据库触发器：trg_tracking_card_output_guard 在 202611090060 扩展为保护 completed 和 scrapped 不再更新，并始终保护卡号、任务及建卡身份；trg_tracking_card_used_no_delete 拒绝删除已用卡。跨行异常状态与卡量一致性由命令事务保证。

## production_tracking_visit

保存每卡每站的一次到站及至多一次交接完成。登记人员为到站时所选人员，后续扫码只补完工事实，不替换人员。

uk_tracking_visit_card_step防重复扫码。任务和工序组合外键保证同源；CHECK限制到站未完成和已完成字段组合。完成从空写入一次；完成数量与盘量后续更正相互独立。报告索引用于任务／工序和人员的时间分页。

### 字段

| 字段                      | SQL定义                                       | 含义                                                 |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                                     |
| `tracking_card_id`        | `bigint unsigned NOT NULL`                    | 所属追踪卡，必填；研发不建立到站事实                 |
| `production_batch_id`     | `bigint unsigned NOT NULL`                    | 所属生产任务；与其他来源ID通过组合外键保持同源       |
| `batch_step_record_id`    | `bigint unsigned NOT NULL`                    | 涉及的任务冻结工序，组合外键保证属于同一任务         |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号                 |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                               |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                               |
| `arrived_by`              | `bigint unsigned NOT NULL`                    | 登记该次到站的实际登录账号                           |
| `arrived_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 首次到站时间，之后不覆盖                             |
| `completed_by`            | `bigint unsigned DEFAULT NULL`                | 完成交接或末站确认的实际登录账号，未完成为空         |
| `completed_at`            | `datetime DEFAULT NULL`                       | 交接或末站完成时间，未完成为空                       |
| `reported_quantity`       | `int DEFAULT NULL`                            | 完成该站时的当前盘量快照，未完成为空，后续改量不回写 |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_visit_card_step` (`tracking_card_id`,`batch_step_record_id`);
KEY `idx_tracking_visit_report` (`production_batch_id`,`batch_step_record_id`,`completed_at`,`id`);
KEY `idx_tracking_visit_personnel` (`personnel_id`,`completed_at`,`id`);
KEY `fk_tracking_visit_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_visit_step` (`batch_step_record_id`,`production_batch_id`);
KEY `fk_tracking_visit_arrived_by` (`arrived_by`);
KEY `fk_tracking_visit_completed_by` (`completed_by`);
CONSTRAINT `fk_tracking_visit_arrived_by` FOREIGN KEY (`arrived_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_visit_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_visit_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_visit_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_visit_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `chk_tracking_visit_completion` CHECK ((((`completed_at` is null) and (`completed_by` is null) and (`reported_quantity` is null)) or ((`completed_at` is not null) and (`completed_by` is not null) and (`reported_quantity` between 1 and 99999999))));
```

数据库触发器：trg_tracking_visit_no_delete、trg_tracking_visit_complete_once。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_quantity_change

每次改量追加更正前量、新量、原因、账号和时间，保留实际盘量更正依据。

仅追加，不更新或删除。数量正整数且必须改变；卡量更新、历史、版本和审计同事务提交，CHECK不能替代这一原子性。

### 字段

| 字段                | SQL定义                                       | 含义                                     |
| ------------------- | --------------------------------------------- | ---------------------------------------- |
| `id`                | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                         |
| `tracking_card_id`  | `bigint unsigned NOT NULL`                    | 所属追踪卡，必填；研发不建立盘量更正事实 |
| `previous_quantity` | `int NOT NULL`                                | 更正前的盘量快照                         |
| `quantity`          | `int NOT NULL`                                | 该卡当前盘量或本次更正后的盘量，正整数   |
| `reason`            | `text NOT NULL`                               | 必须保留的更正原因                       |
| `created_by`        | `bigint unsigned NOT NULL`                    | 实际登录操作者，引用users.id             |
| `created_at`        | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 事实或单据创建时间，北京时间             |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_quantity_card` (`tracking_card_id`,`id`);
KEY `fk_tracking_quantity_actor` (`created_by`);
CONSTRAINT `fk_tracking_quantity_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_quantity_card` FOREIGN KEY (`tracking_card_id`) REFERENCES `production_tracking_card` (`id`);
CONSTRAINT `chk_tracking_quantity_next` CHECK (((`quantity` between 1 and 99999999) and (`quantity` <> `previous_quantity`)));
CONSTRAINT `chk_tracking_quantity_previous` CHECK ((`previous_quantity` between 1 and 99999999));
```

数据库触发器：trg_tracking_quantity_no_update、trg_tracking_quantity_no_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_abnormality

统一保存随盘发现、涉及工序、影响数量、原始说明和处理状态。原始发现与一次最终结算分表，避免处理覆盖发现。

卡和涉及工序以同任务组合外键保证归属。涉及站必须由应用核验本卡已到站；省略时取当前站。解决状态和时间成组，版本保护处理并发；卡根锁保护扫码、异常和最终确认之间的竞态。

### 字段

| 字段                      | SQL定义                                                                   | 含义                                                        |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，数据库自增                                            |
| `tracking_card_id`        | `bigint unsigned NOT NULL`                                                | 所属追踪卡，必填；研发不建立随盘异常                        |
| `production_batch_id`     | `bigint unsigned NOT NULL`                                                | 所属生产任务；与其他来源ID通过组合外键保持同源              |
| `batch_step_record_id`    | `bigint unsigned DEFAULT NULL`                                            | 涉及的任务冻结工序，组合外键保证属于同一任务                |
| `affected_quantity`       | `int NOT NULL`                                                            | 登记时影响数量，正整数且锁内不得超过当时盘量                |
| `status`                  | `varchar(20) NOT NULL DEFAULT 'open'`                                     | 本表的封闭业务状态，值域由下方CHECK限定，转换由应用命令校验 |
| `description`             | `text NOT NULL`                                                           | 原始异常发现说明，不由处理记录覆盖                          |
| `personnel_id`            | `bigint unsigned NOT NULL`                                                | 登记时选择的现场人员ID，不是登录账号                        |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员编码快照                                      |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员姓名快照                                      |
| `resolved_at`             | `datetime DEFAULT NULL`                                                   | 明确完成处理的时间，open状态为空                            |
| `version`                 | `int NOT NULL DEFAULT '0'`                                                | 可变业务单据的乐观版本号，每次合法命令递增                  |
| `created_by`              | `bigint unsigned NOT NULL`                                                | 实际登录操作者，引用users.id                                |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 事实或单据创建时间，北京时间                                |
| `updated_by`              | `bigint unsigned NOT NULL`                                                | 最近一次合法命令的登录操作者                                |
| `updated_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间，北京时间，由数据库维护                        |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_abnormality_card_status` (`tracking_card_id`,`status`,`id`);
KEY `fk_tracking_abnormality_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_abnormality_step` (`batch_step_record_id`,`production_batch_id`);
KEY `fk_tracking_abnormality_personnel` (`personnel_id`);
KEY `fk_tracking_abnormality_created_by` (`created_by`);
KEY `fk_tracking_abnormality_updated_by` (`updated_by`);
CONSTRAINT `fk_tracking_abnormality_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_abnormality_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_abnormality_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_abnormality_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_abnormality_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_tracking_abnormality_resolution` CHECK ((((`status` = 'open') and (`resolved_at` is null)) or ((`status` = 'resolved') and (`resolved_at` is not null))));
CONSTRAINT `chk_tracking_abnormality_affected` CHECK (affected_quantity BETWEEN 1 AND 99999999);
CONSTRAINT `chk_tracking_abnormality_status` CHECK ((`status` in ('open','resolved')));
CONSTRAINT `chk_tracking_abnormality_version` CHECK ((`version` >= 0));
```

202611090060 的 trg_tracking_abnormality_resolve_once 只允许 open → resolved、resolved_at 非空及 version 恰好加一，并保护原始发现、数量、人员、工序与来源身份。最终状态不可再改；一次结算的存在性及数量关系仍由事务与 handling 唯一键共同保证。

## production_tracking_abnormality_handling

保存某异常唯一的一次最终结算、人员快照、返修和新增报废数量，以及扣减前后卡量快照。关联已有报废另由下表逐来源记录。

仅追加，不更新或删除，abnormality_id 唯一。处理事实与原异常转态、异常和卡版本、扣量、引用及成功审计同事务提交。数据库检查数量范围、扣减恒等式及新增处置不超过扣减前卡量；跨表影响数量总和、来源资格与逐来源上限由卡锁内命令保证，不累计消耗其他异常的引用额度。

### 字段

| 字段                      | SQL定义                                       | 含义                                   |
| ------------------------- | --------------------------------------------- | -------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                       |
| `abnormality_id`          | `bigint unsigned NOT NULL`                    | 所属原始异常；处理记录追加于此ID       |
| `content`                 | `text NOT NULL`                               | 本次处理说明，不覆盖原始发现或之前处理 |
| `repaired_quantity`       | `int NOT NULL`                                | 返修数量，不增加卡量                   |
| `scrapped_quantity`       | `int NOT NULL`                                | 本次实际新增报废，唯一扣减卡量的部分   |
| `previous_card_quantity`  | `int NOT NULL`                                | 本次处理前锁定的剩余盘量               |
| `remaining_card_quantity` | `int NOT NULL`                                | 本次处理后盘量，等于前量减新增报废     |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号   |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                 |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                 |
| `created_by`              | `bigint unsigned NOT NULL`                    | 实际登录操作者，引用users.id           |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 事实或单据创建时间，北京时间           |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_handling_abnormality` (`abnormality_id`);
KEY `fk_tracking_handling_personnel` (`personnel_id`);
KEY `fk_tracking_handling_actor` (`created_by`);
CONSTRAINT `fk_tracking_handling_abnormality` FOREIGN KEY (`abnormality_id`) REFERENCES `production_tracking_abnormality` (`id`);
CONSTRAINT `fk_tracking_handling_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_handling_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `chk_tracking_handling_quantities` CHECK (repaired_quantity BETWEEN 0 AND 99999999 AND scrapped_quantity BETWEEN 0 AND 99999999);
CONSTRAINT `chk_tracking_handling_card_quantities` CHECK (previous_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity=previous_card_quantity-scrapped_quantity AND repaired_quantity+scrapped_quantity<=previous_card_quantity);
```

数据库触发器：trg_tracking_handling_no_update、trg_tracking_handling_no_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_scrap_reference

保存某次最终结算对同卡其他 handling 新增报废的数量归因；这是不可变关联事实，不是报废余额或再次扣量记录。同一来源可以出现在不同异常的处理下，复合主键只限制同次处理不重复。来源同卡、属于其他异常、已 resolved、实际新增报废为正且单次引用不超来源数量，由锁卡后的命令校验；不建立跨异常总消耗上限。

### 字段

| 字段                     | SQL定义                                       | 含义                                       |
| ------------------------ | --------------------------------------------- | ------------------------------------------ |
| `handling_id`            | `bigint unsigned NOT NULL`                    | 本次异常最终结算ID，与来源组成主键         |
| `referenced_handling_id` | `bigint unsigned NOT NULL`                    | 其他异常已完成结算的新增报废来源ID         |
| `quantity`               | `int NOT NULL`                                | 本次归因数量，正整数，不扣卡量             |
| `created_at`             | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联事实建立时间；操作者沿所属handling追溯 |

### 约束与索引

```sql
PRIMARY KEY (handling_id,referenced_handling_id);
KEY idx_tracking_scrap_reference_source (referenced_handling_id);
CONSTRAINT fk_tracking_scrap_reference_handling FOREIGN KEY (handling_id) REFERENCES production_tracking_abnormality_handling(id);
CONSTRAINT fk_tracking_scrap_reference_source FOREIGN KEY (referenced_handling_id) REFERENCES production_tracking_abnormality_handling(id);
CONSTRAINT chk_tracking_scrap_reference_quantity CHECK (quantity BETWEEN 1 AND 99999999);
CONSTRAINT chk_tracking_scrap_reference_other CHECK (handling_id<>referenced_handling_id);
```

表与 trg_tracking_scrap_reference_no_update、trg_tracking_scrap_reference_no_delete 由 202611090060 新增。引用记录仅随最终结算同事务追加，不修改、删除或转移来源；普通下游查询不取得写入资格。

## production_tracking_output

不可变产出确认事实。批量同一卡最多一条未撤销产出，数量等于锁定卡的正数剩余量；研发同任务可多笔，手填实际数量且允许0。正数待人工入库，整盘报废不建立本表记录。

组合外键保证任务、工单、成品及卡归属一致。202611120010 移除旧卡唯一键、研发唯一键和 research_batch_id 生成列，保留原 fk_tracking_output_card 卡／任务索引支持历史查询；有效产出唯一性由任务／卡锁及插入守卫核验，撤销后允许再次确认。末站、异常清零、人员资格及当前剩余盘量由命令复核。Inventory 使用本表 ID 追溯整笔原始入库，后续库存调整不能改写本表。

### 字段

| 字段                      | SQL定义                                       | 含义                                                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                                       |
| `production_batch_id`     | `bigint unsigned NOT NULL`                    | 所属生产任务；与其他来源ID通过组合外键保持同源         |
| `tracking_card_id`        | `bigint unsigned DEFAULT NULL`                | 所属追踪卡，批量事实使用该ID；研发最终产出允许为空     |
| `work_order_id`           | `bigint unsigned NOT NULL`                    | 所属任务的工单ID，组合外键保证与任务及成品同源         |
| `product_id`              | `bigint unsigned NOT NULL`                    | 最终产出的成品ID，固定沿所属任务和工单，不接受自由拼接 |
| `quantity`                | `int NOT NULL`                                | 显式确认的最终可用产出，允许0，不是交接报工累计        |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号                   |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                                 |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                                 |
| `confirmed_by`            | `bigint unsigned NOT NULL`                    | 执行最终产出确认的登录账号                             |
| `confirmed_at`            | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 最终确认时间，不可改写                                 |
| `remark`                  | `text`                                        | 原始备注，与后续处理或作废说明分别保存                 |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_output_work_order` (`work_order_id`,`confirmed_at`,`id`);
KEY `idx_tracking_output_batch` (`production_batch_id`,`confirmed_at`,`id`);
KEY `fk_tracking_output_batch` (`production_batch_id`,`work_order_id`,`product_id`);
KEY `fk_tracking_output_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_output_personnel` (`personnel_id`);
KEY `fk_tracking_output_actor` (`confirmed_by`);
CONSTRAINT `fk_tracking_output_actor` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_output_batch` FOREIGN KEY (`production_batch_id`, `work_order_id`, `product_id`) REFERENCES `production_batches` (`id`, `work_order_id`, `product_id`);
CONSTRAINT `fk_tracking_output_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_output_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `chk_tracking_output_quantity` CHECK ((`quantity` between 0 and 99999999));
```

数据库触发器：trg_tracking_output_insert_guard、trg_tracking_output_no_update、trg_tracking_output_no_delete。插入守卫核验执行中任务、末站剩余量及当前有效产出唯一性；原确认内容保持不可变。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_output_cancellation

追加产出撤销事实，保留原确认内容，避免用更新或删除抹去历史。每条产出最多撤销一次；取消后不恢复原记录，需要重新确认。生产产出统计排除此表引用的记录。

| 字段                 | SQL 定义                                    | 含义                                                 |
| -------------------- | ------------------------------------------- | ---------------------------------------------------- |
| id                   | BIGINT UNSIGNED NOT NULL AUTO_INCREMENT     | 主键                                                 |
| production_output_id | BIGINT UNSIGNED NOT NULL                    | 被撤销的产出，唯一引用 production_tracking_output.id |
| reason               | TEXT NOT NULL                               | 必填非空白原因                                       |
| created_by           | BIGINT UNSIGNED NOT NULL                    | 实际操作者，引用 users.id                            |
| created_at           | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 撤销时间                                             |

由 202611120010 新建。主键 id，production_output_id 唯一；产出和账号外键均 RESTRICT，created_by 具有外键支撑索引，chk_tracking_output_cancellation_reason 限制去除空白后的原因长度为 1–5000。插入守卫取得来源任务／卡／产出锁并拒绝已经关联入库明细的产出；更新和删除触发器拒绝改写。恢复卡状态、撤销、任务版本及成功审计同事务提交，不创建库存反向流水。
