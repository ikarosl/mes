# 到货登记与仓库说明表

> [返回采购数据库](../database.md)。本章是以下三表的唯一完整结构所有者；业务含义与锁序见[到货与仓库处理](../receipts.md)。

使用 InnoDB、utf8mb4_0900_ai_ci。ID 和外键均 BIGINT UNSIGNED；FK 使用 RESTRICT。时间为北京时间 DATETIME。可变审计列组与不可变事实列组遵守[数据库公共规则](../../../../../../../docs/database-conventions.md#统一审计规则)。本实验通过 [202611110010](../../../../../../../packages/database/migrations/202611110010-warehouse-simplification.up.sql)追加替换，仅接受没有旧采购业务的独立空库；旧基线不修改。选填交接凭据由 [202611110040](../../../../../../../packages/database/migrations/202611110040-optional-arrival-evidence.up.sql)放开可空性，保留原凭据；down 遇空凭据拒绝，不补造历史资料。下行迁移拒绝恢复退役授权模型，不转换历史业务语义。

## procurement_receipt

职责：记录一次实际来货与采购主单的固定关联及整单作废事实，不保存到货数量。

| 字段                    | 类型、空值和默认                            | 含义                             |
| ----------------------- | ------------------------------------------- | -------------------------------- |
| id                      | 自增主键                                    | 到货稳定身份                     |
| receipt_no              | VARCHAR(100) NOT NULL                       | 服务端编号，永久唯一             |
| purchase_order_id       | ID NOT NULL                                 | 原采购主单                       |
| received_at             | DATETIME NOT NULL                           | 人工填写实际交接时间             |
| handover_evidence       | TEXT NULL                                   | 选填交接凭据；空输入归 NULL      |
| remark                  | TEXT NULL                                   | 登记备注                         |
| is_voided               | TINYINT NOT NULL DEFAULT 0                  | CHECK IN(0,1)                    |
| void_reason             | TEXT NULL                                   | 作废原因，非空白且不超过 2000 字 |
| voided_by / voided_at   | ID NULL / DATETIME NULL                     | 作废操作者与时间                 |
| created_by / updated_by | ID NOT NULL                                 | 创建与最近修改人员               |
| created_at / updated_at | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 后者 ON UPDATE CURRENT_TIMESTAMP |
| version                 | INT NOT NULL DEFAULT 0                      | CHECK >=0；作废恰好递增一次      |

FK：purchase_order_id→procurement_order，created_by/updated_by/voided_by→users。唯一键 receipt_no 及 (id,purchase_order_id)；查询索引 (purchase_order_id,received_at,id) 和人员 FK 支撑索引。CHECK 要求未作废的作废字段全部 NULL，已作废三字段完整且原因有效。trg_procurement_receipt_void_update 冻结登记字段与创建事实，只允许未作废转作废及 version+1；trg_procurement_receipt_no_delete 禁止物理删除。原始登记不修改或恢复，作废资格在应用事务锁内核验。

## procurement_receipt_line

职责：固定本次来货勾选的采购物料及其精确版本；本行不拥有数量、检查办理或唯一库存批次。

| 字段                           | 类型、空值和默认                            | 含义                             |
| ------------------------------ | ------------------------------------------- | -------------------------------- |
| id                             | 自增主键                                    | 到货明细稳定身份                 |
| receipt_id / purchase_order_id | ID NOT NULL                                 | 同一到货主单及原采购根           |
| purchase_order_line_id         | ID NOT NULL                                 | 本次来货的原采购行               |
| line_no                        | INT NOT NULL                                | CHECK >0；固定到货行号           |
| item_id / material_variant_id  | ID NOT NULL                                 | 原采购行的物料精确身份           |
| supplier_batch_code            | VARCHAR(100) NULL                           | 人工供应商批号                   |
| created_by / updated_by        | ID NOT NULL                                 | 创建与最近修改人员               |
| created_at / updated_at        | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 后者 ON UPDATE CURRENT_TIMESTAMP |
| version                        | INT NOT NULL DEFAULT 0                      | CHECK >=0；实际入库或作废时递增  |

组合 FK：(receipt_id,purchase_order_id)→receipt(id,purchase_order_id)，(purchase_order_line_id,purchase_order_id)→order_line(id,purchase_order_id)，(purchase_order_line_id,item_id,material_variant_id)→order_line(id,item_id,material_variant_id)。人员列引用 users。组合 FK 防止冗余根与物料身份成为独立事实。

唯一键：(receipt_id,line_no)、(receipt_id,purchase_order_line_id)、(id,item_id,material_variant_id)、(id,purchase_order_line_id)、(id,receipt_id)。前两者保证同次勾选不重复；其余供库存、补单和报告的组合引用。业务查询索引 (purchase_order_line_id,id)，组合 FK 与人员 FK 有支撑索引。供应商和单位沿固定原采购取得，不复制可变供应商字段；物料名称按公共规则取当前名称。

trg_procurement_receipt_identity_update 禁止修改来源身份与供应商批号，trg_procurement_receipt_line_no_delete 禁止物理删除。应用原子比较版本并推进，同来源本次多个目标仅推进一次。报告、分组和独立说明均不推进本行版本。实际数量与目标逐笔沿 Inventory 入库明细及原始正流水追溯；说明沿下表追溯。

## procurement_receipt_handling

职责：追加保存仓库对到货物料的其他处理说明。它只表示人工文字，不保存退回量、执行状态或第二份库存数量。

| 字段                | 类型、空值和默认                            | 含义                                         |
| ------------------- | ------------------------------------------- | -------------------------------------------- |
| id                  | BIGINT UNSIGNED 自增主键                    | 稳定说明记录                                 |
| receipt_line_id     | ID NOT NULL                                 | 有效到货明细                                 |
| inbound_id          | ID NULL                                     | 历史说明的公共入库主单关联；新独立说明恒为空 |
| other_handling_note | TEXT NOT NULL                               | trim 后 1～2000 字的说明                     |
| created_by          | ID NOT NULL                                 | 本次操作者                                   |
| created_at          | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 追加时间                                     |

FK：receipt_line_id→procurement_receipt_line(id)，inbound_id→inbound_order(id)，created_by→users(id)，均 RESTRICT。索引 (receipt_line_id,created_at,id) 支持历史分页，(inbound_id) 支持关联读取；操作者 FK 有支撑索引。无可变审计列、version、软删除或业务状态，不复制数量。CHECK 拒绝空白或超长说明；trg_procurement_receipt_handling_insert 共享锁核验来源未作废；no_update/no_delete 触发器冻结已保存说明。补充或更正通过追加新说明保留原文；应用在同一来源锁内独立追加，不推进来源版本，与成功审计、幂等原子提交；新记录 inbound_id 恒 NULL，既有历史关联保持不变。

## 跨模块引用与退役范围

Quality 独立报告通过 (receipt_line_id,receipt_id) 组合 FK 固定原到货，拥有自己的不可变报告及更正引用。Inventory 实际入库只保存 procurement_receipt_line_id 和供应商名称快照，物料由组合 FK 绑定；详细字段与守卫见[库存明细](../../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)。

旧 receipt_revision、receipt_round、receipt_acceptance、receipt_allocation 和 supplier_return 表及其执行引用已退出活动结构；历史 migration 登记只用于校验，不授权恢复旧接口。到货和说明没有实收修订、放行授权、处置定稿或实际退回状态。
