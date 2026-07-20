# 迁移路线图

## 原则

迁移采用绞杀式、按模块推进。旧项目在迁移期间继续作为事实实现，新目录只接收通过测试保护的工程能力和业务模块；禁止整仓复制业务代码。

## 阶段 0：冻结依据

- 明确 `newSqlDesign.md` 版本号、评审人和变更流程。
- 清理“最新/废弃”文档标识，避免多份设计并存。
- 输出模块边界、状态字典和 API 契约。

退出条件：数据库和核心状态流转没有未确认冲突。

## 阶段 1：工程底座

- 初始化 pnpm + Turborepo、共享 lint/tsconfig、配置 schema、日志、request-id。
- 建立 CI、Docker 多阶段构建、本地 Compose、健康检查。
- 建立测试样例和测试容器。

退出条件：空项目在干净环境能 install、lint、typecheck、test、build、启动和探活。

## 阶段 2：数据与基础设施

- 建立 baseline migration、迁移状态检查、fresh/upgrade CI。
- 实现 StoragePort 的 local + S3 compatible adapter。
- 实现 CachePort/LockPort 的 Noop + Redis adapter，但默认关闭 Redis。
- 建立备份恢复与迁移失败 runbook。

退出条件：空库可重建，现有库副本可升级，对象存储可替换。

## 阶段 3：按模块迁移

推荐顺序：identity -> product/process -> production -> inventory -> quality -> traceability。每个模块均执行：契约冻结、特征测试、数据迁移、代码迁移、双写/影子读（必要时）、验收、切流、旧入口下线。

## 阶段 4：上线治理

- 预发布演练、容量测试、备份恢复演练。
- 蓝绿或滚动发布；数据库先 expand 后 deploy，最后 contract。
- 观察错误率、P95、慢 SQL、连接池、队列和存储错误。

## 回滚

应用镜像可回滚到上一版本；数据库默认前滚修复。若迁移包含不可逆数据变化，发布前必须有经验证的备份恢复点和停机窗口说明。
