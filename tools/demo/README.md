# 演示场景工具

本目录随 Git 维护可复用的场景数据准备与 JSON 报告工具，用于人工验收。目录职责见[工程脚本与临时文件](../../docs/coding-standards.md#工程脚本与临时文件)；基础数据和 SQL 演示种子通过[数据库包](../../packages/database/README.md)的统一入口维护。

| 文件 | 用途 |
| --- | --- |
| [`prepare-procurement-amount-demo.mjs`](prepare-procurement-amount-demo.mjs) | 采购金额补填与正式单更正，核对报价、总额来源、舍入和成功审计 |
| [`prepare-incoming-inspection-demo.mjs`](prepare-incoming-inspection-demo.mjs) | 来料分组分页、跨采购与供应商、完整明细、移组、空组、作废及实物办理完成场景 |
| [`prepare-procurement-receipt-demo.mjs`](prepare-procurement-receipt-demo.mjs) | 采购／到货两层分页、完整明细、待定稿与作废、组合筛选和页外定位场景 |

## 前置准备

从仓库根执行命令，先按[快速开始](../../README.md#快速开始测试环境)安装依赖并配置开发环境。工具通过 `@company/config` 加载根 `.env`，进程注入的环境变量优先；不要把凭证写入工具或提交到仓库。

先构建工具依赖、初始化开发数据库并显式加载[演示种子](../../packages/database/demo/README.md)，再启动 API：

```bash
corepack pnpm --filter @company/config build
corepack pnpm --filter @company/utils build
corepack pnpm db:init
ALLOW_DEMO_SEED=1 DEMO_USER_PASSWORD='<至少 6 位的独立演示密码>' corepack pnpm db:seed:demo
corepack pnpm dev:api
```

`ADMIN_USERNAME`、`ADMIN_PASSWORD` 必须与初始化管理员一致；`db:init` 重跑会按当前配置更新管理员密码。`DEMO_USER_PASSWORD` 只供演示种子使用，工具使用管理员登录。种子中的演示共批供应商和 `demo-stock-multi` 精确版本须保持可用，工具会按名称／编码精确匹配，不创建替代主数据。

## 运行方式与写入影响

每个工具接受 `prepare` 或 `report`，省略时默认 `report`。`report` 登录后仅通过 GET 读取业务数据；登录本身调用 `POST /auth/login`，可产生认证记录或会话状态。`prepare` 通过公开业务 API 创建和办理场景，会写入业务单据、事实及审计；来料分组工具还会定稿、实际入库和退回，形成库存事实。

读取默认数据集：

```bash
export ALLOW_DEMO_SEED=1
node tools/demo/prepare-procurement-amount-demo.mjs report
node tools/demo/prepare-incoming-inspection-demo.mjs report
node tools/demo/prepare-procurement-receipt-demo.mjs report
```

准备新数据集时设置新的对应 TAG，例如：

```bash
PROCUREMENT_AMOUNT_DEMO_TAG=acceptance_01 node tools/demo/prepare-procurement-amount-demo.mjs prepare
PROCUREMENT_AMOUNT_DEMO_TAG=acceptance_01 node tools/demo/prepare-procurement-amount-demo.mjs report
```

另外两个工具同样传入 `prepare`，分别使用下表中自己的 TAG。准备与报告必须携带同一 TAG；未设置 TAG 时操作默认无后缀的数据集。TAG 为 1～40 位字母、数字、下划线或连字符。

## 环境变量

以下配置同时适用于 `prepare` 与 `report`。

| 环境变量 | 默认值／要求 |
| --- | --- |
| `ALLOW_DEMO_SEED` | 两种模式都必须显式为 `1` |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | 必填，与初始化管理员密码一致 |
| `NODE_ENV` | 为 `production` 时禁止执行，比较前会 trim 并转为小写 |
| `PROCUREMENT_AMOUNT_DEMO_API_BASE_URL` | `http://127.0.0.1:3002/api` |
| `PROCUREMENT_AMOUNT_DEMO_ALLOW_REMOTE` | 未设置时禁止远程；远程须为 `1` |
| `PROCUREMENT_AMOUNT_DEMO_TAG` | 未设置时使用 `[demo-procurement-amount-v4]` |
| `INCOMING_INSPECTION_DEMO_API_BASE_URL` | `http://127.0.0.1:3002/api` |
| `INCOMING_INSPECTION_DEMO_ALLOW_REMOTE` | 未设置时禁止远程；远程须为 `1` |
| `INCOMING_INSPECTION_DEMO_TAG` | 未设置时使用 `[demo-incoming-group-v1]` |
| `PROCUREMENT_RECEIPT_DEMO_API_BASE_URL` | `http://127.0.0.1:3002/api` |
| `PROCUREMENT_RECEIPT_DEMO_ALLOW_REMOTE` | 未设置时禁止远程；远程须为 `1` |
| `PROCUREMENT_RECEIPT_DEMO_TAG` | 未设置时使用 `[demo-procurement-receipts-v1]` |

API 基址仅接受 HTTP(S)，路径须以 `/api` 结尾，不得包含凭证、查询串或片段。`localhost`、`127.0.0.1`、`[::1]` 视为本地；其他主机必须同时使用 HTTPS 并显式设置对应工具的 `ALLOW_REMOTE` 变量为 `1`。所有请求禁止重定向。

## 重复执行与失败处理

设置 TAG 后，标记在版本号后追加 `:<TAG>`，并随场景标识写入备注。同一标记已有数据时，`prepare` 保留已有状态并输出报告，不补缺、不覆盖或自动续写；请保留这些备注标记，删除或修改后再次执行可能重复创建数据。

每次业务写入携带新的 UUID `Idempotency-Key`，失败请求不自动重试；备注标记用于防止重复启动，不承担跨次执行的请求幂等。整个工具没有跨请求事务，失败不会回滚此前成功提交的事实。失败后先用相同 TAG 执行 `report` 核对并人工处理；需要重新准备时使用新的对应 TAG，或从空开发库通过统一初始化与演示种子恢复，避免对同一标记盲目续写。

报告用于辅助人工核对。用户办理后的状态与统计可能偏离初始基准，报告或准备成功不代表正式测试或用户验收通过；验证阶段遵守[测试策略](../../docs/testing-strategy.md)。
