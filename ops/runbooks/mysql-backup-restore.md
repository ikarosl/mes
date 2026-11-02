# MySQL 备份与空库恢复

本手册拥有单机 Compose 的数据库备份、恢复及失败后的停写边界。数据库结构和 migration 规则仍由[数据库包](../../packages/database/README.md)维护；本入口不执行 migration down，不覆盖已有数据库，不修改 migration 账本状态。

## 执行关系与阅读顺序

自动与手动 API 发布统一调用 `deploy-api.sh <digest>`。该脚本负责整个发布流程，在执行迁移和切换应用之前同步完成备份；备份失败即停止后续步骤。镜像下载、配置检查及启动缺失的基础服务可以先做，以避免在停写后才发现镜像不可用。

```text
自动：cd-images.yml ──SSH──┐
手动：sudo ────────────────┴─ deploy-api.sh <digest>（持有发布锁直到结束）
                              ├─ 检查配置、下载镜像、准备依赖
                              ├─ 记录维护状态、停止 Web/API
                              ├─ mes_create_backup release（必须成功）
                              ├─ 候选镜像：migrate.js → migrate-status.js
                              └─ Bucket 初始化 → 切换 API → readiness → 恢复原 Web

手动备份：backup-mysql.sh manual ───────────┐
定时备份：backup.timer → backup.service     │
                          └─ backup-mysql.sh scheduled
独立停写备份：backup-mysql.sh release ──────┴─ mes_create_backup
```

`mes_create_backup` 在 `mysql-backup-common.sh` 中实现。发布脚本直接复用它，不再启动另一份 `backup-mysql.sh` 进程；两条入口执行同一套备份逻辑，且不会重复争抢发布锁。手动发布只需执行一次 `deploy-api.sh`，不依赖操作人员记得先备份。独立的 `manual` 备份会恢复原服务，不能把它当作发布过程中持续停写的替代品。

阅读时按以下顺序查看；仓库脚本安装后位于 `/opt/easy-mes/`，定时单元位于 `/etc/systemd/system/`：

