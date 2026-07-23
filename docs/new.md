# Company MES 统一数据库设计｜方案 B

本文档是后续模块迁移的唯一候选数据库设计基准。生产库存业务以原 `new.md` 为主体，并完成以下统一：

- `item_type` 统一为 `product_categories`。
- `item_info` 统一为 `products`。
- `product_bom` 统一为 `product_materials`，不保留第二套 BOM 表。
- RBAC 与认证字段以新项目已落地迁移为准。
- 工序主数据只保留 `process_steps`，不再创建职责重复的 `processes`。
- 数量事实保存在业务明细或库存流水；为历史追溯补充必要快照，不创建可随意写回的累计缓存字段。
- 当前轻量 MES 不引入项目模型，也不提供项目级主数据、业务单据或库存隔离；界面中的业务入口不得被解释为项目隔离能力。

## 统一审计规则

- 主数据和配置表使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`is_deleted`、`deleted_by`、`deleted_at`。
- 可变业务单据使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`version`；取消通过状态表达，不物理删除。
- 库存流水等不可变事实使用：`created_by`、`created_at`；错误通过反向冲销流水修正，不更新、不删除。
- 纯关联表使用复合主键并至少保留 `created_at`；当前 RBAC 关联表的操作者通过 `operation_logs` 追溯。
- 所有冗余 ID 必须由组合外键或事务校验保证一致，不能成为第二事实来源。
- MES 主数据编码和配置自然键永久不复用，唯一约束不包含布尔 `is_deleted`；软删除后需要再次使用时恢复原记录，不创建相同编码或自然键的新记录。

## 统一类型与状态规则

- 所有主键和外键统一使用 `BIGINT UNSIGNED`。
- 时间统一使用 `DATETIME` 并按 UTC 写入，前端按用户时区展示。
- 业务数量统一使用 `DECIMAL(12,4)`；禁止使用浮点数保存数量。
- 状态值必须在共享常量包中集中维护，并与数据库 `CHECK` 约束一致；不得在页面或 Repository 中散落魔法字符串。
- 单据编号和幂等键必须唯一；所有确认类动作必须在同一事务内写业务明细、库存流水和操作日志。

# 一、系统、RBAC 与认证

## 1.1 `departments`

职责：维护组织部门和用户归属。

| 字段         | 类型              | 说明                        |
| ------------ | ----------------- | --------------------------- |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                  |
| `parent_id`  | `BIGINT UNSIGNED` | 父部门 ID，顶级为空，自关联 |
| `name`       | `VARCHAR(64)`     | 部门名称                    |
| `code`       | `VARCHAR(64)`     | 部门编码，唯一              |
| `sort_order` | `INT`             | 排序，默认 `0`              |
| `status`     | `TINYINT`         | `1` 启用、`0` 停用          |
| `created_at` | `DATETIME`        | 创建时间                    |
| `updated_at` | `DATETIME`        | 更新时间                    |
| `deleted_at` | `DATETIME`        | 删除时间，空表示未删除      |

约束：`UNIQUE (code)`；`parent_id -> departments.id`。

## 1.2 `users`

职责：维护账号、登录凭证、部门归属和账号状态。

| 字段            | 类型              | 说明                 |
| --------------- | ----------------- | -------------------- |
| `id`            | `BIGINT UNSIGNED` | 主键，自增           |
| `department_id` | `BIGINT UNSIGNED` | 部门 ID，可为空      |
| `username`      | `VARCHAR(64)`     | 登录名，唯一         |
| `password_hash` | `VARCHAR(255)`    | 密码哈希，不保存明文 |
| `display_name`  | `VARCHAR(64)`     | 显示名称             |
| `email`         | `VARCHAR(128)`    | 邮箱，可为空         |
| `mobile`        | `VARCHAR(32)`     | 手机号，可为空       |
| `status`        | `TINYINT`         | `1` 启用、`0` 停用   |
| `last_login_at` | `DATETIME`        | 最近登录时间         |
| `created_at`    | `DATETIME`        | 创建时间             |
| `updated_at`    | `DATETIME`        | 更新时间             |
| `deleted_at`    | `DATETIME`        | 删除时间             |

约束：`UNIQUE (username)`；`department_id -> departments.id`；索引 `(status, deleted_at)`。

## 1.3 `roles`

| 字段          | 类型              | 说明               |
| ------------- | ----------------- | ------------------ |
| `id`          | `BIGINT UNSIGNED` | 主键，自增         |
| `name`        | `VARCHAR(64)`     | 角色名称           |
| `code`        | `VARCHAR(64)`     | 角色编码，唯一     |
| `description` | `VARCHAR(255)`    | 说明               |
| `status`      | `TINYINT`         | `1` 启用、`0` 停用 |
| `created_at`  | `DATETIME`        | 创建时间           |
| `updated_at`  | `DATETIME`        | 更新时间           |
| `deleted_at`  | `DATETIME`        | 删除时间           |

约束：`UNIQUE (code)`；索引 `(status, deleted_at)`。

## 1.4 `permissions`

职责：统一维护菜单、页面、按钮和后端接口权限点；权限编码使用 `module:resource:action`。

| 字段         | 类型              | 说明                            |
| ------------ | ----------------- | ------------------------------- |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                      |
| `parent_id`  | `BIGINT UNSIGNED` | 父权限 ID，可为空，自关联       |
| `name`       | `VARCHAR(64)`     | 权限名称                        |
| `code`       | `VARCHAR(128)`    | 权限编码，唯一                  |
| `type`       | `VARCHAR(32)`     | `menu`、`page`、`button`、`api` |
| `route_path` | `VARCHAR(255)`    | 前端路由，可为空                |
| `api_method` | `VARCHAR(16)`     | HTTP 方法，可为空               |
| `api_path`   | `VARCHAR(255)`    | 接口路径，可为空                |
| `sort_order` | `INT`             | 排序，默认 `0`                  |
| `status`     | `TINYINT`         | `1` 启用、`0` 停用              |
| `created_at` | `DATETIME`        | 创建时间                        |
| `updated_at` | `DATETIME`        | 更新时间                        |
| `deleted_at` | `DATETIME`        | 删除时间                        |

约束：`UNIQUE (code)`；`parent_id -> permissions.id`。

## 1.5 `user_roles`

| 字段         | 类型              | 说明     |
| ------------ | ----------------- | -------- |
| `user_id`    | `BIGINT UNSIGNED` | 用户 ID  |
| `role_id`    | `BIGINT UNSIGNED` | 角色 ID  |
| `created_at` | `DATETIME`        | 分配时间 |

约束：`PRIMARY KEY (user_id, role_id)`；两侧外键删除时级联删除关联行。

## 1.6 `role_permissions`

| 字段            | 类型              | 说明     |
| --------------- | ----------------- | -------- |
| `role_id`       | `BIGINT UNSIGNED` | 角色 ID  |
| `permission_id` | `BIGINT UNSIGNED` | 权限 ID  |
| `created_at`    | `DATETIME`        | 分配时间 |

约束：`PRIMARY KEY (role_id, permission_id)`；两侧外键删除时级联删除关联行。

## 1.7 `refresh_tokens`

职责：保存刷新令牌族的服务端状态，只保存 `jti`，不保存明文 Token。

| 字段              | 类型              | 说明                  |
| ----------------- | ----------------- | --------------------- |
| `id`              | `BIGINT UNSIGNED` | 主键，自增            |
| `user_id`         | `BIGINT UNSIGNED` | 用户 ID               |
| `jti`             | `CHAR(36)`        | Token 唯一标识，唯一  |
| `expires_at`      | `DATETIME`        | 过期时间              |
| `revoked_at`      | `DATETIME`        | 撤销时间              |
| `replaced_by_jti` | `CHAR(36)`        | 轮换后的新 Token 标识 |
| `created_at`      | `DATETIME`        | 创建时间              |

约束：`UNIQUE (jti)`；索引 `(user_id, revoked_at, expires_at)`；`user_id -> users.id ON DELETE CASCADE`。

## 1.8 `operation_logs`

职责：记录认证、权限和业务操作审计，不得记录密码、Token、Cookie 或其他密钥。

| 字段          | 类型              | 说明                   |
| ------------- | ----------------- | ---------------------- |
| `id`          | `BIGINT UNSIGNED` | 主键，自增             |
| `log_type`    | `VARCHAR(32)`     | 日志类型               |
| `module`      | `VARCHAR(64)`     | 模块                   |
| `action`      | `VARCHAR(128)`    | 动作                   |
| `user_id`     | `BIGINT UNSIGNED` | 操作用户，可为空       |
| `target_id`   | `BIGINT UNSIGNED` | 目标 ID，可为空        |
| `target_type` | `VARCHAR(64)`     | 目标类型               |
| `result`      | `VARCHAR(32)`     | 默认 `success`         |
| `before_data` | `JSON`            | 操作前数据，已脱敏     |
| `after_data`  | `JSON`            | 操作后数据，已脱敏     |
| `ip`          | `VARCHAR(64)`     | 来源 IP                |
| `remark`      | `VARCHAR(255)`    | 说明或脱敏后的错误摘要 |
| `created_at`  | `DATETIME`        | 创建时间               |

索引：`(user_id, created_at)`、`(module, action, created_at)`。

# 二、文件与工艺

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
| `product_id` | `BIGINT UNSIGNED` | 所属产品 ID                                |
| `version_no` | `VARCHAR(64)`     | 路线版本                                   |
| `status`     | `VARCHAR(20)`     | `draft`、`enabled`、`disabled`、`archived` |
| `remark`     | `VARCHAR(255)`    | 备注                                       |
| 审计字段     | 见统一规则        | 主数据审计字段                             |

约束：`product_id -> products.id`；`UNIQUE (product_id, route_code, version_no)`；启用后的路线版本不得原地修改步骤，只能创建新版本。

说明：路线必须绑定具体产品，才能保证路线工序关联的 `product_materials` 属于同一产品。跨产品复用工序通过 `process_steps` 完成，不在一期引入会破坏 BOM 约束的分类级路线模板。

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
| `need_inspection`         | `TINYINT`         | 是否要求检验，默认 `0`       |
| `need_record`             | `TINYINT`         | 是否要求报工，默认 `1`       |
| `status`                  | `TINYINT`         | `1` 启用、`0` 停用           |
| `remark`                  | `VARCHAR(255)`    | 备注                         |
| 审计字段                  | 见统一规则        | 主数据审计字段               |

约束：`UNIQUE (route_id, step_order)`；`UNIQUE (id, route_id)`；检查布尔字段和 `step_order > 0`。软删除后需要恢复同一路线顺序时恢复原步骤记录，不创建相同顺序的新记录。

## 2.5 `route_step_materials`

职责：关联工艺路线步骤与统一 BOM 明细，只表达“哪道工序使用哪条 BOM”，不重复保存产品级单件用量。

