# Production 工单与批次数据库设计

## 3.2 生产执行表

---

### 4. `work_orders`

职责：维护生产工单，记录某个产品的整体生产计划。

| 字段                    | 类型              | 说明                                                             |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                       |
| `work_order_no`         | `VARCHAR(100)`    | 工单编号                                                         |
| `product_id`            | `BIGINT UNSIGNED` | 计划生产对象 ID                                                  |
| `product_code_snapshot` | `VARCHAR(100)`    | 下达时产品编码快照                                               |
| `product_name_snapshot` | `VARCHAR(200)`    | 下达时产品名称快照                                               |
| `unit_snapshot`         | `VARCHAR(20)`     | 下达时单位快照                                                   |
| `planned_quantity`      | `DECIMAL(12,4)`   | 工单计划生产数量                                                 |
| `customer_name`         | `VARCHAR(255)`    | 客户名称，可为空                                                 |
| `quality_level`         | `VARCHAR(50)`     | 客户自定义质量等级代码，可为空                                   |
| `work_order_owner_id`   | `BIGINT UNSIGNED` | 工单负责人，负责整体计划协调，可为空                             |
| `plan_start_date`       | `DATE`            | 计划开始日期，可为空                                             |
| `plan_end_date`         | `DATE`            | 计划完工日期，可为空                                             |
| `status`                | `VARCHAR(30)`     | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at`           | `DATETIME`        | 下达时间                                                         |
| `cancel_reason`         | `TEXT`            | 草稿工单取消原因；历史未记录数据可为空                           |
| `cancelled_by`          | `BIGINT UNSIGNED` | 草稿工单取消人；历史未记录数据可为空                             |
| `cancelled_at`          | `DATETIME`        | 草稿工单取消时间；历史未记录数据可为空                           |
| `close_type`            | `VARCHAR(30)`     | `unproduced`、`underproduced`、`completed_archive`               |
| `close_reason`          | `TEXT`            | 提前关闭原因；正常完工归档及历史未记录数据可为空                 |
| `closed_by`             | `BIGINT UNSIGNED` | 关闭人；历史未记录数据可为空                                     |
| `closed_at`             | `DATETIME`        | 关闭时间；历史未记录数据可为空                                   |
| `external_order_no`     | `VARCHAR(100)`    | 外部订单号，可为空                                               |
| `remark`                | `TEXT`            | 备注                                                             |
| `version`               | `INT`             | 乐观锁版本号，默认 `0`                                           |
| 业务审计字段            | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (work_order_no)`
- 组合引用索引：`UNIQUE (id, product_id)`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`work_order_owner_id -> users.id`
- 外键：`cancelled_by -> users.id`、`closed_by -> users.id`，删除用户引用时置空
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed'))`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 索引：`INDEX (external_order_no)`
- 索引：`INDEX (work_order_owner_id, status, created_at)`
- 索引：`INDEX (plan_start_date)`
- 组合索引：`INDEX (status, created_at)`，用于工单状态分页

说明：

- 工单表示整体生产计划。
- 一个工单可以拆分为多个生产批次。
- 工单处于 `released` 或 `doing` 且仍有未分配计划量时均可继续创建生产批次；首批次开工不冻结工单剩余任务拆分能力。
- 生产领料、生产入库、半成品入库等动作建议落到 `production_batches` 维度。
- 产品快照在工单下达时冻结，后续修改产品主数据不得回写历史工单。
- `quality_level` 是客户自定义等级，不建立固定状态字典或 `CHECK`；如后续需要客户级等级主数据，必须另行建模，不能把自由文本解释为质量结论。
- 工单实际开工时间不单独持久化，由所属批次的最早 `started_at` 推导；工单实际完工时间由已完工批次的 `completed_at` 汇总，避免形成第二执行事实来源。

当前采用单一 BOM 模型，不建设 BOM 版本头、版本行或当前版本指针。产品首次创建生产任务时，在任务创建事务内写入 `products.bom_locked_at/bom_locked_by`；此后 `product_materials` 永久只读。任务取消、需求完成、库存归零和路线状态变化都不能解锁。原则性用料变化必须创建新产品和新编码，再显式复制、复核 BOM 与路线。产品名称等展示字段修改不改变稳定产品身份，也不破坏既有 ID 引用。

#### 生产工单状态与管理动作

生产工单的成功完工不由生产批次自动回写。管理员必须通过显式“确认工单完工”命令复核工单计划量、非取消批次、批次完成量及未结束批次后，再把工单转为 `completed`。管理端确认不替代后端事务校验。

