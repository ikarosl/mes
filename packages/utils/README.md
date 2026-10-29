# @company/utils

前后端共享的纯数据规范化与计算函数。当前导出生产批次创建、物料出库 payload 的规范化逻辑，Production／Inventory 共用的整数数量函数、采购行价款推算，以及北京时间表示函数。

本包不访问网络、数据库或应用状态，也不拥有业务用例；新增函数必须确有跨消费者复用价值，并保持确定性和无副作用。

## 采购行金额

`calculatePurchaseLineAmount` 为采购草稿预览和服务端写入提供同一份字符串规范化、输入校验及最终总额／来源计算，不持有订单状态、权限或审计。它使用独立的 decimal.js 上下文保留输入上限所需的中间精度，不修改全局十进制配置，不将金额转换成 JavaScript Number；非法输入抛出明确校验错误，由消费者映射到各自边界。字段含义、默认值、优先级和舍入方式唯一维护于 [Procurement 金额契约](../../apps/api/src/modules/procurement/docs/purchase-orders.md#明细采购单位单价)。

## 日期与时间

`normalizeDateOnly(value)` 严格校验真实日历日期 `YYYY-MM-DD` 并原样返回；纯日期没有时区，不转成时刻。`toBeijingISOString`、`toBeijingCompactTimestamp`、`toBeijingDateString`、`formatBeijingDateTime` 和 `toBeijingDateTimeLocalString` 只接收有效时刻（`Date`、毫秒时间戳或带 `Z`／显式偏移的 ISO 时间字符串），分别输出带 `+08:00` 的 ISO、`YYYYMMDDHHmmss`、北京时间日期、`YYYY-MM-DD HH:mm:ss` 和日期时间控件所需的 `YYYY-MM-DDTHH:mm:ss`。

`beijingWallDateTimeToISOString(value)` 将 `YYYY-MM-DDTHH:mm[:ss[.SSS]]` 或空格分隔的北京墙上时间解释为 `+08:00` 时刻。函数不读取当前时间；调用方需要北京今日时传入 `Date.now()`。空值由调用方处理，非法日期、无偏移的时刻及无效时间抛 `RangeError`。

## 验证

构建和常规类型检查只包含应用源码；正式测试文件由 Vitest 运行，并通过 `corepack pnpm --filter @company/utils typecheck:test` 单独检查类型。验证顺序见[测试策略](../../docs/testing-strategy.md)。

```text
corepack pnpm --filter @company/utils typecheck
corepack pnpm --filter @company/utils test
```
