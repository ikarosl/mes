// Both callers alias the mark as m. Nested locking reads keep the chosen
// revision current after a command waits for the card lock.
export function trackingEffectiveScrapJoins(lock = false): string {
  const suffix = lock ? ' FOR SHARE' : '';
  return `
 LEFT JOIN production_tracking_item_mark_scrap original_scrap ON original_scrap.item_mark_id=m.id
  AND NOT EXISTS (
   SELECT 1 FROM production_tracking_abnormality_handling h
   JOIN production_tracking_abnormality_adjustment d ON d.abnormality_id=h.abnormality_id
   WHERE h.id=original_scrap.handling_id${suffix}
  )
 LEFT JOIN production_tracking_abnormality_handling original_handling ON original_handling.id=original_scrap.handling_id
 LEFT JOIN production_tracking_abnormality_adjustment_item_mark adjusted_mark
  ON adjusted_mark.item_mark_id=m.id AND adjusted_mark.set_kind='after'
  AND EXISTS (
   SELECT 1 FROM production_tracking_abnormality_adjustment d
   WHERE d.id=adjusted_mark.adjustment_id AND d.kind='correct' AND NOT EXISTS (
    SELECT 1 FROM production_tracking_abnormality_adjustment later
    WHERE later.abnormality_id=d.abnormality_id AND later.version>d.version${suffix}
   )${suffix}
  )
 LEFT JOIN production_tracking_abnormality_adjustment adjusted_scrap ON adjusted_scrap.id=adjusted_mark.adjustment_id`;
}

export const TRACKING_EFFECTIVE_SCRAP_ABNORMALITY =
  'COALESCE(original_handling.abnormality_id,adjusted_scrap.abnormality_id)';
