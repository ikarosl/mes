import { watch, type WatchSource } from 'vue';
import { useSerialScanner } from './use-serial-scanner';

function canReceivePageScan(): boolean {
  const overlays = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [role="combobox"][aria-expanded="true"]',
  );
  return !Array.from(overlays).some((element) => element.getClientRects().length > 0);
}

/** Only the active page owns complete scans. A context change discards any unfinished frame. */
export function useActivePageSerialScan(
  active: () => boolean,
  context: WatchSource[],
  onScan: (code: string) => void | Promise<void>,
): void {
  const scanner = useSerialScanner();
  watch(
    active,
    (isActive, _, onCleanup) => {
      if (!isActive) return;
      const subscription = scanner.subscribe({ canReceive: canReceivePageScan, onScan });
      const stopWatchingContext = watch(context, subscription.invalidate, { flush: 'sync' });
      onCleanup(() => {
        subscription.unsubscribe();
        stopWatchingContext();
      });
    },
    { immediate: true, flush: 'sync' },
  );
}
