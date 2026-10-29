<template>
  <div class="association-target-picker">
    <el-form
      class="target-search"
      @submit.prevent="$emit('search')"
    >
      <el-input
        :model-value="keyword"
        :disabled="disabled"
        aria-label="目标质检主单搜索"
        clearable
        maxlength="100"
        placeholder="按质检单号或备注搜索"
        @update:model-value="$emit('update:keyword', $event)"
      />
      <el-button
        :loading="loading"
        :disabled="disabled"
        native-type="submit"
        >查询</el-button
      >
    </el-form>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
    >
      <el-button
        link
        type="primary"
        :disabled="disabled"
        @click="$emit('retry')"
        >重试目标主单</el-button
      >
    </el-alert>
    <p
      v-if="selectedTarget"
      class="selected-target"
    >
      已选目标： <strong class="identity-value">{{ selectedTarget.inspectionNo }}</strong>
    </p>
    <div
      v-loading="loading"
      class="target-list"
    >
      <el-empty
        v-if="!loading && !error && !targets.length"
        description="未找到目标主单"
        :image-size="48"
      />
      <div
        v-for="target in targets"
        :key="target.id"
        class="target-row"
        :class="{ 'target-row--selected': selectedTarget?.id === target.id }"
        :data-order-id="target.id"
      >
        <el-radio
          :model-value="selectedTarget?.id"
          :value="target.id"
          :disabled="disabled || loading || Boolean(error) || target.id === prohibitedId"
          @change="$emit('choose', target)"
        >
          <span class="target-identity">
            <strong class="identity-value">{{ target.inspectionNo }}</strong>
            <el-tag
              v-if="target.id === prohibitedId"
              type="info"
              size="small"
              effect="plain"
              >当前主单</el-tag
            >
          </span>
          <span class="target-remark">{{ target.remark || '未填写备注' }}</span>
        </el-radio>
      </div>
    </div>
    <PaginationFooter
      :current-page="page"
      :page-size="10"
      :total="total"
      :show-page-size="false"
      :disabled="loading || disabled"
      layout="prev, pager, next"
      compact
      total-suffix="张主单"
      @page-change="$emit('pageChange', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderReference,
} from '@company/contracts';
import PaginationFooter from '../../../components/PaginationFooter.vue';

defineOptions({ name: 'IncomingInspectionAssociationTargetPicker' });
defineProps<{
  targets: QualityIncomingInspectionOrderItem[];
  keyword: string;
  page: number;
  total: number;
  loading: boolean;
  error: string;
  selectedTarget: QualityIncomingInspectionOrderReference | null;
  prohibitedId?: string;
  disabled: boolean;
}>();
defineEmits<{
  'update:keyword': [value: string];
  search: [];
  retry: [];
  pageChange: [value: number];
  choose: [value: QualityIncomingInspectionOrderItem];
}>();
</script>

<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.association-target-picker {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}
.target-search {
  display: flex;
  gap: 8px;
}
.target-list {
  flex: 1;
  min-height: 90px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.target-row {
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.target-row--selected {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.target-row .el-radio {
  display: flex;
  align-items: flex-start;
  width: 100%;
  height: auto;
  margin: 0;
}
.target-row :deep(.el-radio__input) {
  padding-top: 3px;
}
.target-row :deep(.el-radio__label) {
  min-width: 0;
  white-space: normal;
  line-height: 1.5;
}
.target-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.target-remark {
  display: block;
  margin-top: 4px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.selected-target {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  overflow-wrap: anywhere;
}
</style>
