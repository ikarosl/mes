# @company/code-rules

前后端共同使用的纯业务编码规则。当前只导出生产批次号的生成与格式校验：`generateBatchNo`、`isBatchNoValid` 及其输入类型。

本包不负责读取数据库序号或保证持久化唯一性；调用方仍须在所属业务事务中处理并发和唯一键冲突。

## 验证

```text
corepack pnpm --filter @company/code-rules typecheck
corepack pnpm --filter @company/code-rules test
```
