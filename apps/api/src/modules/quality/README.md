# Quality

Quality 拥有来料、成品和工序专检的不可变检查事实及明确结论。Procurement 管理到货与仓库处置，Production 管理产出、审批和异常处理，Inventory 记录实际库存；检验通过不等于已经取得入库授权。

公开入口为 [public.ts](public.ts)。来源模块先锁定来源并核验资格，Quality 在同池事务中核验、保存本模块事实；跨模块展示查询不能代替来源资格校验。完整来源、状态及事务约束见[数据库设计](docs/database.md)和[统一检验模型](docs/unified-inspection-model.md)。

- [来料分组主单](docs/incoming-inspection-orders.md)：按完整到货组织工作，分组不合并逐来源检查事实或改变办理资格。
- [来料检验与处置](../procurement/docs/receipts.md)：Procurement 编排来源动作，检查使用独立 Quality 权限。
- [正式清单与整批分配](../procurement/docs/receipt-acceptance.md)：库管核实实物、确认去向并承担超建议量的说明责任。
- [查询契约](../procurement/docs/receipt-queries.md)：来料工作列表、当前办理和精确历史依据。

## 工序专检

专检针对任务下的具体工序，独立于某一笔报工；Production 通过异常处置承接已核实的不合格量。检查更正须保护已经处理的数量，完整规则见[工序专检](docs/process-inspections.md)，选择理由见 [ADR-0021](../../../../../docs/adr/0021-process-inspection-and-abnormal-disposition.md)。

## 成品质检

Quality 记录实际检查数量和结论，Production 核对产出并送审，批准后才形成入库依据。复检针对剩余实物，保留原检验和已执行事实；完整规则、接口与来源协作见[成品检验与放行](docs/finished-inspections.md)。成品与来料的职责差异见[统一检验模型](docs/unified-inspection-model.md)，取代范围见 [ADR-0019](../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)，剩余验收见[路线图](../../../../../docs/roadmap.md)。
