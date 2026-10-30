# apps/admin-web

Vue 3 管理端。专题只维护代码或页面不容易解释的约束及原因；数量算法、状态机和业务资格由 API 模块所有者文档维护。

## 相关文档

- [管理端架构](docs/architecture.md)：公共状态所有权、候选、刷新、并发和写意图。
- [视觉设计](docs/visual-design.md)：[界面调整原则](docs/visual-design.md#1-界面调整原则)、显示规范与场景密度；[路由、弹窗和标签页](docs/route-dialogs-and-tabs.md)：接入方式。
- [HTTP 错误处理](docs/http-error-handling.md)：认证、重试、消息去重和已知限制。
- [采购与入库](docs/procurement-inbound.md)、[来料检验与定稿](docs/incoming-inspection-adoption.md)、[成品质检与产出](docs/finished-inspections.md)、[工序专检与生产处理](docs/process-inspections.md)：专题前端约束。
- [其他入出库](docs/other-inventory-orders.md)：本地编辑行、新批次组及确认意图。
- [业务人员配置与生产负责人](docs/business-user-candidates.md)：配置人数与未保存选择的区别。
- [系统模板管理](docs/business-templates.md)：表格尺寸变更及应用模板的覆盖确认。
- [成品、基础物料与精确版本编辑](docs/product-master-data.md)：规格书上传、关联并发及规格参数模板的草稿边界。
- [成品产出清单、复检与入库操作手册](../../docs/manuals/finished-output-inspection-inbound.md)：使用步骤和当前限制。

## 验证

`corepack pnpm --filter @company/admin-web typecheck` 检查应用源码和共享契约；`build` 在打包前执行同样的应用检查。`typecheck:test` 额外纳入测试文件，相邻测试由独立 `test` 入口执行。应用检查与构建不能替代测试类型检查和测试执行。

交付和正式测试顺序遵守根 [AGENTS.md](../../AGENTS.md)，未完成验收见[路线图](../../docs/roadmap.md)。

## 审批组件展示

审批组件的开发入口及模拟范围见[演示页说明](src/views/approval/demo/README.md)。
