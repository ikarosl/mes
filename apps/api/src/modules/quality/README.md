# Quality

Quality 拥有独立来料检查事实及可打印的进料检验报告。Procurement 管理到货来源与仓库处理记录，Inventory 记录实际库存；检验报告与是否入库相互独立，允许先入库后补录检查。生产追踪卡的顺序流转、随盘异常和末道终检由 Production 所有。

公开入口为 [public.ts](public.ts)。Procurement 先锁定来源并核验存在、归属与未作废，再由 Quality 在同池事务追加报告及成功审计；展示查询不能代替来源资格校验。报告内容保存后不可改写，更正通过同源追加记录引用原报告。完整字段与事务边界见[数据库设计](docs/database.md)和[检验模型](docs/unified-inspection-model.md)。

- [已停用的来料分组主单](docs/incoming-inspection-orders.md)：保留接口、主单及既有到货关联的边界。
- [到货来源与仓库处理](../procurement/docs/receipts.md)：Procurement 编排来源动作，登记检查使用独立 Quality 权限，人员岗位不限制为专职质检。
- [查询契约](../procurement/docs/receipt-queries.md)：来料工作列表、逐到货明细的报告历史及精确打印读取。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)，剩余验收见[路线图](../../../../../docs/roadmap.md)。
