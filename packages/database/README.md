# packages/database

只包含数据库连接工厂、迁移 CLI、迁移文件和测试种子。业务 Repository 留在各领域模块的 infrastructure 层。

禁止在这里放未确认的业务表；首次基线必须从已冻结的 `newSqlDesign.md` 生成并评审。
