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
- 分类表达“是什么”，`products.acquire_method` 表达“如何获得”，两者不得混用。

---

### 2. `products`

职责：维护所有可生产、可采购或可库存对象，是物料和成品的唯一主数据。

| 字段               | 类型              | 说明                                    |
| ------------------ | ----------------- | --------------------------------------- |
| `id`               | `BIGINT UNSIGNED` | 主键，自增                              |
| `item_code`        | `VARCHAR(100)`    | 统一库存对象编码（创建后不可修改）      |
| `product_name`     | `VARCHAR(200)`    | 名称                                    |
| `category_id`      | `BIGINT UNSIGNED` | 分类 ID                                 |
| `default_route_id` | `BIGINT UNSIGNED` | 默认工艺路线，可为空                    |
| `bom_locked_at`    | `DATETIME`        | 首次生产任务引用并永久锁定 BOM 的时间   |
| `bom_locked_by`    | `BIGINT UNSIGNED` | 触发首次锁定的操作人，可为空            |
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

- 物料和成品都进入该表，不再创建 `item_info` 或独立物料主表；基础物料身份是 `products.id`。
- 是否是物料或成品，通过 `category_id -> product_categories.item_kind` 判断。
- `item_code` 是产品和物料的唯一业务编码；编码软删除后不得被新记录复用，需要继续使用时恢复原记录。
- 系统只允许一个固定基础单位且不建设单位换算；产品编码和基础单位创建后不可修改。更新接口必须拒绝任何编码变更，数据库触发器同时兜底。

示例：

| id  | product_name           | item_kind        | unit |
| --- | ---------------------- | ---------------- | ---- |
| pi2 | 粘合-h822              | material         | g    |
| pi4 | 10g-30g微带环形器成品  | finished_product | pcs  |

---

### 3. `product_materials`

职责：维护成品的统一 BOM 明细，是生产需求基础生成的唯一 BOM 数据源。

| 字段                  | 类型              | 说明                           |
| --------------------- | ----------------- | ------------------------------ |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                     |
| `product_id`          | `BIGINT UNSIGNED` | 被生产对象 ID                  |
| `material_product_id` | `BIGINT UNSIGNED` | 消耗对象 ID                    |
| `quantity_per_unit`   | `DECIMAL(12,4)`   | 每生产一个目标对象的需求数量   |
| `unit`                | `VARCHAR(20)`     | 用量单位，必须等于物料基础单位 |
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
- 检查约束：`CHECK (quantity_per_unit = FLOOR(quantity_per_unit))`
- 检查约束：布尔字段与 `status` 只允许 `0/1`
- 唯一约束：`UNIQUE (product_id, material_product_id)`
- 组合引用索引：`UNIQUE (id, material_product_id)`

说明：

- `product_id` 只能是成品。
- `material_product_id` 只能是物料；需要精确库存版本时由 Production 在需求或物流事实中选择 `material_variant_id`。
- `production_item_demand` 必须保存 `product_material_id` 和 BOM 数量、单位、追溯标志快照。
- 产品首次成功创建生产任务时，`products.bom_locked_at` 与任务同事务写入；此后本表所有新增、修改、删除、停用、恢复和批量替换操作均拒绝。
- 任务取消、需求完成或库存归零不能解除锁定。原则性用料变化必须新建产品和编码。
- 锁定前修改 BOM 不得回写已经生成的生产需求。
- 同一产品和投入对象的 BOM 行软删除后需要再次使用时恢复原记录，不创建相同自然键的新记录。

#### 单版本 BOM 锁定事实

这两个既有表在 BOM 锁定中的白话分工是：

- `products`：记住“这个产品的 BOM 是否已经真正拿去生产，以及第一次是谁、什么时候锁定的”。
- `product_materials`：保存“生产这个产品固定要用哪些物料和各用多少”；产品一旦锁定，这些行就只能查看，不能再改。

正式规则：

