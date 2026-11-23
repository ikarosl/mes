# LODOP 接入

`@company/printing` 拥有浏览器与本机 C-Lodop／Lodop7 服务的连接和标签提交适配；业务条码含义与权限归消费者。本包没有 API、数据库、migration、应用状态或 Web Storage 依赖。

## 来源与加载

[lodop-funcs.ts](../src/lodop-funcs.ts) 基于用户提供的 `LodopFuncs.js`，将其中本机双端口、HTTPS 服务地址与 `getCLodop()` 获取逻辑适配为惰性 TypeScript 模块。本包不保存未使用的 ActiveX／插件分支、启动时连接、`eval`、`alert` 或重写宿主 `body.innerHTML` 的示例代码。

导入包不连接服务。首次检测或打印才顺序加载本机服务提供的 `CLodopfuncs.js`：HTTP 使用 `localhost:8000` 和备用 `localhost:18000`；HTTPS 使用厂商证书地址 `https://localhost.lodop.net:8443`，备用 `https://localhost:8443`，不降级到 HTTP。明确加载失败时清理本包创建的 script、监听与计时器后尝试备用地址；加载超时则提示刷新网页，不再注入另一份可能被迟到脚本覆盖的 SDK。已加载实例在后续主动检测时可重新打开通信连接。运行时 SDK 仍由已安装服务提供；消费者不应额外插入另一份厂商脚本或直接修改全局 C-Lodop 对象。

本机服务需已安装并启动、系统需安装目标标签打印机驱动；浏览器需允许页面访问本机网络，部署的 CSP 需允许对应服务地址的脚本和 WebSocket。HTTPS 需启用本机 8443 服务并具备浏览器信任的证书。服务连通以 WebSocket 已打开为准，避免厂商未就绪时延迟发送打印的行为；协议和端口依据 [官方常见问题](https://www.lodop.net/faq/pp34.html)及 [HTTPS 说明](https://www.lodop.net/faq/pp32.html)。

原生 `GET_PRINTER_COUNT`／`GET_PRINTER_NAME` 读取当前 SDK 实例的驱动列表。新增、删除或改名驱动后应刷新网页，再重新检测；本包不会热重载全局 SDK、并行创建重复连接或自动选择系统默认设备。调用方保存精确打印机名，提交前在同一实例按精确名定位设备，再通过原生选择接口应用；找不到设备直接拒绝。

## 提交与结果

同一页面内检测、配置与打印按调用顺序串行；参数在进入队列前复制，避免等待时被消费者修改。不同浏览器页面／标签页的系统打印队列仍由本机服务与操作系统管理，本包不做跨页锁或服务端重试。

每次作业重新初始化，按精确名称选择设备并设置毫米纸张和份数。公共排版器按目标驱动报告的分辨率生成整页 PNG，保留 Code 128 两侧静区，将条码与完整文字整体居中。驱动未提供有效 DPI 时使用 203 DPI，大尺寸图像按同一比例限制栅格像素数，纸张毫米尺寸始终取自工位设置。每页通过 `ADD_PRINT_IMAGE` 从纸张原点等比输出一张原图，整批一次 `PRINT`。实物位置和扫码质量须在目标工位验收。[设备选择](https://www.lodop.net/demolist/PrintSample7.html) · [纸张控制](https://www.lodop.net/demolist/PrintSample5.html) · [图片打印](https://www.lodop.net/demolist/PrintSample8.html)

打印深度（黑度）由工位在 Windows 对应打印队列的“打印首选项”中设置，标签作业沿用驱动配置。更换打印机时在工位选择新队列并按其驱动配置耗材和深度。

`checkLabelPrinter` 只验证参数、本机通信和目标设备可配置，检测及保存均不出纸。自动打印和预览补打均用提交返回的 TaskID 关联 `On_Return` 回调，等待结束后恢复之前的回调。回调 `true` 表示本机服务受理打印命令，实物出纸由现场核对。[官方异步回调说明](https://www.lodop.net/blogs/Blog020.html)

`LodopPrintError.outcome` 为 `rejected` 表示参数、连接、准备失败或本机服务明确拒绝。调用 `PRINT` 后若未取得有效 TaskID、通信异常、超时或回调结果不明，结果为 `unknown`。此时任务可能已进入打印队列，调用方须提示先核对队列和已出标签，再由用户决定是否补打。
