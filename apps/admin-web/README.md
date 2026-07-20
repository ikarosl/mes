# apps/admin-web

Vue 3 管理端主线。视觉与交互继续遵守原项目 `design.md`：左侧菜单 + 顶部栏 + 内容区；列表优先；新增、编辑、分配、确认使用 Modal，不使用 Drawer。

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

页面负责组合，Modal 表单、查询模型、状态字典和 API schema 分离；两个场景复用后再进入 `packages/ui`。
