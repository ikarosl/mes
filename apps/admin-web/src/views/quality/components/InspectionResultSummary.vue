<template>
  <el-descriptions
    :column="6"
    border
    size="small"
  >
    <el-descriptions-item
      label="检验方式"
      :span="3"
      >{{ methodLabel }}</el-descriptions-item
    >
    <el-descriptions-item
      label="质量结论"
      :span="3"
      >{{ decisionLabel }}</el-descriptions-item
    >
    <el-descriptions-item
      :label="sampling ? '样本总数' : '检查总数'"
      :span="2"
      >{{ inspectedQuantity }} {{ unit }}</el-descriptions-item
    >
    <el-descriptions-item
      :label="sampling ? '样本合格' : '合格数'"
      :span="2"
    >
      <InspectionQuantity
        :value="qualifiedQuantity"
        kind="qualified"
        :unit="unit"
      />
    </el-descriptions-item>
    <el-descriptions-item
      :label="sampling ? '样本不合格' : '不合格数'"
      :span="2"
    >
      <InspectionQuantity
        :value="unqualifiedQuantity"
        kind="unqualified"
        :unit="unit"
      />
    </el-descriptions-item>
  </el-descriptions>
</template>
<script setup lang="ts">
import InspectionQuantity from './InspectionQuantity.vue';

defineProps<{
  methodLabel: string;
  decisionLabel: string;
  sampling: boolean;
  inspectedQuantity: number | string;
  qualifiedQuantity: number | string;
  unqualifiedQuantity: number | string;
  unit: string;
}>();
</script>
