# Approval 数据库设计

> [返回模块](../README.md)。本章对应 `202609100001-approval-bom-pilot` 及 `202609120001-approval-node-assignees`，定义六张审批表，不包含通知与工单字段。`approval_instance_steps` 是唯一节点待办事实，个人任务表已移除。

## 2. 公共字段和约束

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)：ID/FK 为 `BIGINT UNSIGNED`，API 中用字符串传输；时间为 `DATETIME` 北京时间，接口带 `+08:00`；状态使用 `VARCHAR + CHECK`，稳定编码集中在 constants，contracts 使用字符串联合类型。

以下缩写展开为实际列，不是额外表：

| 字段组 | 列与规则 |
| --- | --- |
| 配置审计 C | `created_by/created_at/updated_by/updated_at/is_deleted/deleted_by/deleted_at`；另加 `version INT NOT NULL DEFAULT 0 CHECK(version >= 0)` 用于配置聚合并发 |
| 单据审计 D | `created_by/created_at/updated_by/updated_at/version`，`version INT NOT NULL DEFAULT 0 CHECK(version >= 0)`；无软删除列，终止用状态表达 |
| 事实审计 F | `created_by/created_at`，不可覆盖、删除 |

新审批申请的 `created_by` 必填并表示申请人，不再重复 `applicant_id/submitted_by`；`created_at` 表示提交时间。实际人工作业的操作者必填，事务内派生任务沿用触发人；日后系统作业是否使用空操作者须另行定义。新外键默认限制删除，不级联删除审批、通知或人员历史。所有者校验负责引用对象的状态和业务归属，外键不能替代它。

生成列使用 `CASE WHEN ... THEN 1 ELSE NULL END` 构造活动槽，再用组合唯一键约束“最多一条活动记录”；多条历史记录允许槽为空。迁移在 MySQL 上建立生成列唯一约束及 CHECK。该槽是约束辅助值，不是第二份可写状态。

## 3. 场景目录与流程配置

### 3.1 代码 Registry

每个业务模块声明场景，通过 `public.ts` 导出，由装配层合并。Registry 是能力目录的唯一来源，数据库保存 `scene_code` 作为稳定引用，不建立 `approval_scenes`。编码示意为 `product.bom.approve`；常量集中在 `packages/constants`，此类分段能力标识不混入状态值字典。

场景描述包括编码、所属模块、中文显示名、固定对象类型、提交及审批权限要求、详情契约版本，以及已装配的业务适配能力。用户不能从 HTTP 指定任意场景、对象类型或回调地址绕过业务提交入口。Registry 不保存数据库连接；重复编码、业务处理器缺失须在装配验证中发现。

场景查询从 Registry 出发，批量关联流程定义及发布指针，返回未配置、仅草稿、已发布、已发布且有草稿等展示状态。新业务场景部署后可出现，但未完成业务门禁和适配的场景不得开放提交。场景显示名可调整，稳定编码不能随意改；有在途申请时不得删除处理能力，历史读取必须保留。

### 3.2 `approval_flow_definitions`

一行对应一个场景的流程配置入口，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `scene_code` | `VARCHAR(100) NOT NULL` | Registry 中存在的场景 |
| `name` | `VARCHAR(100) NOT NULL` | 管理员定义的流程显示名 |
| `published_version_id` | `BIGINT UNSIGNED NULL` | 当前供新申请采用的版本 |
| 配置审计 C | 见 §2 | 流程入口审计与并发 |

约束：`UNIQUE(scene_code)` 永久不复用；发布指针通过组合 FK `(published_version_id,id) -> approval_flow_versions(id,definition_id)` 保证属于本定义，子表建好后再追加该外键。没有发布指针即不能开始申请。首期不提供流程删除或“禁用后自动免审”入口，配置归档不用于绕过必需审批。

### 3.3 `approval_flow_versions`

保存配置草稿及不可改写的已发布流程内容，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `definition_id` | `BIGINT UNSIGNED NOT NULL` | 所属流程定义 FK |
| `version_no` | `INT NOT NULL` | 从 1 递增的配置版本号，不是乐观锁字段 |
| `status` | `VARCHAR(20) NOT NULL` | `draft/published/discarded` |
| `published_by` | `BIGINT UNSIGNED NULL` | 发布人 FK users |
| `published_at` | `DATETIME NULL` | 发布时间 |
| `draft_slot` | 生成列，可空 | 仅 `draft` 时为 1 |
| 配置审计 C | 见 §2 | `version` 表示草稿编辑次数 |

