# 文件与工艺

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

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
