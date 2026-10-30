<template>
  <p>
    <strong>自动含税总额 = 含税单价 × 采购数量。</strong><br />
    <strong
      ><span style="color: var(--el-color-danger)">未填</span>含税单价时，按无税单价 × 采购数量 ×（1
      + 税率 ÷ 100）推算。</strong
    ><br />
    手填总额用于精度修正并优先采用；两项单价都填时按含税单价推算，都未填时不推算。<br />
    <slot name="editing-scope"> 下单后采购数量锁定，可在“查看/编辑”更正单价、税率及总额。 </slot>
    <slot />
  </p>
</template>

<script setup lang="ts">
defineOptions({ name: 'PurchaseOrderAmountHelp' });
</script>
