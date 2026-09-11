# Product 数据库设计

本文是 Product 所有业务表的权威设计。migration 统一存放于 `packages/database/migrations`，不改变表的业务所有权。

## 3.1 基础资料表

---

### 1. `product_categories`

职责：统一维护物料和成品分类，不再创建第二套库存分类表。

| 字段            | 类型              | 说明                                            |
| --------------- | ----------------- | ----------------------------------------------- |
| `id`            | `BIGINT UNSIGNED` | 主键，自增                                      |
| `parent_id`     | `BIGINT UNSIGNED` | 父分类 ID，可为空                               |
| `category_code` | `VARCHAR(64)`     | 分类编码                                        |
| `category_name` | `VARCHAR(100)`    | 分类名称                                        |
| `item_kind`     | `VARCHAR(30)`     | `material`、`finished_product`                 |
| `status`        | `TINYINT`         | `1` 启用、`0` 停用                              |
| `remark`        | `TEXT`            | 备注                                            |
| 审计字段        | 见统一规则        | 主数据审计字段                                  |

约束：

- 主键：`id`
- 自关联：`parent_id -> product_categories.id`
- 检查约束：`CHECK (item_kind IN ('material', 'finished_product'))`
- 唯一约束：`UNIQUE (category_code)`

说明：

- `material` 表示原材料、辅料、零部件等；库存中需要精确区分的版本由 `material_variants` 表示。
- `finished_product` 表示最终成品；半成品不再是独立产品类型。
- 分类表达“是什么”，`materials.acquire_method` / `products.acquire_method` 表达“如何获得”，两者不得混用。

---

### 2. `products`

职责：只维护成品。一条记录对应一个确定的成品编码；同名不同编码是不同成品，不另外建立成品大小版本表。

