# Approval 数据库设计

> [返回模块](../README.md)。本章维护六张审批表的结构、关系和约束；节点执行记录是唯一待办事实。

## 2. 公共字段和约束

结构与[版本化 migration](../../../../../../packages/database/migrations/)同步维护，审计分类遵守[数据库公共规则](../../../../../../docs/database-conventions.md)。表使用 InnoDB、`utf8mb4_0900_ai_ci`。所有 `id` 均为自增主键；未写 `DEFAULT` 的非空列无数据库默认值，可空列默认 `NULL`。

下列列组在表中展开，不是额外表：

| 列 | 物理定义 | 适用列组 |
| --- | --- | --- |
| `created_by` | `BIGINT UNSIGNED`，外键 `users.id`；C 可空，D/F 非空 | C、D、F |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | C、D、F |
| `updated_by` | `BIGINT UNSIGNED NULL`，外键 `users.id` | C、D |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | C、D |
| `version` | `INT NOT NULL DEFAULT 0`，CHECK `version >= 0` | C、D |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | C |
| `deleted_by` | `BIGINT UNSIGNED NULL`，外键 `users.id` | C |
| `deleted_at` | `DATETIME NULL` | C |

C 为配置审计：定义、版本和配置节点使用；各表删除 CHECK 要求未删除时删除人／时间均空，删除时标志为 `1` 且二者均非空。D 为运行单据审计：申请和执行节点使用，无软删除列。F 为不可变动作创建审计，无修改、版本或软删除列。MySQL 为外键维护所需支撑索引，以下另列显式查询索引。

活动槽是只读的 `STORED` 生成列：活动时取 `1`，其余取 `NULL`，配合唯一键保留多条历史；不能直接写槽值替代状态。

审批申请的 `created_by` 必填并表示申请人；`created_at` 表示提交时间。实际人工作业的操作者必填，事务内派生任务沿用触发人；日后系统作业是否使用空操作者须另行定义。新外键默认限制删除，不级联删除审批、通知或人员历史。所有者校验负责引用对象的状态和业务归属，外键不能替代它。

## 3. 场景目录与流程配置

### 3.1 代码 Registry

每个业务模块声明场景，通过 `public.ts` 导出，由装配层合并。Registry 是能力目录的唯一来源，数据库保存 `scene_code` 作为稳定引用，不建立 `approval_scenes`。编码示意为 `product.bom.approve`；常量集中在 `packages/constants`，此类分段能力标识不混入状态值字典。

场景描述包括编码、所属模块、中文显示名、固定对象类型、提交及审批权限要求、详情契约版本，以及已装配的业务适配能力。用户不能从 HTTP 指定任意场景、对象类型或回调地址绕过业务提交入口。Registry 同时声明 `businessAssigneeSources` 白名单及 `requiredFinalAssigneeSourceCode`。来源代码及必需末级须与注册 handler 一致，不接收任意 SQL／字段路径。Registry 不保存数据库连接；重复编码、重复来源、必需来源未声明、业务处理器缺失须在装配验证中发现。

场景查询从 Registry 出发，批量关联流程定义及发布指针，返回未配置、仅草稿、已发布、已发布且有草稿等展示状态。新业务场景部署后可出现，但未完成业务门禁和适配的场景不得开放提交。场景显示名可调整，稳定编码不能随意改；有在途申请时不得删除处理能力，历史读取必须保留。

### 3.2 `approval_flow_definitions`

每个场景的配置根，持有供新申请采用的发布指针；具体内容保存在版本表，旧申请继续引用原版本。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `scene_code` | `VARCHAR(100) NOT NULL` | Registry 场景编码 |
| `name` | `VARCHAR(100) NOT NULL` | 流程显示名 |
| `published_version_id` | `BIGINT UNSIGNED NULL` | 当前发布版本 |
| 配置审计 C | 见公共列组 | 配置根并发与审计 |

唯一键 `uk_approval_flow_definitions_scene(scene_code)`；索引 `idx_approval_flow_definitions_published(published_version_id)`。组合外键 `(published_version_id,id) → approval_flow_versions(id,definition_id)` 保证发布指针属于本定义；配置审计外键和 CHECK 见列组 C。

每个场景只有一个配置入口，编码永久不复用；当前发布版本必须属于该定义。没有发布指针即不能开始申请。首期不提供流程删除或“禁用后自动免审”入口，配置归档不用于绕过必需审批。

### 3.3 `approval_flow_versions`

