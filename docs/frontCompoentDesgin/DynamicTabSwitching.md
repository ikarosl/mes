# 动态标签切换与路由弹窗基础设施

本文说明管理端多标签页、Vue KeepAlive 与路由区域弹窗之间的协作方式，以及 `RouteDialog.vue`、`route-message-box.ts` 和 `live-options.ts` 的接入规范。视觉和通用交互约束仍以根目录 `design.md` 为准。

## 1. 设计目标

- Dialog 和危险操作确认框只遮罩当前路由内容区，不阻断左侧菜单、顶部栏和标签栏。
- 编辑 Dialog 随 KeepAlive 保留普通输入、已选值、校验状态和表格草稿。
- 缓存页面失活后，其 Dialog 必须同步隐藏；返回原标签时恢复编辑现场。
- 外部主数据候选项不使用陈旧页面缓存，应在关键生命周期重新请求。
- 候选项刷新不得覆盖编辑草稿；失效的已选值必须明确显示并阻止保存。

## 2. 基础设施职责

| 基础设施          | 位置                                            | 职责                                                                       |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `RouteDialog`     | `apps/admin-web/src/components/RouteDialog.vue` | 包装 Element Plus `ElDialog`，强制弹窗留在路由组件子树并附加路由区域遮罩类 |
| `RouteMessageBox` | `apps/admin-web/src/utils/route-message-box.ts` | 将危险操作确认框挂载到 `.content`，并提供路由切换时的统一关闭能力          |
| Live Options      | `apps/admin-web/src/utils/live-options.ts`      | 合并实时候选项和原已选值、标记失效值，并在提交前检查失效选择               |

配套入口和样式：

- `apps/admin-web/src/main.ts` 全局注册 `RouteDialog`，并在路由切换前关闭 `RouteMessageBox`。
- `apps/admin-web/src/styles/index.css` 将 Dialog 和 MessageBox 的两层固定遮罩改为相对 `.content` 定位。
- `AdminLayout.vue` 中的 `.content` 是路由内容边界，内部 `router-view + keep-alive` 负责页面实例缓存。

## 3. 联动流程

```text
AdminLayout .content
├─ router-view + KeepAlive
│  └─ 页面中的 <el-dialog>
│     └─ 全局 RouteDialog
│        └─ 原生 ElDialog + route-dialog-overlay
├─ 页面调用 RouteMessageBox.confirm()
│  └─ 确认框挂载到 .content
└─ 页面激活/弹窗打开/下拉展开
   └─ composable 请求最新候选项
      └─ live-options 合并原已选值
         └─ 正常显示可用项，标记并拦截失效项
```

切换标签页时：

1. 路由守卫关闭不应缓存的短时确认框。
2. KeepAlive 将旧页面及其 `RouteDialog` DOM 移出活动视图，弹窗不再显示或拦截新页面。
3. 普通输入和编辑草稿仍保存在旧页面实例中。
4. 返回旧标签后恢复 Dialog，并重新请求动态候选项。

## 4. `RouteDialog` 使用方式

`RouteDialog` 已在 `main.ts` 中覆盖全局 `ElDialog` 注册。业务页面继续使用标准 `<el-dialog>`，不需要逐页导入组件：

```vue
<el-dialog v-model="dialogVisible" title="编辑产品" :width="DialogWidth.md">
  <ProductForm />
  <template #footer>
    <el-button @click="dialogVisible = false">取消</el-button>
    <el-button type="primary" @click="submit">保存产品</el-button>
  </template>
</el-dialog>
```

使用约束：

- 不得在业务页面设置 `append-to-body=true`。
- 不得绕过全局注册直接渲染从 Element Plus 导入的原生 `ElDialog`。
- 编辑 Dialog 不应在 `onDeactivated` 中主动清空普通输入或关闭自身。
- 用户主动关闭且确认放弃编辑后，页面可以按业务需要重置表单。
- 弹窗宽度、滚动和按钮顺序继续遵守 `design.md` 第 5 节。

当前使用情况：管理端现有 23 个 `<el-dialog>` 均通过全局注册自动使用 `RouteDialog`，覆盖 System、Product 以及现存生产/仓储原型页。

## 5. `RouteMessageBox` 使用方式

危险操作不得直接调用 `ElMessageBox.confirm`，统一使用路由确认框：

