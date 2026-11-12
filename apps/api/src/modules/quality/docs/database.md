# Quality 检验数据库

Quality 拥有不可变检查报告，以及[已停用分组](incoming-inspection-orders.md)保留的主单和当前到货关联。Procurement 拥有报告所引用的到货来源，Inventory 拥有真实库存；报告不提供入库授权或数量额度。业务含义与来源事务边界见[检查报告](unified-inspection-model.md)。

所有表使用 InnoDB、`utf8mb4_0900_ai_ci`，ID 为 `BIGINT UNSIGNED`，外键使用默认 RESTRICT。除显式 NULL 外均为 NOT NULL，未注明默认值的字段没有显式默认值。公共审计、时间及数量规则见[数据库公共约定](../../../../../../docs/database-conventions.md)。当前结构核验入口为[基线](../../../../../../packages/database/migrations/202611020110-baseline-quality-tables.up.sql)、[独立报告增量](../../../../../../packages/database/migrations/202611110020-independent-incoming-reports.up.sql)及[完整表格转换](../../../../../../packages/database/migrations/202611110060-incoming-report-json-table.up.sql)。

## 来料分组主单 quality_incoming_inspection_order （这个表当前分支暂不使用）

本表为完整到货提供稳定工作分组身份，不拥有检查状态、数量或报告内容。来源由 Procurement 编排，本表只由 Quality 修改。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| id | BIGINT UNSIGNED，自增 | 主键 |
| inspection_no | VARCHAR(64) | 服务端永久唯一的分组编号 |
| remark | VARCHAR(500) NULL | 可选分组备注 |
| version | INT UNSIGNED DEFAULT 0 | 备注或关系变化时递增的乐观版本 |
| created_by / updated_by | BIGINT UNSIGNED | 创建人／最近修改人，分别 FK users(id) |
| created_at | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) | 创建时间 |
| updated_at | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) | 修改时间 |

主键为 `id`；`uk_incoming_inspection_order_no(inspection_no)` 保证编号永久唯一，`chk_incoming_inspection_order_no` 要求 trim 后非空。`idx_incoming_inspection_order_created(created_at,id)` 支撑分页，两个人员 FK 分别有同名支撑索引。没有状态、软删除、数量或进度缓存；移走全部到货后保留空主单和编号，不提供删除、取消或归档命令。

## 当前到货关联 quality_incoming_inspection_order_receipt

本表保存每张完整到货的当前工作分组，不保存历史归属。解除关系删除本行，转移原子替换关系；相关操作者及前后值由同事务操作日志保存。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| inspection_order_id | BIGINT UNSIGNED | FK quality_incoming_inspection_order(id) |
| receipt_id | BIGINT UNSIGNED | FK procurement_receipt(id) |
| created_at | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) | 当前关系建立时间 |

主键为 `(inspection_order_id,receipt_id)`，支持主单内按到货 ID 倒序读取；`uk_incoming_inspection_order_receipt(receipt_id)` 保证同一到货至多一个当前归属。两个 FK 分别为 `fk_incoming_inspection_order_receipt_order` 与 `fk_incoming_inspection_order_receipt_source`，由主键与唯一键支撑。关系没有独立 ID、版本、报告指针、人员字段或不可变触发器。关系变化不改变检查报告，报告不增加分组外键。

## 独立报告 quality_incoming_inspection_report

本表保存到货明细检验报告每次登记或修订的 G/F 和完整打印内容。修订通过同源前驱关联追加不可变记录；当前报告由该明细最新的创建时间及 ID 派生，不另存当前状态或报告指针。报告与来源数量、仓库处理、入库及可变分组均无额度关系；已有多根记录的解释见[登记与修订](unified-inspection-model.md#登记与修订)。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| id | BIGINT UNSIGNED，自增 | 稳定报告身份 |
| report_no | VARCHAR(64) | 同事务按 incoming_inspection_report 类型分配的报告号 |
| receipt_line_id / receipt_id | BIGINT UNSIGNED | 真实到货明细及所属到货单 |
| receipt_no_snapshot / purchase_no_snapshot | VARCHAR(100) | 登记时的来源单号打印快照 |
| item_code_snapshot | VARCHAR(100) | 来源材料编码快照 |
| item_name_snapshot | VARCHAR(200) | 报告生成时材料名称，仅作为报告内容 |
| material_variant_code_snapshot | VARCHAR(180) | 来源精确版本编码，作为报告“规格型号”的显示与打印来源 |
| unit_snapshot | VARCHAR(20) | 检查数量单位快照 |
| supplier_name_snapshot | VARCHAR(100) | 来源供应商名称打印快照 |
| specification | VARCHAR(2000) NULL | 旧报告手填规格原文，仅保留读取；新报告不写入，打印使用版本编码快照 |
| batch_no | VARCHAR(120) NULL | 保存的打印批次号快照；新报告取可信到货单号，已有报告保留原值 |
| expires_on | DATE NULL | 有效期纯日期 |
| inspection_method | VARCHAR(30) | full／sampling |
| qualified_quantity / unqualified_quantity | INT | 实际检查合格 G／不合格 F，N=G+F 不另存 |
| inspected_at | DATETIME(3) | 真实检验时间 |
| result_note / evidence_reference | TEXT NULL | 可选异常说明与检验凭据 |
| inspection_details | JSON | 本次报告独立的完整列定义与有序行数据，采用 JsonTableData |
| previous_record_id | BIGINT UNSIGNED NULL | 本报告修订的前驱；登记记录为空，新修订必须引用当前报告 |
| correction_reason | TEXT NULL | 有前驱引用时必填的修订原因 |
| created_by | BIGINT UNSIGNED | 实际登记人，FK users(id) |
| created_at | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) | 记录创建时间，与检验时间分别保存 |