| 当前状态 | 管理动作 | 后端规则与目标状态 |
| --- | --- | --- |
| `draft` | 取消工单 | 尚未下达且没有执行事实时允许；必须填写原因，直接进入 `cancelled` |
| `draft` | 下达工单 | 冻结下达快照并进入 `released` |
| `released` | 首个生产批次实际开工 | 与批次开工同事务进入 `doing`；创建或分配批次本身不代表开工 |
| `released` / `doing` | 确认工单完工 | 所有非取消批次均为 `completed`，且其 `completed_quantity` 合计等于工单 `planned_quantity` 时，管理员二次确认后进入 `completed` |
| `released` / `doing` | 提前关闭工单 | 不存在未终态批次时允许进入 `closed`；必须填写关闭原因。没有批次或只有已取消批次属于未生产结案，已完成量小于计划量属于不足量结案 |
| `released` / `doing` | 提前关闭工单但存在未终态批次 | 拒绝并返回未处理批次摘要；管理员须先逐批完成或取消。生产批次没有 `closed` 状态，提示语固定为“请先完成或取消所有未结束生产批次” |
| `completed` | 关闭工单 | 作为成功完工后的行政归档进入 `closed` |

补充规则：

- “取消”只表达从未下达的草稿作废；工单一经下达，提前终止统一使用“关闭”，不得再执行 `released/doing -> cancelled`。
- `completed` 表达生产计划足量完成，`closed` 同时覆盖成功完工后的归档以及下达后的提前结案；查询直接使用 `close_type` 区分，不得把提前关闭展示为正常完工。
- 提前关闭不得自动取消生产批次。存在未终态批次时返回批次编号、状态、计划量和完成量，由管理员逐批核对后执行合法的批次完成或取消命令。
- 草稿取消、提前关闭和完工后归档均提交工单 `version`；终态类型、原因、操作人、操作时间与状态在业务主表同一条更新中写入，并与成功操作日志同事务提交。`operation_logs` 只承担审计和排障，不作为工单详情的业务事实查询来源，也不复用 `remark` 覆盖原备注。

---

### 5. `production_batches`

职责：维护生产批次，表示某个工单被拆分后的实际生产批次。