约束：`UNIQUE(definition_id,version_no)`、`UNIQUE(id,definition_id)`、`UNIQUE(definition_id,draft_slot)`；`version_no > 0`；`published` 必须同时有发布人和时间，其他状态必须都为空。旧版即使不再被当前指针选中仍保持 `published`，不改其内容。

编辑节点须先锁定义、再锁此版本并核对草稿 ID 和乐观锁，保存完整顺序后递增 `version`；发布按定义、版本的固定顺序锁定，检查至少一级、连续顺序、角色或指定用户有效和各级当前均有合格人员，再原子写发布状态与定义指针。新版本号在定义锁内分配。`discarded` 为保留状态，本次未开放废弃草稿接口，不物理删除或覆盖已发布版本。

### 3.4 `approval_flow_steps`

流程版本中的有序节点，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `flow_version_id` | `BIGINT UNSIGNED NOT NULL` | 版本 FK |
| `node_code` | `VARCHAR(64) NOT NULL` | 服务端生成的稳定节点编码，不随排序改变 |
| `step_no` | `INT NOT NULL` | 正整数顺序 |
| `name` | `VARCHAR(100) NOT NULL` | 节点名称 |
| `assignee_type` | `VARCHAR(20) NOT NULL` | `role/user`，每级二选一 |
| `role_id` | `BIGINT UNSIGNED NULL` | 角色节点的审批角色 FK roles |
| `assignee_user_id` | `BIGINT UNSIGNED NULL` | 用户节点的指定用户 FK users |
| `active_step_no` | 生成列，可空 | 未软删除时等于 `step_no`，否则为空，仅约束当前排序位置 |
| 配置审计 C | 见 §2 | 写入仍以版本头为聚合并发边界 |

约束：`UNIQUE(flow_version_id,node_code)` 永久不复用、不含软删除标志；`UNIQUE(flow_version_id,active_step_no)` 约束有效排序位置，位置不是稳定节点身份；`UNIQUE(id,flow_version_id)`、`CHECK(step_no > 0)`。节点配置仅能在所属版本为草稿时修改；发布后的节点禁止任何编辑或删除。草稿移除节点使用软删除，恢复同一节点复用原 ID 和编码；发布和实例化只采用有效节点。排序由完整草稿更新统一实现，避免逐行换位撞唯一键。

CHECK 保证角色节点只填写 `role_id`，用户节点只填写 `assignee_user_id`，两个引用不能同时存在或同时为空。`(assignee_user_id,flow_version_id)` 支持用户引用；角色沿用其外键支撑索引。不使用多态身份字段。每级任意一名合格人员明确决定；用户节点只有该指定人，没有多角色、多名指定用户、会签、认领或转交。

已发布版本固定分配类型及角色/用户 ID。角色成员、账号和权限使用 Identity 公开能力实时解析；指定用户仍需账号有效并拥有审批权限，配置不会自动赋权。运行中人员恢复资格后可直接处理当前节点，不能修改在途申请的规则或将指定用户自动换成他人。

## 4. 审批申请、节点、人员和证据

### 4.1 `approval_instances`

