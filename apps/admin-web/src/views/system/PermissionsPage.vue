<template>
  <section>
    <div class="page-title">
      <div>
        <h2>权限管理</h2>
        <p>权限编码是前后端统一的授权契约</p>
      </div>
    </div>
    <el-card
      ><el-table :data="rows"
        ><el-table-column prop="name" label="权限名称" /><el-table-column
          prop="code"
          label="权限编码"
        /><el-table-column prop="type" label="类型" /><el-table-column
          prop="routePath"
          label="路由"
        /><el-table-column label="状态"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
              row.status === 1 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        ></el-table
      ></el-card
    >
  </section>
</template>
<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import type { PermissionListItem } from '@company/contracts';
import { systemApi } from '../../api/system';
defineOptions({ name: 'PermissionsPage' });
const rows = ref<PermissionListItem[]>([]);
const load = async () => {
  rows.value = await systemApi.permissions();
};
onMounted(load);
onActivated(load);
</script>
