<template>
  <section>
    <div class="page-title">
      <div>
        <h2>操作日志</h2>
        <p>认证和 RBAC 关键操作审计</p>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>
    <el-card
      ><el-table :data="rows"
        ><el-table-column prop="created_at" label="时间" width="180" /><el-table-column
          prop="module"
          label="模块" /><el-table-column prop="action" label="动作" /><el-table-column
          prop="user_id"
          label="用户ID" /><el-table-column prop="result" label="结果" /><el-table-column
          prop="ip"
          label="IP" /><el-table-column prop="remark" label="备注" /></el-table
    ></el-card>
  </section>
</template>
<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { systemApi } from '../../api/system';
defineOptions({ name: 'LogsPage' });
const rows = ref<Record<string, unknown>[]>([]);
const load = async () => {
  rows.value = await systemApi.logs();
};
onMounted(load);
onActivated(load);
</script>
