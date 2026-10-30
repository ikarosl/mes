# Product 数据库设计

本文维护 Product 九张业务表的职责、结构与关系，与[版本化 migration](../../../../../../packages/database/migrations/)同步；公共原则见[数据库规则](../../../../../../docs/database-conventions.md)。

各表使用 InnoDB、`utf8mb4_0900_ai_ci`，`id` 均为 `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` 主键。未写 `DEFAULT` 的非空列无数据库默认值，可空列默认 `NULL`。下表的审计列组 M 在九张表中逐列存在：

| 字段 | 物理定义 | 含义 |
| --- | --- | --- |
| `created_by` / `updated_by` / `deleted_by` | `BIGINT UNSIGNED NULL` | 创建、修改、删除人，各自外键指向 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标志，CHECK 限定 `0/1` |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

外键未另注时限制物理删除；MySQL 为外键维护所需支撑索引，下文另列显式查询索引。各表均有删除标志值域 CHECK，但只有 `materials/material_variants` 另用 CHECK 约束删除人、时间成套；其余表的完整删除审计由应用保证。`version` 不属于 M 组，仅在 `products` 中单列。

BOM 用量遵守公共整数数量约定；用途资格与事务锁由[公开资格](product-rules.md#候选历史展示与写入资格)维护。

## 3.1 基础资料表

---

### 1. `item_categories`

职责：统一维护物料和成品分类，不创建第二套库存分类表。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `parent_id` | `BIGINT UNSIGNED NULL` | 父分类 |
| `category_code` | `VARCHAR(64) NOT NULL` | 永久唯一分类编码 |
| `category_name` | `VARCHAR(100) NOT NULL` | 分类名称 |
| `item_kind` | `VARCHAR(30) NOT NULL` | `material/finished_product` |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_item_categories_code(category_code)`；索引 `idx_item_categories_parent(parent_id)`；自外键 `parent_id → item_categories.id`，另有 M 组操作者外键。CHECK 分别限定物品类型 `material/finished_product`、状态 `0/1` 和删除标志 `0/1`；父子同类型及防环由应用校验。

成品和基础物料共用分类树，分类类型不可混用。

`parent_id` 保留为后续半成品、多级物品扩展的分类关系基础；当前仅提供父分类维护、同类型校验及防环，不据此启用半成品或多级物品业务。目录筛选与用途资格针对直接关联分类，不沿父级递归或继承。成品的独立编码身份及逐条平铺规则见[成品列表与筛选](product-rules.md#成品列表与筛选)，分类关系不构成成品之间的父子身份。

分类编码永久唯一，类别仅为物料或成品。

分类重命名保留 ID 和父子引用，应用切换及回退顺序见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202609170004分类表重命名)。

说明：

- `material` 表示原材料、辅料、零部件等；库存中需要精确区分的版本由 `material_variants` 表示。
- `finished_product` 表示最终成品；不设置独立半成品类型。
- 分类表达“是什么”，`materials.acquire_method` / `products.acquire_method` 表达“如何获得”，两者不得混用。

---

### 2. `products`

职责：只维护成品。一条记录对应一个确定的成品编码；同名不同编码是不同成品，名称不形成父成品或成品类型，不另外建立成品大小版本表。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `item_code` | `VARCHAR(100) NOT NULL` | 成品永久编码 |
| `product_name` | `VARCHAR(200) NOT NULL` | 可重复的展示名称 |
| `category_id` | `BIGINT UNSIGNED NOT NULL` | 成品分类 |
| `default_route_id` | `BIGINT UNSIGNED NULL` | 未启用保留列，应用不读写 |
| `bom_status` | `VARCHAR(30) NOT NULL DEFAULT 'draft'` | `draft/pending_approval/approved` |
| `bom_approval_instance_id` | `BIGINT UNSIGNED NULL` | 当前送审或最终批准的申请 |
| `version` | `INT NOT NULL DEFAULT 0` | 成品聚合并发版本，不是 BOM 业务版本 |
| `bom_locked_at` | `DATETIME NULL` | BOM 最终批准并永久锁定的时间 |
| `bom_locked_by` | `BIGINT UNSIGNED NULL` | 最后一级实际批准人 |
| `unit` | `VARCHAR(20) NOT NULL` | 固定基础计量单位 |
| `acquire_method` | `VARCHAR(32) NOT NULL` | `self_made/outsourced/purchased` |
| `spec_values` | `JSON NOT NULL` | 完整规格参数表格；无数据库默认值 |
| `specification_file_id` | `BIGINT UNSIGNED NULL` | 当前规格书 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

- 唯一键 `uk_products_item_code(item_code)`；索引 `idx_products_category(category_id)`、`idx_products_default_route(default_route_id)`、`idx_products_bom_locked_by(bom_locked_by)`、`idx_products_bom_approval_instance(bom_approval_instance_id)`、`idx_products_specification_file(specification_file_id)`。
- 外键：`category_id → item_categories.id`；`default_route_id → process_routes.id ON DELETE SET NULL`；`bom_approval_instance_id → approval_instances.id`；`bom_locked_by → users.id`；`specification_file_id → technical_files.id ON DELETE RESTRICT`；另有 M 组操作者外键。
- CHECK：获取方式为表列三值；状态、删除标志为 `0/1`；`version >= 0`；`bom_locked_at IS NOT NULL OR bom_locked_by IS NULL`。`chk_products_bom_status` 进一步要求草稿无申请和锁定依据、在审有申请而无锁定依据、批准后申请／锁定人／锁定时间均非空。规格参数结构 CHECK 见[下文](#规格参数存储与迁移)。
- `trg_products_reject_item_code_update` 是 `BEFORE UPDATE` 触发器，拒绝修改 `item_code`；固定单位、BOM 冻结及永久锁定的命令约束由应用执行，不能视为此触发器已覆盖。

`item_code` 是永久身份；`product_name` 可重复。BOM 批准人、时间及当前申请关联保存于成品根；当前规格书引用 `technical_files`，文件引用限制删除，绑定资格见[规格书规则](product-rules.md#成品与精确物料版本规格书)。

说明：

- 成品只写 `products`，基础物料只写 `materials`；二者独立自增，数值相同的 ID 不表示同一对象。
- 成品只能使用成品分类；名称可重复。
- 产品编码和基础单位创建后不可修改；编码永久不复用，软删除后继续使用时恢复原记录。
- BOM 锁定事实只属于成品，物料表不保留这些字段。
- 成品不配置默认路线；`default_route_id` 及其外键保留在当前物理结构中，应用不读取、写入或公开该字段，不以其存量值限制路线停用或归档。生产任务只消费创建请求显式选择的路线。

### 2.1 `materials`

职责：维护 BOM 引用的基础物料编码，例如 `m1.077.012`。名称（例如“微带”）仅用于展示和搜索，分类可表达“半成品 → 微带电路”；两者都不决定物料唯一身份。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `material_code` | `VARCHAR(100) NOT NULL` | 永久唯一基础物料编码 |
| `material_name` | `VARCHAR(200) NOT NULL` | 可重复的当前名称 |
| `category_id` | `BIGINT UNSIGNED NOT NULL` | 物料分类 |
| `unit` | `VARCHAR(20) NOT NULL` | 固定基础单位 |
| `acquire_method` | `VARCHAR(32) NOT NULL` | `self_made/outsourced/purchased` |
| `spec_values` | `JSON NOT NULL` | 全部精确版本共用的规格参数表格 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_materials_code(material_code)`；索引 `idx_materials_category(category_id)`；外键 `category_id → item_categories.id`，另有 M 组操作者外键。CHECK 限定获取方式为表列三值、状态和删除标志为 `0/1`；`chk_materials_delete_facts` 保证未删除时删除人／时间均空，删除时二者均非空。规格参数 CHECK 见下文。`trg_materials_reject_identity_update` 在 `BEFORE UPDATE` 拒绝改变 `material_code` 或 `unit`。

本表的参数由同一基础物料全部版本共用；不保存规格书字段。每个精确版本的规格书由 `material_variants` 自身引用，边界见[规格书规则](product-rules.md#成品与精确物料版本规格书)。

物料编码与固定单位创建后不可变；编码按物料表永久唯一，不与成品共用注册表。分类必须为 `material`，获取方式独立于分类。

名称可重复；物料、成品 ID 独立，数值相同不代表同一身份。

分类类型由 Product 写事务校验，分类对象类型创建后不可修改，无论是否存在引用。物料自身不拥有 BOM 或生产工单；`self_made` 只保留获取方式，不提前开放自产半成品入库能力。

#### 规格参数存储与迁移

`products.spec_values` 与 `materials.spec_values` 保存[完整规格参数 JSON](product-rules.md#规格参数-json)，不保存模板引用。数据库没有 JSON 默认值，应用在省略参数时写入业务空表。

`chk_products_spec_values_table`、`chk_materials_spec_values_table` 要求根为对象且仅有 `columns/rows` 两项，二者都是数组；数据库不在这两项 CHECK 中约束容量或单元格内容，完整结构与容量由共享规范化校验。

迁移 `202610280007-product-json-table-specifications` 期间暂停 Product 资料及 BOM 审批写入，升级后同步切换匹配应用。up 保留旧数组顺序和单元格原文，转换为“参数名称／参数值／单位”三列；缺失或 null 单元格补为空字符串，原 SQL／JSON null 统一为空表，主数据审计时间与版本保持。未知旧字段、非文本值、超过新表格容量的旧数据在转换前拒绝；不截断或猜测内容。

旧 BOM 审批快照不可改写；up 在首个永久 DDL 和数据转换前拒绝旧版本或旧规格结构的相关审批申请，命中时按开发数据库统一初始化约定重建。down 在永久 DDL 前拒绝任何 BOM 审批历史，以及无法无损表示为旧字段的表格；只允许业务空表或上述固定三列、完整字符串行且满足旧字段长度的记录。允许回退时直接还原行数组，不伪造模板关联或审批证据。DDL 与数据转换不能整体回滚，失败恢复遵守[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

```text
products → product_materials → materials → material_variants
process_routes → process_route_steps
```

---

### 3. `product_materials`

职责：维护成品的统一 BOM 明细，是批量生产需求基础生成的唯一 BOM 数据源。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `product_id` | `BIGINT UNSIGNED NOT NULL` | 被生产的成品 |
| `material_id` | `BIGINT UNSIGNED NOT NULL` | 投入的基础物料 |
| `quantity_per_unit` | `INT NOT NULL` | 每件成品所需物料数量 |
| `unit` | `VARCHAR(20) NOT NULL` | 用量单位，须等于物料基础单位 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_product_materials_item(product_id,material_id)`、`uk_product_materials_reference(id,material_id)`；外键 `product_id → products.id`、`material_id → materials.id`，另有 M 组操作者外键。两种 ID 属于不同身份空间，允许数值相等。

CHECK：`quantity_per_unit > 0`、`quantity_per_unit = TRUNCATE(quantity_per_unit,0)`、`quantity_per_unit BETWEEN 0 AND 99999999`，共同限定 `1–99999999` 的整数用量；`status/is_deleted` 均为 `0/1`。组合引用键供 Production 同时校验 BOM 行与物料身份；精确版本不固定在此表。

每个成品与基础物料只有一条 BOM 行；单位用量为正整数，单位必须等于物料基础单位。精确版本由 Production 选择，不写入 BOM。

说明：

- 批量需求保存 BOM 来源与用量快照，研发不依赖 BOM；需求形状由 [Production](../../production/docs/database/demand-allocation-and-outbound.md)维护。追溯依靠精确版本和库存批次，不设 BOM 追溯开关。
- BOM 最后一级审批通过时，`products.bom_locked_at` 与审批终态同事务写入；此后本表所有新增、修改、删除、停用、恢复和批量替换操作均拒绝。
- 任务取消、需求完成或库存归零不能解除锁定。[原则性用料变化](product-rules.md#稳定身份与工作流)必须新建产品和编码。
- 锁定前修改 BOM 不得回写已经生成的生产需求。
- 同一产品和投入对象的 BOM 行软删除后需要再次使用时恢复原记录，不创建相同自然键的新记录。

#### 单版本 BOM 锁定事实

审批接入由[业务规则](product-rules.md#bom-命令与审批)维护，选择理由见 [ADR-0006](../../../../../../docs/adr/0006-approval-workflow-boundaries.md)。Product 只接入 BOM，工单审批仍未实施。

同一成品只有一份 BOM，不建版本头、版本行或当前版本指针。最终批准把最后一级实际批准人和时间写入成品根；这项事实只能从未锁定变为锁定，不提供解锁。名称等展示字段仍可按主数据规则修改。

#### BOM 审批接入结构

成品根保存审批状态、聚合版本和当前申请引用。审批运行表见 [Approval 数据库设计](../../approval/docs/database.md)。

`bom_status` 为 `draft/pending_approval/approved`，独立于成品启停；`version` 是成品聚合并发版本，不是 BOM 业务版本。`bom_approval_instance_id` 指向当前送审或最终批准的申请。

草稿尚无申请或锁定依据；在审须绑定申请但未锁定；批准后保留申请、锁定时间和最终批准人。Product 与 Approval 同事务核验申请确属当前成品及场景，不能只凭申请存在就生效。完整各级人员从审批事实查询，不把最后一人误当全部审批人员。

送审期间冻结成品主表的普通编辑、启停及所有 BOM 明细修改，确保聚合版本和受审内容稳定；要修改先由申请人撤回。所有成品主表及 BOM 写入口均纳入聚合版本管理，BOM 批量修改也须锁成品根并递增同一 `version`。此冻结范围限于当前成品；基础物料自身的改名仍遵守当前名称展示规则，不冻结整个物料目录。

BOM 完整替换的并发及送审前保存规则见[业务命令](product-rules.md#bom-命令与审批)。

提交时校验客户端期望版本，写待审批及申请关联并递增 `version`；申请保存提交冻结后的版本。非末级审批不改 Product。最终批准核对当前申请和冻结版本，检查 BOM 资格后写 `approved` 与锁定事实并递增版本。驳回或撤回清空当前申请关联、恢复 `draft` 并递增版本；旧申请和证据保留在 Approval，不复用旧申请。

已批准产品的名称等展示字段遵守主数据修改规则；BOM 原则性变更继续新建成品编码。创建批量任务只校验批准及当前业务资格，不写 BOM 锁定事实。没有审批证据的旧锁定数据须重置，不能补造人工批准。

---

以下章节继续定义技术文件与工艺路线相关表。

## 2.1 `technical_files`

职责：保存 SOP 与规格书的元数据，文件内容通过 Product 的 S3-compatible 存储端口访问。其他附件用途尚未接入本能力。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `file_name` | `VARCHAR(255) NOT NULL` | 显示文件名，新上传使用原始文件名 |
| `original_name` | `VARCHAR(255) NOT NULL` | 上传原始名称 |
| `storage_provider` | `VARCHAR(32) NOT NULL` | 存储提供方，当前使用 `s3` |
| `bucket` | `VARCHAR(128) NULL` | 稳定 Bucket，当前 S3 写入必填 |
| `object_key` | `VARCHAR(500) NOT NULL` | 稳定对象键，不保存临时 URL |
| `mime_type` | `VARCHAR(128) NOT NULL` | MIME 类型 |
| `size_bytes` | `BIGINT UNSIGNED NOT NULL` | 文件字节数 |
| `checksum_sha256` | `CHAR(64) NOT NULL` | 内容摘要 |
| `file_type` | `VARCHAR(64) NOT NULL` | `sop/specification` |
| `version_no` | `VARCHAR(64) NULL` | SOP 版本，规格书为空 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `VARCHAR(255) NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_technical_files_object(storage_provider,bucket,object_key)`；外键为 M 组操作者引用。CHECK 保证 `size_bytes >= 0`、状态和删除标志为 `0/1`、用途仅 `sop/specification`；`chk_technical_files_version` 要求 SOP 版本非空、规格书版本为空。物理可空 Bucket 不提供当前 S3 写入省略入口；未填 Bucket 的行不受普通联合唯一键的完整去重保护。

稳定对象定位由 provider、bucket、object key 组成并唯一；当前 S3 写入必须保存 bucket，不能保存临时 URL。SOP 必须有版本，规格书版本必须为空。每次上传创建新对象及元数据，不覆盖既有内容；完整生命周期见[技术文件](technical-files.md)。

## 2.2 `process_steps`

职责：维护唯一的工序主数据。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `step_code` | `VARCHAR(100) NOT NULL` | 永久唯一工序编码 |
| `step_name` | `VARCHAR(100) NOT NULL` | 工序名称 |
| `description` | `VARCHAR(255) NULL` | 工序说明 |
| `default_sop_file_id` | `BIGINT UNSIGNED NULL` | 默认 SOP |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_process_steps_code(step_code)`；外键 `default_sop_file_id → technical_files.id ON DELETE SET NULL`，另有 M 组操作者外键；CHECK 限定状态和删除标志为 `0/1`。路线步骤引用工序身份并另存快照，工序主数据不承载具体路线中的位置。

工序编码永久唯一，可配置默认 SOP；文件保留政策见[技术文件](technical-files.md#删除规则)。

## 2.3 `process_routes`

职责：维护可复用、可版本化的工艺路线。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `route_code` | `VARCHAR(64) NOT NULL` | 路线编码 |
| `route_name` | `VARCHAR(128) NOT NULL` | 路线名称 |
| `version_no` | `VARCHAR(64) NOT NULL` | 业务路线版本 |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'draft'` | `draft/enabled/disabled/archived` |
| `remark` | `VARCHAR(255) NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_process_routes_version(route_code,version_no)`；外键为 M 组操作者引用；CHECK 限定状态为表列四值、删除标志为 `0/1`。表不再包含 `product_id`，同一路线可被不同任务显式选择；发布内容不可改由应用保证。

路线编码与版本联合唯一；状态为 `draft/enabled/disabled/archived`，发布和调整规则见[路线工作流](product-rules.md#稳定身份与工作流)。

路线独立于成品，不建立产品—路线适用关系；任务显式选用与历史冻结见[路线工作流](product-rules.md#稳定身份与工作流)。

## 2.4 `process_route_steps`

职责：维护路线中的工序顺序，并保存发布时必要快照。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `route_id` | `BIGINT UNSIGNED NOT NULL` | 所属路线版本 |
| `process_step_id` | `BIGINT UNSIGNED NOT NULL` | 工序主数据身份 |
| `step_order` | `INT NOT NULL` | 顺序，从 `1` 开始 |
| `step_code_snapshot` | `VARCHAR(100) NOT NULL` | 工序编码快照 |
| `step_name_snapshot` | `VARCHAR(100) NOT NULL` | 工序名称快照 |
| `description_snapshot` | `VARCHAR(255) NULL` | 工序说明快照 |
| `default_owner_id` | `BIGINT UNSIGNED NULL` | 默认负责人 |
| `sop_file_id` | `BIGINT UNSIGNED NULL` | 使用的 SOP 文件 |
| `sop_file_name_snapshot` | `VARCHAR(255) NULL` | SOP 名称快照 |
| `sop_object_key_snapshot` | `VARCHAR(500) NULL` | SOP 对象键快照 |
| `sop_version_no_snapshot` | `VARCHAR(64) NULL` | SOP 版本快照 |
| `need_inspection` | `TINYINT NOT NULL DEFAULT 0` | 是否要求检验 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `VARCHAR(255) NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

唯一键 `uk_process_route_steps_order(route_id,step_order)`、`uk_process_route_steps_reference(id,route_id)`；外键 `route_id → process_routes.id`、`process_step_id → process_steps.id`、`default_owner_id → users.id`、`sop_file_id → technical_files.id ON DELETE SET NULL`，另有 M 组操作者外键。

CHECK 保证 `step_order > 0`，`need_inspection/status/is_deleted` 均为 `0/1`；`chk_process_route_steps_sop_version_snapshot` 要求 SOP 名称、对象键及版本三项快照同为空或同非空，不依赖当前文件关联仍存在。所有步骤均须报工，表无报工开关。

每步保存工序编码、名称、说明及 SOP 名称、对象键、版本快照，以及负责人和检验规则。路线内顺序唯一；恢复已删的同一顺序须复用原记录。

## 2.5 路线与 BOM 的边界

不建立 `route_step_materials`。`process_route_steps` 只保存路线工序顺序、负责人、SOP
和规则快照；物料消耗统一来自产品级 `product_materials`，批量任务由 Production 一次完整确认全部 BOM 行的精确 `material_variant_id` 并冻结本任务配置；研发不依赖 BOM。禁止按工序绑定 BOM、按路线步骤推导需求
或以工序范围筛选补料，不得建立旁路表。

## 2.6 `material_variants`

职责：维护同一基础物料下可供管理员选择的精确版本。`materials.id` 是 BOM 的稳定基础物料身份，
`material_variants.id` 才是采购批次、生产需求和库存流水中不可替代的版本身份。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `material_id` | `BIGINT UNSIGNED NOT NULL` | 所属基础物料 |
| `major_version` | `VARCHAR(32) NOT NULL` | 主版本 |
| `minor_version` | `VARCHAR(32) NOT NULL` | 次版本 |
| `variant_code` | `VARCHAR(180) NOT NULL` | 服务端生成的永久版本编码 |
| `specification_file_id` | `BIGINT UNSIGNED NULL` | 当前精确版本规格书 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `remark` | `TEXT NULL` | 备注 |
| 审计列组 M | 见公共列组 | 主数据创建、修改与软删除审计 |

- 唯一键 `uk_material_variants_code(variant_code)`、`uk_material_variants_version(material_id,major_version,minor_version)`、`uk_material_variants_material_reference(id,material_id)`；索引 `idx_material_variants_material_status(material_id,status,is_deleted,id)`、`idx_material_variants_specification_file(specification_file_id)`。
- 外键 `material_id → materials.id`、`specification_file_id → technical_files.id ON DELETE RESTRICT`，另有 M 组操作者外键。组合引用键支持外部同时校验精确版本及基础物料归属。
- CHECK 要求大小版本和版本编码去空白后非空、状态及删除标志为 `0/1`；`chk_material_variants_delete_facts` 要求未删除时删除人／时间均空，删除时二者均非空。
- `trg_material_variants_reject_identity_update` 在 `BEFORE UPDATE` 拒绝改变基础物料、大小版本或版本编码；更换规格书不改变这些身份字段。

基础物料与大小版本联合唯一，版本编码也永久唯一；不同基础物料可使用相同大小版本。版本编码由服务端按物料编码及大小版本生成，身份创建后不可改。每个精确版本独立引用当前规格书。

版本停用不改变历史需求、批次和库存事实。采购允许停用但未删除版本，生产新选版及领料要求启用版本；基础物料及分类资格、历史身份锁和固定锁序统一见[公开用途资格](product-rules.md#候选历史展示与写入资格)。库存批次的冻结／停用由 Inventory 判断。

版本启停只锁本版本行，不借展示 JOIN 反向取得基础物料锁。

规格书引用限制物理删除。规格书替换只更新该关联及修改审计，不改精确版本身份、编码、大小版本或基础物料参数；文件用途和可绑定资格见[规格书规则](product-rules.md#成品与精确物料版本规格书)。

BOM 只选择基础物料，不能固定大小版本。版本候选不等于管理员已经认可替代：Production 按任务类型决定是否允许选择另一版本：批量同任务锁版，研发按每次需求选版，详见[工单物料版本规则](../../production/docs/database/work-orders-and-batches.md)。已停用版本继续用于历史查询，但不允许新增需求选择。

## 3. 数据库实施与应用适配边界

拆表迁移不推造历史身份或审批证据，空数据门禁与恢复顺序见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。待验收和未完成事项见[路线图](../../../../../../docs/roadmap.md)。

### 规格书关联迁移

`202610280001-product-specification-files` 不推测或回填既有资料的规格书。物理空值明确表示尚未补充真实规格书；应用的新建与资料保存必须提交有效规格书，独立启停命令不强制补资料。此可空性不提供省略规格书的新建入口，也不建立影子表或兼容双写。

切换期间暂停 Product 资料及技术文件写入，迁移后切换匹配应用。现存非 SOP／规格书用途会使首个 DDL 失败，不删除或改写其数据。down 在任何永久 DDL 前拒绝成品或精确版本存在非空规格书引用，包含软删除主数据；允许回退时保留技术文件元数据、对象及操作日志。MySQL DDL 不能整体回滚，中断后遵守通用迁移恢复约定。

`202610280003-product-specification-file-metadata` 将版本列改为可空，规格书名称归一为原始文件名并清空版本，SOP 数据和快照保持；回退限制及执行条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280003规格书文件元数据)。

### 物料名称的跨模块展示读取

Product 向 Production、Procurement 与 Inventory 的 `infrastructure/queries/` 开放只读 `materials.id` 与 `materials.material_name`，登记于根 `scripts/api-data-ownership.mjs`。改动这些字段时须检查登记调用方。名称表示当前称呼，历史引用也按稳定 ID 解析，不过滤停用或软删除；禁止物理删除被引用物料。权限、状态、版本可用性及写入资格仍通过 Product 公共能力校验。改名审批尚未实现，见根 roadmap。
