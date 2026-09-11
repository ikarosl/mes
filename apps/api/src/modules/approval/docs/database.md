# Approval 数据库设计

> [返回模块](../README.md)。本章对应 `202609100001-approval-bom-pilot`，只定义七张审批表，不包含通知与工单字段。

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

编辑节点须先锁定义、再锁此版本并核对草稿 ID 和乐观锁，保存完整顺序后递增 `version`；发布按定义、版本的固定顺序锁定，检查至少一级、连续顺序、角色有效和各级当前均有合格人员，再原子写发布状态与定义指针。新版本号在定义锁内分配。`discarded` 为保留状态，本次未开放废弃草稿接口，不物理删除或覆盖已发布版本。

### 3.4 `approval_flow_steps`

流程版本中的有序节点，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `flow_version_id` | `BIGINT UNSIGNED NOT NULL` | 版本 FK |
| `node_code` | `VARCHAR(64) NOT NULL` | 服务端生成的稳定节点编码，不随排序改变 |
| `step_no` | `INT NOT NULL` | 正整数顺序 |
| `name` | `VARCHAR(100) NOT NULL` | 节点名称 |
| `role_id` | `BIGINT UNSIGNED NOT NULL` | 审批角色 FK roles |
| `active_step_no` | 生成列，可空 | 未软删除时等于 `step_no`，否则为空，仅约束当前排序位置 |
| 配置审计 C | 见 §2 | 写入仍以版本头为聚合并发边界 |

约束：`UNIQUE(flow_version_id,node_code)` 永久不复用、不含软删除标志；`UNIQUE(flow_version_id,active_step_no)` 约束有效排序位置，位置不是稳定节点身份；`UNIQUE(id,flow_version_id)`、`CHECK(step_no > 0)`。节点配置仅能在所属版本为草稿时修改；发布后的节点禁止任何编辑或删除。草稿移除节点使用软删除，恢复同一节点复用原 ID 和编码；发布和实例化只采用有效节点。排序由完整草稿更新统一实现，避免逐行换位撞唯一键。

首期每级固定任意一人通过，不增加可编辑 `approval_mode`，也不建多态 `assignee_type/assignee_id` 或审批组表。

## 4. 审批申请、节点、人员和证据

### 4.1 `approval_instances`

一行是一次真实送审，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_no` | `VARCHAR(100) NOT NULL` | 唯一申请编号 |
| `scene_code` | `VARCHAR(100) NOT NULL` | 稳定场景编码 |
| `subject_type` | `VARCHAR(50) NOT NULL` | 场景确定的对象类型，首期 `product` |
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

### 4.2 `approval_instance_steps`

本次申请的节点执行情况，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 申请 FK |
| `flow_step_id` | `BIGINT UNSIGNED NOT NULL` | 不可变已发布配置节点 FK |
| `step_no` | `INT NOT NULL` | 本次节点顺序，须与配置一致 |
| `status` | `VARCHAR(20) NOT NULL` | `waiting/pending/blocked/approved/rejected/cancelled` |
| `assignment_round` | `INT NOT NULL DEFAULT 0` | 待办分派轮次，激活及重新分派时递增 |
| `activated_at` | `DATETIME NULL` | 首次轮到本级的时间 |
| `ended_at` | `DATETIME NULL` | 本级结束时间 |
| `blocked_reason` | `VARCHAR(50) NULL` | 首期 `no_eligible_assignee` |
| `active_slot` | 生成列，可空 | `pending/blocked` 时为 1 |
| 单据审计 D | 见 §2 | 节点状态并发 |

约束：`UNIQUE(instance_id,step_no)`、`UNIQUE(instance_id,flow_step_id)`、`UNIQUE(id,instance_id)`、`UNIQUE(instance_id,active_slot)`；`step_no > 0`，`assignment_round >= 0`。通过 FK 确保申请、配置节点存在，通过提交事务确保配置节点属于申请的流程版本且节点集合完整。角色和节点名称从不可变配置读取，不再复制一份可改的规则。

每个活动申请事务提交时恰好有一个 `pending/blocked` 节点；数据库唯一键保证最多一个，“至少一个”和完整顺序由应用事务保证。其余节点为前面已通过、后面等待。终态申请没有活动节点。节点 `blocked` 时必须有原因，其他状态必须为空；终态节点有结束时间，非终态为空；未激活即取消的后续节点允许激活时间为空。

### 4.3 `approval_tasks`

每轮分派给具体用户的待办，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_step_id` | `BIGINT UNSIGNED NOT NULL` | 执行节点 FK |
| `assignment_round` | `INT NOT NULL` | 所属分派轮次 |
| `assignee_id` | `BIGINT UNSIGNED NOT NULL` | 具体用户 FK |
| `status` | `VARCHAR(20) NOT NULL` | `pending/approved/rejected/closed` |
| `close_reason` | `VARCHAR(50) NULL` | `peer_decided/instance_rejected/instance_withdrawn/reassigned` |
| `ended_at` | `DATETIME NULL` | 处理或关闭时间 |
| 单据审计 D | 见 §2 | 任务并发 |