| 字段                  | 类型              | 说明                   |
| --------------------- | ----------------- | ---------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增             |
| `route_step_id`       | `BIGINT UNSIGNED` | 路线步骤 ID            |
| `product_material_id` | `BIGINT UNSIGNED` | `product_materials.id` |
| `remark`              | `TEXT`            | 备注                   |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                 |
| `created_at`          | `DATETIME`        | 创建时间               |

约束：`UNIQUE (route_step_id, product_material_id)`；两个外键均使用 `RESTRICT`。应用事务必须校验 `product_materials.product_id = process_routes.product_id`。

# 三、生产与库存

## 3.0 设计说明

本方案用于管理生产过程中的物料需求、物料分配、生产领料出库、退料、报废补料、半成品入库、成品入库、库存流水和盘点。

核心设计原则：

1. 物料、半成品、成品统一作为库存对象管理。
2. 所有库存对象统一使用 `products` 表维护基础信息。
3. 所有库存批次统一使用 `item_batch` 表维护。
4. 生产批次 `production_batches` 不等于库存批次 `item_batch`。
5. 库存流水 `inventory_transaction.batch_id` 统一关联 `item_batch.id`。
6. 生产领料分配代表业务预留，已分配数量不能被其他生产批次抢占。
7. 需求、分配、出库、退料、报废的累计数量通过视图汇总，不建议写回主表。
8. 入库、出库、退料、报废、盘点调整等影响库存数量的动作都应生成库存流水。

---

## 3.1 基础资料表

---

### 1. `product_categories`

职责：统一维护物料、半成品和成品分类，不再创建第二套库存分类表。

| 字段            | 类型              | 说明                                            |
| --------------- | ----------------- | ----------------------------------------------- |
| `id`            | `BIGINT UNSIGNED` | 主键，自增                                      |
| `parent_id`     | `BIGINT UNSIGNED` | 父分类 ID，可为空                               |
| `category_code` | `VARCHAR(64)`     | 分类编码                                        |
| `category_name` | `VARCHAR(100)`    | 分类名称                                        |
| `item_kind`     | `VARCHAR(30)`     | `material`、`semi_finished`、`finished_product` |
| `status`        | `TINYINT`         | `1` 启用、`0` 停用                              |
| `remark`        | `TEXT`            | 备注                                            |
| 审计字段        | 见统一规则        | 主数据审计字段                                  |

约束：

- 主键：`id`
- 自关联：`parent_id -> product_categories.id`
- 检查约束：`CHECK (item_kind IN ('material', 'semi_finished', 'finished_product'))`
- 唯一约束：`UNIQUE (category_code)`

说明：

- `material` 表示原材料、辅料、零部件等。
- `semi_finished` 表示生产过程中产生的半成品。
- `finished_product` 表示最终成品。
- 分类表达“是什么”，`products.acquire_method` 表达“如何获得”，两者不得混用。

---

### 2. `products`

职责：维护所有可生产、可采购或可库存对象，是物料、半成品和成品的唯一主数据。

| 字段               | 类型              | 说明                                    |
| ------------------ | ----------------- | --------------------------------------- |
| `id`               | `BIGINT UNSIGNED` | 主键，自增                              |
| `item_code`        | `VARCHAR(100)`    | 统一库存对象编码                        |
| `product_name`     | `VARCHAR(200)`    | 名称                                    |
| `category_id`      | `BIGINT UNSIGNED` | 分类 ID                                 |
| `default_route_id` | `BIGINT UNSIGNED` | 默认工艺路线，可为空                    |
| `unit`             | `VARCHAR(20)`     | 唯一基础计量单位，例如 `g`、`kg`、`pcs` |
| `acquire_method`   | `VARCHAR(32)`     | `self_made`、`outsourced`、`purchased`  |
| `spec_values`      | `JSON`            | 轻量规格参数                            |
| `status`           | `TINYINT`         | `1` 启用、`0` 停用                      |
| `remark`           | `TEXT`            | 备注                                    |
| 审计字段           | 见统一规则        | 主数据审计字段                          |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (item_code)`
- 外键：`FOREIGN KEY (category_id) REFERENCES product_categories(id)`
- 外键：`default_route_id -> process_routes.id ON DELETE SET NULL`，在工艺表创建后追加
- 检查约束：`CHECK (acquire_method IN ('self_made', 'outsourced', 'purchased'))`
- 检查约束：`CHECK (status IN (0, 1))`

说明：

- 物料、半成品、成品都进入该表，不再创建 `item_info` 或独立物料主表。
- 是否是物料、半成品或成品，通过 `category_id -> product_categories.item_kind` 判断。
- `item_code` 是产品、物料和半成品的唯一业务编码；编码软删除后不得被新记录复用，需要继续使用时恢复原记录。
- 一期只允许一个基础单位；需要多单位时必须另行设计单位换算，不能同时维护同义的 `unit/default_unit`。

示例：

| id  | product_name           | item_kind        | unit |
| --- | ---------------------- | ---------------- | ---- |
| pi2 | 粘合-h822              | material         | g    |
| pi3 | 6g-20g微带环形器半成品 | semi_finished    | pcs  |
| pi4 | 10g-30g微带环形器成品  | finished_product | pcs  |

---

### 3. `product_materials`

职责：维护产品或半成品的统一 BOM 明细，是生产需求生成的唯一 BOM 数据源。

| 字段                  | 类型              | 说明                           |
| --------------------- | ----------------- | ------------------------------ |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                     |
| `product_id`          | `BIGINT UNSIGNED` | 被生产对象 ID                  |
| `material_product_id` | `BIGINT UNSIGNED` | 消耗对象 ID                    |
| `quantity_per_unit`   | `DECIMAL(12,4)`   | 每生产一个目标对象的需求数量   |
| `unit`                | `VARCHAR(20)`     | 用量单位，默认等于物料基础单位 |
| `is_key_material`     | `TINYINT`         | 是否关键物料，默认 `1`         |
| `need_batch_record`   | `TINYINT`         | 是否要求批次追溯，默认 `1`     |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用             |
| `remark`              | `TEXT`            | 备注                           |
| 审计字段              | 见统一规则        | 主数据审计字段                 |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (material_product_id) REFERENCES products(id)`
- 检查约束：`CHECK (product_id <> material_product_id)`
- 检查约束：`CHECK (quantity_per_unit > 0)`
- 检查约束：布尔字段与 `status` 只允许 `0/1`
- 唯一约束：`UNIQUE (product_id, material_product_id)`
- 组合引用索引：`UNIQUE (id, material_product_id)`

说明：

- `product_id` 可以是成品，也可以是半成品。
- `material_product_id` 可以是物料，也可以是半成品。
- `production_item_demand` 必须保存 `product_material_id` 和 BOM 数量、单位、追溯标志快照。
- 修改 BOM 不得回写已经生成的生产需求。
- 同一产品和投入对象的 BOM 行软删除后需要再次使用时恢复原记录，不创建相同自然键的新记录。

---

## 3.2 生产执行表

---

### 4. `work_orders`

职责：维护生产工单，记录某个产品的整体生产计划。

| 字段                    | 类型              | 说明                                                             |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                       |
| `work_order_no`         | `VARCHAR(100)`    | 工单编号                                                         |
| `product_id`            | `BIGINT UNSIGNED` | 计划生产对象 ID                                                  |
| `product_code_snapshot` | `VARCHAR(100)`    | 下达时产品编码快照                                               |
| `product_name_snapshot` | `VARCHAR(200)`    | 下达时产品名称快照                                               |
| `unit_snapshot`         | `VARCHAR(20)`     | 下达时单位快照                                                   |
| `planned_quantity`      | `DECIMAL(12,4)`   | 工单计划生产数量                                                 |
| `status`                | `VARCHAR(30)`     | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at`           | `DATETIME`        | 下达时间                                                         |
| `external_order_no`     | `VARCHAR(100)`    | 外部订单号，可为空                                               |
| `remark`                | `TEXT`            | 备注                                                             |
| `version`               | `INT`             | 乐观锁版本号，默认 `0`                                           |
| 业务审计字段            | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (work_order_no)`
- 组合引用索引：`UNIQUE (id, product_id)`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed'))`
- 索引：`INDEX (external_order_no)`

说明：

- 工单表示整体生产计划。
- 一个工单可以拆分为多个生产批次。
- 生产领料、生产入库、半成品入库等动作建议落到 `production_batches` 维度。
- 产品快照在工单下达时冻结，后续修改产品主数据不得回写历史工单。

---

### 5. `production_batches`

职责：维护生产批次，表示某个工单被拆分后的实际生产批次。

