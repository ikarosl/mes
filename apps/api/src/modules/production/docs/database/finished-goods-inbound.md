# 批准清单与成品流转入库

Production 拥有批准产出来源资格及用例编排；Inventory 拥有本章引用的入库主从表、库存批次、流水及余额，并通过公开能力在同一事务内写入。仍与物料库存共用 `inventory_transaction` 唯一账本。本章细化 [ADR-0011](../../../../../../../docs/adr/0011-task-closeout-output-list-and-finished-goods-inbound.md) 的成品库存模型；schema 由追加迁移 `202609170002-finished-goods-inbound` 提供。接口和用例必须与该结构同时接入，不能仅执行迁移后将现有物料查询当成通用库存查询。

## 身份与范围

`item_id` 继续只表示 `materials.id`；成品采用独立的 `product_id → products.id`。物料精确版本和成品不能共用一个外键身份，也不另建成品流水账本。

| 表 | 物料分支 | 成品分支 |
| --- | --- | --- |
| `item_batch` | `item_id/material_variant_id/material_variant_code_snapshot` 非空，`product_id` 为空 | `product_id` 非空，物料三列为空；来源仅 `self_made/production_extra`，来源工单和任务均非空 |
| `inbound_detail` | 物料与版本、库存批次均非空；`product_id/requested_batch_code` 为空 | `product_id/requested_batch_code` 非空，物料与版本为空；草稿暂未建立库存批次 |
| `inventory_transaction` | 物料与版本非空，成品为空 | 成品非空，物料与版本为空；本阶段仅正数 `production_inbound`、`available`、`inbound_detail` 引用 |
| `inventory_batch_balance` | `item_id` 非空，成品为空 | `product_id` 非空，物料为空 |

每张表以明确 `IS NULL/IS NOT NULL` 的 CHECK 实现互斥分支；不能用 MySQL CHECK 的 UNKNOWN 或部分为空的组合外键绕过身份。余额表不复制 `material_variant_id`，同一库存批次的精确版本仍从 `item_batch` 取得。

物料分支原有 `item_batch(id,item_id,material_variant_id)` 等组合外键全部保留。新增成品组合键 `item_batch(id,product_id)`，成品入库明细、流水、批次余额均引用它。流水另以 `(reference_detail_id,product_id,batch_id)` 引用对应成品入库明细；成品分支三列非空，必须实质满足引用关系。物料分支不使用这个成品专用引用。

成品批次唯一键为 `(product_id,batch_code)`，现有物料批次唯一键仍为 `(material_variant_id,batch_code)`。库存批次身份不可修改，成品来源、批号、编码和单位也不能在建批后回改。两类成品入库各自创建新批次，不合并到已有批次。

成品不参与物料分配、领料、退料、物料损耗或当前物料盘点。现有物料库存列表、候选、盘点及汇总入口须明确限制 `product_id IS NULL`，不能仅依赖 nullable 值不匹配联表来过滤。现有物料名称实时展示规则不变；成品名称从所属工单成品快照展示，不写入物料名称字段。

## 入库单与批准版本

复用 `inbound_order/inbound_detail`，不建立影子单据或第二套数量事实。

`inbound_order` 增加：

- `product_id`、`output_revision_id`：成品来源均非空，其他来源均为空；成品同时要求非空工单、任务，`provider` 为空。
- `(output_revision_id,production_batch_id,work_order_id,product_id)` 组合外键：引用批准清单的同组四列，保证所选批准版确实属于该任务、工单和成品。
- `active_finished_slot`：仅成品 `pending/completed` 返回 `1`，其余返回 NULL。唯一键 `(production_batch_id,source_type,active_finished_slot)` 保证同一任务、同一类别最多一张有效草稿或已确认单；取消释放占位，已确认永久占位，不因库存被消费释放。

`inbound_detail` 增加：

- `product_id`、`requested_batch_code`；后者为草稿拟使用的库存批号。
- `(inbound_id,product_id)` 组合外键及唯一键，保证成品主单恰对应同一成品、至多一条明细。触发器同时拒绝物料明细混入成品主单及反向混用。
- `batch_id` 对成品草稿可为空；物料明细必须非空。确认时建立批次并回填，已确认明细不再修改或删除。
- 数量只保存于原 `inbound_number`，主单不新增数量列。待确认数量是单据草稿，只有库存流水表示已实际接收；不能将草稿数量加入库存。

两类来源分别为：

| 来源 | 名称 | 批准数量 |
| --- | --- | --- |
| `self_made` | 生产流转入库 | 当前有效批准版 `available_quantity` |
| `production_extra` | 额外产出入库 | 当前有效批准版 `extra_quantity` |

每张单数量等于对应类别的全部批准数量，不开放分次收货；数量为零不建单。两个类别没有办理先后依赖，可以在不同时间分别确认。已确认类别不能通过更改批准数量另建同类单据追加收货。

## 命令、锁序与确认事务

