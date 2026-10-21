<template>
  <el-dialog
    :model-value="visible"
    title="选择需求所属工单"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      inline
      @submit.prevent="search"
    >
      <el-form-item label="工单编号"
        ><el-input
          v-model="keyword"
          clearable
      /></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          native-type="submit"
          :loading="loading"
          >查询</el-button
        ></el-form-item
      >
    </el-form>
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="id"
      empty-text="没有包含可采购需求的工单"
    >
      <el-table-column
        prop="workOrderNo"
        label="工单编号"
      />
      <el-table-column
        label="操作"
        width="100"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="$emit('selected', row)"
            >选择</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { onActivated, ref, watch } from 'vue';
import type { ProcurementDemandWorkOrder } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
const props = defineProps<{ visible: boolean }>();
defineEmits<{ 'update:visible': [boolean]; selected: [ProcurementDemandWorkOrder] }>();
const keyword = ref(''),
  rows = ref<ProcurementDemandWorkOrder[]>([]),
  loading = ref(false),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
async function load() {
  if (!props.visible || !read.isActive()) return;
  const current = read.begin(() => props.visible);
  loading.value = true;
  try {
    const result = await procurementApi.demandWorkOrders(
      { keyword: keyword.value.trim() || undefined, page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '工单候选加载失败');
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function search() {
  page.value = 1;
  await load();
}
async function changePage(value: number) {
  page.value = value;
  await load();
}
async function changePageSize(value: number) {
  pageSize.value = value;
  await search();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      page.value = 1;
      void load();
    } else read.invalidate();
  },
);
onActivated(() => {
  if (props.visible) void load();
});
</script>
