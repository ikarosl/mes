<template>
  <el-tooltip
    v-if="labels.length"
    placement="top"
    effect="light"
    :trigger="['hover', 'focus']"
    :show-after="200"
  >
    <template #content>
      <div
        class="full-tags"
        aria-label="全部异常标签"
      >
        <el-tag
          v-for="label in labels"
          :key="label"
          type="info"
          effect="plain"
        >
          {{ label }}
        </el-tag>
      </div>
    </template>
    <div
      class="compact-tags"
      :class="{ 'has-more': labels.length > 2 }"
      tabindex="0"
      role="group"
      :aria-label="`异常标签：${labels.join('；')}`"
      @click.stop
    >
      <el-tag
        v-for="label in labels.slice(0, 2)"
        :key="label"
        class="compact-tag"
        type="info"
        effect="light"
        size="small"
      >
        <span class="tag-text">{{ label }}</span>
      </el-tag>
      <el-tag
        v-if="labels.length > 2"
        class="more-tags"
        size="small"
        type="info"
      >
        +{{ labels.length - 2 }}
      </el-tag>
    </div>
  </el-tooltip>
  <span v-else>—</span>
</template>

<script setup lang="ts">
defineOptions({ name: 'TrackingAbnormalityTags' });
defineProps<{ labels: string[] }>();
</script>

<style scoped>
.compact-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 3px 0;
}
.compact-tags:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: var(--el-border-radius-base);
}
.compact-tag {
  flex: none;
  min-width: 0;
  max-width: calc((100% - 6px) / 2);
}
.compact-tag:only-child {
  max-width: 100%;
}
.has-more .compact-tag {
  max-width: calc((100% - 52px) / 2);
}
.compact-tag :deep(.el-tag__content) {
  min-width: 0;
  overflow: hidden;
}
.tag-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.more-tags {
  flex: none;
}
.full-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: min(480px, calc(100vw - 48px));
  max-height: 40vh;
  overflow: auto;
}
.full-tags .el-tag {
  height: auto;
  min-height: 24px;
  max-width: 100%;
  padding: 3px 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
</style>
