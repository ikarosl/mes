# 动态标签切换与路由弹窗

本文维护 KeepAlive、路由区域弹窗的接入边界；候选所有权与刷新遵守[管理端架构](architecture.md)，尺寸和视觉遵守[视觉设计](visual-design.md)。

## 1. 挂载边界

Dialog 和短时确认框只遮罩 `AdminLayout` 的 `.content`，不阻断菜单、顶部栏和标签栏。Dialog 的 DOM 必须留在所属路由子树，失活隐藏，回来恢复草稿、选择及校验状态；普通编辑不能在 `onDeactivated` 清空。

遮罩固定定位使用布局提供的 `--route-overlay-*` 坐标和尺寸，保证内容区滚动或局部定位不会改变边界。路由内容到弹窗之间不得加会重建固定定位包含块的 transform、filter 或 contain；效果应限在不含弹窗的展示节点。子业务弹窗与父弹窗并列挂载，不能置于父正文滚动区。

## 3. 联动流程

切换标签关闭短时 MessageBox，保留编辑 Dialog 及草稿；重新激活由候选持有者定向刷新，不以缓存候选保证当前资格。报工／追溯的短延时刷新与失败差异见[架构 §6](architecture.md#6-生命周期与定向刷新)，不得为减少渲染直接禁用 KeepAlive。

有草稿或未确认写意图的 editor 使用 `useTabsStore().registerCloseGuard(routeName, async () => boolean)`，在 `onScopeDispose` 注销。同页可注册多个 guard，全部允许才移出缓存；检查也覆盖非活动标签。提交中返回 false，脏草稿／未知结果须明确确认放弃。普通路由切换不执行关闭 guard，也不丢弃意图。

缓存多页会占内存，性能排查固定同一组标签往返，比较 GC 后堆、DOM、监听器数量及关闭后的回收；同时用无扩展浏览器核验，不能凭一次 heap 峰值判定泄漏。

## 4. RouteDialog

全局 `<el-dialog>` 已由 [RouteDialog](../src/components/RouteDialog.vue) 接管，业务页不直接导入原生 ElDialog，不设置 `append-to-body=true`：

```vue
<el-dialog v-model="visible" title="编辑产品" :width="DialogWidth.md">
  <ProductForm />
</el-dialog>
```

普通 Dialog 与 `workbench` 共用挂载区高度 90% 上限、垂直居中及仅正文滚动；无需逐页设置正文 vh 或第二层整体滚动。用户明确关闭并放弃后才可重置；只读加载可关闭并忽略迟到响应，写入中禁止关闭。业务收尾的空记录／结束快照解释见[架构](architecture.md#生产需求收尾与库存)。

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

## 6. Live Options

[buildLiveOptions/hasUnavailableSelection](../src/utils/live-options.ts) 适用于可变外部候选，不用于稳定枚举或普通输入。下面的 `categories` 必须是完整有效候选集；分页／搜索窗口需先解析已选 ID，不能将窗口缺项标失效。

```ts
const selected = computed(() => form.categoryId ? [form.categoryId] : []);
const choices = computed(() =>
  buildLiveOptions(categories.value, selected.value, item => item.id),
);
// 提交前检查；刷新失败的阻断由候选状态另外判断。
const hasInvalidChoice = () =>
  hasUnavailableSelection(categories.value, selected.value, item => item.id);
```

渲染保留 unavailable 的原 ID，显示“已失效”并禁用该项，保存前阻止失效选择。刷新时机和实例归属只维护在[管理端架构](architecture.md#6-生命周期与定向刷新)，不要复制一份生命周期实现。未接入后端的业务不能伪造实时候选。

## 8. 验证重点

按[测试策略](../../../docs/testing-strategy.md)规定阶段核验：非活动页弹窗不遮挡新页；返回恢复草稿；MessageBox 随路由关闭；关闭非活动标签也保护未知意图；正文滚动不裁剪子弹窗；失效候选可见且阻止保存。实现存在不代表 UI 已验收，状态见[路线图](../../../docs/roadmap.md)。
