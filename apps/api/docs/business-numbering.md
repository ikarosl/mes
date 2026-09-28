# 业务自动编号

本章维护平台编号格式、日计数和事务边界；业务记录、建批资格和入库关系由各模块所有。决策理由见 [ADR-0017](../../../docs/adr/0017-business-numbering-and-beijing-time.md)，时间类型见[数据库公共规则](../../../docs/database-conventions.md#统一类型与状态规则)。

## 格式与类型

所有已接入的内部业务编号使用 `前缀YYYYMMDD-n`，例如 `WO20260928-1`。日期是实际分配编号时的北京自然日，不使用用户补录的业务发生时间；每种编号类型每日从 1 独立递增，序号不补零、不承诺连续无缺口。

语义类型到前缀的唯一代码映射为 [BUSINESS_NUMBER_PREFIX](../../../packages/constants/src/business-number.ts)。前缀由开发者人工维护，保持稳定且互不重复，不提供动态配置或前缀格式／长度校验。供应商退回使用 VR，生产报工含返工报工统一使用 SR。物料和成品新库批共用 inventory_batch / IB；来源、权限和身份仍由结构化字段判断，不解析编号决定业务行为。

主数据版本编码、单据行号、修订号、审批动作序号、供应商批号和技术 UUID 不进入日序号。编号只由服务端生成；任务、盘点和新库存批次输入不接受手填编号。

## 平台序列表

`business_number_daily_sequence` 属于 platform-numbering。当前唯一运行时 SQL 写入口为 [mysql-business-number.ts](../src/infrastructure/numbering/mysql-business-number.ts)，业务 infrastructure 在当前事务内调用；application port 不接收数据库连接，也没有对外预领号接口。

| 字段 | 类型与约束 | 语义 |
| --- | --- | --- |
| number_kind | VARCHAR(64)，非空，CHECK 限定已登记类型 | 稳定语义类型 |
| number_date | DATE，非空 | 北京自然日 |
| last_sequence | BIGINT UNSIGNED，非空且大于零 | 最后分配值 |
| created_at / updated_at | DATETIME(3)，默认当前时间；更新自动推进 updated_at | 技术记录时间 |

复合主键为 `(number_kind,number_date)`。技术计数不是业务事实，不配置软删除、业务 version 或操作者；操作者从业务记录和成功审计追溯。旧 `work_order_daily_sequence` 仅保留历史 migration 所有权登记，运行时不再使用。

## 事务与日期

分配器通过同池、已设置 `time_zone='+08:00'` 的连接读取一次数据库 CURRENT_DATE，原子 upsert 递增对应计数，在同一连接内读取字符串序号。排他行锁保持到业务事务结束；不扫描业务表取 MAX，不使用应用内计数或随机尾段，不把 BIGINT 转成 JavaScript number。

计数、业务写入、成功审计和已启用的 HTTP 幂等结果原子提交。失败整体回滚；成功重放不再次取号。提交后编号不可因取消、关闭或更正回收。锁超时／死锁沿现有命令和[幂等错误协议](idempotency.md#8-错误与日志语义)处理，不在已失败事务内只重试计数语句。涉及多个类型时保持业务既有稳定锁序和取号顺序。

演示初始化是受门禁约束的离线写入方：从共享映射读取工单前缀，在 seed 事务中为缺失工单按同一类型／日期一次分配所需序号；不通过另一个计数器或扫描已有编号推算值。它不属于运行时业务入口。

## 库存批次与单据

全局唯一约束位于 `item_batch.batch_code`。它只防止不同批次重号，不限制多张入库单、多条入库明细引用同一 `item_batch.id`。

入库目标仍区分 `{mode:'new',clientKey}` 与 `{mode:'existing',batchId}`。新目标在实际确认事务创建批次时取 IB；同请求相同 clientKey 只创建／取号一次。已有目标复用原批次和批号，不取 IB。每次新入库确认分别生成 PI 或 FI 单号，重复请求按现有幂等重放。具体身份、单位、状态和来源授权校验见 [Inventory 公开能力](../src/modules/inventory/docs/public-contracts.md)。

## 迁移与验证边界

追加 `202609280001-business-number-daily-sequence` 成对 migration；升级和回滚前均暂停全部受影响写入，并要求相关编号业务表及旧 HTTP 幂等记录为空。开发数据通过统一初始化流程重建，不转换旧编号、不推导旧日计数、不保留兼容双写。迁移还为库存批号增加全局唯一键，保留归批和必要的组合外键。

迁移运行限制见[迁移安全](../../../packages/database/docs/migration-safety.md)。实现、启动验证、用户验收和正式测试是不同阶段；剩余验证集中在[路线图](../../../docs/roadmap.md)。