约束：`UNIQUE(instance_step_id,assignment_round,assignee_id)`；索引 `(assignee_id,status,created_at,id)`；轮次正整数。`pending` 无结束时间，其余非空；仅 `closed` 有关闭原因。决定操作者必须等于 `assignee_id`，且当前仍满足本级角色及审批权限；任务轮次必须等于节点当前轮次。

角色预览不产生任务；节点激活时才生成该级具体用户任务。其他候选被关闭不表示他们批准。跨级同人分别拥有不同节点任务，每次都需显式操作。重新分派关闭旧轮未结束任务、新增下一轮任务，不重新开放或改写旧任务。离职或权限撤销后的旧任务不能继续授权，但保留历史；名单恢复通过显式重新分派生效，不靠重新读角色列表悄悄改变任务归属。

### 4.4 `approval_actions`

申请内不可变事件和审批意见，所有者 Approval。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 申请 FK |
| `action_no` | `INT NOT NULL` | 申请内递增顺序，在申请锁内分配 |
| `instance_step_id` | `BIGINT UNSIGNED NULL` | 相关执行节点 |
| `task_id` | `BIGINT UNSIGNED NULL` | 人工批准/驳回所处理任务 |
| `action_type` | `VARCHAR(30) NOT NULL` | `submitted/approved/rejected/withdrawn/assignment_blocked/reassigned` |
| `comment` | `TEXT NULL` | 意见或操作原因 |
| `details` | `JSON NULL` | 受控事件详情，如分派轮次、当前候选用户集合与节点信息 |
| 事实审计 F | 见 §2 | 实际操作者及时间 |

约束：`UNIQUE(instance_id,action_no)`、`UNIQUE(task_id)`，允许空 task 多条；组合 FK `(instance_step_id,instance_id) -> approval_instance_steps(id,instance_id)`；普通 FK `task_id -> approval_tasks.id`，并由事务校验任务属于该节点。批准/驳回必须有任务和节点；撤回、提交无任务。`action_no > 0`。驳回、重新分派须有原因，批准意见可空，仍保存操作者与时间；撤回是否填写说明作为可选输入，不因缺少说明阻止申请人撤回。

申请内的 `approved` 事件表示一次节点决定，是否最终通过由申请状态及完整节点历史判断。该表不替代 `operation_logs`；业务事件、状态写入及成功审计同事务。证据出错通过撤回或驳回后新申请修正，不更新旧意见。


## 当前实现补充

- 配置审计 C 的操作者列可空，应用写入时总是填写；运行申请、节点、任务和不可变动作的 created_by 非空。任务和节点的 updated_by 可空，后续命令更新时填写。
- scene_code、subject_type 的语义由代码 Registry 校验；SQL 的 `subject_type` 为扩展标识，不建多态 FK。
- 暂限每流程 1–20 个顺序节点，非固定两级。每级单角色 ANY，无会签或条件路由。新草稿节点可从已发布内容复制，稳定 node_code 仅在所属版本内唯一；客户端未知节点编码需属于当前已发布版本，否则拒绝。
- `policy_snapshot` 固定记录 any、允许自审及同人跨级，本次没有编辑策略入口；未来新增策略必须同时实现运行时解释，不只写配置。
- 重新分派旧轮任务关闭，新轮按当前同角色合格成员生成；无成员时节点 blocked 并保留记录。读取在运行中成员失权时派生 blocked 提示，不在 GET 更新表。
- 草稿排序先软删除全部当前行，再按提交顺序恢复或新增，同事务避免唯一顺序冲突；已发布配置不更新。
- 审批动作编号在申请锁内递增。approved/rejected 的动作必须带节点和任务 FK；非决定动作没有 task_id。
- 本次不建通知表、BOM 版本表、场景目录表或用户可编辑回调表。
