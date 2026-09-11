# 审批接入边界与后续通知设计

业务决策以 [ADR-0006](adr/0006-approval-workflow-boundaries.md) 为准。本次试探只接入成品 BOM，包含流程配置和审批待办；工单审批、采购和 Notification 不在本次实现范围。

## 1. 本次 BOM 试探

审批的实际接口、七张表、权限与事务职责统一由 [Approval 模块](../apps/api/src/modules/approval/README.md)及其[数据库设计](../apps/api/src/modules/approval/docs/database.md)维护。本文不再重复已接入表的字段定义；Product 字段和 BOM 冻结规则以 [Product 数据库设计](../apps/api/src/modules/product/docs/database.md)为准。

- 场景由 Product 代码声明，经公开能力装配到 Registry。首个且唯一场景为 `product.bom.approve`；数据库只保存流程配置，不建场景目录表，管理员不能创造任意业务回调。
- 管理员配置每一级名称、顺序和角色，保存草稿后发布。发布版本不可改写，在途申请固定原版本。每级任意一名合格人员显式决定；允许自审与同人跨级，每级分别记录。
- BOM 提交时保存不可变受审证据并冻结编辑；最后一级通过时与永久锁定同事务。驳回或申请人撤回结束本次申请，修改后重新提交；已批准 BOM 不解锁，用料变更需新成品编码。
- 角色决定候选范围，账号、成员关系和审批权限决定当前资格。发布及提交前检查全部级别有合格人；运行中无合格人保留申请，补齐人员后显式重新分派当前级，保留已完成决定。
- 生产任务创建要求 BOM 已批准并锁定；工单创建、下达继续既有流程，本次没有工单审批场景或新的工单审批字段。
- 本次只生成 Approval 待办，没有站内消息、未读数、通知表、外部投递或 outbox。以下通知结构是后续候选方案。

## 2. 公共字段和约束

遵守[数据库公共规则](database-conventions.md)：ID/FK 为 `BIGINT UNSIGNED`，API 中用字符串传输；时间为 `DATETIME` 北京时间，接口带 `+08:00`；状态使用 `VARCHAR + CHECK`，稳定编码集中在 constants，contracts 使用字符串联合类型。

以下缩写展开为实际列，不是额外表：

| 字段组 | 列与规则 |
| --- | --- |
| 配置审计 C | `created_by/created_at/updated_by/updated_at/is_deleted/deleted_by/deleted_at`；另加 `version INT NOT NULL DEFAULT 0 CHECK(version >= 0)` 用于配置聚合并发 |
| 单据审计 D | `created_by/created_at/updated_by/updated_at/version`，`version INT NOT NULL DEFAULT 0 CHECK(version >= 0)`；无软删除列，终止用状态表达 |
| 事实审计 F | `created_by/created_at`，不可覆盖、删除 |

新审批申请的 `created_by` 必填并表示申请人，不再重复 `applicant_id/submitted_by`；`created_at` 表示提交时间。实际人工作业的操作者必填，事务内派生任务沿用触发人；日后系统作业是否使用空操作者须另行定义。新外键默认限制删除，不级联删除审批、通知或人员历史。所有者校验负责引用对象的状态和业务归属，外键不能替代它。

生成列的候选方案使用 `CASE WHEN ... THEN 1 ELSE NULL END` 构造活动槽，再用组合唯一键约束“最多一条活动记录”；多条历史记录允许槽为空。迁移阶段必须验证目标 MySQL 的生成列、索引及 CHECK 实际行为。该槽是约束辅助值，不是第二份可写状态。

## 3. 站内通知候选表（尚未实施）

### 3.1 `notifications`

