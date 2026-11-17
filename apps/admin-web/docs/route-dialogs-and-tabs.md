# 动态标签切换与路由弹窗

本文维护 KeepAlive、路由区域弹窗的接入边界；候选所有权与刷新遵守[管理端架构](architecture.md)，尺寸和视觉遵守[视觉设计](visual-design.md)。

## 代码职责

`main.ts` 负责应用与平台能力装配；`src/layouts` 负责侧栏、顶栏、标签及路由内容区的组合和布局。业务路由由 `src/router/routes` 分组声明，路由创建与守卫安装分别由 `router/index.ts` 和 `router/guards.ts` 负责。导航配置位于 `router/navigation.ts`，只维护菜单分组、顺序和目标路由；菜单标题与页面准入权限读取目标路由声明，仓储分类入口依其子路由权限选择首个可访问目标。菜单工作区不决定业务代码所有权，例如采购到货仍由 Procurement 所有。

路由 URL、`name`、页面组件名与 `meta.keepAliveName/tabName/menuPath` 共同构成导航及缓存身份。目录移动和文件拆分须保留这些身份、嵌套路由与关闭保护关系；跨页跳转继续按目标路由权限判断。

## 1. 挂载边界

Dialog 和短时确认框只遮罩 `AdminLayout` 的 `.content`，不阻断菜单、顶部栏和标签栏。Dialog 的 DOM 必须留在所属路由子树，失活隐藏，回来恢复草稿、选择及校验状态；普通编辑不能在 `onDeactivated` 清空。

表格单元格及固定列内只挂操作入口，通过事件把选中的对象和动作交给页面级弹窗；动作、历史与报工关联详情 Dialog 与主表并列挂载。弹窗内的报工历史表也只发出查看事件，关联详情须与父 Dialog 并列，不能置于表格或父正文滚动区。固定列等设置了定位层级的单元格会建立独立层叠上下文，内部遮罩无法凭自身 `z-index` 越过表格边线。草稿和对象失效的处理遵守[公共架构](architecture.md#2-草稿与关键详情)。

遮罩固定定位使用布局提供的 `--route-overlay-*` 坐标和尺寸，保证内容区滚动或局部定位不会改变边界。路由内容到弹窗之间不得加会重建固定定位包含块的 transform、filter 或 contain；效果应限在不含弹窗的展示节点。子业务弹窗与父弹窗并列挂载，不能置于父正文滚动区。

## 3. 联动流程

所有 Dialog（编辑、详情、选择）及 MessageBox（确认、输入提示）均禁止点击弹窗外区域或遮罩关闭，由 `RouteDialog` 和 `RouteMessageBox` 强制设置 `closeOnClickModal=false`，调用方不得开启。关闭按钮、取消、提交成功及 Esc 继续遵守各场景原有的关闭保护。

切换标签关闭短时 MessageBox，保留编辑 Dialog 及草稿；缓存返回的读取规则、明确定位与办理核验边界见[架构 §6](architecture.md#6-生命周期与定向刷新)，不得为减少渲染直接禁用 KeepAlive。

有草稿或未确认写意图的 editor 使用 `useTabsStore().registerCloseGuard(routeName, async () => boolean)`，在 `onScopeDispose` 注销。同页可注册多个 guard，全部允许才移出缓存；检查也覆盖非活动标签。提交中返回 false，脏草稿／未知结果须明确确认放弃。普通路由切换不执行关闭 guard，也不丢弃意图。

仓储管理以“物料出入库”和“成品出入库”两个同级菜单进入各自独立的工作标签，页内只用入库／出库页签导航。物料入库、物料出库、成品入库、成品出库四个具名叶路由及 URL 保持稳定，各自保留查询、分页和编辑器，切方向触发原子视图失活。物料父标签为 `warehouse-material-stock-documents`，成品父标签为 `warehouse-finished-stock-documents`；两个父页面分别使用稳定且独立的组件名和缓存身份，编辑器向所属对象的父标签注册 guard，关闭一类标签不保留其缓存或清除另一类草稿。范围准入按已登记场景的查看权限取并集，菜单及默认方向只在本对象范围选择首个可访问方向，具体场景的列表、详情和创建入口仍保留原查看权限。旧入库、出库、其他单和退料地址重定向到相应范围，不另建缓存草稿。

出入库单以方向和 `documentId` 精确读取真实主单，`detailId` 只用于高亮其真实明细；定位不依赖当前筛选页，也不改变分页总数。多个成品入库单共用一个库存批次时，单号仍打开各自主单。旧 `inventoryBatchId` 地址先列出该批次的真实入库来源，由人员选择主单，不能把整个批次当作一张单据。库存流水的单号导航使用服务端返回的主单身份和场景，不从单号前缀推断路由；没有独立页面的盘点来源通过真实详情接口在只读弹窗查看。

缓存多页会占内存，性能排查固定同一组标签往返，比较 GC 后堆、DOM、监听器数量及关闭后的回收；同时用无扩展浏览器核验，不能凭一次 heap 峰值判定泄漏。

## 4. RouteDialog

全局 `<el-dialog>` 由 [RouteDialog](../src/components/RouteDialog.vue) 接管，业务页不直接导入原生 ElDialog，不设置 `append-to-body=true`：

```vue
<el-dialog v-model="visible" title="编辑产品" :width="DialogWidth.md">
  <ProductForm />
</el-dialog>
```

尺寸与正文滚动遵守[视觉规范](visual-design.md#5-弹窗规范)，不逐页复制整体高度约束。用户明确关闭并放弃后才可重置；只读加载可关闭并忽略迟到响应，写入中禁止关闭。

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
