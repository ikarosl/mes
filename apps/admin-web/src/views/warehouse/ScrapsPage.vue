<template>
  <section class="availability-panel">
    <el-result
      icon="info"
      title="库存报废管理暂未开放"
      sub-title="当前页面仅展示功能入口，不提供报废单查询、创建、确认或取消能力。"
    >
      <template #extra>
        <el-tag
          type="info"
          effect="plain"
          >能力预告</el-tag
        >
      </template>
    </el-result>

    <el-alert
      title="当前业务边界"
      type="warning"
      :closable="false"
      show-icon
    >
      <p>通用库存报废尚未进入当前正式范围，不会生成报废单或库存流水。</p>
      <p>生产工序异常的报废补产继续在生产模块处理，不属于本页面。</p>
    </el-alert>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'ScrapsPage' });
</script>

<style scoped>
.availability-panel {
  max-width: 920px;
  margin: 0 auto;
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.availability-panel :deep(.el-result) {
  padding: 32px 24px 28px;
}

.availability-panel :deep(.el-alert) {
  align-items: flex-start;
}

.availability-panel :deep(.el-alert__content) {
  padding-bottom: 2px;
}

.availability-panel p {
  margin: 6px 0 0;
  color: #6b7280;
  line-height: 1.6;
}
</style>