一次事件产生的一条站内消息，可有多个接收人，所有者 Notification。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `event_key` | `VARCHAR(150) NOT NULL` | 服务端稳定事件去重键，不使用 HTTP 幂等原始键 |
| `event_type` | `VARCHAR(50) NOT NULL` | 首期 `approval_task_assigned/approval_approved/approval_rejected/approval_withdrawn` |
| `source_type` | `VARCHAR(50) NOT NULL` | 首期 `approval_action` |
| `source_id` | `BIGINT UNSIGNED NOT NULL` | 触发消息的动作 ID |
| `target_type` | `VARCHAR(50) NOT NULL` | 首期 `approval_instance` |
| `target_id` | `BIGINT UNSIGNED NOT NULL` | 跳转申请 ID |
| `title` | `VARCHAR(255) NOT NULL` | 服务端生成的纯文本标题 |
| `body` | `TEXT NOT NULL` | 最小通知摘要，不复制完整 BOM |
| 事实审计 F | 见 §2 | 原始消息不可改写 |

约束：`UNIQUE(event_key)`；事件键由触发动作 ID、事件类型、目标节点及分派轮次按需要组合，同一事件重复调用不得重复建消息，也不得用同键覆盖不同内容。来源/目标为跨模块逻辑引用，由发布用例验证，不建立通用多态 FK。

### 3.2 `notification_recipients`

各用户自己的通知收件和阅读状态，所有者 Notification。

| 字段 | 类型及空值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL` | 主键 |
| `notification_id` | `BIGINT UNSIGNED NOT NULL` | 消息 FK |
| `user_id` | `BIGINT UNSIGNED NOT NULL` | 接收人 FK users |
| `read_at` | `DATETIME NULL` | 为空未读，首次标记后不回写为空 |
| 单据审计 D | 见 §2 | 收件与阅读并发 |

约束：`UNIQUE(notification_id,user_id)`；索引 `(user_id,read_at,created_at,id)` 和 `(user_id,created_at,id)`，分别支持未读及全部收件分页。只允许本人标记自己的收件记录已读，重复已读操作保持首次时间，不改变审批状态。首期不提供消息删除或收件人手工增删。

### 3.3 触发和一致性

- 提交或激活下一级：给实际生成待办的用户发通知；未来节点不提前发送。重新分派按新轮任务发消息。
- 最终通过或驳回：通知申请人。撤回：通知撤回前当前节点待办接收人；本人是否同时为接收人不改变去重规则。
- 同级其他人处理后，不删除或改写旧通知；打开统一申请详情时读取当前结果，不能依据通知文案执行审批。首期不另外发送每次同级待办关闭消息或周期催办。
- 站内通知及接收人通过 Notification 公开能力加入审批同一 MySQL 事务，任一核心落库失败整体回滚。没有外部网络发送，不需要 outbox、外部投递状态或消息队列。
- 未读数来自收件记录，待办数来自 Approval 当前有效任务，两者独立。申请详情授权由参与关系和明确查询权限控制，通知链接本身不授予业务权限。

## 4. 后续工单与采购接入

工单目标字段见[工单审批目标结构](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md#工单审批接入目标结构尚未实施)。目标是沿用 `draft` 并通过当前审批关联冻结待审内容，最终批准才下达；此目标尚未改动当前工单状态机。

工单审核证据包含选定产品 ID、编码、名称、数量、客户、外部订单号、质量要求、交期及负责人。产品核对是独立责任，工单批准不能替代 BOM 批准；外部订单到达不入系统，也不能据此省略人工核对。工单最终下达应使用受审快照，当前业务资格仍需复核。

采购何时选择精确物料版本、采购数量依据及与现有需求的关系仍须后续设计，不提前增加采购单或第二份生产需求事实。受审快照只提供审批证据，不作为生产定义或可写业务影子表。

## 5. 后续通知事务接入

未来 Notification 通过其公开能力加入现有同库事务：提交、激活下一级与重新分派生成任务消息；终态产生结果消息。Approval 仍独立拥有任务和决定，Product 拥有 BOM，成功审计仍统一经公共 writer。

接入通知时应验证消息及接收人与业务动作整体提交、去重、不因旧消息重复批准，以及通知详情的权限校验。HTTP 幂等重放也需独立登记 scope 与响应契约后验收；本次不声明审批端点支持 `Idempotency-Key` 或自动写重试。

数据库变化采用追加 migration。项目处于开发阶段，可重置并用统一 migration、seed 恢复；不得将旧任务锁定伪造成历史人工批准，不建设兼容双写。待办及测试阶段安排见 [roadmap](roadmap.md)。
