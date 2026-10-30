# @company/utils

前后端共享的纯数据规范化与计算函数，覆盖数量、采购金额、日期时间、JSON 表格和请求规范化；导出见 [src/index.ts](src/index.ts)。

本包不访问网络、数据库或应用状态，也不拥有业务用例；新增函数必须确有跨消费者复用价值，并保持确定性和无副作用。

## 采购行金额

[采购金额函数](src/procurement-amount.ts)供草稿预览和服务端写入共用，使用独立十进制上下文，避免 JavaScript Number 精度损失或修改全局配置。输入含义、计算优先级和舍入规则由 [Procurement 金额契约](../../apps/api/src/modules/procurement/docs/purchase-orders.md#明细采购单位单价)维护；订单资格、持久化及错误映射由消费者负责。

## JSON 表格

[表格规范化](src/json-table.ts)校验并复制 [JsonTableData](../contracts/src/template.ts)，保留单元格原文，缺失单元格补空文本；无列时不能保留数据行。字段格式、保留名称及容量限制见实现，非法输入由所属用例映射为业务错误。

表格的单项上限与 [HTTP JSON 请求体总容量](../../docs/api-conventions.md#1-基础约定)同时适用；提交时，包含表格及其他业务字段的完整请求须满足总容量限制。

业务模块直接保存完整表格 JSON，并拥有各自资料的权限、状态和写入规则；模板要求的最少列数由 Template 用例维护。本包不执行表达式，也不提供动态表单规则。

## 日期与时间

[日期时间函数](src/date-time.ts)遵循[统一时间规范](../../docs/database-conventions.md#统一类型与状态规则)，提供纯日期、具体时刻及北京墙上时间的分别处理入口。

函数不读取当前时间，空值由调用方处理；非法日期或时刻抛出 `RangeError`。需要“今日”等相对值时，由调用方显式传入当前时刻。

## 验证

测试类型入口为 `corepack pnpm --filter @company/utils typecheck:test`，适用阶段见[测试策略](../../docs/testing-strategy.md)。

```text
corepack pnpm --filter @company/utils typecheck
corepack pnpm --filter @company/utils test
```
