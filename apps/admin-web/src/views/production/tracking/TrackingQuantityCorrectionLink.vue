<template>
  <el-button
    v-if="canAccessRoute(trackingRoute) && canCorrectTrackingQuantity(card)"
    link
    type="primary"
    :disabled="disabled"
    @click="openCorrection"
    >{{ TRACKING_ACTION_LABELS.quantity }}</el-button
  >
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ProductionTrackingCardItem } from '@company/contracts';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { EMessage } from '../../../utils/message';
import { canCorrectTrackingQuantity, TRACKING_ACTION_LABELS } from './tracking-presentation';

const props = defineProps<{
  card: Pick<
    ProductionTrackingCardItem,
    'id' | 'productionBatchId' | 'cardNo' | 'quantity' | 'status'
  >;
  disabled?: boolean;
}>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const trackingRoute = { name: 'production-tracking' };

async function openCorrection(): Promise<void> {
  const { card, disabled } = props;
  if (disabled || !canAccessRoute(trackingRoute) || !canCorrectTrackingQuantity(card)) return;
  try {
    await router.push({
      ...trackingRoute,
      query: { batchId: card.productionBatchId, cardId: card.id, quantityCorrection: card.cardNo },
    });
  } catch (error) {
    EMessage.error(error, '无法打开盘量更正');
  }
}
</script>
