# apps/admin-web

Vue 3 管理端主线。视觉与交互遵守[视觉设计](docs/visual-design.md)：左侧菜单 + 顶部栏 + 内容区；列表优先；新增、编辑、分配、确认使用 Modal，不使用 Drawer。前端分层、候选数据所有权、竞态守卫和刷新时机遵守[管理端架构](docs/architecture.md)。

```text
src/
  app/
  api/
  components/
    data-table/
    query-form/
    modal-form/
    status-tag/
  composables/
  layouts/
  router/
  stores/
  styles/
  views/<module>/<feature>/
    components/
    composables/
    schemas/
    index.vue
```

页面负责组合，Modal 表单、查询模型、状态字典和 API schema 分离。当前共享组件仍由 admin-web 的
`src/components` 所有；只有出现第二个独立前端消费者且组件 API 已稳定时，才评审提取 workspace UI 包。

## 相关文档

- [路由、弹窗和标签页](docs/route-dialogs-and-tabs.md)
- [HTTP 错误处理](docs/http-error-handling.md)

## 验证

`corepack pnpm --filter @company/admin-web typecheck`、相邻测试及根 `corepack pnpm format:check`。
