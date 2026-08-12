# 演示数据

本目录保存可重复加载的开发/演示样例数据，与 `seed` 中的运行基础数据严格分离。

当前数据集包含：

- System：生产操作工、生产管理员角色，`operator-001`、`operator-002`、`production-001` 三个演示账号及其授权；
- Product：微带成品、两种外购物料、BOM、装配/粘接工序、启用的 V1.0 工艺路线及工序物料绑定。

`admin` 账号不在演示数据中，仍由 `pnpm db:bootstrap-admin` 通过环境变量初始化。演示账号共用的密码不会写入 SQL，执行时由 `DEMO_USER_PASSWORD` 生成 bcrypt 哈希。

完整初始化与演示数据加载：

```powershell
corepack pnpm db:init
$env:ALLOW_DEMO_SEED='1'
$env:DEMO_USER_PASSWORD='<至少 6 位的演示密码>'
corepack pnpm db:seed:demo
```

该命令按业务编码幂等更新数据，可以重复执行；不会删除其他业务数据。它不会进入 `db:init`、生产部署或 CI 自动执行链路。不得在生产数据库启用此门禁。
