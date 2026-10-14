<template>
  <OtherInventoryOrdersPanel
    direction="inbound"
    route-name="warehouse-inbound"
  />
</template>
<script setup lang="ts">
import OtherInventoryOrdersPanel from './components/OtherInventoryOrdersPanel.vue';
defineOptions({ name: 'OtherInboundsPage' });
</script>