| 字段                     | 类型              | 说明                            |
| ------------------------ | ----------------- | ------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，生产批次 ID               |
| `work_order_id`          | `BIGINT UNSIGNED` | 工单 ID                         |
| `product_id`             | `BIGINT UNSIGNED` | 冗余产品 ID，与工单组合外键约束 |
| `batch_no`               | `VARCHAR(100)`    | 生产批号                        |
| `route_id`               | `BIGINT UNSIGNED` | 工艺路线 ID，可为空             |
| `route_code_snapshot`    | `VARCHAR(64)`     | 路线编码快照                    |
| `route_version_snapshot` | `VARCHAR(64)`     | 路线版本快照                    |
| `planned_quantity`       | `DECIMAL(12,4)`   | 本批次计划生产数量              |
| `completed_quantity`     | `DECIMAL(12,4)`   | 最终完成数量，默认 `0`          |
| `qualified_quantity`     | `DECIMAL(12,4)`   | 最终合格数量，默认 `0`          |
| `completed_at`           | `DATETIME`        | 完工确认时间，可为空            |
| `completed_by`           | `BIGINT UNSIGNED` | 完工确认人，可为空              |
| `status`                 | `VARCHAR(40)`     | 生产批次状态                    |
| `owner_id`               | `BIGINT UNSIGNED` | 负责人 ID，可为空               |
| `remark`                 | `TEXT`            | 备注                            |
| `version`                | `INT`             | 乐观锁版本号，默认 `0`          |
| 业务审计字段             | 见统一规则        | 可变业务单据审计字段            |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id)`
- 外键：`FOREIGN KEY (route_id) REFERENCES process_routes(id)`
- 外键：`FOREIGN KEY (owner_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (completed_by) REFERENCES users(id)`
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (completed_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity <= completed_quantity)`
- 检查约束：`CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))`
- 唯一约束：`UNIQUE (work_order_id, batch_no)`
- 组合引用索引：`UNIQUE (id, work_order_id)`、`UNIQUE (id, product_id)`
- 检查约束：`CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_outbound', 'doing', 'completed', 'cancelled'))`

状态说明：

| 状态                | 含义                   |
| ------------------- | ---------------------- |
| `pending`           | 待开始                 |
| `material_pending`  | 待生成或待确认物料需求 |
| `material_assigned` | 物料已分配             |
| `material_outbound` | 物料已领料出库         |
| `doing`             | 生产中                 |
| `completed`         | 生产完成               |
| `cancelled`         | 已取消                 |

说明：

- `production_batches` 是生产执行批次，不是库存批次。
- 生产批次负责表达“这一批怎么生产”。
- `product_id` 是受组合外键保护的查询冗余，不允许与工单产品不一致。
- 路线快照在批次创建时冻结；批次执行期间不能跟随路线主数据变化。
- 成品或半成品入库后，应生成 `item_batch` 库存批次，并通过 `item_batch.source_production_batch_id` 关联回生产批次。
- 一个生产批次可以产生多个库存批次，例如半成品批次、成品批次、待检批次。

---

## 3.3 库存批次与库存流水表

---

### 6. `item_batch`

职责：维护所有库存对象的库存批次，包括物料批次、半成品批次、成品批次。

| 字段                         | 类型              | 说明                                                             |
| ---------------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键，库存批次 ID                                                |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `products.id`                                  |
| `item_code_snapshot`         | `VARCHAR(100)`    | 建批时库存对象编码快照                                           |
| `product_name_snapshot`      | `VARCHAR(200)`    | 建批时名称快照                                                   |
| `unit_snapshot`              | `VARCHAR(20)`     | 建批时基础单位快照                                               |
| `batch_code`                 | `VARCHAR(100)`    | 库存批次号                                                       |
| `source_type`                | `VARCHAR(30)`     | 来源类型：`自产`、`外购`、`委外`、`退货入库`、`盘点生成`、`其他` |
| `provider`                   | `VARCHAR(100)`    | 供应商或委外方，自产时可为空                                     |
| `source_work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID，自产或委外时可填                                    |
| `source_production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID，自产半成品或成品时可填                          |
| `production_date`            | `DATE`            | 生产日期或批次日期                                               |
| `batch_status`               | `VARCHAR(20)`     | 批次业务状态，默认 `可用`                                        |
| `remark`                     | `TEXT`            | 备注                                                             |
| `version`                    | `INT`             | 乐观锁版本号，默认 `0`                                           |
| 业务审计字段                 | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id)`
- 外键：`FOREIGN KEY (source_production_batch_id) REFERENCES production_batches(id)`
- 当两个来源字段同时存在时，使用组合外键 `(source_production_batch_id, source_work_order_id) -> production_batches(id, work_order_id)` 保证一致
- 唯一约束：`UNIQUE (item_id, batch_code)`
- 唯一约束：`UNIQUE (id, item_id)`
- 检查约束：`CHECK (source_type IN ('自产', '外购', '委外', '退货入库', '盘点生成', '其他'))`
- 检查约束：`CHECK (batch_status IN ('可用', '冻结', '停用'))`

说明：

- `item_batch` 是统一库存批次表。
- 物料、半成品、成品都使用该表。
- `batch_status` 只表示批次业务状态，不表示库存是否用完。
- 库存是否用完应通过 `inventory_transaction` 汇总判断。
- `source_production_batch_id` 用于追溯自产半成品或成品来自哪个生产批次。
- 编码、名称和单位快照用于历史批次标签及客户审核，不随产品主数据变化。
- 不建议将 `production_batches.id` 直接作为库存流水的 `batch_id`。

示例：

| batch_id | item_id | 类型       | source_type | source_production_batch_id |
| -------- | ------- | ---------- | ----------- | -------------------------- |
| ib1      | pi2     | 物料批次   | 外购        | NULL                       |
| ib6      | pi3     | 半成品批次 | 自产        | pb1                        |
| ib7      | pi4     | 成品批次   | 自产        | pb1                        |

---

### 7. `inventory_transaction`

职责：维护统一库存流水，记录所有会影响库存对象数量或库存状态的变动明细。物料、半成品、成品共用该表。

库存现存量、可分配库存、批次是否用完等结果应从该表按库存对象、批次和库存状态汇总得出，而不是写回批次表。

| 字段                         | 类型              | 说明                                                 |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键                                                 |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `products.id`                      |
| `batch_id`                   | `BIGINT UNSIGNED` | 库存批次 ID，关联 `item_batch.id`                    |
| `transaction_type`           | `VARCHAR(30)`     | 库存变动类型                                         |
| `quantity`                   | `DECIMAL(12,4)`   | 库存变动数量。正数表示增加，负数表示减少，不能为 `0` |
| `unit_snapshot`              | `VARCHAR(20)`     | 发生流水时的单位快照                                 |
| `stock_status`               | `VARCHAR(20)`     | 库存状态，默认 `可用`                                |
| `reference_type`             | `VARCHAR(50)`     | 来源明细类型                                         |
| `reference_detail_id`        | `BIGINT UNSIGNED` | 来源明细 ID，建议指向明细行，不要只指向主单          |
| `idempotency_key`            | `VARCHAR(150)`    | 幂等键，防止同一业务动作重复生成库存流水             |
| `transaction_group_key`      | `VARCHAR(150)`    | 状态转换分组键，同事务双流水共享，可为空             |
| `reversal_of_transaction_id` | `BIGINT UNSIGNED` | 被冲销的原流水 ID，正常流水为空                      |
| `remark`                     | `TEXT`            | 备注                                                 |
| `created_by`                 | `BIGINT UNSIGNED` | 创建人                                               |
| `created_at`                 | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                   |

`transaction_type` 可选语义：

| 值             | 说明                               |
| -------------- | ---------------------------------- |
| `采购入库`     | 外购物料、外购半成品、外购成品入库 |
| `生产入库`     | 自产半成品或成品入库               |
| `委外入库`     | 委外加工完成入库                   |
| `生产领料出库` | 生产批次领料出库                   |
| `销售出库`     | 成品销售出库，后续可扩展           |
| `退料入库`     | 生产退料回仓                       |
| `报废出库`     | 报废扣减库存                       |
| `盘点调整`     | 盘点差异调整                       |
| `状态转入`     | 库存状态转入                       |
| `状态转出`     | 库存状态转出                       |

`stock_status` 可选语义：

| 值     | 说明           |
| ------ | -------------- |
| `可用` | 可分配、可出库 |
| `待检` | 暂不可用       |
| `冻结` | 被业务冻结     |
| `不良` | 不良品         |

`reference_type` 可选语义：

| 值                   | 说明     |
| -------------------- | -------- |
| `INBOUND_DETAIL`     | 入库明细 |
| `OUTBOUND_DETAIL`    | 出库明细 |
| `RETURN_DETAIL`      | 退料明细 |
| `SCRAP`              | 报废记录 |
| `STOCK_CHECK_DETAIL` | 盘点明细 |
| `INSPECTION_RECORD`  | 检验记录 |
| `MANUAL`             | 手工调整 |

约束：

- 主键：`id`
- 检查约束：`CHECK (quantity <> 0)`
- 唯一约束：`UNIQUE (idempotency_key)`
- 索引：`INDEX (transaction_group_key)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`reversal_of_transaction_id -> inventory_transaction.id`
- 唯一约束：`UNIQUE (reversal_of_transaction_id)`；一期仅允许对同一原流水执行一次整笔全额冲销，不支持部分冲销或重复冲销

说明：

- 库存流水是库存数量的事实来源。
- 入库、出库、退料、报废、盘点调整都应产生对应流水。
- `reference_detail_id` 建议指向明细表，例如 `inbound_detail.id`、`outbound_detail.id`、`return_detail.id`。
- 不建议直接修改库存余额字段来表达库存变化。
- 已写入流水不可更新或删除；错误通过一条数量相反、状态相同的冲销流水修正。
- 此处“冲销”仅表示 MES 库存流水纠错，与财务报销单、付款单或财务凭证 ID 无关；例如已确认的入库、出库、退料、报废或盘点流水录入错误时，以反向流水抵消原库存影响。
- 一期冲销流水必须与原流水保持相同的 `item_id`、`batch_id`、`stock_status`、`unit_snapshot`、`transaction_type` 和原业务引用，`quantity` 必须等于原流水数量的相反数，并填写新的唯一 `idempotency_key`。
- 原流水、冲销流水和操作日志必须保留，均不得更新或删除。未来如确需部分冲销，应通过追加迁移调整唯一约束，并增加累计冲销数量不超过原流水绝对数量的事务校验；该能力不属于一期范围。
- 状态转换流水必须填写 `transaction_group_key`；非状态转换流水可以为空。

---

## 3.4 入库表

---

### 8. `inbound_order`

职责：维护入库主单，记录一次入库动作。入库来源可以是外购、自主生产、委外、退货入库、盘点生成等。

| 字段                  | 类型              | 说明                                                             |
| --------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                                             |
| `inbound_no`          | `VARCHAR(100)`    | 入库单号                                                         |
| `source_type`         | `VARCHAR(30)`     | 来源类型：`自产`、`外购`、`委外`、`退货入库`、`盘点生成`、`其他` |
| `provider`            | `VARCHAR(100)`    | 供应商、委外方或来源方，自产时可为空                             |
| `work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID，自产或委外时可填                                    |
| `production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID，自产半成品或成品入库时可填                      |
| `status`              | `VARCHAR(30)`     | 入库单状态，默认 `待入库`                                        |
| `inbound_at`          | `DATETIME`        | 实际入库时间                                                     |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                                        |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                                           |
| `remark`              | `TEXT`            | 备注                                                             |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (inbound_no)`
- 唯一约束：`UNIQUE (id, source_type)`
- 外键：`FOREIGN KEY (work_order_id) REFERENCES work_orders(id)`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 当两个字段同时存在时，使用组合外键 `(production_batch_id, work_order_id) -> production_batches(id, work_order_id)` 保证一致
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (source_type IN ('自产', '外购', '委外', '退货入库', '盘点生成', '其他'))`
- 检查约束：`CHECK (status IN ('待入库', '已入库', '已取消'))`

说明：

- 入库主单表达“这一次入库动作”。
- 具体入库了哪些对象、哪些批次、多少数量，由 `inbound_detail` 记录。
- 半成品入库和成品入库都可以使用该表。
- 自产入库时，`provider` 可以为空，`production_batch_id` 应建议填写。
- 外购入库时，`provider` 建议填写，`production_batch_id` 为空。

---

### 9. `inbound_detail`

职责：维护入库明细，记录本次入库的具体库存对象、库存批次、入库数量和库存状态。