| 字段                     | 类型              | 说明                            |
| ------------------------ | ----------------- | ------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，生产批次 ID               |
| `work_order_id`          | `BIGINT UNSIGNED` | 工单 ID                         |
| `product_id`             | `BIGINT UNSIGNED` | 冗余产品 ID，与工单组合外键约束 |
| `batch_no`               | `VARCHAR(100)`    | 生产批号                        |
| `route_id`               | `BIGINT UNSIGNED` | 工艺路线 ID，可为空             |
| `route_code_snapshot`    | `VARCHAR(64)`     | 路线编码快照                    |
| `route_version_snapshot` | `VARCHAR(64)`     | 路线版本快照                    |
| `planned_quantity`       | `DECIMAL(12,4)`   | 本批次计划生产数量              |
| `completed_quantity`     | `DECIMAL(12,4)`   | 生产执行完成数量，默认 `0`；批次完工时由服务端从报工事实推导 |
| `qualified_quantity`     | `DECIMAL(12,4)`   | 最终合格数量，默认 `0`          |
| `plan_start_date`        | `DATE`            | 本批次计划开始日期，可为空        |
| `plan_end_date`          | `DATE`            | 本批次计划完工日期，可为空        |
| `started_at`              | `DATETIME`        | 批次实际开工时间，可为空        |
| `completed_at`           | `DATETIME`        | 完工确认时间，可为空            |
| `completed_by`           | `BIGINT UNSIGNED` | 完工确认人，可为空              |
| `cancel_reason`          | `TEXT`            | 取消原因；历史未记录数据可为空  |
| `cancelled_by`           | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空    |
| `cancelled_at`           | `DATETIME`        | 取消时间；历史未记录数据可为空  |
| `status`                 | `VARCHAR(40)`     | 生产批次状态                    |
| `material_plan_version`  | `INT UNSIGNED`    | 当前整组物料需求计划版本，默认 `1`；用于判断短批授权是否过期 |
| `batch_owner_id`         | `BIGINT UNSIGNED` | 批次负责人，负责该批次执行，可为空 |
| `remark`                 | `TEXT`            | 备注                            |
| `version`                | `INT`             | 乐观锁版本号，默认 `0`          |
| 业务审计字段             | 见统一规则        | 可变业务单据审计字段            |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id)`
- 外键：`FOREIGN KEY (route_id) REFERENCES process_routes(id)`
- 外键：`FOREIGN KEY (batch_owner_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (completed_by) REFERENCES users(id)`
- 外键：`cancelled_by -> users.id`，删除用户引用时置空
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (completed_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity <= completed_quantity)`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 检查约束：`CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))`
- 唯一约束：`UNIQUE (batch_no)`；批次号在全系统范围内唯一，自动编号与手动输入均由后端校验
- 组合引用索引：`UNIQUE (id, work_order_id)`、`UNIQUE (id, product_id)`
- 检查约束：`CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_partially_outbound', 'material_outbound', 'doing', 'completed', 'cancelled'))`
- 检查约束：`CHECK (material_plan_version > 0)`
- 组合索引：`INDEX (work_order_id, status)`，用于按工单查询有效生产批次
- 索引：`INDEX (plan_start_date)`，用于生产排程与按计划开工日筛选

状态说明：

| 状态                | 含义                   |
| ------------------- | ---------------------- |
| `pending`           | 待开始                 |
| `material_pending`  | 待生成或待确认物料需求 |
| `material_assigned` | 物料已分配             |
| `material_partially_outbound` | 已确认一部分领料，但仍有活动物料需求 |
| `material_outbound` | 物料已领料出库         |
| `doing`             | 生产中                 |
| `completed`         | 生产完成               |
| `cancelled`         | 已取消                 |

任务生成与取消规则：

- 创建生产批次只接受 `released`、`doing` 工单，并在事务内重新汇总非取消批次计划量；本次新增后不得超过工单计划量。创建批次本身不推动工单进入 `doing`。
- `pending` 只允许在创建批次时由数据库默认值产生，已有批次不得迁回 `pending`。释放尚未出库的有效分配后，如果批次不再齐套，允许 `material_assigned → material_pending`；这不是重新开放正常需求生成。
- 所有 `production_batches.status` 和 `work_orders.status` 写入都必须先通过 `production-status.policy.ts` 的统一转换校验；SQL 中的旧状态条件和乐观锁只用于防并发覆盖，不能替代领域校验。
- 第一版生产批次没有 `closed` 状态，管理动作统一称为“取消任务”。只允许 `pending`、`material_pending`、`material_assigned` 取消，即任务尚未开工且物料尚未实际出库；`material_partially_outbound` 已形成库存事实，不能取消。
- 取消前管理端必须读取服务端实时影响摘要，展示将取消的待确认出库单、有效预留和活动需求数量，并要求填写取消原因；提交事务仍须重新锁定批次及相关单据校验，不能信任前端摘要。
- 取消事务把 `pending_picking` 待出库单转为 `cancelled`、把活动分配转为 `cancelled` 以释放库存预留、把活动需求转为 `cancelled`，最后把生产批次状态、取消原因、取消人和取消时间同一条更新写入；这些写入和成功审计同事务提交，不生成 `inventory_transaction`。
- `material_partially_outbound`、`material_outbound`、`doing`、`completed` 明令禁止取消。只要存在已确认出库事实，即使批次状态异常滞后也必须拒绝；第一版不提供强制取消或绕过入口。未来若要终止已开工批次，必须先定稿短批结案、生产损失、在制品及已领物料处置，不能复用本取消命令。

短批状态与版本规则：

- `material_plan_version` 不是单条需求版本，而是“管理员授权时看到的整组物料计划编号”。创建或取消需求、短批开工前确认退料导致需求缺口恢复时递增；继续确认出库只会缩小缺口，不递增。
- 有效短批授权确认首笔部分领料后，批次从 `material_pending` 进入 `material_partially_outbound`；该状态只表达已经发生部分出库，不表达授权是否仍有效。
- 首工序开工事务重新检查授权仍有效、版本匹配、至少存在一笔确认出库且实际缺口没有超过逐需求批准值，成功后进入 `doing` 并消费授权。
- 短批开工后剩余活动需求继续分配和出库；存在活动需求时批次不得完成。完整授权表、剩余需求关闭和出库关联规则见 [生产需求、分配与领料出库](demand-allocation-and-outbound.md)。

当前生产执行完工数量规则：

- 以本批次中 `need_record_snapshot = 1` 且 `step_order_snapshot` 最大的工序作为数量来源工序；`completed_quantity` 等于该工序从 `batch_step_reports` 聚合得到的 `effective_normal`。
- 完工命令必须在事务内重新锁定并校验所有必报工工序均为 `completed`，重新聚合数量后写入；客户端不得提交或覆盖 `completed_quantity`。
- 当前至少需要存在一道必报工工序；没有数量来源工序的批次不得执行完工确认。
- 当前不支持正常数量低于要求数量时的短批完工。确需按不足数量结束时，未来以独立的短批完工/生产损失确认命令记录差额、原因、确认人与审计，不得通过人工填写 `completed_quantity` 绕过报工事实。
- `qualified_quantity` 不由生产执行完工命令写入；它只允许来自未来独立的最终质量结论。

说明：

- `production_batches` 是生产执行批次，不是库存批次。
- 生产批次负责表达“这一批怎么生产”。
- `product_id` 是受组合外键保护的查询冗余，不允许与工单产品不一致。
- 路线快照在批次创建时冻结；批次执行期间不能跟随路线主数据变化。
- `plan_start_date`、`plan_end_date` 是批次排程，不是实际执行事实；实际开工、完工分别只以 `started_at`、`completed_at` 为准。
- 成品或半成品入库后，应生成 `item_batch` 库存批次，并通过 `item_batch.source_production_batch_id` 关联回生产批次。
- 一个生产批次可以产生多个库存批次，例如半成品批次、成品批次、待检批次。

---