```ts
import { RouteMessageBox } from '../../utils/route-message-box';

await RouteMessageBox.confirm('确认停用该产品吗？', '停用产品', {
  type: 'warning',
  confirmButtonText: '停用',
});
```

为了减少现有页面改动，也允许使用清晰的局部别名：

```ts
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
```

使用约束：

- 适用于删除、停用、取消、关闭、作废、完成等短时危险操作确认。
- 不用于承载表单、详情或需要随标签页恢复的编辑内容。
- 确认框切换路由时自动关闭，返回后必须由用户重新发起操作。
- 禁止业务页面重新从 `element-plus` 直接导入 `ElMessageBox`。

当前使用情况：管理端现有 21 处危险操作确认均已接入 `RouteMessageBox`。

## 6. Live Options 使用方式

### 6.1 请求时机

动态候选项应在以下时机调用对应 composable 的 `loadOptions`：

```ts
import { onActivated, onMounted } from 'vue';

onMounted(loadPageData);
onActivated(loadOptions);
```

弹窗打开和下拉展开时继续刷新：

```vue
<el-dialog @open="$emit('refresh-options')">
  <el-select
    v-model="form.categoryId"
    @visible-change="(visible: boolean) => visible && $emit('refresh-options')"
  />
</el-dialog>
```

同一 composable 应合并并发的候选请求，避免页面激活、弹窗打开和下拉展开同时产生重复 API 调用。

### 6.2 保留失效的已选值

```ts
import { computed } from 'vue';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';

const categoryChoices = computed(() =>
  buildLiveOptions(
    props.categoryOptions,
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  ),
);
```

```vue
<el-option
  v-for="choice in categoryChoices"
  :key="choice.value"
  :value="choice.value"
  :label="choice.option?.categoryName ?? `${choice.value}（已失效）`"
  :disabled="choice.isUnavailable"
/>
```

保存前必须检查：

```ts
if (
  hasUnavailableSelection(
    props.categoryOptions,
    form.categoryId ? [form.categoryId] : [],
    (item) => item.id,
  )
) {
  EMessage.warning('产品分类已失效，请重新选择');
  return;
}
```

### 6.3 适用范围

适用：

- 部门、角色、权限等可变系统主数据；
- 产品分类、关联产品、物料、工序、工艺路线；
- 用户、负责人等跨页面可能变化的关联对象；
- API 返回且可能被停用、删除或改变适用条件的候选项。

不适用：

- 获取方式、固定状态等由 `packages/constants` 或 contracts 定义的稳定枚举；
- 普通文本、数字、日期、开关等不依赖外部候选数据的输入；
- 仅用于列表展示、不参与编辑提交的数据。

当前正式接入页面包括用户管理、产品管理、产品分类和工艺路线；候选类型覆盖部门、角色、分类、产品、物料、工序、路线和负责人。生产/仓储后端尚未迁移，其原型页只接入路由弹窗边界，不伪造实时 API。

## 7. 状态缓存边界

| 状态               | 是否随 KeepAlive 保留 | 更新策略                           |
| ------------------ | --------------------- | ---------------------------------- |
| Dialog 显示状态    | 是                    | 返回标签后恢复                     |
| 普通输入和表格草稿 | 是                    | 候选刷新不得覆盖                   |
| 用户已选值         | 是                    | 缺失时标记为“已失效”               |
| 动态候选集合       | 否                    | 页面激活、弹窗打开或下拉展开时请求 |
| 危险操作确认框     | 否                    | 路由切换时关闭                     |
| 服务端校验结果     | 否                    | 提交时重新校验                     |

## 8. 测试要求

新增或修改相关交互时至少验证：

- Dialog 遮罩仍位于路由组件子树内；
- KeepAlive 失活时 Dialog 不可见，返回后编辑草稿仍在；
- MessageBox 的 `appendTo` 指向 `.content`；
- 多次同时刷新候选项只产生一次请求；
- 候选刷新不会丢失原已选值；
- 失效选择能够显示且无法提交。

相关测试位于：

- `apps/admin-web/src/components/__tests__/route-dialog.test.ts`
- `apps/admin-web/src/utils/__tests__/route-message-box.test.ts`
- `apps/admin-web/src/utils/__tests__/live-options.test.ts`
- 各页面相邻的 `components/__tests__` 或 `composables/__tests__`