| 字段             | 类型              | 说明                                 |
| ---------------- | ----------------- | ------------------------------------ |
| `id`             | `BIGINT UNSIGNED` | 主键                                 |
| `inbound_id`     | `BIGINT UNSIGNED` | 入库主单 ID，关联 `inbound_order.id` |
| `item_id`        | `BIGINT UNSIGNED` | 入库对象 ID，关联 `products.id`      |
| `batch_id`       | `BIGINT UNSIGNED` | 入库批次 ID，关联 `item_batch.id`    |
| `inbound_number` | `DECIMAL(12,4)`   | 本次入库数量                         |
| `unit_snapshot`  | `VARCHAR(20)`     | 入库时单位快照                       |
| `stock_status`   | `VARCHAR(20)`     | 入库后的库存状态，默认 `可用`        |
| `source_stage`   | `VARCHAR(100)`    | 来源工序或生产阶段，半成品入库时有用 |
| `remark`         | `TEXT`            | 备注                                 |
| `created_by`     | `BIGINT UNSIGNED` | 创建人                               |
| `created_at`     | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`   |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (inbound_id) REFERENCES inbound_order(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (inbound_number > 0)`
- 检查约束：`CHECK (stock_status IN ('可用', '待检', '冻结', '不良'))`
- 唯一约束：`UNIQUE (inbound_id, batch_id, item_id)`

说明：

- `inbound_detail` 是入库事实表。
- 每条入库明细应生成一条或多条 `inventory_transaction`。
- 生产入库、采购入库、委外入库都可以走该表。
- 入库数量不建议写回 `item_batch`，应通过库存流水汇总。

---

## 3.5 生产物料需求与分配表

---

### 10. `production_item_demand`

职责：维护生产批次的投入需求，是物料、半成品、辅料等生产投入对象的需求来源表。

视图汇总版本中，该表只保存需求事实，不保存累计分配、累计出库、累计退料、累计报废等缓存字段。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `product_material_id`              | `BIGINT UNSIGNED` | 统一 BOM 明细 ID；正常需求必须保存        |
| `item_id`                          | `BIGINT UNSIGNED` | 需求对象 ID，关联 `products.id`           |
| `quantity_per_unit_snapshot`       | `DECIMAL(12,4)`   | 生成需求时的 BOM 单件用量快照             |
| `unit_snapshot`                    | `VARCHAR(20)`     | 生成需求时的用量单位快照                  |
| `is_key_material_snapshot`         | `TINYINT`         | 关键物料标志快照                          |
| `need_batch_record_snapshot`       | `TINYINT`         | 批次追溯要求快照                          |
| `planned_output_quantity_snapshot` | `DECIMAL(12,4)`   | 生成需求时的批次计划产量快照              |
| `need_number`                      | `DECIMAL(12,4)`   | 需求数量                                  |
| `demand_type`                      | `TINYINT`         | 需求类型，默认 `0`                        |
| `idempotency_key`                  | `VARCHAR(150)`    | 幂等键，同一键重复提交返回既有结果        |
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 补料需求关联的原始需求 ID                 |
| `source_scrap_id`                  | `BIGINT UNSIGNED` | 报废补料关联的报废记录 ID，可为空         |
| `reason_type`                      | `VARCHAR(50)`     | 补料原因                                  |
| `business_status`                  | `VARCHAR(30)`     | 业务状态，默认 `正常`                     |
| `version`                          | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`                           | `TEXT`            | 备注                                      |
| 业务审计字段                       | 见统一规则        | 可变业务单据审计字段                      |

字段说明：

| 字段                                           | 说明                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `product_material_id`                          | 正常需求必须保存，用于追溯来源 BOM 明细          |
| `item_id`                                      | 受组合外键保护的需求对象冗余，便于查询和约束     |
| `quantity_per_unit_snapshot` / `unit_snapshot` | 保证 BOM 修改后仍可还原需求计算口径              |
| `need_number`                                  | 需求事实，不应因为出库、退料、报废而直接修改     |
| `demand_type`                                  | `0` 正常需求，`1` 追加补料，`2` 报废补料         |
| `parent_demand_id`                             | 补料需求关联的原始需求                           |
| `source_scrap_id`                              | 报废补料来源，同一报废记录可生成多种物料补料需求 |
| `idempotency_key`                              | 幂等键，同一键重复提交返回既有结果               |
| `business_status`                              | 业务状态，不表达数量进度                         |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_product_id)`
- 外键：`FOREIGN KEY (parent_demand_id) REFERENCES production_item_demand(id)`
- 外键：`FOREIGN KEY (source_scrap_id) REFERENCES item_scrap(id)`
- 检查约束：`CHECK (need_number > 0)`
- 检查约束：`CHECK (demand_type IN (0, 1, 2))`
- 检查约束：`CHECK (business_status IN ('正常', '已取消', '已关闭', '冻结', '异常'))`
- 检查约束：正常需求 `demand_type = 0` 时要求 `product_material_id IS NOT NULL`，且 `parent_demand_id IS NULL`、`source_scrap_id IS NULL`
- 检查约束：追加需求 `demand_type = 1` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`，且 `source_scrap_id IS NULL`
- 检查约束：报废补料 `demand_type = 2` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`、`source_scrap_id IS NOT NULL`
- 检查约束：正常需求的 BOM 快照字段不得为空且均大于 `0`
- 唯一约束：`UNIQUE (idempotency_key)`
- 唯一约束：`UNIQUE (id, item_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 索引：`INDEX (source_scrap_id)`

视图版本删除字段：

| 删除字段             | 删除原因                                             |
| -------------------- | ---------------------------------------------------- |
| `allocated_quantity` | 由 `production_item_allocation.assigned_number` 汇总 |
| `outbound_quantity`  | 由 `outbound_detail.outbound_number` 汇总            |
| `returned_quantity`  | 由 `return_detail.return_number` 汇总                |
| `scrapped_quantity`  | 由 `item_scrap.scrap_number` 汇总                    |

说明：

- 半成品也可以作为生产投入需求。
- 如果某个生产批次需要领用上一个生产批次产出的半成品，也应通过该表生成需求。
- 补料不建议直接修改原需求的 `need_number`，应新增一条需求记录。
- 正常需求的 `need_number = quantity_per_unit_snapshot * planned_output_quantity_snapshot`；结果生成后作为事实保存，不随 BOM 或批次计划变化自动回写。
- 幂等键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}:{product_material_id}`，报废补料为 `SCRAP:{source_scrap_id}:{product_material_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 应用事务必须校验 `parent_demand_id` 指向的原需求与当前需求属于同一生产批次，且 `product_material_id` 对应投入对象与 `item_id` 一致。
- 报废补料还必须校验 `source_scrap_id` 指向已确认、未取消的报废记录，且报废、原需求和补料需求属于同一生产批次。
- 需求事实和对应操作日志必须在同一事务写入。

---

### 11. `production_item_allocation`

职责：维护生产批次的物料分配明细，记录某条需求分配到了哪个库存批次以及分配数量。

分配代表业务预留。已分配但未出库的数量，应从可分配库存中扣除，避免其他生产批次抢占。

| 字段                  | 类型              | 说明                                                  |
| --------------------- | ----------------- | ----------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                                  |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，便于查询和约束                 |
| `item_id`             | `BIGINT UNSIGNED` | 库存对象 ID，冗余保存，用于约束需求对象与批次对象一致 |
| `batch_id`            | `BIGINT UNSIGNED` | 分配的库存批次 ID，关联 `item_batch.id`               |
| `assigned_number`     | `DECIMAL(12,4)`   | 分配数量                                              |
| `unit_snapshot`       | `VARCHAR(20)`     | 分配时单位快照                                        |
| `allocation_status`   | `VARCHAR(30)`     | 分配业务状态，默认 `正常`                             |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                                |
| `remark`              | `TEXT`            | 备注                                                  |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                                  |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (demand_id, item_id) REFERENCES production_item_demand(id, item_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (assigned_number > 0)`
- 检查约束：`CHECK (allocation_status IN ('正常', '已释放', '已取消', '冻结', '异常'))`
- 唯一约束：`UNIQUE (id, demand_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 唯一约束：`UNIQUE (id, item_id)`
- 组合候选键：`UNIQUE (id, demand_id, production_batch_id, item_id, batch_id)` — 供 `outbound_detail` 和 `return_detail` 作为组合外键引用，保证出库/退料与 allocation 的需求、生产批次、物料和库存批次一致

视图版本删除字段：

| 删除字段            | 删除原因                  |
| ------------------- | ------------------------- |
| `outbound_quantity` | 由 `outbound_detail` 汇总 |
| `returned_quantity` | 由 `return_detail` 汇总   |
| `scrapped_quantity` | 由 `item_scrap` 汇总      |

说明：

- `assigned_number` 是分配事实，不是缓存字段，应保留。
- 分配创建后，应影响可分配库存。
- 分配不等于出库，库存流水不会因为分配而扣减。
- 分配只代表业务预留，实际库存减少发生在出库时。
- `allocation_status = 已释放` 或 `已取消` 时，不应继续占用可分配库存。

---

## 3.6 生产领料出库表

---

### 12. `outbound_order`

职责：维护生产领料出库主单，记录库管针对某个生产批次的一次出库动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `outbound_no`         | `VARCHAR(100)`    | 出库单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存，便于查询               |
| `status`              | `VARCHAR(30)`     | 出库单状态，默认 `待拣货`                 |
| `outbound_at`         | `DATETIME`        | 实际出库时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (outbound_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('待拣货', '已拣货', '部分出库', '已出库', '已取消'))`

说明：

- `outbound_order` 表示一次出库动作。
- 一张出库单可以包含多个物料、多个需求、多个库存批次。
- 出库单主表建议关联 `production_batch_id`，而不是单个 `demand_id`。
- 具体出了哪些物料、哪些批次、多少数量，由 `outbound_detail` 记录。

---

### 13. `outbound_detail`

职责：维护生产领料出库明细，记录某次出库动作中每个分配行实际出库的库存对象、批次和数量。

| 字段                  | 类型              | 说明                                              |
| --------------------- | ----------------- | ------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                              |
| `outbound_id`         | `BIGINT UNSIGNED` | 出库主单 ID，关联 `outbound_order.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，用于查询和约束             |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`         |
| `allocation_id`       | `BIGINT UNSIGNED` | 分配明细 ID，关联 `production_item_allocation.id` |
| `item_id`             | `BIGINT UNSIGNED` | 出库对象 ID，冗余保存                             |
| `batch_id`            | `BIGINT UNSIGNED` | 出库库存批次 ID，冗余保存                         |
| `outbound_number`     | `DECIMAL(12,4)`   | 本次出库数量                                      |
| `unit_snapshot`       | `VARCHAR(20)`     | 出库时单位快照                                    |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                            |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (outbound_id, production_batch_id) REFERENCES outbound_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (outbound_number > 0)`
- 唯一约束：`UNIQUE (outbound_id, allocation_id)`

说明：

- `outbound_detail` 是出库事实明细表。
- `inventory_transaction` 中的生产领料出库流水应引用 `outbound_detail.id`。
- 出库明细用于判断某条分配是否已经出库、某条需求是否已经满足。
- `outbound_id` 用于表达哪些明细属于同一次出库动作。
- `production_batch_id` 是有价值的冗余字段，便于按生产批次查询出库记录。

---

## 3.7 退料表

---

### 14. `return_order`

职责：维护生产退料主单，记录某个生产批次的一次退料动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `return_no`           | `VARCHAR(100)`    | 退料单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存                         |
| `status`              | `VARCHAR(30)`     | 退料单状态，默认 `待处理`                 |
| `return_at`           | `DATETIME`        | 实际退料时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (return_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('待处理', '已入库', '已报废', '已取消'))`