写命令锁序为：**工单 → 生产任务 → 结案根 → Product 历史成品身份共享锁 → Inventory 入库单 → 库存批次**。与结案清单更正使用相同根锁。首次创建有效类别草稿时，数据库唯一占位再次防止并发重复；API 还须使用幂等键和版本校验。

创建／编辑草稿锁内复核：任务存在且已结案；选择的是结案根 `current_revision_id`；成品与任务一致；类别量为正；该类尚未确认；不存在另一张有效同类草稿；相应类别没有受在审更正冻结。草稿可以修改批号、说明及引用的最新批准版本，数量随所选版本的对应类别整体更新。

确认时重新执行上述资格核对，不能只信任创建草稿时的检查：

1. 锁定来源及入库单，复核待确认状态、版本、最新有效批准版和类别冻结。
2. 复核该明细数量等于最新清单该类别的全量，仓管已核对实物并收齐；旧纸质清单和旧草稿不能绕过当前版本。
3. 创建新的成品 `item_batch`，记录成品、批号、工单、任务、来源类别、编码和单位；将批次 ID 回填该明细。
4. 追加一条 `inventory_transaction`：`production_inbound`、正数、`available`，引用该明细，同事务维护批次余额。
5. 将主单置 `completed`，写确认人、时间、版本及成功审计，和幂等结果一起提交。

数据库触发器允许这个事务内部的合法中间步骤：主单仍为 pending 时先建立批次、回填明细及追加流水，再将主单完成。不能在每条 SQL 上禁止该顺序。草稿创建不建批次由创建命令保证；completed 的数据库守卫要求恰好一条与采用批准版数量、成品批次、来源和正流水一致的明细。取消只允许尚未绑定库存批次的待确认成品单，不写流水，并保留取消明细。

成品流水唯一键 `(product_id,reference_type,reference_detail_id,transaction_type)` 防止相同成品明细重复记账；结合类别唯一占位、明确的源版本和幂等协议共同防重。流水不可变规则继续适用；本阶段不提供成品出库、成品库存报废或已确认成品入库冲销。

## 清单更正与收货

更正批准不改已发生的库存流水。已确认类别批准量保持原值；另一尚未确认类别仍可更正。更正在审期间仅冻结数量受影响类别；仅修改报废或说明不自动冻结两个类别。读取冻结依据须比较正在审批的草稿和当前批准版，不能根据页面缓存推断。

更正批准后 `current_revision_id` 切换，未确认草稿引用旧版时必须刷新并保存新版后才能确认。历史入库单始终保留当次实际采用的批准版；不回写为新版本。仓管线下拒收不强制创建差异单，差异与核实结果保留于清单更正及前后审批。

## 余额投影

`inventory_transaction` 插入时，同事务更新 `inventory_batch_balance(batch_id,stock_status)`；该投影按账本身份填写物料或成品 ID。`inventory_material_variant_balance` 仅在物料分支更新，成品不插入无版本桶，也不另建成品总量账本。

批次状态变更仍只对物料执行版本余额桶搬移。成品库存按批次余额与当前批次状态查询、聚合。现有余额防负、库存流水不可变及专用测试库受控清理边界保持；成品投影也必须能从同一账本重建并对账。

## API 与权限

页面仍为入库管理，不新增独立成品菜单或路由权限。接口约定：

| 路径（`/api/production/finished-goods-inbounds`） | 权限与用途 |
| --- | --- |
| `GET /` | 既有 `production:inbounds:view`；分页查询两类成品单据 |
| `GET /candidates` | 同上；查询任务、当前批准版、两类量及各类草稿／确认／冻结状态 |
| `GET /:inboundId` | 同上；单据、明细、采用批准版和库存来源追溯 |
| `POST /` | `production:inbounds:create-finished`；创建草稿 |
| `PUT /:inboundId` | 同上；按版本修改草稿并核对最新清单 |
| `POST /:inboundId/actions/confirm` | `production:inbounds:confirm-finished`；仓管整类一次确认 |
| `POST /:inboundId/actions/cancel` | `production:inbounds:cancel-finished`；填写原因取消未确认单 |

以上新写权限均挂既有入库查看权限。页面内部按钮不要求逐项隐藏；每个后端入口独立鉴权，质检人员或产线草稿权限不能替代仓库确认权限。

## 迁移边界

这是开发期结构切换，不转换或兼容旧库存身份。up/down 在任何永久 DDL 前要求库存批次、流水、入库主明细及余额投影为空；可通过统一开发重置重新生成。迁移期间停止所有相关写入，MySQL DDL 不具有整体事务回滚。

up 暂时解除受 nullability 变更影响的原物料外键，完成互斥身份分支后原名恢复；不关闭 `FOREIGN_KEY_CHECKS`。down 先拆新成品引用与触发器，再删除新列及新增索引，恢复旧非空物料结构、原外键和投影触发器，移除三项新写权限。迁移脚本与应用、权限目录须一起发布；DDL 或回退失败时保持写入停止，检查实际结构后恢复。
