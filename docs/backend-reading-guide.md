# 后端阅读引导 — 阶段 8：S3 适配器、文件上传与收尾（待阅读）

> 本文件记录 product 模块阅读引导的**最后一个未完成阶段**（阶段 0~7 已读完）。
> 阅读对象：`apps/api/src/modules/product`，配套文档 `docs/architecture.md` 与 `docs/api-conventions.md`。
> 完成本阶段后，product 模块的完整阅读即结束；底部附**快速导航表**供日后复习。

## 阅读清单（约 30 分钟）

| 文件                                                                                | 内容                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/src/modules/product/infrastructure/s3-technical-file.storage.ts`          | S3 适配器（115 行），重点                            |
| `apps/api/src/modules/product/presentation/http/multipart-file-name.ts`             | multipart 文件名编码处理                             |
| `apps/api/src/modules/product/presentation/http/product.controller.ts`              | 上传/下载端点，重点 `:65-88`、`:242-252`、`:343-355` |
| `apps/api/src/modules/product/presentation/http/product-domain-exception.filter.ts` | 错误码 → HTTP 状态映射，重点 `:44-50`                |
| `apps/api/src/modules/product/product.module.ts`                                    | 观察 `useFactory` 如何构造 S3 客户端，重点 `:39-42`  |
| `eslint.config.js`                                                                  | `no-restricted-imports` + `boundaries/dependencies`  |
| `scripts/check-api-architecture.mjs`                                                | 架构测试（审计写入唯一咽喉、表所有权等）             |

## 一、S3 adapter 的三个看点

### 1. 外部 SDK 隔离

`S3Client` 只存在于 adapter 里（`s3-technical-file.storage.ts:5-8`），domain / application / presentation 完全不认识 AWS 类型。

**为什么？** 换 MinIO / 阿里云 OSS / 腾讯 COS 时只改这一个文件。`forcePathStyle` 就是为了兼容 MinIO 这类非 AWS 原生端点而准备的。

### 2. 错误翻译

所有 S3 失败统一 `throw new ProductDomainError('STORAGE_UNAVAILABLE', ...)`（`:64-66`），由阶段 5 的过滤器映射成 HTTP 502（`product-domain-exception.filter.ts:44-50`）。

**为什么不是直接抛 AWS 的原始错误？** 原始错误带着 SDK 细节，违反 `api-conventions.md` §2「不向前端暴露 SQL、SDK、堆栈和密钥」；统一成领域错误码还能保证错误信封结构稳定。

### 3. 对象键设计

对象键形如 `sop/2026/08/<uuid>.pdf`（`:53`）：

- 用**北京时区的年月**做前缀（`toBeijingCompactTimestamp` / `toBeijingISOString` 生成），方便按时间归档和配置生命周期规则；
- 文件名用 `randomUUID()`，避免用户原始文件名冲突和路径注入；
- 记录 `checksumSha256`（`:75`），用于文件完整性校验。

## 二、文件上传链路

```
multipart 请求
  → FileInterceptor('file', { limits: { fileSize, files } })   // controller :68，限制大小和数量
  → @UploadedFile() file: UploadedSop | undefined              // 拿到 Multer 解析结果
  → toTechnicalFileUpload(file)                                // controller :343-350，缺失时抛 BadRequest
  → decodeMultipartFileName(file.originalname)                 // 处理文件名编码
  → service.uploadTechnicalFile(...)                           // 校验 → S3 存储 → 数据库记录
```

两个真实项目才会踩的坑：

- **`decodeMultipartFileName`（`multipart-file-name.ts`）**：Busboy/Multer 历史性地把 multipart 文件名参数按 **Latin-1** 解释，中文/emoji 文件名会变成乱码字节。此函数在「每个字符都单字节」且「这些字节构成合法 UTF-8」时才恢复 UTF-8，否则原样保留并归一化到 NFC。这是浏览器与 Node multipart 解析之间的编码错位。
- **文件与数据库的分布式一致性**：先存 S3、后写数据库（`product.service.ts:40-49`）；数据库写入失败时用 `storage.remove(...)` 做**补偿**，删掉刚上传的 S3 对象再抛错。S3 和 MySQL 之间没有事务边界，只能手动回滚。

## 三、收尾：自动约束

分层规则靠人自觉不可靠，所以用工具固化（对应 `docs/architecture.md` §9「自动约束」表）：

| 约束                                                                                    | 工具                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------- |
| 分层反向依赖（domain 不得引框架/数据库，层间不得反向引用）                              | ESLint `no-restricted-imports`                |
| 跨模块深层 import（只能走目标模块 `public.ts`）                                         | ESLint `boundaries/dependencies`              |
| 审计写入唯一咽喉（仅 `transactional-audit-writer` 可写 `operation_logs`）、数据表所有权 | `scripts/check-api-architecture.mjs` 架构测试 |

**读这一节的收获**：设计不只是"写在文档里"，而是"编译不过 / 测试不过"。规则被工具强制，越界即失败。

## 四、快速导航表（日后复习直接跳）

| 想弄懂的东西                   | 去看                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Nest 如何组装、DI 如何绑定端口 | `product.module.ts:22-45`                                                                  |
| 端口为什么用 abstract class    | `application/ports/product-catalog.repository.ts`                                          |
| 错误码如何变成 HTTP 状态       | `presentation/http/product-domain-exception.filter.ts:44-50`                               |
| 事务里写审计的原子性           | `infrastructure/mysql-product-catalog.repository.ts:57-86`                                 |
| 行锁 / 并发安全                | `infrastructure/mysql-product-catalog.repository.ts:433-473`                               |
| 跨模块只读契约                 | `application/product-snapshot.query.ts:54-78` + `production.service.ts:55`                 |
| 把驱动错误翻译成业务错误       | `infrastructure/mysql-product.shared.ts:7-11`                                              |
| S3 失败如何变成 502            | `infrastructure/s3-technical-file.storage.ts:64-66` + `product-domain-exception.filter.ts` |
| multipart 文件名编码坑         | `presentation/http/multipart-file-name.ts`                                                 |
