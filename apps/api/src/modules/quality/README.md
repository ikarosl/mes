# Quality

Quality 拥有来料检验办理、不可变检查事实及明确结论。Procurement 管理到货、处理轮次与仓库处置，Inventory 记录实际库存；检验通过不等于已经取得入库授权。生产追踪卡的顺序流转、随盘异常和末道终检由 Production 所有，不创建 Quality 工序专检单或成品质检轮次。

公开入口为 [public.ts](public.ts)。来源模块先锁定来源并核验资格，Quality 在同池事务中核验、保存本模块事实；跨模块展示查询不能代替来源资格校验。完整来源、状态及事务约束见[数据库设计](docs/database.md)和[统一检验模型](docs/unified-inspection-model.md)。

- [来料分组主单](docs/incoming-inspection-orders.md)：按完整到货组织工作，分组不合并逐来源检查事实或改变办理资格。
- [来料检验与处置](../procurement/docs/receipts.md)：Procurement 编排来源动作，检查使用独立 Quality 权限。
- [正式清单与整批分配](../procurement/docs/receipt-acceptance.md)：库管核实实物、确认去向并承担超建议量的说明责任。
- [查询契约](../procurement/docs/receipt-queries.md)：来料工作列表、当前办理和精确历史依据。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)，剩余验收见[路线图](../../../../../docs/roadmap.md)。