一行是一次真实送审，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_no` | `VARCHAR(100) NOT NULL` | 唯一申请编号 |
| `scene_code` | `VARCHAR(100) NOT NULL` | 稳定场景编码 |
| `subject_type` | `VARCHAR(50) NOT NULL` | 场景确定的对象类型：`product / production_demand_correction / production_batch_closeout` |
| `subject_id` | `BIGINT UNSIGNED NOT NULL` | 业务对象 ID |
| `flow_version_id` | `BIGINT UNSIGNED NOT NULL` | 本次采用的已发布版本 FK |
| `title` | `VARCHAR(255) NOT NULL` | 服务端生成的申请标题 |
| `subject_version` | `INT NOT NULL` | 提交并冻结业务对象后的并发版本 |
| `snapshot_schema_version` | `INT NOT NULL` | 受审证据结构版本 |
| `subject_snapshot` | `JSON NOT NULL` | 提交时受审内容，不可改写 |
| `policy_snapshot` | `JSON NOT NULL` | 本次人员规则：首期允许自审、跨级同人，节点任一人决定 |
| `status` | `VARCHAR(20) NOT NULL` | `pending/approved/rejected/withdrawn` |
| `ended_at` | `DATETIME NULL` | 终态时间 |
| `active_slot` | 生成列，可空 | `pending` 时为 1，包括节点无人可审的申请 |
| 单据审计 D | 见 §2 | 创建人即申请人 |

约束：`UNIQUE(instance_no)`；`UNIQUE(scene_code,subject_type,subject_id,active_slot)` 防止并发重复送审；索引 `(created_by,status,created_at,id)` 和 `(scene_code,subject_type,subject_id,created_at,id)`。`subject_version >= 0`，`snapshot_schema_version > 0`；`pending` 时结束时间为空，终态非空。

通用提交引擎在创建申请的同一事务内调用业务 handler 绑定申请，再以绑定返回的版本确定 `subject_version`；不推算其他模块的版本递增方式。`snapshot_schema_version` 由业务 handler 随快照返回，历史详情的证据结构校验也由对应 handler 承担。提交完成后不改写快照或冻结版本；新 BOM 证据采用结构版本 2，不含关键物料和记录批次标志。结构版本 1 的既有证据保持原文，Product 读取时投影当前公开字段，不将已移除属性返回前端；未知结构版本拒绝读取。

多态 `subject_id` 不建立指向多张业务表的伪外键。提交和每次最终业务操作经所属模块验证对象存在性、场景与对象类型、当前申请关联；`scene_code` 与所选版本所属定义相符由事务校验。申请的场景、对象、流程版本、证据、人员规则及申请人一经提交不可更换。未来收紧自审规则默认只影响新申请，不能静默改写旧申请的规则或历史决定；账号、角色及当前权限仍实时校验。

Production 更正和收尾证据结构版本均为 1，分别由其 handler 校验；其申请来源、冻结和生效字段详见 [Production 需求设计](../../production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代) 与[批次收尾设计](../../production/docs/database/production-termination.md)。Approval 表不复制业务执行数量或工序状态。

### 4.2 `approval_instance_steps`

本次申请的节点执行情况，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 申请 FK |
| `flow_step_id` | `BIGINT UNSIGNED NOT NULL` | 不可变已发布配置节点 FK |
| `step_no` | `INT NOT NULL` | 本次节点顺序，须与配置一致 |
| `status` | `VARCHAR(20) NOT NULL` | `waiting/pending/approved/rejected/cancelled` |
| `activated_at` | `DATETIME NULL` | 首次轮到本级的时间 |
| `ended_at` | `DATETIME NULL` | 本级结束时间 |
| `active_slot` | 生成列，可空 | `pending` 时为 1 |
| 单据审计 D | 见 §2 | 节点状态并发 |

约束：`UNIQUE(instance_id,step_no)`、`UNIQUE(instance_id,flow_step_id)`、`UNIQUE(id,instance_id)`、`UNIQUE(instance_id,active_slot)`；`step_no > 0`。通过 FK 确保申请、配置节点存在，通过提交事务确保配置节点属于申请的流程版本且节点集合完整。分配类型、角色/用户和节点名称从不可变配置读取，不复制一份可改的规则。

每个活动申请事务提交时恰好有一个 `pending` 节点；数据库唯一键保证最多一个，“至少一个”和完整顺序由应用事务保证。其余节点为前面已通过、后面等待。终态申请没有活动节点。终态节点有结束时间，非终态为空；未激活即取消的后续节点允许激活时间为空。

### 4.3 动态待办与访问资格

每个节点只有上述一条执行记录，`approval_tasks` 及分派轮次不再存在。查询先通过 Identity 公开能力取得当前用户合格角色及是否具备审批权限，再在 Approval SQL 的分页前过滤当前 pending 节点：角色匹配或指定用户匹配。前端不能指定授权角色或用户。

当前节点无合格人员时仍保存 pending；响应将该节点投影为 `blocked`，`blockedReason=no_eligible_assignee`。成员新增、移除、账号或权限变化在下一次查询及决定时生效；恢复资格无需写节点或执行重新分派。GET 不改变业务状态。

决定提交 `stepId + version`，按业务根、申请、节点顺序加锁，再检查当前节点及实时资格；同级并发只接受一次决定。申请人、实际作出批准/驳回的人员保留历史查询资格，当前活动节点的合格人员可访问当前申请。仅曾是候选人或收到通知不授予历史全文访问；流程配置权限可查看全部申请，`approval:view` 本身不授予全局访问。

### 4.4 `approval_actions`

申请内不可变事件和审批意见，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 申请 FK |
| `action_no` | `INT NOT NULL` | 申请内递增顺序，在申请锁内分配 |
| `instance_step_id` | `BIGINT UNSIGNED NULL` | 相关执行节点 |
| `decision_step_id` | `BIGINT UNSIGNED` 生成列，可空 | 仅批准/驳回时取 `instance_step_id`，约束每节点最多一个有效决定 |
| `action_type` | `VARCHAR(30) NOT NULL` | `submitted/approved/rejected/withdrawn/assignment_blocked/reassigned` |
| `comment` | `TEXT NULL` | 意见或操作原因 |
| `details` | `JSON NULL` | 受控事件详情，如节点序号、分配类型及角色/用户身份；不保存动态候选人作为授权事实 |
| 事实审计 F | 见 §2 | 实际操作者及时间 |

约束：`UNIQUE(instance_id,action_no)`、`UNIQUE(decision_step_id)`；组合 FK `(instance_step_id,instance_id) -> approval_instance_steps(id,instance_id)`。批准/驳回必须有节点；撤回、提交不关联节点。`action_no > 0`。驳回须有原因，批准意见可空，仍保存操作者与时间；撤回说明为可选。历史 `assignment_blocked/reassigned` 事件只保留读取，当前命令不再生成；已有实际决定及证据不改写。

申请内的 `approved` 事件表示一次节点决定，是否最终通过由申请状态及完整节点历史判断。该表不替代 `operation_logs`；业务事件、状态写入及成功审计同事务。证据出错通过撤回或驳回后新申请修正，不更新旧意见。


## 当前实现补充

- 配置审计 C 的操作者列可空，应用写入时总是填写；运行申请、节点和不可变动作的 created_by 非空。节点的 updated_by 可空，后续命令更新时填写。
- scene_code、subject_type 的语义由代码 Registry 校验；SQL 的 `subject_type` 为扩展标识，不建多态 FK。
- 暂限每流程 1–20 个顺序节点，非固定两级。每级选择一个角色或一个指定用户，无会签或条件路由。新草稿节点可从已发布内容复制，稳定 node_code 仅在所属版本内唯一；客户端未知节点编码需属于当前已发布版本，否则拒绝。
- `policy_snapshot` 固定记录 any、允许自审及同人跨级，本次没有编辑策略入口；未来新增策略必须同时实现运行时解释，不只写配置。
- 角色成员动态变化，用户节点固定指定人；无人可审时派生 blocked 提示，不在 GET 更新表，不保留重新分派端点或权限。
- 草稿排序先软删除全部当前行，再按提交顺序恢复或新增，同事务避免唯一顺序冲突；已发布配置不更新。
- 审批动作编号在申请锁内递增。approved/rejected 的动作必须关联节点；生成列唯一键限制同一节点的决定数量。
- Approval 不拥有通知表，也不建 BOM 版本表、场景目录表或用户可编辑回调表。消息由 Notification 通过公开能力同事务写入。

`202609120001` 追加迁移扩展角色/用户配置、移除个人任务和关联字段，将旧 blocked 节点转为 pending，并保留实际动作和受审证据。升级须暂停 Approval/Product 写入；down 要求没有申请且没有指定用户节点配置，不能重建已删除的个人分派历史。开发库可完全重置并按统一 migration/seed 恢复，不建设双写或影子表。

回滚必须先执行 `202609130001` 的准备 down，再连续执行 `202609120001` down；准备过程带相同的数据守卫，通过分开变更角色外键与列可空性规避 MySQL 的表重建限制。当前应用仍要求 `role_id` 可空，准备状态不用于启动应用；取消回滚时先重新执行准备迁移的 up。具体顺序与失败恢复见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。
