# @company/printing

浏览器端本机打印基础设施，供管理端及后续前端共用。公开入口见 [src/index.ts](src/index.ts)，本机服务、回调与提交语义由 [LODOP 接入](docs/lodop.md)维护；不依赖 Vue，也不进入前后端共享纯函数包 `@company/utils`。

默认纸张 60 × 40 mm。调用方传入条码内容、完整标签文字、纸张尺寸、份数和目标打印机名称。自动打印使用公共排版器生成整页 PNG。有预览的页面用 `renderBarcodeLabel` 生成原图，并用 `printLabelImages` 提交已选原图。

```ts
import {
  DEFAULT_LABEL_PRINT_SETTINGS,
  getLodopPrinters,
  printBarcodeLabels,
} from '@company/printing';

const { printers } = await getLodopPrinters();
// 由用户明确选择 printers 中的名称，不能以系统默认设备替代。
const settings = { ...DEFAULT_LABEL_PRINT_SETTINGS, printerName: selectedPrinterName };
await printBarcodeLabels([{ barcode: compactBarcode, text: fullCardNo }], settings);
```

## 验证

```text
corepack pnpm --filter @company/printing typecheck
corepack pnpm --filter @company/printing build
```

正式测试按 [测试策略](../../docs/testing-strategy.md)及授权阶段执行；连接失败、回调关联／超时、并发隔离及打印布局仍待授权后补充正式用例。类型与构建通过不代表本机出纸或扫码验收通过。
