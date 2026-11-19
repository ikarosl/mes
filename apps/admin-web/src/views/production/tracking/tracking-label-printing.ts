import type { ProductionTrackingCardItem } from '@company/contracts';
import { LodopPrintError, type BarcodeLabel } from '@company/printing';
import { encodeTrackingCardBarcode } from '@company/utils';
import { RouteMessageBox } from '../../../utils/route-message-box';

type TrackingLabelCard = Pick<ProductionTrackingCardItem, 'id' | 'cardNo'>;

export function trackingBarcodeLabels(cards: readonly TrackingLabelCard[]): BarcodeLabel[] {
  return cards.map((card) => ({
    barcode: encodeTrackingCardBarcode(card.cardNo),
    text: card.cardNo,
  }));
}

export function trackingPrintFailure(error: unknown): { message: string; unknown: boolean } {
  const reason = error instanceof Error ? error.message : '标签打印未能确认提交';
  const unknown = !(error instanceof LodopPrintError) || error.outcome === 'unknown';
  if (unknown)
    return {
      message: `${reason} 打印结果待确认，请先核对打印队列和实物，再补打原标签，避免重复打印。`,
      unknown,
    };
  return { message: `${reason} 可调整打印设置后补打原标签。`, unknown };
}

export async function confirmTrackingLabelReprint(unknown: boolean): Promise<boolean> {
  if (!unknown) return true;
  try {
    await RouteMessageBox.confirm(
      '上次打印结果待确认，请先核对打印队列和实物。确认仍需补打所选原标签？',
      '核对后补打',
      { type: 'warning', confirmButtonText: '确认补打' },
    );
    return true;
  } catch {
    return false;
  }
}
