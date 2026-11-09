# 跨模块测试

这里放不能由单一 workspace 或源码模块独立拥有的测试。测试分层、目录约定和门禁以[全局测试策略](../docs/testing-strategy.md)为准。

## 当前内容

`integration/` 使用真实 MySQL 验证 migration、Repository、事务、并发和 HTTP/application 闭环。运行前提与专用库保护见[测试策略](../docs/testing-strategy.md#业务-mysql-integration)。

测试按所验证的业务归属组织，生产相关入口进一步按职责分目录：

| 目录                                  | 内容                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| `integration/database/`               | 共享事务、迁移初始化与重复执行、基线回退保护及运行器的失败保护 |
| `integration/production/execution/`   | 追踪卡执行、异常、数量与事务覆盖的待恢复说明                   |
| `integration/production/materials/`   | 生产分配、领料、退料与损耗、供需及追溯                         |
| `integration/production/persistence/` | 批次与需求持久化、数据库约束及事务                             |
| `integration/production/fixtures/`    | 生产测试数据清理的待恢复说明                                   |
| `integration/inventory/`              | 库存流水不可变性、余额投影及库存事务的待恢复说明               |
| `integration/fixtures/`               | 当前结构的基础资料构造器，以及迁移读取与执行辅助函数           |

生产领退料用例包含库存影响断言时，仍作为完整生产流程保留，不因涉及库存表就拆断同一用例。跨模块夹具按需复用，目录位置不表示其依赖已全部消除。

[基础资料夹具](integration/fixtures/master-data-fixture.ts)集中提供当前结构的用户、角色、分类、成品、物料与精确版本插入入口，接收测试连接及具名参数。各套件显式提供本场景的身份、归属及影响断言的字段，其余使用合法默认值；必填字段变化时先调整对应构造器。共享的是构造方式，各套件仍负责独立的数据标识和清理，不共用可变业务记录。审批、生产和库存事实由所属场景准备，不由基础资料夹具隐式创建。

这些入口按当前表结构直接写入，不代表通过业务命令的资格校验。验证历史迁移区间时，继续在所属迁移测试中显式构造该版本的数据；只有已应用最新完整迁移链、且受测迁移未改变这些基础表结构的场景才复用当前夹具。

包含有效测试的 `*.mysql.test.ts` 是 Vitest 运行入口。共享可变夹具及执行顺序的审批套件保留统一入口，在 `*.cases.ts` 中按功能定义场景，由入口按原顺序注册；有效的 `*-fixture.ts` 只提供初始化、数据构造和清理，不单独注册测试。仅含恢复说明的原文件不注册测试，也不计为通过覆盖。

生产 `execution/`、`materials/`、`persistence/` 及 `inventory/inventory-ledger.mysql.test.ts` 的旧结构夹具覆盖目前暂停执行，原位置只保留测试目的、重要性与暂停原因、恢复条件的 TODO 注释；失效共用夹具不保留实现或专属导入。旧人工报工、异常审批和返工补产已由追踪卡流转、随盘异常及末道终检替代，恢复时使用当前所有者契约，不恢复退役业务主线。上述说明属于待恢复的高重要性覆盖，不是已通过的数据库验证；恢复范围与优先级见[路线图](../docs/roadmap.md#存量测试恢复待正式测试授权)。迁移专项是否保留按[迁移测试取舍](../docs/testing-strategy.md#migration-测试的范围与维护)判断。

创建任务 HTTP 等当前能力的夹具恢复仍按路线图推进。已退役旧链的历史库存投影转换及完整 down 缺陷不再属于当前支持路径；退役不表示旧缺陷已修复。当前基线、非空保护和迁移失败的验证边界见[迁移安全](../packages/database/docs/migration-safety.md#验证边界)。

审批[业务套件](integration/approval/approval.mysql.test.ts)使用实际节点执行记录和角色/指定用户配置构造 fixture，不创建个人任务或模拟历史通知授权。[数据库约束套件](integration/approval/approval-assignees-migration.mysql.test.ts)在当前结构验证角色／用户约束、外键、单节点决定唯一及非空回退保护；历史证据保留继续由业务测试验证。数据库清理顺序遵守当前外键关系，失败也必须释放连接、关闭 HTTP 应用并清理本套件资料；迁移测试只在独立临时测试库执行 DDL，不能改写已执行 migration。

通知[持久化套件](integration/notification/notification.mysql.test.ts)验证发布去重、并发、固定收件、首次已读和事务审计；[HTTP 套件](integration/notification/notification-http.mysql.test.ts)使用真实认证及全局管线验证无业务权限用户的本人通知访问和目标独立鉴权；[迁移套件](integration/notification/notification-migration.mysql.test.ts)验证完整迁移链、up/down/up、非空回滚保护及外键/唯一键/CHECK。通知夹具及审批夹具均先清理本次创建的收件与消息，再清理用户，避免长期保留外键影响测试隔离。

仓库当前没有 Contract、E2E 或 Performance 测试实现，因此不保留对应占位子目录文档。形成可运行测试及独立配置后，再创建相应目录和 README。

## 验证

```text
corepack pnpm typecheck:integration
corepack pnpm test:production:mysql
```
