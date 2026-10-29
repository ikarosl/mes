# 动态标签切换与路由弹窗

本文维护 KeepAlive、路由区域弹窗的接入边界；候选所有权与刷新遵守[管理端架构](architecture.md)，尺寸和视觉遵守[视觉设计](visual-design.md)。

## 代码职责

`main.ts` 负责应用与平台能力装配；`src/layouts` 负责侧栏、顶栏、标签及路由内容区的组合和布局。业务路由由 `src/router/routes` 分组声明，路由创建与守卫安装分别由 `router/index.ts` 和 `router/guards.ts` 负责。导航配置位于 `router/navigation.ts`，只维护菜单分组、顺序和目标路由；菜单标题与页面准入权限读取目标路由声明，仓储分类入口依其子路由权限选择首个可访问目标。菜单工作区不决定业务代码所有权，例如采购到货仍由 Procurement 所有。

路由 URL、`name`、页面组件名与 `meta.keepAliveName/tabName/menuPath` 共同构成导航及缓存身份。目录移动和文件拆分须保留这些身份、嵌套路由与关闭保护关系；跨页跳转继续按目标路由权限判断。

## 1. 挂载边界

Dialog 和短时确认框只遮罩 `AdminLayout` 的 `.content`，不阻断菜单、顶部栏和标签栏。Dialog 的 DOM 必须留在所属路由子树，失活隐藏，回来恢复草稿、选择及校验状态；普通编辑不能在 `onDeactivated` 清空。

表格单元格及固定列内只挂操作入口，通过事件把选中的对象和动作交给页面级弹窗；动作、历史与报工关联详情 Dialog 与主表并列挂载。弹窗内的报工历史表也只发出查看事件，关联详情须与父 Dialog 并列，不能置于表格或父正文滚动区。固定列等设置了定位层级的单元格会建立独立层叠上下文，内部遮罩无法凭自身 `z-index` 越过表格边线。弹窗保留编辑开始时的快照，当前对象从页面最新列表重新解析；换分页或任务后对象不可用时保留草稿并阻止提交。

遮罩固定定位使用布局提供的 `--route-overlay-*` 坐标和尺寸，保证内容区滚动或局部定位不会改变边界。路由内容到弹窗之间不得加会重建固定定位包含块的 transform、filter 或 contain；效果应限在不含弹窗的展示节点。子业务弹窗与父弹窗并列挂载，不能置于父正文滚动区。

## 3. 联动流程

所有 Dialog（编辑、详情、选择）及 MessageBox（确认、输入提示）均禁止点击弹窗外区域或遮罩关闭，由 `RouteDialog` 和 `RouteMessageBox` 强制设置 `closeOnClickModal=false`，调用方不得开启。关闭按钮、取消、提交成功及 Esc 继续遵守各场景原有的关闭保护。

切换标签关闭短时 MessageBox，保留编辑 Dialog 及草稿；缓存返回的读取规则、明确定位与办理核验边界见[架构 §6](architecture.md#6-生命周期与定向刷新)，不得为减少渲染直接禁用 KeepAlive。

有草稿或未确认写意图的 editor 使用 `useTabsStore().registerCloseGuard(routeName, async () => boolean)`，在 `onScopeDispose` 注销。同页可注册多个 guard，全部允许才移出缓存；检查也覆盖非活动标签。提交中返回 false，脏草稿／未知结果须明确确认放弃。普通路由切换不执行关闭 guard，也不丢弃意图。

仓储入库／出库分类采用嵌套子路由：父页面通过 `el-tabs` 导航，子视图由独立 KeepAlive 保留，切分类触发原分类子视图失活。分类共享父级顶部标签及关闭保护，路由继承的 `meta.tabName` 指向父标签名，外层缓存使用父页面组件名；编辑器向父标签注册 guard。分类权限仍由各子路由独立校验，菜单定位首个有权限的分类，不因父页面可进入而挂载无权限分类。旧其他单地址仍可定位对应分类，不另建一份缓存草稿。

缓存多页会占内存，性能排查固定同一组标签往返，比较 GC 后堆、DOM、监听器数量及关闭后的回收；同时用无扩展浏览器核验，不能凭一次 heap 峰值判定泄漏。

## 4. RouteDialog

全局 `<el-dialog>` 由 [RouteDialog](../src/components/RouteDialog.vue) 接管，业务页不直接导入原生 ElDialog，不设置 `append-to-body=true`：

```vue
<el-dialog v-model="visible" title="编辑产品" :width="DialogWidth.md">
  <ProductForm />
</el-dialog>
```

尺寸与正文滚动遵守[视觉规范](visual-design.md#5-弹窗规范)，不逐页复制整体高度约束。用户明确关闭并放弃后才可重置；只读加载可关闭并忽略迟到响应，写入中禁止关闭。业务收尾的空记录／结束快照解释见[架构](architecture.md#生产需求收尾与库存)。

## 5. RouteMessageBox

短时危险确认统一用 [RouteMessageBox](../src/utils/route-message-box.ts)，不直接调用 Element Plus ElMessageBox：

```ts
import { RouteMessageBox } from '../../utils/route-message-box';

await RouteMessageBox.confirm('确认停用该产品吗？', '停用产品', {
  type: 'warning',
  confirmButtonText: '停用',
});
```

确认框不承载表单、详情或需缓存的编辑内容。切路由自动关闭，回来须重新发起；长提示仅正文滚动，标题和确认按钮可见。

## 6. 选择组件接入

选择组件禁止接入存量 Live Options 设计；其存量遗留范围、停止使用与维护的约束、替换标准及已选值核验由[管理端架构 §4](architecture.md#4-选择组件与候选契约)统一维护。静态枚举、有界候选与远程搜索按该标准接入，不因使用 `el-select` 或组件的 `options` 属性而沿用旧封装。刷新时机见[架构 §6](architecture.md#6-生命周期与定向刷新)，未接入后端的业务不能伪造实时候选。

## 8. 验证重点

重点核验非活动页弹窗不遮挡新页、返回恢复草稿、MessageBox 随路由关闭、关闭非活动标签保护未知意图，以及正文滚动不裁剪子弹窗。
