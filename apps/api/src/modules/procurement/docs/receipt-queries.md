# 到货、检验待办与入库候选查询

查询端口 `ProcurementReceiptQuery` 由 `MysqlProcurementReceiptQuery` 实现，SQL 位于登记的 `infrastructure/queries/receipt-*.ts`。跨模块展示只读使用 Product 当前物料名称、Inventory 批号与实际入库事实、Quality 办理定位字段及放行条件；完整检验记录通过 Quality 公开批量查询取得，不跨模块写入或锁定。复合详情在同池只读事务的同一快照内组装，办理命令仍重新锁定并核验业务依据。

## 接口和权限

| GET 路径（省略 /api） | 权限 | 返回 |
| --- | --- | --- |
| /procurement/receipts | procurement:receipts:view | 到货单分页，关键字、供应商、采购单筛选 |
| /procurement/receipts/:id | procurement:receipts:view | 到货行、当前可办理范围、数量及有限历史预览 |
| /procurement/receipt-lines/:id | procurement:receipts:view | 单个到货行，含 receiptId，供跨页来源定位 |
| /procurement/receipt-order-options[/:id] | procurement:receipts:view | 已下单采购候选分页及详情，不要求仓管拥有采购管理页面权限 |
| /procurement/receipt-lines/:id/:historyKind | receipts:view 或 quality:inbound-inspections:view | revisions / scopes / cases / returns / inbounds 五类独立分页历史 |
| /quality/inbound-inspections | quality:inbound-inspections:view | 未检范围和真实检验办理联合分页 |
| /quality/inbound-inspections/:id | quality:inbound-inspections:view | 指定真实 case 的任务投影 |
| /quality/inbound-inspections/receipt-lines/:id | quality:inbound-inspections:view | 当前到货行版本与范围；质检不必拥有采购页权限 |
| /procurement/inbound-releases | production:inbounds:view | 可办理放行范围分页，不因采购关闭而消失 |

所有 query、path 和 command body 均为 class DTO。分页默认 10、上限 100；批量查询 ID 最多 100 且禁止重复。到货明细允许同一采购行按供应商批号拆成多条，不按采购行 ID 去重。传入实收或交接时间须包含时区。到货说明／原因／凭据最多 2000 字，供应商批号最多 100 字，质检说明／凭据最多 4000 字。

## 当前范围和历史分页

到货详情 `scopes` 只包含当前未处置叶子：待检、复核中、批准待入库、质量待退、采购终止待退。已入库、已退与被替代范围通过 `scopes` 历史分页完整查询；不能将详情中的范围数组解释为全部历史实收。

每行 `revisions/returns/inbounds` 预览最新 10 条，`cases` 包含最新 10 条与全部 reviewing 办理。`historyTotals` 给出五类完整数量，历史子接口均返回标准 `PageResult`。所有当前复核均可见，包括覆盖量为零、没有目标实物范围的实收更正核实。查询按行批量获取预览，检验明细按最多 100 个 ID 分批，不逐行、逐检验发 N+1 查询。

详情批号直接关联 `receipt_line.batch_id -> item_batch.batch_code`，未首次入库时为空。不复制内部批号字段。供应商批号独立保存。

## 数量依据

`I` 只累计 completed 的 purchased 入库明细及其匹配正库存流水。匹配包括明细 ID、精确物料身份、库存批次、单位、库存状态与数量；不限制当前到货修订，不使用当前余额，也不将 inbounded 范围数量当作库存事实。

`R` 来自真实退回交接，`L=I+当前approved`，`J=R+当前质量或终止待退`，`U=当前uninspected+reviewing`。最新实收来自当前修订；`hasOpenReview` 检查全部 reviewing case，包括零量复核。所有数量字符串无小数尾零。

## 检验任务与放行候选

检验与放行列表关键字匹配到货单号、采购单号、供应商名称、当前物料名称、物料编码和精确版本编码；全部条件在分页前生效。

到货确认只创建 uninspected 范围，未检实物还没有 Quality case。检验列表以 `taskKind='uninspected'|'case'` 区分；未检行保存真实 scopeId 且 `case=null`，已发起行包含真实 `QualityInboundCaseItem`。`taskKey` 仅用于页面行标识，不作为后端业务 ID。来源筛选及状态筛选在 UNION 后、分页前完成。初检确认发起后，由写事务创建 reviewing case 并暂停相应范围。

入库候选要求当前 approved、没有采购终止标记、Quality 对应已完成且明确放行，已有库存批次可用；Product 采购用途候选在分页前过滤无效物料／分类／已删除版本，但允许停用版本。采购关闭状态不排除合法仓库待办。`receiptLineId` 用于来源定位，`scopeIds` 接受逗号分隔的最多 100 个 ID，供跨页已选范围一次显式复核；已经拆分、复核或处置的范围消失，不自动替换为新范围 ID。

写 HTTP 由 `ReceiptService` 通过既有幂等 executor 调用来源 Repository：到货、更正、发起检验、提交结论、指定终止退回、实际退回和批量入库均独立鉴权。Quality 权限不授予更正实收或确认库存的能力。多范围入库使用一个 details 数组，整体原子确认。
