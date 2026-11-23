import { readonly, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { LabelPrintSettings } from '@company/printing';
import { useLabelPrinterStore } from '../../stores/label-printer';

type LabelPrinterStore = ReturnType<typeof useLabelPrinterStore>;

export function useLabelPrinter(): {
  settings: Readonly<Ref<LabelPrintSettings>>;
  busy: Readonly<Ref<boolean>>;
  runOperation: LabelPrinterStore['runOperation'];
  saveSettings: LabelPrinterStore['saveSettings'];
} {
  const store = useLabelPrinterStore();
  const { settings, busy } = storeToRefs(store);
  return {
    settings: readonly(settings),
    busy: readonly(busy),
    runOperation: store.runOperation,
    saveSettings: store.saveSettings,
  };
}
