<template>
  <section>
    <div class="toolbar">
      <p class="muted">质检仅留存当时记录，不改写产线草稿。复检新增记录，历史记录不可覆盖。</p>
      <el-button
        type="primary"
        :disabled="
          !detail.canRecordInspection ||
          busy ||
          unresolved ||
          Boolean(error) ||
          dirty ||
          inspectionOpen
        "
        @click="$emit('start')"
        >{{ detail.inspections.length ? '新增复检记录' : '登记线下质检' }}</el-button
      >
    </div>
    <p
      v-if="dirty"
      class="muted"
    >
      产出草稿存在未保存修改，请先保存草稿，再登记质检。
    </p>
    <el-alert
      v-if="inspectionStale"
      title="申报内容已被其他操作更新，请放弃本次填写后重新登记质检。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <el-form
      v-if="inspectionOpen"
      label-position="top"
      :disabled="busy || unresolved || Boolean(error)"
      class="inspection-form"
    >
      <p>
        本次留存申报版本 {{ declaredVersion }}：计划内 {{ declared.availableQuantity }} / 计划外
        {{ declared.extraQuantity }} / 新增报废 {{ declared.additionalScrapQuantity }}。
      </p>
      <div class="quantity-fields">
        <el-form-item
          label="实检计划内合格数"
          required
          ><el-input-number
            :model-value="inspection.availableQuantity"
            :min="0"
            :max="Number(detail.check.plannedQuantity)"
            :precision="0"
            @update:model-value="
              (value: number | undefined) =>
                $emit('change', { availableQuantity: value ?? Number.NaN })
            "
        /></el-form-item>
        <el-form-item
          label="实检计划外合格数"
          required
          ><el-input-number
            :model-value="inspection.extraQuantity"
            :min="0"
            :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
            :precision="0"
            @update:model-value="
              (value: number | undefined) => $emit('change', { extraQuantity: value ?? Number.NaN })
            "
        /></el-form-item>
        <el-form-item
          label="实检新增成品报废"
          required
          ><el-input-number
            :model-value="inspection.additionalScrapQuantity"
            :min="0"
            :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
            :precision="0"
            @update:model-value="
              (value: number | undefined) =>
                $emit('change', { additionalScrapQuantity: value ?? Number.NaN })
            "
        /></el-form-item>
      </div>
      <el-form-item
        label="线下检验时间"
        required
        ><el-date-picker
          :model-value="inspection.inspectedAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          @update:model-value="
            (value: string | null) => $emit('change', { inspectedAt: value ?? '' })
          "
      /></el-form-item>
      <el-form-item
        label="检验结果说明"
        required
        ><el-input
          :model-value="inspection.resultNote"
          type="textarea"
          :rows="2"
          maxlength="5000"
          show-word-limit
          @update:model-value="(value: string) => $emit('change', { resultNote: value ?? '' })"
      /></el-form-item>
      <el-form-item label="凭据编号 / 存放位置"
        ><el-input
          :model-value="inspection.evidenceReference"
          type="textarea"
          :rows="2"
          maxlength="2000"
          placeholder="填写线下质检单编号或凭据位置"
          @update:model-value="
            (value: string) => $emit('change', { evidenceReference: value ?? '' })
          "
      /></el-form-item>
      <div class="toolbar">
        <el-button @click="$emit('discard')">放弃填写</el-button
        ><el-button
          type="primary"
          :disabled="!inspectionValid || inspectionStale || dirty"
          :loading="submitting"
          @click="$emit('record')"
          >留存本次质检记录</el-button
        >
      </div>
    </el-form>
    <el-empty
      v-if="!detail.inspections.length && !inspectionOpen"
      description="尚未留存质检记录，保存产线草稿后可登记"
      :image-size="72"
    />
    <el-collapse v-model="inspectionPanels">
      <el-collapse-item
        v-for="record in detail.inspections"
        :key="record.id"
        :name="record.id"
        :title="`质检 #${record.id} · ${record.createdByName} · ${record.inspectedAt}${record.id === detail.latestInspectionId ? ' · 最新记录' : ''}`"
      >
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="当时申报版本">{{
            record.declaredVersion
          }}</el-descriptions-item>
          <el-descriptions-item label="前次记录">{{
            record.previousInspectionId ? `#${record.previousInspectionId}` : '首次检验'
          }}</el-descriptions-item>
          <el-descriptions-item label="登记时间">{{ record.createdAt }}</el-descriptions-item>
          <el-descriptions-item
            label="当时申报（计划内 / 外 / 报废）"
            :span="3"
            >{{ record.declared.availableQuantity }} / {{ record.declared.extraQuantity }} /
            {{ record.declared.additionalScrapQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            label="实检记录（计划内 / 外 / 报废）"
            :span="3"
            >{{ record.inspected.availableQuantity }} / {{ record.inspected.extraQuantity }} /
            {{ record.inspected.additionalScrapQuantity }}</el-descriptions-item
          >
          <el-descriptions-item
            label="检验结果"
            :span="3"
            >{{ record.resultNote }}</el-descriptions-item
          >
          <el-descriptions-item
            label="凭据参考"
            :span="3"
            >{{ record.evidenceReference || '未填写' }}</el-descriptions-item
          >
        </el-descriptions>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type { ProductionOutputDetail, ProductionOutputQuantities } from '@company/contracts';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
defineProps<{
  detail: ProductionOutputDetail;
  declared: ProductionOutputQuantities;
  declaredVersion: number | null;
  inspection: ProductionOutputQuantities & {
    inspectedAt: string;
    resultNote: string;
    evidenceReference: string;
  };
  inspectionOpen: boolean;
  inspectionStale: boolean;
  inspectionValid: boolean;
  busy: boolean;
  unresolved: boolean;
  error: string;
  dirty: boolean;
  submitting: boolean;
}>();
defineEmits<{
  start: [];
  record: [];
  discard: [];
  change: [
    Partial<
      ProductionOutputQuantities & {
        inspectedAt: string;
        resultNote: string;
        evidenceReference: string;
      }
    >,
  ];
}>();
const inspectionPanels = ref<string[]>([]);
</script>
<style scoped>
.toolbar,
.quantity-fields {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.quantity-fields {
  justify-content: flex-start;
  gap: 32px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.inspection-form {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}
.notice {
  margin-top: 12px;
}
</style>
