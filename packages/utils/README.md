# @company/utils

前后端共享的纯数据规范化与计算函数。当前导出生产批次创建、物料出库 payload 的规范化逻辑，Production／Inventory 共用的整数数量函数、采购行价款推算，以及北京时间表示函数。

本包不访问网络、数据库或应用状态，也不拥有业务用例；新增函数必须确有跨消费者复用价值，并保持确定性和无副作用。

## 采购行金额

`calculatePurchaseLineAmount` 为采购草稿预览和服务端写入提供同一份字符串规范化、输入校验及最终总额／来源计算，不持有订单状态、权限或审计。它使用独立的 decimal.js 上下文保留输入上限所需的中间精度，不修改全局十进制配置，不将金额转换成 JavaScript Number；非法输入抛出明确校验错误，由消费者映射到各自边界。字段含义、默认值、优先级和舍入方式唯一维护于 [Procurement 金额契约](../../apps/api/src/modules/procurement/docs/purchase-orders.md#明细采购单位单价)。
前后端共享的纯数据规范化函数。当前导出生产批次创建、物料出库 payload 的规范化逻辑、Production／Inventory 共用的整数数量函数、北京时间表示函数，以及轻量 JSON 表格规范化。

本包不访问网络、数据库或应用状态，也不拥有业务用例；新增函数必须确有跨消费者复用价值，并保持确定性和无副作用。

## JSON 表格

`normalizeJsonTable(value)` 校验并复制 [contracts 的 `JsonTableData`](../contracts/src/template.ts)：根对象只有 `columns` 和 `rows`。`columns` 是按显示顺序排列的 `{ key,label }` 数组，最多 20 列；`key` 以 ASCII 字母开头，仅含字母、数字及下划线，最多 64 字符，区分大小写且唯一，禁用 `constructor`、`prototype` 和 `__proto__`。`label` trim 后必填，最多 100 字符。列定义只表达身份、名称与顺序。

`rows` 最多 200 行，每行是以列 key 为键、文本为值的对象；缺失单元格补 `''`，未定义列和非字符串值拒绝，每个单元格最多 1000 字符，文本原样保留。空业务表格为 `{ columns:[],rows:[] }`；无列时不能包含数据行。非法结构和超限输入抛出中文 `Error`，所属用例映射为自身领域错误。

表格的单项上限与 [HTTP JSON 请求体总容量](../../docs/api-conventions.md#1-基础约定)同时适用；提交时，包含表格及其他业务字段的完整请求须满足总容量限制。

业务模块直接保存完整表格 JSON，并拥有各自资料的权限、状态和写入规则；模板要求的最少列数由 Template 用例维护。本包不执行表达式，也不提供动态表单规则。

## 日期与时间

`normalizeDateOnly(value)` 严格校验真实日历日期 `YYYY-MM-DD` 并原样返回；纯日期没有时区，不转成时刻。`toBeijingISOString`、`toBeijingCompactTimestamp`、`toBeijingDateString`、`formatBeijingDateTime` 和 `toBeijingDateTimeLocalString` 只接收有效时刻（`Date`、毫秒时间戳或带 `Z`／显式偏移的 ISO 时间字符串），分别输出带 `+08:00` 的 ISO、`YYYYMMDDHHmmss`、北京时间日期、`YYYY-MM-DD HH:mm:ss` 和日期时间控件所需的 `YYYY-MM-DDTHH:mm:ss`。

`beijingWallDateTimeToISOString(value)` 将 `YYYY-MM-DDTHH:mm[:ss[.SSS]]` 或空格分隔的北京墙上时间解释为 `+08:00` 时刻。函数不读取当前时间；调用方需要北京今日时传入 `Date.now()`。空值由调用方处理，非法日期、无偏移的时刻及无效时间抛 `RangeError`。

## 验证

构建和常规类型检查只包含应用源码；正式测试文件由 Vitest 运行，并通过 `corepack pnpm --filter @company/utils typecheck:test` 单独检查类型。验证顺序见[测试策略](../../docs/testing-strategy.md)。

```text
corepack pnpm --filter @company/utils typecheck
corepack pnpm --filter @company/utils test
```