| 文件 | 负责什么、重点读哪里 |
| --- | --- |
| [cd-images.yml](../../.github/workflows/cd-images.yml) | CI 成功后构建镜像；开启[自动部署](api-image-release.md#自动部署开关)时同步控制文件，再通过 SSH 调用 API/Web 发布入口；阅读 `deploy-test-server`。 |
| [deploy-api.sh](../scripts/deploy-api.sh) | 完整发布顺序、持锁与失败停写；从 `mes_take_lock` 往下阅读，关注 `mes_create_backup` 必须先于迁移。 |
| [backup-mysql.sh](../scripts/backup-mysql.sh) | 独立备份的模式、定时时间校验和加锁入口。 |
| [mysql-backup-common.sh](../scripts/mysql-backup-common.sh) | 配置读取、维护状态、数据库读锁与导出；核心是 `mes_source_database`、`mes_begin_maintenance`、`mes_create_backup`。 |
| [migrate.ts](../../packages/database/src/migrate.ts) → [migration-runner.ts](../../packages/database/src/migration-runner.ts) | 前者加载连接并调用后者；后者校验历史、登记 running、执行 SQL，再登记 applied 或 failed。 |
| [migration-utils.ts](../../packages/database/src/migration-utils.ts)、[migrate-status.ts](../../packages/database/src/migrate-status.ts) | 前者按文件名读取 SQL、计算校验和；后者只读检查迁移是否全部完成，供部署与恢复阻止错误启动。登记与中断规则见[迁移安全](../../packages/database/docs/migration-safety.md#运行状态与中断)。 |
| [restore-mysql.sh](../scripts/restore-mysql.sh) → [resume-api.sh](../scripts/resume-api.sh) | 前者恢复备份到新库；人工核对、切库及选择镜像后，后者检查迁移状态并恢复服务。完整步骤见下方[人工恢复](#维护失败后的人工恢复)。 |

[安装器](../scripts/install-easy-mes-compose)负责首次安装运行文件；[apply-control.sh](../scripts/apply-control.sh)负责后续同步脚本与 Compose，内部的 `backup_dir` 只是临时控制文件副本。[deploy-web.sh](../scripts/deploy-web.sh)仅更新 Web，不执行数据库迁移或数据库备份；本次同时发布 API/Web 时，CD 先等 API 发布成功，再发布 Web。[service](../config/systemd/easy-mes-mysql-backup.service)负责执行独立备份脚本，[timer](../config/systemd/easy-mes-mysql-backup.timer)只负责定时触发。

## 备份入口与产物

宿主机只需 Bash、Docker Compose、GNU coreutils、gzip 与 flock，无需 Node。首次安装或从旧版四文件 CD 升级时，先从同一提交的完整部署包重跑[安装器](compose-server-deployment.md#安装文件与入口)，安装全部运行脚本和 systemd 单元；安装器保留已有人工 env、不启动服务、不启用 timer。旧版 `apply-control.sh` 无法齐套安装新入口，不能直接依赖第一次 CD 自升级。

人工备份：

```bash
sudo /opt/easy-mes/backup-mysql.sh manual
```

API 发布由上方统一入口自动执行 `release` 备份。独立维护时也可显式执行 `backup-mysql.sh release '<完整API镜像仓库>@sha256:<digest>'`，成功后保持 Web/API 停写，供人工继续维护；不得以普通备份成功推断可重新启动旧镜像。

三种模式都取得 `/run/lock/easy-mes-deploy.lock`，写入持久的 `/opt/easy-mes/mysql-maintenance.state` 并记录原 API/Web 状态后，停止 Web 入口及 API。API 不发布宿主机端口，Web 停止使候选 API 在 readiness 检查完成前无法接收常规业务流量；维护文件本身不是网关拦截器。备份期间独立 MySQL 会话持有 `FLUSH TABLES WITH READ LOCK`，阻止本实例写入和 DDL；所有基础表必须是 InnoDB，dump 使用 `--single-transaction --quick`。维护窗口内不得另行修改 schema、直接写业务库或升级 MySQL/MinIO。锁会话禁止自动重连，取得锁及结束时均确认会话存活；命令、锁等待和整个数据库备份阶段设有超时，失锁、超时或任一步失败均不会发布完成目录。

产物落在 `/srv/easy-mes/backups/mysql/<UTC时间>-<模式>-<唯一后缀>/`，目录仅 root 可访问，文件 `600`，创建时 `umask 077`：

- `database.sql.gz`：所有表和全部数据，包括 `_schema_migrations`，以及触发器、routines、events；保留 mysqldump 的字符集、创建时 SQL_MODE 和触发器顺序语义。数据在触发器创建前装载，避免重复派生流水或被不可变事实触发器拒绝。
- `metadata.env`：格式版本、起止时间、源库、MySQL 版本、库字符集/排序规则、当前 API/Web 镜像及目标 API 镜像；不保存密码或服务器 env。
- `objects.tsv`、`rows.tsv`：同一全局读锁内的对象/列/索引/约束、触发器顺序/SQL_MODE/字符集及逐表精确行数。
- `SHA256SUMS`：上述四文件的 SHA-256。先在隐藏临时目录完成，再原子改名；失败清理未完成目录，不产生伪成功备份。

密码仅在 MySQL 容器内从已有环境写入临时 `600` 客户端 option file，退出删除，不进入命令参数或日志。请勿使用 `bash -x`、输出容器环境或把凭证复制到备份 metadata。备份包含业务数据，应按生产数据保护。

`manual` 和 `scheduled` 成功后，只恢复备份前已运行的 API，并检查 readiness，再恢复原来运行的 Web；原来停止的组件保持停止。备份或重启失败时保留维护状态并停止 Web/API，不自动重开；已有完成备份仍保留。`release` 始终保留维护状态，直到候选镜像迁移、状态检查、Bucket 初始化及 API readiness 成功，再恢复原 Web。发布失败不自动启动旧 API，也不自动 down。首次部署的空库可以完整备份；源库不存在、连接失败或权限不足均失败关闭，不当成可跳过备份的首次发布。

## 配置与备份目录从哪里来

下表区分服务器配置、脚本内部变量和调用参数；无需为备份导出一组额外的环境变量。

| 来源 | 变量或参数 | 用途 |
| --- | --- | --- |
| `/etc/easy-mes/api.env` | `DB_HOST`、`DB_PORT`、`DB_NAME` | 当前业务库定位；备份源库取 `DB_NAME`，仅支持本 Compose 的 `mysql:3306`。 |
| 同一份 `api.env`，由 Compose 注入 API 容器 | `DB_USER`、`DB_PASSWORD` 及上述连接定位值 | 应用和镜像内的迁移/状态查询使用这套连接；源码本地运行则从仓库根 `.env` 加载，已注入的进程环境优先。 |
| MySQL 容器环境，最初由 `/etc/easy-mes/mysql.env` 注入 | `MYSQL_ROOT_PASSWORD` | 备份/恢复在容器内通过 socket 使用 root 账号导出和建库；密码不写入备份 metadata。修改宿主机 env 不会自动修改已有数据库密码。 |
| `/etc/easy-mes/mysql.env` | `MYSQL_DATABASE` | 首次初始化的库名；切库后不能用容器里保留的旧值判断当前业务库。 |
| `/etc/easy-mes/deploy.env` + 发布命令参数 | `API_IMAGE_REPOSITORY` + `sha256:<digest>` | 组合本次候选 API 镜像；自动调用的 digest 来自工作流 `API_DIGEST`。 |
| `/opt/easy-mes/release.env` | `API_IMAGE`、`WEB_IMAGE` | 当前选定的镜像，备份记录到 `metadata.env` 的 `current_api_image`、`current_web_image`。 |
| `mysql-backup-common.sh` 内部固定常量 | `MES_BACKUP_DIR` | 备份父目录 `/srv/easy-mes/backups/mysql`；不能通过 `export MES_BACKUP_DIR=...` 覆盖。 |
| `mes_create_backup` 内部变量 | `final_name` | 本次已完成备份的完整目录，由日志 `Backup completed: ...` 输出；子 shell 不会把它导出到调用者环境。 |
| 恢复脚本的命令参数 | `--backup`、`--target-database` | 明确选择整份备份目录及新库名；不读取 `BACKUP_FILE`，不自动选择“最新备份”。 |

`api.env` 的三项连接定位值须为字面值，可带配对引号，不接受变量展开。备份函数检查到 API 正在运行时，会核对容器的三项值与文件一致；部署入口已停写时按文件中的连接定位值处理。维护前须确认文件指向拟迁移的库，不能一边发布一边修改配置或直接写库。

查找恢复点时，从手动命令输出、CD 的 SSH 部署日志或 `journalctl -u easy-mes-mysql-backup.service` 取得完成目录，并核对其中 `metadata.env` 的源库、完成时间及镜像。文件夹时间使用 UTC（末尾 `Z`），半月定时窗口使用北京时间。发布前备份与故障后留证备份用途不同，不能仅取时间最新的一份用于回退。

## 半月自动备份

安装器和后续 CD 同步 `easy-mes-mysql-backup.service` / `.timer`，只执行 daemon-reload，不启用或启动任务。完成下面的恢复演练并确认维护时间后，由管理员显式启用：

```bash
sudo systemd-analyze calendar '*-*-01,16 03:00:00 Asia/Shanghai'
sudo systemctl enable --now easy-mes-mysql-backup.timer
sudo systemctl list-timers --all easy-mes-mysql-backup.timer
sudo journalctl -u easy-mes-mysql-backup.service
```

任务在北京时间每月 1 日和 16 日 03:00 执行。`Persistent=false`，脚本还自行限定当日 03:00–03:14 可开始；错过窗口直接跳过，不补发。锁被占用则报告失败，不排队占用后续维护窗口。手动入口不受定时窗口限制。停用使用 `systemctl disable --now easy-mes-mysql-backup.timer`。

半月频率意味着故障时可能丢失约半月、最长约 16 天的数据，不提供时间点恢复承诺。脚本不自动清理备份；异地副本、MinIO 备份与保留策略尚待确定，不能自动删除唯一可用副本。磁盘空间与失败/跳过任务需纳入部署报警验收。

## 恢复演练与新库恢复

优先在隔离 MySQL 实例演练，使用兼容的 MySQL 版本、源库字符集和必要 DEFINER 账号。运行入口从当前 Compose 的 `mysql` 容器连接；演练实例使用独立安装配置，不能偷偷改生产连接。备份包含 event 时，恢复要求 `event_scheduler=OFF`（或实例启动时 `DISABLED`），避免恢复的 event 在验证前写入；生产依赖 scheduler 时应另建隔离恢复实例，不为演练修改生产全局状态。不含 event 的备份允许 scheduler 保持启用。

指定已完成备份目录和一个**尚不存在**的新数据库名：

```bash
sudo /opt/easy-mes/restore-mysql.sh \
  --backup '/srv/easy-mes/backups/mysql/<已完成备份目录>' \
  --target-database easy_mes_restore_20261102
```

入口先核对文件权限、全部 SHA-256 和 gzip，再检查目标未存在，按源库字符集/排序规则创建。目标不得是源库、当前应用库或系统库；即使现有库没有表也拒绝覆盖。dump 不使用 `--databases`，不得含源库 `USE` / `CREATE DATABASE`；发现源库限定引用也拒绝换名恢复，须在隔离环境审查其语义，不能机械替换业务 SQL。

mysqldump 官方导入脚本会暂存并调整会话级外键检查等设置，只允许在此新空库恢复边界内使用；不得把它作为 migration 关闭外键检查的依据。恢复失败保留部分库供检查，不 DROP、不覆盖重试；再次演练用另一个新库名。完整恢复后比较对象、约束、触发器顺序/SQL_MODE/字符集及每张表行数，任何差异报告失败；不会重写 `_schema_migrations` 的 `running` / `failed` / `applied` 状态。校验通过不代表业务、附件或数据库账号授权已验收。

## 维护失败后的人工恢复

出现维护状态时，Web 发布、控制文件协调和 TLS 自动重载均拒绝介入；API 发布可以在停写状态下重试，但失败 migration 账本会阻止盲目续跑。不得直接删除维护文件再执行整体 `compose up`，不得把旧镜像自动连接到部分迁移的库。

管理员先确认失败阶段、发布前备份、实际 schema、migration 账本与镜像匹配，并协调外部 SQL 写入。决定回退或恢复前，先对当前问题库再次完整备份并保持停写；使用已有 `release` 模式，目标传入已选的完整 API 镜像，而不是会在成功后恢复服务的 `manual`：

```bash
sudo /opt/easy-mes/backup-mysql.sh release \
  'docker.io/<user>/easy-mes-api@sha256:<拟恢复API digest>'
```

该入口允许在已有维护状态下备份失败库，成功后仍保持 Web/API 停止。保留问题库、这份留证备份及原发布前备份；留证备份用于核对和补录，不代替选定的恢复点。备份失败时继续停写并处理原因，不盲目覆盖问题库。

若问题仅在应用层，实际 schema 与所选旧镜像兼容，且该镜像能通过只读 migration status 门禁，可仅在 `release.env` 选择匹配的 API/Web digest，保留当前数据库数据后继续下方人工恢复入口。schema 不兼容、migration 部分执行或状态门禁未通过时，不能只回退应用，也不能绕过状态检查或自动 down；应恢复选定的发布前备份到新库并验证，再人工切换数据库与镜像。

当前门禁要求所选镜像识别全部已登记迁移，常见适用情形是没有数据库迁移的应用发布。即使人工判断新增字段兼容旧代码，只要旧镜像不认识新迁移记录也会拒绝启动；本入口不提供跳过检查的参数或自动兼容判断。

恢复新库后，由 DBA 核验原应用数据库账号对新库的访问授权，脚本不擅自扩大权限，缺少授权时 readiness 会失败。再将 `/etc/easy-mes/api.env` 的 `DB_NAME` 与 `/etc/easy-mes/mysql.env` 的 `MYSQL_DATABASE` 指向新库，并按恢复点 `metadata.env` 中的 `current_api_image` / `current_web_image` 在 `release.env` 显式选择匹配的 API/Web digest。首次部署尚无 Web 镜像记录时，该项为空，须人工核对适配的版本，不能猜测或使用 `latest`。密码继续仅存 `600` 的人工配置。备份不会自动恢复这些配置、账号或 MinIO 文件，需同时处理附件一致性。

迁移失败不会自动把字段改回去；恢复数据库会回到所选备份时间点。只有发布前已停写、备份完整且验证成功，并且此后没有需保留的新写入等条件满足时，才能按该恢复点讨论无数据损失。上线后已产生的数据不会因恢复旧备份自动保留，应从保留的问题库及留证备份核对恢复点后的新增和修改，按所属模块允许的业务操作人工补录、纠正并核验附件，不直接合并不兼容表或篡改不可变事实；不能承诺任意故障和降级都无损。

明确审查完毕后，使用当前 `release.env` 中的 API digest：

```bash
sudo /opt/easy-mes/resume-api.sh 'sha256:<当前已选API digest>' --database-reviewed
```

该确认参数表示人工已核对数据库、镜像、外部写入和失败原因。入口验证 digest 一致，先执行镜像内只读 migration status；存在 pending、running、failed、checksum/顺序异常则拒绝启动。状态检查无法证明实际 schema 与账本完全等价，不能替代恢复或人工 schema 核验。检查通过后启动所选 API，readiness 成功才恢复维护前运行的 Web 并移除维护状态；失败再次停止 Web/API。之后仍须人工验收登录、核心业务读写和附件访问。

正式上线门禁还包括：从有效备份在新库完成恢复演练，保留可用异地副本，确认数据库与 MinIO 附件的一致恢复时间点，以及监控、磁盘空间、备份失败/跳过报警和恢复授权流程。当前脚本提供执行入口，不代表上述部署验收已通过。

## 后续凌晨部署约束（尚未启用）

开启[自动部署](api-image-release.md#自动部署开关)后，现有 CD 在 CI 和镜像构建成功后立即发布。当前只提供半月备份 timer，不安装或启用部署 timer。后续若改为凌晨部署：白天完成构建、测试、批准和固定 digest 预拉；由服务器按 `Asia/Shanghai` 04:00 调度，部署脚本自行检查批准记录、发布锁及维护窗口，超窗跳过且不补发，不能只依赖 `Persistent=false`。窗口结束时间尚待配置。手动维护入口独立，须明确由人工启动；自动部署只更新 API/Web，readiness 与约定的核心业务路径检查成功后才解除维护，不能仅凭 liveness 声称业务验收完成。基础设施升级仍是单独的人工维护操作。
