<template>
  <OtherInventoryOrdersPanel
    direction="outbound"
    route-name="warehouse-other-outbounds"
  />
</template>
<script setup lang="ts">
import OtherInventoryOrdersPanel from './components/OtherInventoryOrdersPanel.vue';
defineOptions({ name: 'OtherOutboundsPage' });
</script>
