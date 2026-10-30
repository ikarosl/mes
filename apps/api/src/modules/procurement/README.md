# Procurement

拥有供应商、采购单、需求来源映射、到货与实收修订、整批处理轮次、正式清单／分配和供应商退回。Quality 拥有检查事实，Inventory 拥有实际库存；跨模块协作见[采购业务设计](../../../../../docs/procurement-inbound-design.md)。

采购主单限定唯一供应商；按需采购限定单一工单，可跨该工单任务，独立备料不绑定需求。采购跟进状态由人员结束或恢复，不由物流数量自动推进。到货处置归仓储职责，检验归 Quality 权限，职责分组不改变事实所有者。

公开能力见 [public.ts](public.ts)；用途资格分别由 Production、Product 提供，展示读取按[架构](../../../../../docs/architecture.md)登记。各主题的唯一维护位置：

- [数据库](docs/database.md)：身份、来源关系和数据库特有约束。
- [供应商](docs/suppliers.md)：名称维护、选择窗口和历史显示。
- [采购订单](docs/purchase-orders.md)：来源、状态、补单、金额及锁序。
- [到货处置](docs/receipts.md)：实收更正、作废、检验编排、拒收、实际入库与退回。
- [正式清单与整批分配](docs/receipt-acceptance.md)：核实数量、建议公式、换轮和执行授权。
- [整批处理示例](docs/receipt-round-examples.md)：错误定稿、部分执行和拒收重办的数量与身份。
- [到货查询](docs/receipt-queries.md)：分层分页、精确定位、当前数量及历史投影。

验证阶段见[测试策略](../../../../../docs/testing-strategy.md)，剩余事项见[路线图](../../../../../docs/roadmap.md)。