保存可编辑草稿及不可改写的已发布配置，同一流程的新旧申请可以采用不同发布版本。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `definition_id` | `BIGINT UNSIGNED NOT NULL` | 流程定义 |
| `version_no` | `INT NOT NULL` | 从 `1` 递增的配置版本号 |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'draft'` | 草稿／已发布／废弃 |
| `published_by` | `BIGINT UNSIGNED NULL` | 发布人 |
| `published_at` | `DATETIME NULL` | 发布时间 |
| `draft_slot` | `TINYINT`，`STORED` 生成列，可空 | `status='draft'` 时为 `1`，其余为空 |
| 配置审计 C | 见公共列组 | 草稿编辑并发与审计 |

唯一键：`(definition_id,version_no)`、`(id,definition_id)`、`(definition_id,draft_slot)`；查询索引 `idx_approval_flow_versions_status(definition_id,status)`。外键 `definition_id → approval_flow_definitions.id`、`published_by → users.id`，另有 C 组操作者外键。CHECK 保证 `version_no > 0`、状态仅 `draft/published/discarded`，且仅 `published` 同时保存非空发布人／时间；其余两态均为空，另适用 C 组 CHECK。

`version_no` 是发布配置版本，`version` 是草稿编辑并发版本，两者不可混用。

一个定义最多一个草稿，配置版本号不能重复。只有已发布版本记录发布人和时间。旧版即使不再被当前指针选中仍保持 `published`，不改其内容。

编辑节点须先锁定义、再锁此版本并核对草稿 ID 和乐观锁，保存完整顺序后递增 `version`；发布按定义、版本的固定顺序锁定，检查至少一级、连续顺序、角色或指定用户有效及当前合格人员；业务来源节点只检查场景支持及末级来源约束，不预解析具体工单，再原子写发布状态与定义指针。新版本号在定义锁内分配。`discarded` 为保留状态，当前未开放废弃草稿接口，不物理删除或覆盖已发布版本。

### 3.4 `approval_flow_steps`

保存某一版本的有序分派规则；稳定节点身份与排序位置分开，发布后供执行节点引用。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `flow_version_id` | `BIGINT UNSIGNED NOT NULL` | 所属流程版本 |
| `node_code` | `VARCHAR(64) NOT NULL` | 版本内稳定节点编码 |
| `step_no` | `INT NOT NULL` | 顺序，从 `1` 开始 |
| `name` | `VARCHAR(100) NOT NULL` | 节点名称 |
| `assignee_type` | `VARCHAR(20) NOT NULL` | `role/user/business`；无默认值 |
| `role_id` | `BIGINT UNSIGNED NULL` | 角色节点的角色 |
| `assignee_user_id` | `BIGINT UNSIGNED NULL` | 指定用户节点的人员 |
| `assignee_source_code` | `VARCHAR(100) NULL` | 业务节点的人员来源代码 |
| `active_step_no` | `INT`，`STORED` 生成列，可空 | `is_deleted=0` 时取 `step_no`，否则为空 |
| 配置审计 C | 见公共列组 | 配置节点审计；写入以版本根为并发边界 |

唯一键：`(flow_version_id,node_code)`、`(flow_version_id,active_step_no)`、`(id,flow_version_id)`；索引 `idx_approval_flow_steps_user(assignee_user_id,flow_version_id)`。外键 `flow_version_id → approval_flow_versions.id`、`role_id → roles.id`、`assignee_user_id → users.id`，另有 C 组操作者外键。

CHECK 保证 `step_no > 0`，并按 `assignee_type` 三选一：`role` 仅角色非空，`user` 仅指定用户非空，`business` 仅来源代码非空且去空白后非空；其他两类身份列须为空。另适用 C 组 CHECK。

节点编码在版本内永久唯一；删除不释放编码，排序位置不是节点身份。有效节点不能占同一位置。节点配置仅能在所属版本为草稿时修改；发布后的节点禁止任何编辑或删除。草稿移除节点使用软删除，恢复同一节点复用原 ID 和编码；发布和实例化只采用有效节点。排序整体保存，不能留下半次换位。

每级只能选择一个角色、一个指定用户或一个受支持的业务来源。每级任意一名合格人员明确决定；用户节点只有该指定人，没有多角色、多名指定用户、会签、认领或转交。

已发布配置不保存某张工单的人员。结案末级来源及本次人员解析见[场景接入](subject-integration.md#业务关联人员)，动态资格、无人可审及历史访问范围见[运行契约](../README.md#配置与操作)。

## 4. 审批申请、节点、人员和证据

### 4.1 `approval_instances`

一次真实送审的运行根，固定受审对象、发布流程、证据和人员规则；重新送审建立新申请，不覆盖旧证据。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `instance_no` | `VARCHAR(100) NOT NULL` | 审批申请编号 |
| `scene_code` | `VARCHAR(100) NOT NULL` | 稳定场景 |
| `subject_type` | `VARCHAR(50) NOT NULL` | 场景确定的业务对象类型，可扩展 |
| `subject_id` | `BIGINT UNSIGNED NOT NULL` | 业务对象 ID，不建多态外键 |
| `flow_version_id` | `BIGINT UNSIGNED NOT NULL` | 本次采用的发布版本 |
| `title` | `VARCHAR(255) NOT NULL` | 申请标题 |
| `subject_version` | `INT NOT NULL` | 绑定并冻结后的业务版本 |
| `snapshot_schema_version` | `INT NOT NULL` | 所属业务 handler 声明的证据结构版本 |
| `subject_snapshot` | `JSON NOT NULL` | 提交时受审内容 |
| `policy_snapshot` | `JSON NOT NULL` | 本次人员规则 |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'pending'` | 申请状态 |
| `ended_at` | `DATETIME NULL` | 申请结束时间 |
| `active_slot` | `TINYINT`，`STORED` 生成列，可空 | 待审为 `1`，其余为空 |
| 单据审计 D | 见公共列组 | 创建人即申请人，创建时间即提交时间 |