| 字段               | 类型              | 说明                                    |
| ------------------ | ----------------- | --------------------------------------- |
| `id`               | `BIGINT UNSIGNED` | 主键，自增                              |
| `item_code`        | `VARCHAR(100)`    | 成品编码（创建后不可修改）      |
| `product_name`     | `VARCHAR(200)`    | 名称                                    |
| `category_id`      | `BIGINT UNSIGNED` | 分类 ID                                 |
| `default_route_id` | `BIGINT UNSIGNED` | 默认工艺路线，可为空                    |
| `bom_locked_at`    | `DATETIME`        | BOM 最终审批通过并永久锁定的时间   |
| `bom_locked_by`    | `BIGINT UNSIGNED` | BOM 最后一级批准人；未批准时为空            |
| `unit`             | `VARCHAR(20)`     | 唯一基础计量单位，例如 `g`、`kg`、`pcs` |
| `acquire_method`   | `VARCHAR(32)`     | `self_made`、`outsourced`、`purchased`  |
| `spec_values`      | `JSON`            | 轻量规格参数；纯记录，不参与整数数量计算 |
| `status`           | `TINYINT`         | `1` 启用、`0` 停用                      |
| `remark`           | `TEXT`            | 备注                                    |
| 审计字段            | 见统一规则        | 主数据审计字段                          |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (item_code)`
- 外键：`FOREIGN KEY (category_id) REFERENCES product_categories(id)`
- 外键：`default_route_id -> process_routes.id ON DELETE SET NULL`，在工艺表创建后追加
- 外键：`bom_locked_by -> users.id`
- 检查约束：`CHECK (bom_locked_at IS NOT NULL OR bom_locked_by IS NULL)`
- 检查约束：`CHECK (acquire_method IN ('self_made', 'outsourced', 'purchased'))`
- 检查约束：`CHECK (status IN (0, 1))`

说明：

- 成品只写 `products`，基础物料只写 `materials`；二者独立自增，数值相同的 ID 不表示同一对象。
- `category_id` 必须属于 `finished_product` 分类；名称不唯一，唯一键只约束 `item_code`。
- 产品编码和基础单位创建后不可修改；编码永久不复用，软删除后继续使用时恢复原记录。
- BOM 锁定事实与 `default_route_id` 只属于成品；物料表不保留这些字段。
- `default_route_id` 只是新增生产任务时的快捷默认值，不是路线归属或适用性约束。

### 2.1 `materials`

职责：维护 BOM 引用的基础物料编码，例如 `m1.077.012`。名称（例如“微带”）仅用于展示和搜索，分类可表达“半成品 → 微带电路”；两者都不决定物料唯一身份。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 自增主键，独立于成品 ID |
| `material_code` | `VARCHAR(100)` | 永久唯一、不可修改的基础物料编码 |
| `material_name` | `VARCHAR(200)` | 可重复的名称 |
| `category_id` | `BIGINT UNSIGNED` | `product_categories.id`，必须是 `material` 分类 |
| `unit` | `VARCHAR(20)` | 固定基础单位，不允许修改或换算 |
| `acquire_method` | `VARCHAR(32)` | `self_made`、`outsourced`、`purchased` |
| `spec_values` | `JSON` | 基础物料共有的轻量规格记录 |
| `status` | `TINYINT` | `0/1` |
| `remark` | `TEXT` | 可空备注 |
| 审计字段 | 见统一规则 | `created_by/at`、`updated_by/at`、`is_deleted`、`deleted_by/at` |

约束：`UNIQUE (material_code)`；分类和操作者外键；状态与软删除标志只允许 `0/1`；删除必须同时保存删除人和时间。物料编码和单位由更新触发器保护。名称不唯一；物料与成品分别保证各自编码唯一，不建立跨表编码注册表。

分类类型由 Product 写事务校验，分类对象类型创建后不可修改，无论是否存在引用。物料自身不拥有 BOM、默认路线或生产工单；`self_made` 只保留获取方式，不提前开放自产半成品入库能力。

```text
products → product_materials → materials → material_variants
products.default_route_id → process_routes → process_route_steps
```

---

### 3. `product_materials`

职责：维护成品的统一 BOM 明细，是生产需求基础生成的唯一 BOM 数据源。

| 字段                  | 类型              | 说明                           |
| --------------------- | ----------------- | ------------------------------ |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                     |
| `product_id`          | `BIGINT UNSIGNED` | 被生产对象 ID                  |
| `material_id` | `BIGINT UNSIGNED` | 消耗对象 ID                    |
| `quantity_per_unit`   | `DECIMAL(12,4)`   | 每生产一个目标对象的需求数量   |
| `unit`                | `VARCHAR(20)`     | 用量单位，必须等于物料基础单位 |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用             |
| `remark`              | `TEXT`            | 备注                           |
| 审计字段              | 见统一规则        | 主数据审计字段                 |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (material_id) REFERENCES materials(id)`
- 检查约束：`CHECK (quantity_per_unit > 0)`
- 检查约束：`CHECK (quantity_per_unit = FLOOR(quantity_per_unit))`
- 检查约束：`status` 与 `is_deleted` 只允许 `0/1`
- 唯一约束：`UNIQUE (product_id, material_id)`
- 组合引用索引：`UNIQUE (id, material_id)`

说明：

- `product_id` 指向成品表；成品 ID 与物料 ID 可以数值相同，不再保留自引用不等式。
- `material_id` 指向 `materials.id`；需要精确库存版本时由 Production 在需求或物流事实中选择 `material_variant_id`。
- `production_item_demand` 必须保存 `product_material_id` 和 BOM 数量、单位快照；批次追溯统一依靠精确版本及库存批次引用，不配置 BOM 追溯开关。
- BOM 最后一级审批通过时，`products.bom_locked_at` 与审批终态同事务写入；此后本表所有新增、修改、删除、停用、恢复和批量替换操作均拒绝。
- 任务取消、需求完成或库存归零不能解除锁定。原则性用料变化必须新建产品和编码。
- 锁定前修改 BOM 不得回写已经生成的生产需求。
- 同一产品和投入对象的 BOM 行软删除后需要再次使用时恢复原记录，不创建相同自然键的新记录。

#### 单版本 BOM 锁定事实

审批业务边界见 [ADR-0006](../../../../../../docs/adr/0006-approval-workflow-boundaries.md)。本次只接入 BOM，工单审批仍未实施。

这两个既有表在 BOM 锁定中的白话分工是：

- `products`：记住“这个产品的 BOM 是否已最终批准，以及谁、什么时候批准并锁定”。
- `product_materials`：保存“生产这个产品固定要用哪些物料和各用多少”；产品一旦锁定，这些行就只能查看，不能再改。

正式规则：