本表只使用创建审计；无可变审计、状态、乐观版本、软删除、申报到货量、放行结论、复检轮次、审批或签核字段。名称快照适用[报告内容例外](../../../../../../docs/database-conventions.md#基础物料名称与历史身份)，不作为材料身份或写入资格。真正来源身份只由到货明细确定；`(receipt_line_id,receipt_id)` 以 `fk_incoming_report_receipt_source` 组合引用 `procurement_receipt_line(id,receipt_id)`，防止记录与到货头错配。

键、索引及约束：

- `PRIMARY KEY(id)` 与 `uk_incoming_report_no(report_no)` 保持身份和编号唯一；`uk_incoming_report_source(id,receipt_line_id)` 支撑同源自引用。
- `idx_incoming_report_line_created(receipt_line_id,created_at,id)` 支撑逐来源历史分页及当前报告读取；`idx_incoming_report_receipt_source(receipt_line_id,receipt_id)` 支撑来源 FK。
- `uk_incoming_report_previous(previous_record_id)` 让一份报告最多有一个直接修订后继；NULL 可重复，保留已有独立登记。`idx_incoming_report_previous_source(previous_record_id,receipt_line_id)` 支撑 `fk_incoming_report_previous_source`，组合外键保证引用同一到货明细。在 Procurement 已持有来源锁后，应用锁定读取当前报告，已有报告时仅接受与其 ID 一致的前驱；唯一键不能单独保证当前报告约束。
- `idx_incoming_report_creator(created_by)` 支撑 `fk_incoming_report_creator`。
- `chk_incoming_report_header` 要求编号、来源打印文本 trim 后非空，规格与批号允许 NULL；`chk_incoming_report_method` 限定 full／sampling。
- `chk_incoming_report_quantities` 保证 G/F 各为 0..99999999、合计为 1..99999999；应用在写入前拒绝小数。该数量不与入库量、采购量或其他报告求和比较。
- `chk_incoming_report_notes` 限定非空说明和凭据为 1..4000 字，允许 NULL；`chk_incoming_report_correction` 要求原报告引用与非空更正原因同时出现或同时为空。
- `chk_incoming_report_details` 保证 JSON 顶层只有 `columns/rows`，分别为 1..20 列、1..200 行的数组。列键、列名、单元格与未知字段由共享 [JSON 表格规范化](../../../../../../packages/utils/README.md#json-表格)校验；Quality 额外要求至少一列和一行数据，不推导人工表格结果。完整输入形状见[契约](../../../../../../packages/contracts/src/quality/inbound-inspections.ts)，默认项目与打印标签见[常量](../../../../../../packages/constants/src/quality.ts)。报告不保存模板 ID 或模板外键。
- `trg_incoming_report_no_update` 与 `trg_incoming_report_no_delete` 无条件禁止更新／删除。登记与修订均追加记录，以新记录的前驱引用保存关系，不更新原报告。

## 写入、查询与迁移

来源锁、作废后的历史保留及同池事务边界见[报告协作](unified-inspection-model.md#事务与权限)。报告唯一运行时写入口为本模块 [Repository](../infrastructure/mysql-quality-inbound.repository.ts)，只追加事实；公开输入和查询类型见 [public.ts](../public.ts)。Procurement 的工作列表可按已登记展示字段只读组合来源、当前分组及报告摘要，不扩大表写入所有权。

`202611110010` 先解除旧采购／库存链路引用并建立到货明细组合唯一键；`202611110020` 在任何 DDL 前拒绝非空旧 `quality_inspection_case/quality_inspection_record`，移除旧表并建立本报告表和新编号值域。仅在本实验分支另建的、用户明确授权的空库初始化，不转换或清除原业务库历史。已有分组结构和关联继续保留，不构造历史报告或分组归属。

`202611110060` 对已经保存的报告增量转换：先核验旧五列记录均为可完整展示的文本字段，再把固定列定义与原 `report_rows` 数组组合为完整表格，并重命名为 `inspection_details`。转换不 trim、不截断或重排行和单元格；旧批次号、来源、数量及更正引用不变。旧记录超过当前通用单元格上限时仍保留原文并可读取／打印，新报告按当前通用规则保存。临时验证快照核对报告数、逐报告原行摘要、行数和批号；不支持的旧形状在 DDL 前拒绝。

独立报告和完整表格增量均拒绝自动 down，避免伪造旧放行事实或丢失动态列内容。停写、失败停止及恢复依[迁移安全](../../../../../../packages/database/docs/migration-safety.md)执行；恢复使用匹配备份和旧应用。migration 文件存在不表示任一实际数据库已执行。
