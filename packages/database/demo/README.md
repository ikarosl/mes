# 演示数据

本目录保存可重复加载的开发/演示样例数据，与 `seed` 中的运行基础数据严格分离。

当前数据集包含：

- System：生产操作工、生产管理员角色，`operator-001`、`operator-002`、`production-001` 三个演示账号及其授权；
- Product：三个同名不同编码成品、两个同名基础物料 `m1.077.012` / `m1.077.013`、六个大小版本、仅关联基础物料的 BOM，以及被三个成品共同用作默认值的独立工艺路线；
- Production：`demo-mass-001` 批量工单与 `demo-research-001` 研发工单，均为草稿，不自动下达、选版本、生成需求或库存流水。

成品写 `products`，基础物料写 `materials`，具体版本写 `material_variants`。两个物料都叫“微带”，分类为“半成品 → 微带电路”，获取方式为 `purchased`；分类不意味着开放自产半成品链路。版本候选由管理员选择，批量单整个工单锁定同物料一个版本，研发单允许在 BOM 基础物料内选择多个启用版本。

`admin` 账号不在演示数据中，仍由 `pnpm db:bootstrap-admin` 通过环境变量初始化。演示账号共用的密码不会写入 SQL，执行时由 `DEMO_USER_PASSWORD` 生成 bcrypt 哈希。

完整初始化与演示数据加载：

```powershell
corepack pnpm db:init
$env:ALLOW_DEMO_SEED='1'
$env:DEMO_USER_PASSWORD='<至少 6 位的演示密码>'
corepack pnpm db:seed:demo
```

System 演示账号和权限仍按业务编码幂等更新；Product 主数据与 Production 草稿工单只补缺失样例，可以重复执行；不会覆盖已有样例的业务编辑、已锁定 BOM、已启用路线步骤或已下达工单。已有同名编码记录的停用/删除状态也不自动恢复。它不会进入 `db:init`、生产部署或 CI 自动执行链路。不得在生产数据库启用此门禁。

拆表迁移要求空业务库；开发环境允许完全重置，无需保留兼容数据。先从空库执行完整 migration 和系统初始化，再显式运行 demo。应用适配状态见[roadmap](../../../docs/roadmap.md)，demo SQL 成功不表示旧接口已适配新结构。

演示路线所有工序统一报工；操作工通过报工数量达标自动完成工序，不授予单独完成工序权限。