1. 系统不建立 BOM 版本头、版本行或当前版本指针；同一个 `products.id` 只有一份有效 BOM 定义。
2. BOM 末级批准、申请结束及写入 `products.bom_locked_at/bom_locked_by` 必须处于同一事务。生产任务只校验已有批准事实并冻结路线工序快照。
3. 锁定事实只允许从“未锁定”写成“已锁定”，没有解锁命令。任务取消、需求完成、库存归零或所有路线停用均不能清空锁定事实。
4. 批准后 `bom_locked_by` 与 `bom_locked_at` 必须同时非空，记录最后一级实际处理人。没有审批证据的旧锁定数据须按开发约定重置。
5. 已锁定产品拒绝 BOM 行新增、修改、删除、停用、恢复和批量替换。产品确需发生原则性用料变化时，管理员新建产品和编码，再复制并重新复核 BOM 与路线。
6. 名称等不改变稳定产品身份的展示字段仍可按产品主数据规则修改；产品编码和固定基础单位不可修改。

#### BOM 审批接入结构

`202609100001-approval-bom-pilot` 追加以下字段与约束。审批运行表见 [Approval 数据库设计](../../approval/docs/database.md)。

| `products` 字段 | 类型 | 语义 |
| --- | --- | --- |
| 新增 `bom_status` | `VARCHAR(30) NOT NULL DEFAULT 'draft'` | `draft/pending_approval/approved`，独立于成品启停 |
| 新增 `bom_approval_instance_id` | `BIGINT UNSIGNED NULL` | 当前送审或最终批准的申请 FK `approval_instances.id` |
| 新增 `version` | `INT NOT NULL DEFAULT 0` | 聚合乐观锁，不是 BOM 业务版本 |
| 既有 `bom_locked_at/by` | 保留原类型 | 由最终 BOM 批准写入永久锁定事实，操作人是最后一级实际批准人 |

CHECK：`version >= 0`；`draft` 时申请关联和锁定字段均为空；`pending_approval` 时申请关联非空、锁定字段为空；`approved` 时申请关联、锁定时间和操作人均非空。索引 `bom_approval_instance_id`；外键仅保证申请存在，Product 与 Approval 同事务验证申请场景、对象类型、`subject_id`、状态及业务关联相符。完整各级人员从审批事实查询，不把最后一人误当全部审批人员。

送审期间冻结成品主表的普通编辑、启停、默认路线变更及所有 BOM 明细修改，确保聚合版本和受审内容稳定；要修改先由申请人撤回。所有成品主表及 BOM 写入口均纳入聚合版本管理，BOM 批量修改也须锁成品根并递增同一 `version`。此冻结范围限于当前成品；基础物料自身的改名仍遵守当前名称展示规则，不冻结整个物料目录。

BOM 替换命令必须包含客户端读取的 `version` 与完整 `items`；锁成品根后，先核对当前版本与命令版本一致，再进行任何明细写入。不一致则返回冲突，不能仅递增版本而允许旧页面覆盖新 BOM。

提交时校验客户端期望版本，写待审批及申请关联并递增 `version`；申请保存提交冻结后的版本。非末级审批不改 Product。最终批准核对当前申请和冻结版本，检查 BOM 资格后写 `approved` 与锁定事实并递增版本。驳回或撤回清空当前申请关联、恢复 `draft` 并递增版本；旧申请和证据保留在 Approval，不复用旧申请。

已批准产品的名称等原本允许修改的展示字段仍遵守既有主数据规则；BOM 原则性变更继续新建成品编码。后续创建任务只校验批准及当前业务资格，不再触发首次锁定。单一 `product_materials` 结构保留，不增加版本头、版本行、`bom_revision` 或名称影子表。改表只能追加 migration；开发环境可重置，不把既有任务锁定回填成不存在的人工审批。

---

以下章节继续定义技术文件与工艺路线相关表。

## 2.1 `technical_files`

职责：保存 SOP、检验附件和追溯附件的元数据，文件内容通过存储端口访问，兼容本地、S3、OSS 和 MinIO。

