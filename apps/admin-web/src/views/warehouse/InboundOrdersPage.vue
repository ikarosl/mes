<template>
  <div class="inbound-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane
        label="外购物料入库"
        name="purchase"
      />
      <el-tab-pane
        label="成品入库"
        name="finished"
      />
    </el-tabs>
    <div v-show="activeTab === 'purchase'">
      <PurchaseInboundPanel :active="activeTab === 'purchase'" />
    </div>
    <div v-show="activeTab === 'finished'">
      <FinishedGoodsInboundPanel
        v-if="finishedVisited"
        :requested-inbound-id="requestedInboundId"
        :active="activeTab === 'finished'"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PurchaseInboundPanel from './components/PurchaseInboundPanel.vue';
import FinishedGoodsInboundPanel from './components/FinishedGoodsInboundPanel.vue';
defineOptions({ name: 'InboundOrdersPage' });
const activeTab = ref('purchase'),
  finishedVisited = ref(false),
  requestedInboundId = ref<string | null>(null);
const route = useRoute();
watch(
  () => [route.name, route.query.inboundId] as const,
  ([routeName, id]) => {
    if (routeName === 'warehouse-inbound' && typeof id === 'string' && id) {
      requestedInboundId.value = id;
      finishedVisited.value = true;
      activeTab.value = 'finished';
    } else {
      // 清除导航请求，不关闭或重置缓存中的业务草稿；再次进入同一单据可重新触发定位。
      requestedInboundId.value = null;
    }
  },
  { immediate: true },
);
watch(activeTab, (value) => {
  if (value === 'finished') finishedVisited.value = true;
});
</script>
