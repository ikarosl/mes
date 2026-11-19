# LODOP 接入

`@company/printing` 拥有浏览器与本机 C-Lodop／Lodop7 服务的连接和标签提交适配；业务条码含义与权限归消费者。本包没有 API、数据库、migration、应用状态或 Web Storage 依赖。

## 来源与加载

[lodop-funcs.ts](../src/lodop-funcs.ts) 基于用户提供的 `LodopFuncs.js`，将其中本机双端口、HTTPS 服务地址与 `getCLodop()` 获取逻辑适配为惰性 TypeScript 模块。本包不保存未使用的 ActiveX／插件分支、启动时连接、`eval`、`alert` 或重写宿主 `body.innerHTML` 的示例代码。

导入包不连接服务。首次检测或打印才顺序加载本机服务提供的 `CLodopfuncs.js`：HTTP 使用 `localhost:8000` 和备用 `localhost:18000`；HTTPS 使用厂商证书地址 `https://localhost.lodop.net:8443`，备用 `https://localhost:8443`，不降级到 HTTP。明确加载失败时清理本包创建的 script、监听与计时器后尝试备用地址；加载超时则提示刷新网页，不再注入另一份可能被迟到脚本覆盖的 SDK。已加载实例在后续主动检测时可重新打开通信连接。运行时 SDK 仍由已安装服务提供；消费者不应额外插入另一份厂商脚本或直接修改全局 C-Lodop 对象。

本机服务需已安装并启动、系统需安装目标标签打印机驱动；浏览器需允许页面访问本机网络，部署的 CSP 需允许对应服务地址的脚本和 WebSocket。HTTPS 需启用本机 8443 服务并具备浏览器信任的证书。服务连通以 WebSocket 已打开为准，避免厂商未就绪时延迟发送打印的行为；协议和端口依据 [官方常见问题](https://www.lodop.net/faq/pp34.html)及 [HTTPS 说明](https://www.lodop.net/faq/pp32.html)。

原生 `GET_PRINTER_COUNT`／`GET_PRINTER_NAME` 读取当前 SDK 实例的驱动列表。新增、删除或改名驱动后应刷新网页，再重新检测；本包不会热重载全局 SDK、并行创建重复连接或自动选择系统默认设备。调用方保存精确打印机名，提交前在同一实例按精确名定位设备，再通过原生选择接口应用；找不到设备直接拒绝。

## 提交与结果

同一页面内检测、配置与打印按调用顺序串行；参数在进入队列前复制，避免等待时被消费者修改。不同浏览器页面／标签页的系统打印队列仍由本机服务与操作系统管理，本包不做跨页锁或服务端重试。

每次作业重新初始化并显式设置设备、毫米纸张和份数；原生 `128Auto` 生成 Code 128 条码，扫描载荷与完整可读文字分开传入，不把二者相互推导。每个标签占一页，设置的份数应用于整份作业。标签布局、纸张规格和打印机驱动需用实际标签纸手工校准并验证扫码；公共基础库不判断业务编号或物理扫描质量。相关原生接口见 [设备选择](https://www.lodop.net/demolist/PrintSample7.html)、[纸张控制](https://www.lodop.net/demolist/PrintSample5.html)及 [原生条码](https://www.lodop.net/demolist/PrintSample11.html)。

`checkLabelPrinter` 仅验证参数、本机通信和目标设备可配置，不打印测试纸，也不能证明打印机在线、纸张已装好或纸面输出成功。`printBarcodeLabels` 对每次 `PRINT` 返回的 TaskID 关联 `On_Return` 回调，保留等待期间的回调并在结束后恢复；不接受其他任务的结果。回调 `true` 仅表示本机服务受理打印命令，Promise 成功不表示物理打印完成，也不回写业务事实，依据 [官方异步回调说明](https://www.lodop.net/blogs/Blog020.html)。

`LodopPrintError.outcome` 为 `rejected` 时，参数／连接／准备失败或本机服务明确拒绝；为 `unknown` 时，已经调用 `PRINT`，但未取得有效 TaskID、通信异常、等待超时或回调结果无法确认，任务可能已进入打印队列。调用方必须提示先核对队列和已出标签，不能自动重试。原生 `PRINT` 的立即返回值不是打印成功标志，即使为 `null` 也不能认定未发送；厂商 SDK 可能仍有延迟发送。
