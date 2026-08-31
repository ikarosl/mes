# @company/utils

前后端共享的纯数据规范化函数。当前导出生产批次创建、物料出库和外购物料入库 payload 的规范化逻辑。

本包不访问网络、数据库或应用状态，也不拥有业务用例；新增函数必须确有跨消费者复用价值，并保持确定性和无副作用。

## 验证

```text
corepack pnpm --filter @company/utils typecheck
corepack pnpm --filter @company/utils test
```
