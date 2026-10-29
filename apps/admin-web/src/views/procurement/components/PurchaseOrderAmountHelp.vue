<template>
  <p>
    <strong>自动含税总额 = 无税单价 × 采购数量 ×（1 + 税率 ÷ 100）。</strong><br />
    手填总额优先；未填无税单价时不推算。含税单价仅作记录，不参与推算。<br />
    <slot name="editing-scope"> 下单后采购数量锁定，可在“查看/编辑”更正单价、税率及总额。 </slot>
    <slot />
  </p>
</template>

<script setup lang="ts">
defineOptions({ name: 'PurchaseOrderAmountHelp' });
</script>