| 字段               | 类型              | 说明                            |
| ------------------ | ----------------- | ------------------------------- |
| `id`               | `BIGINT UNSIGNED` | 主键，自增                      |
| `file_name`        | `VARCHAR(255)`    | 业务文件名                      |
| `original_name`    | `VARCHAR(255)`    | 上传时原始文件名                |
| `storage_provider` | `VARCHAR(32)`     | `local`、`s3`、`oss`、`minio`   |
| `bucket`           | `VARCHAR(128)`    | Bucket，本地存储可为空          |
| `object_key`       | `VARCHAR(500)`    | 存储对象键，不保存临时签名 URL  |
| `mime_type`        | `VARCHAR(128)`    | MIME 类型                       |
| `size_bytes`       | `BIGINT UNSIGNED` | 文件大小                        |
| `checksum_sha256`  | `CHAR(64)`        | 内容摘要                        |
| `file_type`        | `VARCHAR(64)`     | `sop`、`inspection`、`trace` 等 |
| `version_no`       | `VARCHAR(64)`     | 文件版本                        |
| `status`           | `TINYINT`         | `1` 启用、`0` 停用              |
| `remark`           | `VARCHAR(255)`    | 备注                            |
| 审计字段           | 见统一规则        | 主数据审计字段                  |

约束：`UNIQUE (storage_provider, bucket, object_key)`；`CHECK (size_bytes >= 0)`。

## 2.2 `process_steps`

职责：唯一的工序主数据来源，不再创建 `processes`。

| 字段                  | 类型              | 说明                  |
| --------------------- | ----------------- | --------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增            |
| `step_code`           | `VARCHAR(100)`    | 工序编码              |
| `step_name`           | `VARCHAR(100)`    | 工序名称              |
| `description`         | `VARCHAR(255)`    | 工序说明              |
| `default_sop_file_id` | `BIGINT UNSIGNED` | 默认 SOP 文件，可为空 |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用    |
| `remark`              | `TEXT`            | 备注                  |
| 审计字段              | 见统一规则        | 主数据审计字段        |

约束：`UNIQUE (step_code)`；`default_sop_file_id -> technical_files.id ON DELETE SET NULL`。

## 2.3 `process_routes`

职责：维护可复用、可版本化的工艺路线。

| 字段         | 类型              | 说明                                       |
| ------------ | ----------------- | ------------------------------------------ |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                                 |
| `route_code` | `VARCHAR(64)`     | 路线编码                                   |
| `route_name` | `VARCHAR(128)`    | 路线名称                                   |
| `version_no` | `VARCHAR(64)`     | 路线版本                                   |
| `status`     | `VARCHAR(20)`     | `draft`、`enabled`、`disabled`、`archived` |
| `remark`     | `VARCHAR(255)`    | 备注                                       |
| 审计字段     | 见统一规则        | 主数据审计字段                             |

约束：`UNIQUE (route_code, version_no)`；`CHECK (status IN ('draft', 'enabled', 'disabled', 'archived'))`；启用后的路线版本不得原地修改步骤，只能创建新版本。

说明：路线独立维护，新增/编辑路线不包含“适用产品”。不建立产品—路线适用关系表；多个成品可选择同一条启用路线作为默认值。新增任务允许选择任意启用且未删除的路线；未指定时使用产品默认路线，并重新校验启用状态。批次创建时冻结路线、步骤和 SOP 快照，后续修改默认值不改变历史任务。

## 2.4 `process_route_steps`

职责：维护路线中的工序顺序，并保存发布时必要快照。

| 字段                      | 类型              | 说明                         |
| ------------------------- | ----------------- | ---------------------------- |
| `id`                      | `BIGINT UNSIGNED` | 主键，自增                   |
| `route_id`                | `BIGINT UNSIGNED` | 工艺路线 ID                  |
| `process_step_id`         | `BIGINT UNSIGNED` | 工序主数据 ID                |
| `step_order`              | `INT`             | 工序顺序，从 `1` 开始        |
| `step_code_snapshot`      | `VARCHAR(100)`    | 工序编码快照                 |
| `step_name_snapshot`      | `VARCHAR(100)`    | 工序名称快照                 |
| `description_snapshot`    | `VARCHAR(255)`    | 工序说明快照                 |
| `default_owner_id`        | `BIGINT UNSIGNED` | 默认负责人，可为空           |
| `sop_file_id`             | `BIGINT UNSIGNED` | 本路线步骤使用的 SOP，可为空 |
| `sop_file_name_snapshot`  | `VARCHAR(255)`    | SOP 名称快照                 |
| `sop_object_key_snapshot` | `VARCHAR(500)`    | SOP 对象键快照               |
| `sop_version_no_snapshot` | `VARCHAR(64)`     | SOP 版本号快照               |
| `need_inspection`         | `TINYINT`         | 是否要求检验，默认 `0`       |
| `status`                  | `TINYINT`         | `1` 启用、`0` 停用           |
| `remark`                  | `VARCHAR(255)`    | 备注                         |
| 审计字段                  | 见统一规则        | 主数据审计字段               |