说明：

- 退料主单表达一次退料动作。
- 具体退回哪个分配行、哪个批次、多少数量，由 `return_detail` 记录。
- 退料后是否继续占用原生产批次，需要由明细字段控制。

---

### 15. `return_detail`

职责：维护生产退料明细，记录某个分配行本次退回数量、退回后的库存状态，以及是否释放给公共库存。

| 字段                   | 类型              | 说明                                     |
| ---------------------- | ----------------- | ---------------------------------------- |
| `id`                   | `BIGINT UNSIGNED` | 主键                                     |
| `return_id`            | `BIGINT UNSIGNED` | 退料主单 ID，关联 `return_order.id`      |
| `production_batch_id`  | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存                    |
| `demand_id`            | `BIGINT UNSIGNED` | 需求 ID                                  |
| `allocation_id`        | `BIGINT UNSIGNED` | 分配明细 ID                              |
| `item_id`              | `BIGINT UNSIGNED` | 退料对象 ID                              |
| `batch_id`             | `BIGINT UNSIGNED` | 退料库存批次 ID                          |
| `return_number`        | `DECIMAL(12,4)`   | 本次退料数量                             |
| `unit_snapshot`        | `VARCHAR(20)`     | 退料时单位快照                           |
| `return_stock_status`  | `VARCHAR(20)`     | 退回后的库存状态，默认 `可用`            |
| `release_after_return` | `TINYINT`         | 是否退回后释放给公共库存：`0` 否，`1` 是 |
| `remark`               | `TEXT`            | 备注                                     |
| `created_by`           | `BIGINT UNSIGNED` | 创建人                                   |
| `created_at`           | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`       |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (return_id, production_batch_id) REFERENCES return_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (return_number > 0)`
- 检查约束：`CHECK (return_stock_status IN ('可用', '待检', '冻结', '不良'))`
- 检查约束：`CHECK (release_after_return IN (0, 1))`
- 唯一约束：`UNIQUE (return_id, allocation_id)`
- 组合候选键：`UNIQUE (id, allocation_id, demand_id, production_batch_id, item_id, batch_id)`，供退料后报废精确引用具体退料明细

说明：

- `return_stock_status = 可用` 的退料会增加库存流水中的可用库存。
- `release_after_return = 0` 表示退回后仍绑定原生产批次，可再次出给该批次。
- `release_after_return = 1` 表示退回后释放给公共库存，不再继续占用原生产批次。
- 退料入库应生成 `inventory_transaction`，类型为 `退料入库`。

---

## 3.8 报废表

---

### 16. `item_scrap`

职责：维护报废记录，支持生产消耗报废、仓库侧报废、退料后报废、库存内报废等场景。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `scrap_no`            | `VARCHAR(100)`    | 报废单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，可为空                       |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，可为空                           |
| `allocation_id`       | `BIGINT UNSIGNED` | 分配明细 ID，可为空                       |
| `return_detail_id`    | `BIGINT UNSIGNED` | 来源退料明细 ID，退料后报废时填写，可为空 |
| `item_id`             | `BIGINT UNSIGNED` | 报废对象 ID                               |
| `batch_id`            | `BIGINT UNSIGNED` | 报废库存批次 ID，可为空                   |
| `scrap_scene`         | `VARCHAR(40)`     | 报废场景                                  |
| `scrap_number`        | `DECIMAL(12,4)`   | 报废数量                                  |
| `unit_snapshot`       | `VARCHAR(20)`     | 报废时单位快照                            |
| `reason_type`         | `VARCHAR(50)`     | 报废原因                                  |
| `status`              | `VARCHAR(30)`     | 状态，默认 `已确认`                       |
| `remark`              | `TEXT`            | 备注                                      |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

`scrap_scene` 可选语义：

| 值                      | 含义                                 | 是否影响 allocation 可再次出库量 |
| ----------------------- | ------------------------------------ | -------------------------------- |
| `WAREHOUSE_ALLOCATED`   | 已分配但未出库，在仓库侧报废         | 是                               |
| `RETURN_AFTER_OUTBOUND` | 出库后退回，再发生报废               | 是                               |
| `PRODUCTION_CONSUMED`   | 已出库到生产后，在生产过程中消耗报废 | 否                               |
| `IN_STOCK`              | 库存内直接报废，例如成品库存报废     | 不涉及 allocation                |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (scrap_no)`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (return_detail_id, allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES return_detail(id, allocation_id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (scrap_number > 0)`
- 检查约束：`CHECK (scrap_scene IN ('WAREHOUSE_ALLOCATED', 'RETURN_AFTER_OUTBOUND', 'PRODUCTION_CONSUMED', 'IN_STOCK'))`
- 检查约束：`CHECK (status IN ('待确认', '已确认', '已取消'))`
- 检查约束：`WAREHOUSE_ALLOCATED` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`batch_id` 非空，且 `return_detail_id` 为空
- 检查约束：`RETURN_AFTER_OUTBOUND` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`return_detail_id`、`batch_id` 均非空
- 检查约束：`PRODUCTION_CONSUMED` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`batch_id` 非空，且 `return_detail_id` 为空
- 检查约束：`IN_STOCK` 要求 `batch_id` 非空，且 `production_batch_id`、`demand_id`、`allocation_id`、`return_detail_id` 均为空

说明：

- 生产消耗报废不应直接扣减原 allocation 的可再次出库量。
- 生产消耗报废如果需要补料，应新增 `production_item_demand`，并设置：

  - `demand_type = 2`
  - `parent_demand_id = 原始需求 ID`
  - `source_scrap_id = 报废记录 ID`

- 库存内报废应生成 `inventory_transaction`，类型为 `报废出库`。
- 只有 `status = 已确认` 的报废记录参与视图汇总。
- `WAREHOUSE_ALLOCATED` 必须校验分配仍有效且存在尚未出库、未释放的可报废数量；确认后生成负数报废库存流水。
- `RETURN_AFTER_OUTBOUND` 必须校验来源退料已确认，且报废数量不超过该退料明细尚未处置数量；确认后生成负数报废库存流水。
- `PRODUCTION_CONSUMED` 的库存已在领料时扣减，确认报废时不得再次生成库存流水。
- `IN_STOCK` 不虚构生产批次或需求关系，确认后从对应库存批次生成负数报废库存流水。

---

## 3.9 盘点表

---

### 17. `stock_check_order`

职责：维护库存盘点主单，记录一次盘点任务的基本信息。

