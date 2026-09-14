# 跨模块测试

这里放不能由单一 workspace 或源码模块独立拥有的测试。测试分层、目录约定和门禁以[全局测试策略](../docs/testing-strategy.md)为准。

## 当前内容

`integration/` 使用真实 MySQL 验证 migration、Repository、事务、并发和完整 HTTP/application 闭环。运行时必须显式设置 `RUN_MYSQL_INTEGRATION=1`，并确保 `TEST_DB_*` 与 `DB_*` 指向同一个以 `_test` 结尾的专用数据库。

审批[业务套件](integration/approval/approval.mysql.test.ts)使用实际节点执行记录和角色/指定用户配置构造 fixture，不创建个人任务或模拟历史通知授权。[迁移套件](integration/approval/approval-assignees-migration.mysql.test.ts)单独构造旧结构，验证历史决定与证据保留、角色/用户约束、回滚保护和 up/down/up 结构一致性。数据库清理顺序遵守当前外键关系，失败也必须释放连接、关闭 HTTP 应用并清理本套件资料；迁移测试只在独立临时测试库执行 DDL，不能改写已执行 migration。已有本机 MySQL 时直接使用该服务，初始化由测试命令编排，不要求 Docker。

通知[持久化套件](integration/notification/notification.mysql.test.ts)验证发布去重、并发、固定收件、首次已读和事务审计；[HTTP 套件](integration/notification/notification-http.mysql.test.ts)使用真实认证及全局管线验证无业务权限用户的本人通知访问和目标独立鉴权；[迁移套件](integration/notification/notification-migration.mysql.test.ts)验证完整迁移链、up/down/up、非空回滚保护及外键/唯一键/CHECK。通知夹具及审批夹具均先清理本次创建的收件与消息，再清理用户，避免长期保留外键影响测试隔离。

仓库当前没有 Contract、E2E 或 Performance 测试实现，因此不保留对应占位子目录文档。形成可运行测试及独立配置后，再创建相应目录和 README。

## 验证

```text
corepack pnpm typecheck:integration
corepack pnpm test:production:mysql
```
