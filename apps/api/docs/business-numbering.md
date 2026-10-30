# 业务自动编号

本章维护平台编号格式、日计数和事务边界；业务记录、建批资格和入库关系由各模块所有。决策理由见 [ADR-0017](../../../docs/adr/0017-business-numbering-and-beijing-time.md)，时间类型见[数据库公共规则](../../../docs/database-conventions.md#统一类型与状态规则)。

## 格式与类型

所有已接入的内部业务编号使用 `前缀YYYYMMDD-n`。日期是实际分配编号时的北京自然日，不使用用户补录的业务发生时间；每种编号类型每日从 1 独立递增，序号不补零、不承诺连续无缺口。

语义类型到前缀的唯一映射由 [BUSINESS_NUMBER_PREFIX](../../../packages/constants/src/business-number.ts) 维护。前缀取中文业务名称的大写拼音首字母，由开发者人工维护，保持稳定且互不重复，不提供动态配置或前缀格式／长度校验。文档以业务名称或稳定编号类型描述取号规则并引用本章，不复制具体前缀值；编号示例使用前缀占位。

供应商退回按 `supplier_return` 取号，生产报工含返工报工统一按 `step_report` 取号。物料和成品新库批共用 `inventory_batch` 类型与日序列；来源、权限和身份仍由结构化字段判断，不解析编号决定业务行为。

主数据版本编码、单据行号、修订号、审批动作序号、供应商批号和技术 UUID 不进入日序号。编号只由服务端生成；任务、盘点和新库存批次输入不接受手填编号。

## 平台序列表

`business_number_daily_sequence` 属于 platform-numbering。当前唯一运行时 SQL 写入口为 [mysql-business-number.ts](../src/infrastructure/numbering/mysql-business-number.ts)，业务 infrastructure 在当前事务内调用；application port 不接收数据库连接，也没有对外预领号接口。

职责：按编号类型和北京自然日保存最后已分配序号，为不同业务共用的原子取号提供锁定点。它只负责编号分配，不保存业务单据或决定业务状态。

| 字段 | 类型 | 可空／默认 | 含义 |
| --- | --- | --- | --- |
| `number_kind` | `VARCHAR(64)` | 非空，无默认 | 稳定编号类型 |
| `number_date` | `DATE` | 非空，无默认 | 分配编号时的北京自然日 |
| `last_sequence` | `BIGINT UNSIGNED` | 非空，无默认 | 最后已分配序号 |
| `created_at` | `DATETIME(3)` | 非空，默认 `CURRENT_TIMESTAMP(3)` | 当日类型计数首次创建时间 |
| `updated_at` | `DATETIME(3)` | 非空，默认及更新时 `CURRENT_TIMESTAMP(3)` | 最近一次计数更新时间 |

使用 InnoDB、`utf8mb4_0900_ai_ci`；复合主键为 `(number_kind,number_date)`，没有额外索引或外键。`chk_business_number_sequence_positive` 限制 `last_sequence > 0`；`chk_business_number_kind` 的当前值域为：

```text
work_order, production_batch, purchase_order, purchase_receipt,
incoming_inspection_order, supplier_return, purchase_inbound, finished_inbound,
other_inbound, other_outbound, inventory_batch, stock_check,
production_material_outbound, production_material_return, material_loss,
manual_material_demand, rework, step_report, abnormal_disposition,
scrap_supplement_plan, material_supplement, approval_instance
```

核验来源：[初始编号表](../../../packages/database/migrations/202609280001-business-number-daily-sequence.up.sql)、[其他出入库类型](../../../packages/database/migrations/202610140002-other-draft-history-deletion.up.sql)、[来料质检主单类型](../../../packages/database/migrations/202610280001-incoming-inspection-orders.up.sql)。技术计数不配置软删除、业务 version 或操作者；操作者从业务记录和成功审计追溯。旧 `work_order_daily_sequence` 仅保留历史 migration 所有权登记，运行时不再使用。

## 事务与日期

取号以当前事务连接的北京自然日为准，日序列锁保持到事务结束；不能用应用时钟、扫描业务最大编号或随机尾段代替。

计数、业务写入、成功审计和已启用的 HTTP 幂等结果原子提交。失败整体回滚；成功重放不再次取号。提交后编号不可因取消、关闭或更正回收。锁超时／死锁沿现有命令和[幂等错误协议](idempotency.md#8-错误与日志语义)处理，不在已失败事务内只重试计数语句。涉及多个类型时保持业务既有稳定锁序和取号顺序。

演示初始化是受门禁约束的离线写入方：从共享映射读取工单前缀，在 seed 事务中为缺失工单按同一类型／日期一次分配所需序号；不通过另一个计数器或扫描已有编号推算值。它不属于运行时业务入口。

## 库存批次与单据

新库存批次在实际确认创建时取号，已有目标保留原批号；同请求复用同一新目标时只取号一次。批号全局唯一不限制多张入库单引用同一批次。各类单据的取号时点、目标身份和来源授权见[Inventory 公开能力](../src/modules/inventory/docs/public-contracts.md)。

## 迁移与验证边界

旧编号和日计数不能推导转换；切换、空数据门禁及回退规则见[迁移安全](../../../packages/database/docs/migration-safety.md#202609280001业务日序号与库存批号唯一)，剩余验证见[路线图](../../../docs/roadmap.md)。
