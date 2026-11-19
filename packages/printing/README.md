# @company/printing

浏览器端本机打印基础设施，供管理端及后续前端共用。公开入口见 [src/index.ts](src/index.ts)，本机服务、回调与提交语义由 [LODOP 接入](docs/lodop.md)维护；不依赖 Vue，也不进入前后端共享纯函数包 `@company/utils`。

默认纸张 60 × 40 mm，尺寸、份数和精确打印机名称由调用方配置。本包不持久化设置，不读取业务数据，不生成或转换业务条码；消费者传入可扫描内容与完整标签文字。

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