唯一键：`(instance_no)`、`(scene_code,subject_type,subject_id,active_slot)`；索引 `idx_approval_instances_applicant_status(created_by,status,created_at,id)`、`idx_approval_instances_subject(scene_code,subject_type,subject_id,created_at,id)`。外键 `flow_version_id → approval_flow_versions.id`，另有 D 组操作者外键。

CHECK 保证 `subject_version >= 0`、`snapshot_schema_version > 0`、状态仅 `pending/approved/rejected/withdrawn`，待审结束时间为空、终态非空；另适用 D 组版本 CHECK。证据 JSON 的具体结构与版本由所属业务校验，不在本表设置统一结构 CHECK。

申请在送审事务内按[统一编号规则](../../../../docs/business-numbering.md)取号。

同一场景、对象类型和业务对象最多有一份待审申请；无人可审也仍占此资格。申请结束后保留历史，重新送审必须建立新申请。

证据生成、业务绑定和读取校验遵守[场景接入](subject-integration.md#模块与事务边界)；BOM 证据内容和解析版本见[Product 契约](../../product/docs/product-rules.md#bom-命令与审批)。

多态 `subject_id` 不建立指向多张业务表的伪外键。提交和每次最终业务操作经所属模块验证对象存在性、场景与对象类型、当前申请关联；`scene_code` 与所选版本所属定义相符由事务校验。申请的场景、对象、流程版本、证据、人员规则及申请人一经提交不可更换。未来收紧自审规则默认只影响新申请，不能静默改写旧申请的规则或历史决定；账号、角色及当前权限仍实时校验。

Production 的证据内容、来源冻结和生效条件分别见[需求更正](../../production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)与[批次收尾](../../production/docs/database/production-termination.md)，Approval 不复制业务数量、工序状态或证据版本。不自行兼容旧证据或改写历史快照。

### 4.2 `approval_instance_steps`

每行是一次申请的一个执行节点，保存进度与本次业务来源人员；角色候选多人共用这一条执行事实，不再建逐人任务表。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 所属申请 |
| `flow_step_id` | `BIGINT UNSIGNED NOT NULL` | 不可变的配置节点 |
| `resolved_assignee_user_id` | `BIGINT UNSIGNED NULL` | 送审解析的业务人员；其他分派类型为空 |
| `step_no` | `INT NOT NULL` | 本次节点顺序 |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'waiting'` | 执行状态 |
| `activated_at` | `DATETIME NULL` | 首次激活时间 |
| `ended_at` | `DATETIME NULL` | 节点结束时间 |
| `active_slot` | `TINYINT`，`STORED` 生成列，可空 | `pending` 时为 `1`，其余为空 |
| 单据审计 D | 见公共列组 | 执行节点并发与审计 |

唯一键：`(instance_id,step_no)`、`(instance_id,flow_step_id)`、`(id,instance_id)`、`(instance_id,active_slot)`；索引 `idx_approval_instance_steps_resolved_user(resolved_assignee_user_id,status,instance_id)`。外键 `instance_id → approval_instances.id`、`flow_step_id → approval_flow_steps.id`、`resolved_assignee_user_id → users.id`，另有 D 组操作者外键。

CHECK 保证 `step_no > 0`、状态仅 `waiting/pending/approved/rejected/cancelled`，等待／活动时结束时间为空、其余状态非空；另适用 D 组版本 CHECK。分派类型与解析人跨表一致性、流程版本归属和至少一个活动节点由应用事务校验，不能视为单表 CHECK 已保证。

一次申请的每个流程节点只实例化一次，顺序不能重复；提交事务须保证采用版本正确且节点完整。分配类型、角色/用户和节点名称从不可变配置读取，不复制一份可改的规则。

业务节点的 `resolved_assignee_user_id` 在送审时必填、此后不可改；来源规则仍由不可变配置节点提供。外键限制删除被引用用户。模板分派规则与本次解析人员须相符，不能只凭人员引用存在就授予处理资格；解析与资格边界见[业务关联人员](subject-integration.md#业务关联人员)。

每个活动申请事务提交时恰好有一个 `pending` 节点；数据库唯一键保证最多一个，“至少一个”和完整顺序由应用事务保证。其余节点为前面已通过、后面等待。终态申请没有活动节点。终态节点有结束时间，非终态为空；未激活即取消的后续节点允许激活时间为空。

### 4.4 `approval_actions`

追加记录真实提交、决定和撤回，不用节点当前状态代替历史意见；动作与执行节点分开，保留同一申请的完整顺序。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `instance_id` | `BIGINT UNSIGNED NOT NULL` | 所属申请 |
| `action_no` | `INT NOT NULL` | 申请内递增顺序 |
| `instance_step_id` | `BIGINT UNSIGNED NULL` | 关联执行节点 |
| `decision_step_id` | `BIGINT UNSIGNED`，`STORED` 生成列，可空 | 批准／驳回时取 `instance_step_id`，否则为空 |
| `action_type` | `VARCHAR(30) NOT NULL` | 动作类型 |
| `comment` | `TEXT NULL` | 意见或操作原因 |
| `details` | `JSON NULL` | 受控事件依据，不保存动态候选授权 |
| 事实审计 F | 见公共列组 | 实际操作者与动作时间 |

唯一键：`(instance_id,action_no)`、`(decision_step_id)`；索引 `idx_approval_actions_instance_time(instance_id,created_at,id)`。外键 `instance_id → approval_instances.id`、`created_by → users.id`；组合外键 `(instance_step_id,instance_id) → approval_instance_steps(id,instance_id)` 保证节点属于本申请。

CHECK 保证 `action_no > 0`、类型仅 `submitted/approved/rejected/withdrawn/assignment_blocked/reassigned`，批准／驳回必须关联节点。提交／撤回不关联节点以及驳回原因必填属于应用规则；当前数据库 CHECK 未约束这两项。

每个节点最多一次实际批准或驳回，决定必须属于同一申请；提交和撤回是申请级动作。驳回须有原因，批准意见可空，仍保存操作者与时间；撤回说明为可选。历史 `assignment_blocked/reassigned` 事件只保留读取，当前命令不再生成；已有实际决定及证据不改写。

申请内的 `approved` 事件表示一次节点决定，是否最终通过由申请状态及完整节点历史判断。该表不替代 `operation_logs`；业务事件、状态写入及成功审计同事务。证据出错通过撤回或驳回后新申请修正，不更新旧意见。

## 配置与执行约束

- 配置操作者列可空，应用写入时总是填写；申请、节点和动作的 created_by 必填。节点 updated_by 可空，后续命令更新时填写。
- 每流程暂限 1–20 个顺序节点，无会签或条件路由。复制已发布节点形成新草稿时，稳定编码仍只在版本内唯一；客户端给出的既有编码必须属于当前发布版本。
- `policy_snapshot` 固定记录任一人决定、允许自审及同人跨级；没有策略编辑入口。新增策略须同时实现运行时解释。
- Approval 不建 BOM 版本表、场景目录表或用户可编辑回调表；通知由 Notification 公开能力同事务写入。

审批历史升级、连续回滚和失败恢复只维护于[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。不能为回退删除受审证据、将业务来源降为固定用户，或启动处于迁移准备结构的应用。
