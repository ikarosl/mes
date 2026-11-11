<template>
  <div>
    累计已入库 <strong>{{ Number(quantities.inboundQuantity) }}</strong> {{ unit }}
  </div>
</template>
<script setup lang="ts">
import type { PurchaseSupplementReceiptQuantities } from '@company/contracts';
defineOptions({ name: 'SupplementReceiptQuantities' });
defineProps<{ quantities: PurchaseSupplementReceiptQuantities; unit: string }>();
</script>
