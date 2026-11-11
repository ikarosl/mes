# Procurement

拥有供应商、采购单、需求来源映射、到货登记和仓库其他处理说明。Quality 拥有独立来料检验报告，Inventory 拥有实际入库及唯一库存账本；协作边界见[采购业务设计](../../../../../docs/procurement-inbound-design.md)。

采购主单限定唯一供应商；按需采购限定单一工单，可跨该工单任务，独立备料不绑定需求。采购跟进状态由人员结束或恢复。到货只登记采购行和交接信息，检验报告、补单、实际入库与到货行其他处理说明独立办理。

公开能力见 [public.ts](public.ts)；Product、Production 分别提供物料和需求资格，展示读取按[架构](../../../../../docs/architecture.md)登记。各主题的唯一维护位置：

- [数据库](docs/database.md)：表职责、身份和约束；[到货表](docs/database/receipts.md)维护到货与说明的逐表结构。
- [供应商](docs/suppliers.md)：名称维护、候选窗口和历史显示。
- [采购订单](docs/purchase-orders.md)：来源、状态、补单、金额及锁序。
- [到货和仓库处理](docs/receipts.md)：登记、作废、实际入库、说明和权限。
- [到货查询](docs/receipt-queries.md)：到货分页、定位、实际入库和说明历史。

本实验仅在独立空库初始化，不转换已有采购业务数据。验证阶段见[测试策略](../../../../../docs/testing-strategy.md)，待验收及测试覆盖见[路线图](../../../../../docs/roadmap.md)。
