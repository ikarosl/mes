<template>
  <div class="outbound-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane
        label="通用出库"
        name="general"
      />
      <el-tab-pane
        label="生产领料"
        name="production"
      />
    </el-tabs>
    <div v-show="activeTab === 'general'">
      <GeneralOutboundPanel :active="activeTab === 'general'" />
    </div>
    <div v-show="activeTab === 'production'">
      <ProductionMaterialOutboundPanel v-if="productionVisited" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import GeneralOutboundPanel from './components/GeneralOutboundPanel.vue';
import ProductionMaterialOutboundPanel from './components/ProductionMaterialOutboundPanel.vue';
import { RouteMessageBox } from '../../utils/route-message-box';

defineOptions({ name: 'OutboundOrdersPage' });

const activeTab = ref('general');
const productionVisited = ref(false);

watch(activeTab, (value) => {
  RouteMessageBox.close();
  if (value === 'production') productionVisited.value = true;
});
</script>