约束：`UNIQUE (route_id, step_order)`；`UNIQUE (id, route_id)`；检查布尔字段和 `step_order > 0`。软删除后需要恢复同一路线顺序时恢复原步骤记录，不创建相同顺序的新记录。

## 2.5 路线与 BOM 的边界

当前模型不再建立 `route_step_materials`。`process_route_steps` 只保存路线工序顺序、负责人、SOP
和规则快照；物料消耗统一来自产品级 `product_materials`，生产批次在创建时冻结完整 BOM，随后由
Production 一次完整配置全部 BOM 行的精确 `material_variant_id`。任何按工序绑定 BOM、按路线步骤推导需求
或以工序范围筛选补料的语义均已删除，不得恢复旁路表。

## 2.6 `material_variants`

职责：维护同一基础物料下可供管理员选择的精确版本。`materials.id` 是 BOM 的稳定基础物料身份，
`material_variants.id` 才是采购批次、生产需求和库存流水中不可替代的版本身份。

| 字段                  | 类型              | 说明                              |
| --------------------- | ----------------- | --------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                              |
| `material_id` | `BIGINT UNSIGNED` | `materials.id`，必须是启用物料      |
| `major_version`       | `VARCHAR(32)`     | 主版本                            |
| `minor_version`       | `VARCHAR(32)`     | 次版本                            |
| `variant_code`        | `VARCHAR(180)`    | 服务端生成且创建后不可修改的编码   |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用                 |
| `is_deleted`          | `TINYINT`         | 软删除标记                         |

同一基础物料的启用、未删除版本构成候选集合；停用只阻止新选择，不改变需求、批次、分配、出入库、退料、
报废、盘点及库存流水中已冻结的版本快照。跨模块只能通过 Product 的 `MaterialVariantQuery` 读取候选，
不得直接查询本表。

物料版本约束：`UNIQUE (material_id, major_version, minor_version)`、`UNIQUE (variant_code)`、`UNIQUE (id, material_id)`；版本编码由基础物料编码与大小版本生成。版本表同样保存完整主数据审计字段与备注，身份字段创建后不可修改。不同基础物料可以具有相同大小版本号。

BOM 只选择基础物料，不能固定大小版本。版本候选不等于管理员已经认可替代：Production 按工单类型决定是否允许选择另一版本，详见[工单物料版本规则](../../production/docs/database/work-orders-and-batches.md)。已停用版本继续用于历史查询，但不允许新增需求选择。

## 3. 数据库实施与应用适配边界

本项目目前处于开发阶段，数据库结构可能随时调整，允许在任何时候完全重置数据库数据（清空或重建），无需保留兼容性数据。重置是正常开发流程，测试数据由统一 demo/fixture 再生成；开发者不得依赖旧数据验证功能。

拆表迁移仅接受空业务表，遇到既有成品、物料版本、路线或工单时在任何结构改动前拒绝执行，应重置开发库后从第一条 migration 重建。回滚同样只接受空业务表。不得修改已执行 migration，不设置双写或影子表。

本设计是目标 schema 的权威定义；现有 API、DTO、查询适配器与页面仍需按[roadmap](../../../../../../docs/roadmap.md)完成适配后才能连接新结构提供完整业务操作。

### 物料名称的跨模块展示读取

Product 向 Production 的 `infrastructure/queries/` 开放只读 `materials.id` 与 `materials.material_name`，登记于根 `scripts/api-data-ownership.mjs`。改动这些字段时须检查登记调用方。名称表示当前称呼，历史引用也按稳定 ID 解析，不过滤停用或软删除；禁止物理删除被引用物料。权限、状态、版本可用性及写入资格仍通过 Product 公共能力校验。改名审批尚未实现，见根 roadmap。

所有路线步骤均须报工，不设置是否报工字段；工序检验规则仍独立保存。

成品名称分组、组成员关联均采用数据库字段的排序规则。当前页各组由 SQL 分配内部组序号，应用层只按该序号收集编码，不重新使用 JavaScript 名称相等规则分组。组成员包含该组全部未删除编码，筛选命中决定组是否出现在结果中。
