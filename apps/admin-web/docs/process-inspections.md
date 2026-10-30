# 工序专检与生产处理的前端约束

检查范围、更正及处理下限由 [Quality 工序专检](../../api/src/modules/quality/docs/process-inspections.md)维护；处理、返工及历史引用由 [Production 执行规则](../../api/src/modules/production/docs/database/execution-traceability-quality.md)维护。草稿、并发和未知结果沿用[管理端架构](architecture.md)，弹窗沿用[路由规范](route-dialogs-and-tabs.md)。

## 登记和更正

数量初始留空，由人员据实填写。“详情／历史”只读；更正和冲销从当前工序的办理入口进入，查看历史不切换正在填写的业务目标。

单次办理成功后回到同一工序，便于连续登记。新增检查后明细回第一页，更正和冲销保留页码；历史查看与当前检查草稿独立。

## 处理和生产来源

生产待处理与历史处理保留各自分页；手动刷新保留选择和填写。历史的处置说明可能被审批更新，明确标为“当前处置说明”，不冒充首次现场说明。

专检链接先解析所属工序，再打开指定检查，不依赖当前明细页。质检页查看生产处理时携带任务与工序定位，并经过生产页的任务切换和草稿保护；反向查看专检仍按目标页权限导航。权限边界见[Production 专检处理](../../api/src/modules/production/docs/database/execution-traceability-quality.md#43-工序专检与生产处理)。