1. 系统不建立 BOM 版本头、版本行或当前版本指针；同一个 `products.id` 只有一份有效 BOM 定义。
2. 首次成功创建引用该产品的生产批次时，创建批次、冻结路线工序快照以及写入 `products.bom_locked_at/bom_locked_by` 必须处于同一事务。
3. 锁定事实只允许从“未锁定”写成“已锁定”，没有解锁命令。任务取消、需求完成、库存归零或所有路线停用均不能清空锁定事实。
4. `bom_locked_by` 可以为空，用于历史事实只能确定锁定时间、无法可靠恢复操作人的情况；一旦记录了操作人，`bom_locked_at` 必须同时存在。
5. 已锁定产品拒绝 BOM 行新增、修改、删除、停用、恢复和批量替换。产品确需发生原则性用料变化时，管理员新建产品和编码，再复制并重新复核 BOM 与路线。
6. 名称等不改变稳定产品身份的展示字段仍可按产品主数据规则修改；产品编码和固定基础单位不可修改。

`202608280001-product-bom-lock-facts` 为 `products` 增加上述锁定时间与操作人，并按每个产品最早的历史生产批次回填已有锁定事实。该迁移只补事实字段，不创建 BOM 版本模型。

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
| `product_id` | `BIGINT UNSIGNED` | 所属产品 ID                                |
| `version_no` | `VARCHAR(64)`     | 路线版本                                   |
| `status`     | `VARCHAR(20)`     | `draft`、`enabled`、`disabled`、`archived` |
| `remark`     | `VARCHAR(255)`    | 备注                                       |
| 审计字段     | 见统一规则        | 主数据审计字段                             |

约束：`product_id -> products.id`；`UNIQUE (product_id, route_code, version_no)`；`CHECK (status IN ('draft', 'enabled', 'disabled', 'archived'))`；启用后的路线版本不得原地修改步骤，只能创建新版本。

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
| `sop_version_no_snapshot` | `VARCHAR(64)`     | SOP 版本号快照               |
| `need_inspection`         | `TINYINT`         | 是否要求检验，默认 `0`       |
| `need_record`             | `TINYINT`         | 是否要求报工，默认 `1`       |
| `status`                  | `TINYINT`         | `1` 启用、`0` 停用           |
| `remark`                  | `VARCHAR(255)`    | 备注                         |
| 审计字段                  | 见统一规则        | 主数据审计字段               |

约束：`UNIQUE (route_id, step_order)`；`UNIQUE (id, route_id)`；检查布尔字段和 `step_order > 0`。软删除后需要恢复同一路线顺序时恢复原步骤记录，不创建相同顺序的新记录。

## 2.5 路线与 BOM 的边界

当前模型不再建立 `route_step_materials`。`process_route_steps` 只保存路线工序顺序、负责人、SOP
和规则快照；物料消耗统一来自产品级 `product_materials`，生产批次在创建时冻结完整 BOM，随后由
Production 按 BOM 行逐行配置精确 `material_variant_id`。任何按工序绑定 BOM、按路线步骤推导需求
或以工序范围筛选补料的语义均已删除，不得恢复旁路表。

## 2.6 `material_variants`

职责：维护同一基础物料下可供管理员选择的精确版本。`products.id` 仍是 BOM 的稳定基础物料身份，
`material_variants.id` 才是采购批次、生产需求和库存流水中不可替代的版本身份。

| 字段                  | 类型              | 说明                              |
| --------------------- | ----------------- | --------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                              |
| `material_product_id` | `BIGINT UNSIGNED` | `products.id`，必须是启用物料      |
| `major_version`       | `VARCHAR(32)`     | 主版本                            |
| `minor_version`       | `VARCHAR(32)`     | 次版本                            |
| `variant_code`        | `VARCHAR(180)`    | 服务端生成且创建后不可修改的编码   |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用                 |
| `is_deleted`          | `TINYINT`         | 软删除标记                         |

同一基础物料的启用、未删除版本构成候选集合；停用只阻止新选择，不改变需求、批次、分配、出入库、退料、
报废、盘点及库存流水中已冻结的版本快照。跨模块只能通过 Product 的 `MaterialVariantQuery` 读取候选，
不得直接查询本表。