| 字段          | 类型              | 说明                    |
| ------------- | ----------------- | ----------------------- |
| `id`          | `BIGINT UNSIGNED` | 主键                    |
| `check_no`    | `VARCHAR(100)`    | 盘点单号                |
| `status`      | `VARCHAR(30)`     | 盘点状态，默认 `待盘点` |
| `check_at`    | `DATETIME`        | 实际盘点时间            |
| `operator_id` | `BIGINT UNSIGNED` | 操作人 ID               |
| `remark`      | `TEXT`            | 备注                    |
| `version`     | `INT`             | 乐观锁版本号，默认 `0`  |
| 业务审计字段  | 见统一规则        | 可变业务单据审计字段    |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (check_no)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('待盘点', '盘点中', '已完成', '已取消'))`

说明：

- 盘点主单表达一次盘点动作。
- 具体盘点了哪些库存对象、哪些批次、账面数量和实盘数量，由 `stock_check_detail` 记录。

---

### 18. `stock_check_detail`

职责：维护库存盘点明细，记录某个库存对象某个批次的账面数量、实盘数量和差异数量。

| 字段                  | 类型              | 说明                                     |
| --------------------- | ----------------- | ---------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                     |
| `stock_check_id`      | `BIGINT UNSIGNED` | 盘点主单 ID，关联 `stock_check_order.id` |
| `item_id`             | `BIGINT UNSIGNED` | 库存对象 ID                              |
| `batch_id`            | `BIGINT UNSIGNED` | 库存批次 ID                              |
| `stock_status`        | `VARCHAR(20)`     | 盘点的库存状态，例如 `可用`、`待检`      |
| `unit_snapshot`       | `VARCHAR(20)`     | 盘点时单位快照                           |
| `system_quantity`     | `DECIMAL(12,4)`   | 盘点时系统账面数量                       |
| `actual_quantity`     | `DECIMAL(12,4)`   | 实盘数量                                 |
| `difference_quantity` | `DECIMAL(12,4)`   | 生成列：实盘数量 - 系统数量              |
| `result`              | `VARCHAR(20)`     | 生成列：`盘盈`、`盘亏`、`一致`           |
| `adjusted`            | `TINYINT`         | 是否已生成盘点调整流水：`0` 否，`1` 是   |
| `remark`              | `TEXT`            | 备注                                     |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                   |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`       |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (stock_check_id) REFERENCES stock_check_order(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (system_quantity >= 0)`
- 检查约束：`CHECK (actual_quantity >= 0)`
- 检查约束：`CHECK (adjusted IN (0, 1))`
- 唯一约束：`UNIQUE (stock_check_id, item_id, batch_id, stock_status)`

说明：

- `difference_quantity` 和 `result` 必须使用数据库生成列或只在查询视图中计算，禁止由接口独立写入。
- 盘点调整应生成 `inventory_transaction`，类型为 `盘点调整`。
- 盘点明细应记录盘点时的系统数量快照，避免后续库存变动影响盘点结果。

---

## 3.10 核心汇总视图

---

### 19. `v_item_batch_stock`

职责：按库存批次、库存对象和库存状态汇总现存量。

| 字段                         | 类型              | 说明            |
| ---------------------------- | ----------------- | --------------- |
| `batch_id`                   | `BIGINT UNSIGNED` | 库存批次 ID     |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID     |
| `item_name`                  | `VARCHAR(200)`    | 库存对象名称    |
| `item_kind`                  | `VARCHAR(30)`     | 库存对象大类    |
| `batch_code`                 | `VARCHAR(100)`    | 库存批次号      |
| `source_type`                | `VARCHAR(30)`     | 来源类型        |
| `provider`                   | `VARCHAR(100)`    | 供应商或委外方  |
| `source_work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID     |
| `source_production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID |
| `batch_status`               | `VARCHAR(20)`     | 批次业务状态    |
| `available_quantity`         | `DECIMAL(12,4)`   | 可用库存数量    |
| `pending_quantity`           | `DECIMAL(12,4)`   | 待检库存数量    |
| `frozen_quantity`            | `DECIMAL(12,4)`   | 冻结库存数量    |
| `defective_quantity`         | `DECIMAL(12,4)`   | 不良库存数量    |
| `total_quantity`             | `DECIMAL(12,4)`   | 总库存数量      |

汇总口径：

| 字段                 | 计算来源                              |
| -------------------- | ------------------------------------- |
| `available_quantity` | 汇总 `stock_status = 可用` 的库存流水 |
| `pending_quantity`   | 汇总 `stock_status = 待检` 的库存流水 |
| `frozen_quantity`    | 汇总 `stock_status = 冻结` 的库存流水 |
| `defective_quantity` | 汇总 `stock_status = 不良` 的库存流水 |
| `total_quantity`     | 汇总该批次所有库存流水                |

说明：

- 该视图只表达账面库存。
- 是否可被新生产批次分配，还需要结合预留数量，通过 `v_item_batch_available_to_allocate` 判断。
- 批次是否用完不写回 `item_batch.batch_status`。

---

### 20. `v_production_item_allocation_summary`

职责：按分配明细维度汇总出库、退料、报废和可再次出库数量。

| 字段                           | 类型              | 说明                           |
| ------------------------------ | ----------------- | ------------------------------ |
| `allocation_id`                | `BIGINT UNSIGNED` | 分配明细 ID                    |
| `demand_id`                    | `BIGINT UNSIGNED` | 需求 ID                        |
| `production_batch_id`          | `BIGINT UNSIGNED` | 生产批次 ID                    |
| `item_id`                      | `BIGINT UNSIGNED` | 库存对象 ID                    |
| `batch_id`                     | `BIGINT UNSIGNED` | 库存批次 ID                    |
| `assigned_number`              | `DECIMAL(12,4)`   | 分配数量                       |
| `outbound_quantity`            | `DECIMAL(12,4)`   | 累计出库数量                   |
| `returned_quantity`            | `DECIMAL(12,4)`   | 累计退料数量                   |
| `returned_available_quantity`  | `DECIMAL(12,4)`   | 退回后可用且未释放的数量       |
| `released_return_quantity`     | `DECIMAL(12,4)`   | 退回后已释放给公共库存的数量   |
| `stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 仓库侧或退料后的报废数量       |
| `production_scrapped_quantity` | `DECIMAL(12,4)`   | 生产消耗报废数量               |
| `available_outbound_quantity`  | `DECIMAL(12,4)`   | 当前对原生产批次可再次出库数量 |
| `is_quantity_abnormal`         | `TINYINT`         | 数量是否异常                   |

核心计算口径：

| 字段                           | 计算来源                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `outbound_quantity`            | 汇总 `outbound_detail.outbound_number`                                           |
| `returned_quantity`            | 汇总 `return_detail.return_number`                                               |
| `returned_available_quantity`  | 汇总 `return_stock_status = 可用` 且 `release_after_return = 0` 的退料数量       |
| `released_return_quantity`     | 汇总 `release_after_return = 1` 的退料数量                                       |
| `stock_scrapped_quantity`      | 汇总 `WAREHOUSE_ALLOCATED`、`RETURN_AFTER_OUTBOUND` 且状态为 `已确认` 的报废数量 |
| `production_scrapped_quantity` | 汇总 `PRODUCTION_CONSUMED` 且状态为 `已确认` 的报废数量                          |
| `available_outbound_quantity`  | 分配数量 - 已出库数量 + 未释放可用退料数量 - 库存侧报废数量                      |

说明：

- `PRODUCTION_CONSUMED` 不扣减 `available_outbound_quantity`。
- `release_after_return = 1` 的退料不再属于原生产批次的可再次出库量。
- 如果 `available_outbound_quantity < 0`，表示该分配行存在数量异常。

---

### 21. `v_production_item_demand_summary`

职责：按需求维度汇总分配、出库、退料、报废、缺料和数量进度状态。

| 字段                           | 类型              | 说明               |
| ------------------------------ | ----------------- | ------------------ |
| `demand_id`                    | `BIGINT UNSIGNED` | 需求 ID            |
| `production_batch_id`          | `BIGINT UNSIGNED` | 生产批次 ID        |
| `product_material_id`          | `BIGINT UNSIGNED` | BOM 行 ID          |
| `item_id`                      | `BIGINT UNSIGNED` | 需求对象 ID        |
| `need_number`                  | `DECIMAL(12,4)`   | 需求数量           |
| `demand_type`                  | `TINYINT`         | 需求类型           |
| `parent_demand_id`             | `BIGINT UNSIGNED` | 原始需求 ID        |
| `source_scrap_id`              | `BIGINT UNSIGNED` | 来源报废记录 ID    |
| `business_status`              | `VARCHAR(30)`     | 业务状态           |
| `allocated_quantity`           | `DECIMAL(12,4)`   | 累计已分配数量     |
| `unallocated_quantity`         | `DECIMAL(12,4)`   | 未分配数量         |
| `outbound_quantity`            | `DECIMAL(12,4)`   | 累计已出库数量     |
| `not_outbound_quantity`        | `DECIMAL(12,4)`   | 未出库数量         |
| `returned_quantity`            | `DECIMAL(12,4)`   | 累计退料数量       |
| `stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 库存侧报废数量     |
| `production_scrapped_quantity` | `DECIMAL(12,4)`   | 生产消耗报废数量   |
| `available_outbound_quantity`  | `DECIMAL(12,4)`   | 当前可再次出库数量 |
| `is_shortage`                  | `TINYINT`         | 是否缺料           |
| `is_quantity_abnormal`         | `TINYINT`         | 是否数量异常       |
| `progress_status`              | `VARCHAR(30)`     | 数量进度状态       |

核心计算口径：

| 字段                    | 计算来源                                          |
| ----------------------- | ------------------------------------------------- |
| `allocated_quantity`    | 汇总该需求下所有有效分配的 `assigned_number`      |
| `unallocated_quantity`  | `need_number - allocated_quantity`，小于 0 时按 0 |
| `outbound_quantity`     | 汇总该需求下所有出库明细数量                      |
| `not_outbound_quantity` | `need_number - outbound_quantity`，小于 0 时按 0  |
| `returned_quantity`     | 汇总该需求下所有退料数量                          |
| `is_shortage`           | 当 `unallocated_quantity > 0` 时为 1              |

`progress_status` 推荐规则：

| 条件                                                           | 状态             |
| -------------------------------------------------------------- | ---------------- |
| `business_status` 为 `已取消`、`已关闭`、`冻结`、`异常`        | 直接显示业务状态 |
| 已分配数量 = 0                                                 | `待分配`         |
| 已分配数量 < 需求数量，且已出库数量 = 0                        | `部分分配`       |
| 已分配数量 >= 需求数量，且已出库数量 = 0                       | `已分配`         |
| 已出库数量 > 0，已出库数量 < 需求数量，且已分配数量 < 需求数量 | `缺料待补`       |
| 已出库数量 > 0，已出库数量 < 需求数量                          | `部分出库`       |
| 已出库数量 >= 需求数量                                         | `已出库`         |
| 其他情况                                                       | `未知`           |

说明：

- `progress_status` 是视图计算字段，不建议写入需求表。
- `business_status` 是业务流程状态，应该存入基础表。
- 该视图适合生产批次详情、领料进度、缺料提醒使用。

---

### 22. `v_item_batch_available_to_allocate`

职责：按库存批次计算可继续分配给新生产批次的数量。

| 字段                             | 类型              | 说明             |
| -------------------------------- | ----------------- | ---------------- |
| `batch_id`                       | `BIGINT UNSIGNED` | 库存批次 ID      |
| `item_id`                        | `BIGINT UNSIGNED` | 库存对象 ID      |
| `item_name`                      | `VARCHAR(200)`    | 库存对象名称     |
| `item_kind`                      | `VARCHAR(30)`     | 库存对象大类     |
| `batch_code`                     | `VARCHAR(100)`    | 批次号           |
| `on_hand_available_quantity`     | `DECIMAL(12,4)`   | 账面可用库存数量 |
| `reserved_quantity`              | `DECIMAL(12,4)`   | 已预留未释放数量 |
| `available_to_allocate_quantity` | `DECIMAL(12,4)`   | 可继续分配数量   |

核心计算口径：

| 字段                             | 计算来源                                         |
| -------------------------------- | ------------------------------------------------ |
| `on_hand_available_quantity`     | 来自 `v_item_batch_stock.available_quantity`     |
| `reserved_quantity`              | 来自有效分配行的未出库、未释放占用数量           |
| `available_to_allocate_quantity` | `on_hand_available_quantity - reserved_quantity` |

说明：

- 该视图用于新生产批次分配物料时判断可用量。
- 不能只看账面库存，因为已分配但未出库的数量已经被预留。
- `allocation_status IN ('已释放', '已取消')` 的分配不应继续占用库存。
- 退料后如果 `release_after_return = 1`，退回数量应释放给公共库存，不继续占用原生产批次。

---

### 23. `v_production_batch_item_summary`

职责：按生产批次和投入对象汇总需求、分配、出库、退料、报废和实际消耗。

| 字段                                 | 类型              | 说明                                    |
| ------------------------------------ | ----------------- | --------------------------------------- |
| `production_batch_id`                | `BIGINT UNSIGNED` | 生产批次 ID                             |
| `item_id`                            | `BIGINT UNSIGNED` | 投入对象 ID                             |
| `item_name`                          | `VARCHAR(200)`    | 投入对象名称                            |
| `total_need_number`                  | `DECIMAL(12,4)`   | 总需求数量                              |
| `total_allocated_quantity`           | `DECIMAL(12,4)`   | 总分配数量                              |
| `total_unallocated_quantity`         | `DECIMAL(12,4)`   | 总未分配数量                            |
| `total_outbound_quantity`            | `DECIMAL(12,4)`   | 总出库数量                              |
| `total_returned_quantity`            | `DECIMAL(12,4)`   | 总退料数量                              |
| `actual_consumed_quantity`           | `DECIMAL(12,4)`   | 实际消耗数量，建议为出库数量 - 退料数量 |
| `total_stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 总库存侧报废数量                        |
| `total_production_scrapped_quantity` | `DECIMAL(12,4)`   | 总生产消耗报废数量                      |
| `is_shortage`                        | `TINYINT`         | 是否存在缺料                            |
| `is_quantity_abnormal`               | `TINYINT`         | 是否存在数量异常                        |

说明：

- 该视图适合生产批次投入汇总。
- 生产报废补料会让同一 `item_id` 的总需求增加。
- `actual_consumed_quantity` 可用于生产成本、用料分析和损耗分析。

---

### 24. `v_production_batch_output_summary`

职责：按生产批次汇总半成品和成品入库产出。

| 字段                  | 类型              | 说明                       |
| --------------------- | ----------------- | -------------------------- |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID                |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID                    |
| `item_id`             | `BIGINT UNSIGNED` | 产出对象 ID                |
| `item_name`           | `VARCHAR(200)`    | 产出对象名称               |
| `item_kind`           | `VARCHAR(30)`     | 产出对象类型：半成品或成品 |
| `batch_id`            | `BIGINT UNSIGNED` | 产出库存批次 ID            |
| `batch_code`          | `VARCHAR(100)`    | 产出库存批次号             |
| `inbound_quantity`    | `DECIMAL(12,4)`   | 生产入库数量               |
| `stock_status`        | `VARCHAR(20)`     | 入库库存状态               |
| `source_stage`        | `VARCHAR(100)`    | 来源工序或阶段             |

说明：

- 该视图适合查看某个生产批次产出了哪些半成品和成品。
- 半成品和成品都来自 `inbound_detail`。
- 当前库存数量不一定等于生产入库数量，因为后续可能发生销售出库、盘点调整、报废出库等。

---

## 3.11 跨模块引用说明

本章引用的 `users`、`process_routes`、`process_steps`、`technical_files` 均已在本文前两章定义；质量记录统一使用第四章的 `inspection_records` 和 `rework_records`，不再创建 `quality_check_order`、`quality_check_detail`。

跨模块写操作必须由应用服务在同一事务内维护组合外键、快照和操作日志，Controller 不得直接拼接 SQL 修改多张事实表。

---

## 3.12 关键业务规则汇总

### 3.12.1 生产批次和库存批次必须分离

| 类型     | 表                   | 含义                   |
| -------- | -------------------- | ---------------------- |
| 生产批次 | `production_batches` | 这一批怎么生产         |
| 库存批次 | `item_batch`         | 入库后怎么存、怎么追溯 |

说明：

- `production_batches.id` 不应直接作为库存流水的 `batch_id`。
- 库存流水的 `batch_id` 应统一指向 `item_batch.id`。
- `item_batch.source_production_batch_id` 用来追溯库存批次来源于哪个生产批次。

---

### 3.12.2 分配等于预留

创建 `production_item_allocation` 后，分配数量应视为被该生产批次占用。

可分配库存计算：

```text
可分配数量 = 账面可用库存 - 已预留未释放数量
```

说明：

- 分配不会生成库存流水。
- 出库才会生成库存流水。
- 新生产批次分配时，应查 `v_item_batch_available_to_allocate`，不能只查账面库存。

---

### 3.12.3 出库明细是业务事实，库存流水是库存事实

| 表                      | 职责                                         |
| ----------------------- | -------------------------------------------- |
| `outbound_detail`       | 记录业务上出了什么、从哪个分配行出、出了多少 |
| `inventory_transaction` | 记录库存账面如何变化                         |

说明：

- `inventory_transaction.reference_detail_id` 应指向 `outbound_detail.id`。
- 一张 `outbound_order` 可以有多条 `outbound_detail`。
- `outbound_order.production_batch_id` 表示本次出库服务哪个生产批次。

---

### 3.12.4 入库明细是业务事实，库存流水是库存事实

| 表                      | 职责                                     |
| ----------------------- | ---------------------------------------- |
| `inbound_detail`        | 记录业务上入库了什么、哪个批次、多少数量 |
| `inventory_transaction` | 记录库存账面如何增加                     |

说明：

- 物料采购入库、半成品入库、成品入库都走 `inbound_order` + `inbound_detail`。
- `inventory_transaction.reference_detail_id` 应指向 `inbound_detail.id`。

---

### 3.12.5 报废补料不修改原需求

生产消耗报废后，如果需要补料，应新增需求：

| 字段               | 值          |
| ------------------ | ----------- |
| `demand_type`      | `2`         |
| `parent_demand_id` | 原始需求 ID |
| `source_scrap_id`  | 报废记录 ID |
| `need_number`      | 补料数量    |

说明：

- 不建议直接修改原始需求的 `need_number`。
- 这样可以形成清晰链路：原始需求 → 报废记录 → 补料需求 → 分配 → 出库。

---

### 3.12.6 退料是否释放库存要明确

退料后有两种处理：

| 场景             | 字段设置                   | 含义                         |
| ---------------- | -------------------------- | ---------------------------- |
| 仍属于原生产批次 | `release_after_return = 0` | 原生产批次后续可再次领用     |
| 释放给公共库存   | `release_after_return = 1` | 新生产批次可以分配这部分库存 |

说明：

- 如果生产已经结束，多领退料通常建议释放给公共库存。
- 如果只是临时退回，后续还可能继续领用，则不释放。

---

### 3.12.7 盘点调整必须生成库存流水

盘点明细记录账面数量和实盘数量。
若存在差异，应生成 `inventory_transaction`：

| 差异 | 库存流水        |
| ---- | --------------- |
| 盘盈 | `盘点调整` 正数 |
| 盘亏 | `盘点调整` 负数 |

说明：

- 盘点不应直接修改库存余额。
- 盘点调整应通过库存流水体现。
- `stock_check_detail.adjusted` 用于标记是否已经生成调整流水，防止重复调整。

---

### 3.12.8 产品与工艺路线归属校验

路线与产品归属由应用事务校验，数据库不增加复杂组合外键。

- 设置产品默认路线时，应用必须校验路线的 `product_id` 等于当前产品 ID，且路线状态为 `enabled`。
- 创建生产批次时，以工单产品为准；未指定路线时读取产品默认路线，指定路线时允许使用同产品的非默认路线。
- 生产批次不得使用其他产品的路线或未启用路线。
- 批次工序必须由后端查询所选路线的有效 `process_route_steps` 后按顺序自动生成，不接受前端提交任意 `route_step_id` 集合。
- 上述读取、校验、批次创建和批次工序生成必须处于同一应用事务。

### 3.12.9 需求幂等与报废补料条件

- 正常需求幂等键为 `NORMAL:{production_batch_id}:{product_material_id}`。
- 报废补料幂等键为 `SCRAP:{source_scrap_id}:{product_material_id}`。
- 人工追加幂等键为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- 相同幂等键重复提交返回既有需求，不新增记录、不修改原需求数量。
- 一条已确认报废可以为不同 BOM 行生成多条补料需求，但报废、原需求和补料需求必须属于同一生产批次。

### 3.12.10 库存分配并发行锁

库存正确性使用 `item_batch` 行锁保证，Redis 不作为必要条件或库存事实来源。

分配事务必须按以下顺序执行：

1. 锁定目标 `item_batch` 行；多批次操作按稳定的批次 ID 升序加锁，避免死锁。
2. 在锁内从 `inventory_transaction` 重新汇总账面可用库存。
3. 在锁内汇总有效、未释放、未取消的生产分配占用。
4. 计算最新可分配数量并校验本次分配。
5. 写入 `production_item_allocation`。
6. 更新必要的业务状态并写操作日志。
7. 提交事务后再向调用方返回成功。

单库存批次的行锁查询：

```sql
SELECT id FROM item_batch WHERE id = :batch_id FOR UPDATE;
```

出库、退料、库存侧报废和盘点确认涉及同一库存批次时，也必须遵循相同批次锁顺序。

### 3.12.11 批次完工确认与乐观锁

`production_batches` 的完工确认使用 `version` 乐观锁：

- 批次完工前校验所有 `need_record_snapshot = 1` 的工序已完成。
- 批次完工前校验所有 `need_inspection_snapshot = 1` 的工序存在有效检验结论。
- 批次完工前校验不存在未关闭返工。
- 在同一事务写入最终数量、完工时间、完工人、`completed` 状态和操作日志。
- 批次完工不自动创建入库单、库存批次或库存流水。
- 工单完成数量从已完工生产批次 `qualified_quantity` 汇总。

### 3.12.12 库存状态转换双流水

库存状态通过同事务内的双流水表达，不创建独立状态转换单据：

- 待检 → 可用：一条 `stock_status = 待检` 的负数流水 + 一条 `stock_status = 可用` 的正数流水。
- 两条流水共享相同 `transaction_group_key`，使用不同且分别唯一的 `idempotency_key`。
- 两条流水具有相同 `item_id`、`batch_id`、单位和数量绝对值。
- 使用 `reference_type = INSPECTION_RECORD`，`reference_detail_id` 指向触发放行的检验记录。
- 状态转换流水必须填写 `transaction_group_key`；该字段建立普通索引用于成对核查，两条流水仍分别依靠 `idempotency_key` 防止重复。
- 质量结论、检验人员和报告只保存在 `inspection_records`，库存流水只记录数量和状态维度。

### 3.12.13 多态库存流水引用规则

`inventory_transaction.reference_type + reference_detail_id` 是多态引用，数据库普通外键无法表达：

- 应用必须根据 `reference_type` 校验 `reference_detail_id` 指向的记录存在且类型匹配。
- 校验来源记录与库存流水的 `item_id`、`batch_id`、单位、数量方向和业务状态一致。
- 业务明细、库存流水和操作日志必须在同一事务写入。
- 每条库存流水必须具有唯一 `idempotency_key`。
- 已确认库存流水不可更新或删除，错误只能通过数量相反、库存状态相同的冲销流水修正。
- 冲销流水必须填写 `reversal_of_transaction_id` 并保留原业务引用；一期只支持一次整笔全额冲销，不关联任何财务报销 ID。

## 3.13 最终表关系简图

```text
product_categories
  ↓
products
  ↓
product_materials

work_orders
  ↓
production_batches
  ↓
production_item_demand
  ↓
production_item_allocation
  ↓
outbound_order
  ↓
outbound_detail
  ↓
inventory_transaction

production_batches
  ↓
inbound_order
  ↓
inbound_detail
  ↓
item_batch
  ↓
inventory_transaction

production_item_allocation
  ↓
return_order
  ↓
return_detail
  ↓（`RETURN_AFTER_OUTBOUND`）
item_scrap
  ↓
inventory_transaction

production_item_demand
  ↓
item_scrap
  ↓
production_item_demand 报废补料

stock_check_order
  ↓
stock_check_detail
  ↓
inventory_transaction
```

---

## 3.14 方案总结

本方案的核心是：

```text
生产批次管生产执行。
库存批次管库存追溯。
库存流水管数量变化。
分配明细管预留占用。
出入库明细管业务动作。
视图负责汇总结果。
```

主要优点：

- 物料、半成品、成品统一库存模型。
- 生产批次和库存批次语义清晰，不互相混用。
- 可支持半成品入库、成品入库、外购入库、委外入库。
- 可支持生产领料、退料、报废补料、盘点调整。
- 主表不保存累计缓存字段，减少数据不一致风险。
- 后续如性能不足，可在视图基础上增加汇总表或物化视图。

# 四、生产追溯与质量闭环

## 4.1 `batch_step_records`

职责：记录生产批次内每道路线工序的派工、开工和报工，是生产过程追溯的关键节点事实。

| 字段                       | 类型              | 说明                                                    |
| -------------------------- | ----------------- | ------------------------------------------------------- |
| `id`                       | `BIGINT UNSIGNED` | 主键，自增                                              |
| `production_batch_id`      | `BIGINT UNSIGNED` | 生产批次 ID                                             |
| `route_step_id`            | `BIGINT UNSIGNED` | 路线步骤 ID                                             |
| `step_order_snapshot`      | `INT`             | 工序顺序快照                                            |
| `step_code_snapshot`       | `VARCHAR(100)`    | 工序编码快照                                            |
| `step_name_snapshot`       | `VARCHAR(100)`    | 工序名称快照                                            |
| `sop_file_id_snapshot`     | `BIGINT UNSIGNED` | 执行时 SOP 文件 ID，可为空                              |
| `sop_file_name_snapshot`   | `VARCHAR(255)`    | SOP 文件名快照                                          |
| `sop_object_key_snapshot`  | `VARCHAR(500)`    | SOP 对象键快照                                          |
| `responsible_user_id`      | `BIGINT UNSIGNED` | 当前负责人，可为空                                      |
| `need_record_snapshot`     | `TINYINT`         | 创建时冻结的必须报工标志，默认 `1`                      |
| `need_inspection_snapshot` | `TINYINT`         | 创建时冻结的必须检验标志，默认 `0`                      |
| `status`                   | `VARCHAR(30)`     | `pending`、`assigned`、`doing`、`completed`、`abnormal` |
| `started_at`               | `DATETIME`        | 开工时间                                                |
| `completed_at`             | `DATETIME`        | 完工时间                                                |
| `output_quantity`          | `DECIMAL(12,4)`   | 完成数量，默认 `0`                                      |
| `qualified_quantity`       | `DECIMAL(12,4)`   | 合格数量，默认 `0`                                      |
| `abnormal_quantity`        | `DECIMAL(12,4)`   | 异常数量，默认 `0`                                      |
| `rework_quantity`          | `DECIMAL(12,4)`   | 返工数量，默认 `0`                                      |
| `unit_snapshot`            | `VARCHAR(20)`     | 报工单位快照                                            |
| `remark`                   | `TEXT`            | 报工备注                                                |
| `version`                  | `INT`             | 乐观锁版本号，默认 `0`                                  |
| 业务审计字段               | 见统一规则        | 可变追溯记录审计字段                                    |

约束：

- `production_batch_id -> production_batches.id`
- `route_step_id -> process_route_steps.id`
- `responsible_user_id -> users.id ON DELETE SET NULL`
- `UNIQUE (production_batch_id, route_step_id)`
- 所有数量不得小于 `0`，且 `qualified_quantity + abnormal_quantity <= output_quantity`
- 快照字段 `need_record_snapshot`、`need_inspection_snapshot` 只允许 `0` 或 `1`
- 状态检查：`CHECK (status IN ('pending', 'assigned', 'doing', 'completed', 'abnormal'))`
- 完工时必须存在 `started_at`、`completed_at`，并满足 `completed_at >= started_at`

说明：创建生产批次时按路线步骤生成记录并复制快照（SOP、工序信息、必须报工和必须检验标志）；后续修改工序或路线不得回写已生成记录。

## 4.2 `inspection_records`

职责：按生产批次记录过程检验和最终检验；工序检验可额外关联具体报工记录。

| 字段                   | 类型              | 说明                                         |
| ---------------------- | ----------------- | -------------------------------------------- |
| `id`                   | `BIGINT UNSIGNED` | 主键，自增                                   |
| `inspection_no`        | `VARCHAR(100)`    | 检验单号，唯一                               |
| `production_batch_id`  | `BIGINT UNSIGNED` | 生产批次 ID                                  |
| `batch_step_record_id` | `BIGINT UNSIGNED` | 工序报工记录，可为空                         |
| `inspection_type`      | `VARCHAR(30)`     | `process`、`final`                           |
| `inspected_quantity`   | `DECIMAL(12,4)`   | 检验数量                                     |
| `qualified_quantity`   | `DECIMAL(12,4)`   | 合格数量                                     |
| `unqualified_quantity` | `DECIMAL(12,4)`   | 不合格数量                                   |
| `unit_snapshot`        | `VARCHAR(20)`     | 检验单位快照                                 |
| `result`               | `VARCHAR(30)`     | `pending`、`passed`、`failed`、`conditional` |
| `inspector_id`         | `BIGINT UNSIGNED` | 检验人                                       |
| `inspected_at`         | `DATETIME`        | 检验时间                                     |
| `report_file_id`       | `BIGINT UNSIGNED` | 检验报告文件，可为空                         |
| `source_rework_id`     | `BIGINT UNSIGNED` | 来源返工记录 ID，返工后复检时填写，可为空    |
| `remark`               | `TEXT`            | 备注                                         |
| `version`              | `INT`             | 乐观锁版本号，默认 `0`                       |
| 业务审计字段           | 见统一规则        | 可变质量记录审计字段                         |

约束：

- `production_batch_id -> production_batches.id`
- `batch_step_record_id -> batch_step_records.id`
- `inspector_id -> users.id`
- `report_file_id -> technical_files.id ON DELETE SET NULL`
- `source_rework_id -> rework_records.id`，在两张表创建后通过后续迁移追加
- `CHECK (inspected_quantity > 0)`
- `CHECK (qualified_quantity >= 0 AND unqualified_quantity >= 0)`
- `CHECK (qualified_quantity + unqualified_quantity <= inspected_quantity)`
- 应用事务必须校验 `batch_step_record_id` 属于同一 `production_batch_id`
- 应用事务必须校验 `source_rework_id` 对应的返工记录属于同一 `production_batch_id`

## 4.3 `rework_records`

职责：记录由检验不合格触发的返工。返工只通过 `source_inspection_id` 追溯生产批次，不重复保存 `production_batch_id`。

| 字段                   | 类型              | 说明                                         |
| ---------------------- | ----------------- | -------------------------------------------- |
| `id`                   | `BIGINT UNSIGNED` | 主键，自增                                   |
| `rework_no`            | `VARCHAR(100)`    | 返工单号，唯一                               |
| `source_inspection_id` | `BIGINT UNSIGNED` | 来源检验记录 ID                              |
| `rework_quantity`      | `DECIMAL(12,4)`   | 返工数量                                     |
| `unit_snapshot`        | `VARCHAR(20)`     | 单位快照                                     |
| `reason`               | `TEXT`            | 返工原因                                     |
| `action`               | `TEXT`            | 返工措施                                     |
| `responsible_user_id`  | `BIGINT UNSIGNED` | 返工负责人，可为空                           |
| `status`               | `VARCHAR(30)`     | `pending`、`doing`、`completed`、`cancelled` |
| `started_at`           | `DATETIME`        | 开始时间                                     |
| `completed_at`         | `DATETIME`        | 完成时间                                     |
| `result`               | `VARCHAR(30)`     | `pending`、`passed`、`failed`                |
| `result_file_id`       | `BIGINT UNSIGNED` | 返工结果附件，可为空                         |
| `remark`               | `TEXT`            | 备注                                         |
| `version`              | `INT`             | 乐观锁版本号，默认 `0`                       |
| 业务审计字段           | 见统一规则        | 可变返工记录审计字段                         |

约束：`source_inspection_id -> inspection_records.id`；负责人和文件使用 `SET NULL`；`CHECK (rework_quantity > 0)`。返工数量不得超过来源检验记录的可返工不合格数量，该跨行规则由事务校验。

## 4.4 `finished_flow_records`

职责：记录成品或半成品进入库存、质量放行、仓库出库等客户审核关注的流转里程碑。库存数量仍只以 `inventory_transaction` 为准。

| 字段                       | 类型              | 说明                                                                  |
| -------------------------- | ----------------- | --------------------------------------------------------------------- |
| `id`                       | `BIGINT UNSIGNED` | 主键，自增                                                            |
| `flow_no`                  | `VARCHAR(100)`    | 流转记录号，唯一                                                      |
| `item_batch_id`            | `BIGINT UNSIGNED` | 库存批次 ID                                                           |
| `item_id`                  | `BIGINT UNSIGNED` | 冗余库存对象 ID，与批次组合约束                                       |
| `production_batch_id`      | `BIGINT UNSIGNED` | 来源生产批次，可为空                                                  |
| `flow_type`                | `VARCHAR(40)`     | `WAREHOUSE_INBOUND`、`QUALITY_RELEASE`、`WAREHOUSE_OUTBOUND`、`OTHER` |
| `inventory_transaction_id` | `BIGINT UNSIGNED` | 对应库存流水；质量放行等非数量动作可为空                              |
| `quantity_snapshot`        | `DECIMAL(12,4)`   | 本次流转数量快照，可为空                                              |
| `unit_snapshot`            | `VARCHAR(20)`     | 单位快照                                                              |
| `occurred_at`              | `DATETIME`        | 发生时间                                                              |
| `operator_id`              | `BIGINT UNSIGNED` | 操作人                                                                |
| `status`                   | `VARCHAR(20)`     | `confirmed`、`cancelled`                                              |
| `remark`                   | `TEXT`            | 备注                                                                  |
| `version`                  | `INT`             | 乐观锁版本号，默认 `0`                                                |
| 业务审计字段               | 见统一规则        | 可变流转记录审计字段                                                  |

约束：

- `(item_batch_id, item_id) -> item_batch(id, item_id)`
- `production_batch_id -> production_batches.id`
- `inventory_transaction_id -> inventory_transaction.id`
- `UNIQUE (inventory_transaction_id)`；MySQL 允许多个空值
- 有库存增减的流转必须关联库存流水，`finished_flow_records` 本身不得改变库存

## 4.5 追溯主链

```text
products
  -> work_orders
  -> production_batches
  -> batch_step_records
  -> inspection_records
  -> rework_records

production_batches
  -> item_batch
  -> inventory_transaction
  -> finished_flow_records
```

追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从库存流水汇总，任何生产需求只能从 `production_item_demand` 读取。

# 五、建表与迁移顺序

```text
1. departments / users / roles / permissions / user_roles / role_permissions
2. refresh_tokens / operation_logs
3. technical_files / product_categories / process_steps
4. products（暂不添加 default_route_id 外键）
5. process_routes / process_route_steps
6. 为 products.default_route_id 追加外键
7. product_materials / route_step_materials
8. work_orders / production_batches / batch_step_records
9. item_batch / inbound_order / inbound_detail / inventory_transaction
10. production_item_demand / production_item_allocation
11. outbound_order / outbound_detail / return_order / return_detail / item_scrap
12. 为 production_item_demand.source_scrap_id 追加外键
13. stock_check_order / stock_check_detail
14. inspection_records（暂不添加 source_rework_id 外键） / rework_records
15. 为 inspection_records.source_rework_id 追加外键 / finished_flow_records
16. 最后创建所有汇总视图
```

每一步必须使用新的不可变迁移文件。已执行迁移不得修改；循环依赖的外键在两侧表都创建后通过后续迁移追加。

当前新项目只完成第 1、2 步。本文档的其余表是后续模块迁移基准，不代表对应业务代码或数据库迁移已经完成。
