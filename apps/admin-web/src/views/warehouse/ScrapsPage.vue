<template>
  <div class="scraps-page">
    <section class="query-panel">
      <el-form
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键词"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="损耗单、批次、工单或物料"
        /></el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              v-for="(label, value) in scrapStatusLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          ><el-button @click="resetQuery">重置</el-button></el-form-item
        >
      </el-form>
    </section>

    <el-alert
      class="scope-alert"
      title="当前只开放生产领料损耗：确认后固定按同物料、同单位、同数量生成损耗补料需求，不回收或增加产品生产授权。"
      type="info"
      :closable="false"
      show-icon
    />

    <section class="table-panel">
      <TableToolbar :total="total">
        <template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="openCreate"
            >申报领料损耗</el-button
          ></template
        >
        <template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="loadRows"
        /></template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        empty-text="暂无生产领料损耗记录"
      >
        <el-table-column
          prop="scrapNo"
          label="损耗单号"
          min-width="190"
        />
        <el-table-column
          label="生产来源"
          min-width="220"
          ><template #default="{ row }"
            ><div class="primary-cell">{{ row.batchNo }}</div>
            <div class="secondary-cell">
              {{ row.workOrderNo }} · {{ row.productCode }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="损耗物料"
          min-width="230"
          ><template #default="{ row }"
            ><div class="primary-cell">{{ row.itemCode }} · {{ row.itemName }}</div>
            <div class="secondary-cell">库存批次 {{ row.batchCode }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="损耗数量"
          width="135"
          ><template #default="{ row }"
            >{{ quantity(row.scrapQuantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          prop="reasonType"
          label="损耗原因"
          min-width="145"
        />
        <el-table-column
          label="补料状态"
          width="125"
          ><template #default="{ row }"
            ><el-tag
              v-if="row.supplement"
              effect="plain"
              :type="row.supplement.status === 'fulfilled' ? 'success' : 'warning'"
              >{{ row.supplement.status === 'fulfilled' ? '已补料领用' : '待补料领用' }}</el-tag
            ><span
              v-else
              class="secondary-cell"
              >待确认损耗</span
            ></template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          width="105"
          ><template #default="{ row }"
            ><el-tag :type="statusTag(row.status)">{{
              scrapStatusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="取消信息"
          min-width="220"
        >
          <template #default="{ row }">
            <template v-if="row.status === 'cancelled'">
              <div>{{ row.cancelReason || '-' }}</div>
              <div class="secondary-cell">
                {{ row.cancelledByName || '-' }} · {{ formatDateTimeForDisplay(row.cancelledAt) }}
              </div>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="190"
          fixed="right"
          ><template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              link
              type="success"
              :loading="pendingAction === `confirm:${row.id}`"
              @click="confirmLoss(row)"
              >确认并补料</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              link
              :loading="pendingAction === `cancel:${row.id}`"
              @click="cancelLoss(row)"
              >取消</el-button
            >
          </template></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="query.page"
        :page-size="query.pageSize"
        @update:page-size="pageSizeChanged"
        @page-change="pageChanged"
      />
    </section>

    <el-dialog
      v-model="createVisible"
      title="申报生产领料损耗"
      width="980px"
      :close-on-click-modal="false"
    >
      <el-alert
        title="请选择已经确认领料的物料。损耗确认后系统固定一比一生成补料需求，不能选择不补料或修改补料数量。"
        type="warning"
        :closable="false"
      />
      <el-form
        class="loss-form"
        label-width="100px"
      >
        <el-form-item
          label="生产批次"
          required
          ><el-select
            v-model="form.productionBatchId"
            filterable
            :loading="optionsLoading"
            @change="batchChanged"
            ><el-option
              v-for="item in batchOptions"
              :key="item.productionBatchId"
              :label="`${item.batchNo} · ${item.workOrderNo} · ${item.productCode}`"
              :value="item.productionBatchId" /></el-select
        ></el-form-item>
        <el-form-item
          label="领料明细"
          required
        >
          <el-table
            v-loading="candidatesLoading"
            :data="candidates"
            max-height="300"
            empty-text="该批次暂无可申报损耗的已领物料"
          >
            <el-table-column width="52"
              ><template #default="{ row }"
                ><el-radio
                  v-model="form.allocationId"
                  :value="row.allocationId" /></template
            ></el-table-column>
            <el-table-column
              prop="itemCode"
              label="物料编码"
              width="140"
            /><el-table-column
              prop="itemName"
              label="物料名称"
              min-width="180"
            /><el-table-column
              prop="batchCode"
              label="库存批次"
              width="150"
            />
            <el-table-column
              label="已领/可损耗"
              width="180"
              ><template #default="{ row }"
                >{{ quantity(row.confirmedOutboundQuantity) }} /
                {{ quantity(row.availableLossQuantity) }} {{ row.unit }}</template
              ></el-table-column
            >
          </el-table>
        </el-form-item>
        <el-form-item
          label="损耗数量"
          required
          ><el-input-number
            v-model="form.scrapQuantity"
            :min="1"
            :step="1"
            :precision="0"
            :max="scrapInputMax"
          /><span class="unit-hint">{{ selectedCandidate?.unit || '' }}</span></el-form-item
        >
        <el-form-item
          label="损耗原因"
          required
          ><el-input
            v-model="form.reasonType"
            maxlength="50"
            placeholder="例如：搬运损坏、现场遗失、加工前破损"
        /></el-form-item>
        <el-form-item label="备注"
          ><el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="5000"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="submitting"
          @click="submitCreate"
          >提交损耗申报</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  ScrapStatus,
} from '@company/contracts';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import { warehouseApi } from '../../api/warehouse';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import { scrapStatusLabel, scrapStatusLabels } from '../../constants/business-status';
import { EMessage } from '../../utils/message';
import { RouteMessageBox } from '../../utils/route-message-box';
import { formatDateTimeForDisplay } from '../../utils/date';

defineOptions({ name: 'ScrapsPage' });
const query = reactive<{ page: number; pageSize: number; keyword: string; status?: ScrapStatus }>({
  page: 1,
  pageSize: 20,
  keyword: '',
});
const rows = ref<MaterialLossItem[]>([]);
const total = ref(0);
const loading = ref(false);
const pendingAction = ref('');
const createVisible = ref(false);
const submitting = ref(false);
const optionsLoading = ref(false);
const candidatesLoading = ref(false);
const batchOptions = ref<MaterialLossBatchOption[]>([]);
const candidates = ref<MaterialLossCandidateItem[]>([]);
const form = reactive({
  productionBatchId: '',
  allocationId: '',
  scrapQuantity: 1,
  reasonType: '',
  remark: '',
});
const createIntent = useIdempotentIntent();
const confirmIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
const selectedCandidate = computed(() =>
  candidates.value.find((item) => item.allocationId === form.allocationId),
);
const selectedMax = computed(() => Number(selectedCandidate.value?.availableLossQuantity ?? 0));
// 未选中候选或可损耗量为 0 时 max 会小于 min，需保证 max 不低于 min，避免 InputNumber 校验报错
const scrapInputMax = computed(() => Math.max(selectedMax.value, 1));

async function loadRows() {
  loading.value = true;
  try {
    const result = await warehouseApi.listMaterialLosses({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword.trim() || undefined,
      status: query.status,
    });
    rows.value = result.items;
    total.value = result.total;
  } catch (error) {
    EMessage.error(error, '生产领料损耗加载失败');
  } finally {
    loading.value = false;
  }
}
async function openCreate() {
  Object.assign(form, {
    productionBatchId: '',
    allocationId: '',
    scrapQuantity: 1,
    reasonType: '',
    remark: '',
  });
  candidates.value = [];
  createVisible.value = true;
  optionsLoading.value = true;
  try {
    batchOptions.value = await warehouseApi.listMaterialLossBatchOptions();
  } catch (error) {
    EMessage.error(error, '生产批次候选加载失败');
  } finally {
    optionsLoading.value = false;
  }
}
async function batchChanged(batchId: string) {
  form.allocationId = '';
  candidates.value = [];
  if (!batchId) return;
  candidatesLoading.value = true;
  try {
    candidates.value = await warehouseApi.listMaterialLossCandidates(batchId);
  } catch (error) {
    EMessage.error(error, '已领物料候选加载失败');
  } finally {
    candidatesLoading.value = false;
  }
}
async function submitCreate() {
  if (!form.productionBatchId || !selectedCandidate.value)
    return EMessage.warning('请选择生产批次和领料明细');
  if (
    !Number.isInteger(form.scrapQuantity) ||
    form.scrapQuantity <= 0 ||
    form.scrapQuantity > selectedMax.value
  )
    return EMessage.warning('损耗数量必须大于零且不能超过当前可申报数量');
  if (!form.reasonType.trim()) return EMessage.warning('请填写损耗原因');
  const payload = {
    productionBatchId: form.productionBatchId,
    allocationId: form.allocationId,
    scrapQuantity: form.scrapQuantity,
    reasonType: form.reasonType.trim(),
    remark: form.remark.trim() || null,
  };
  submitting.value = true;
  try {
    await createIntent.execute(
      { intentType: 'production.material-loss.create', params: {}, query: {}, body: payload },
      (key) => warehouseApi.createMaterialLoss(payload, key),
    );
    createVisible.value = false;
    query.page = 1;
    EMessage.success('生产领料损耗已提交，等待管理员确认');
    await loadRows();
  } catch (error) {
    EMessage.error(error, '生产领料损耗提交失败');
  } finally {
    submitting.value = false;
  }
}
async function confirmLoss(row: MaterialLossItem) {
  try {
    await RouteMessageBox.confirm(
      `确认 ${row.itemCode} 损耗 ${quantity(row.scrapQuantity)} ${row.unit}？确认后将自动生成完全等量的损耗补料需求，产品生产授权上限保持不变。`,
      '确认生产领料损耗',
      { type: 'warning', confirmButtonText: '确认并生成补料' },
    );
    pendingAction.value = `confirm:${row.id}`;
    const intent = confirmIntents.get(row.id) ?? useIdempotentIntent();
    confirmIntents.set(row.id, intent);
    await intent.execute(
      {
        intentType: 'production.material-loss.confirm',
        params: { scrapId: row.id },
        query: {},
        body: { version: row.version },
      },
      (key) => warehouseApi.confirmMaterialLoss(row.id, row.version, key),
    );
    EMessage.success('损耗已确认，等量补料需求已生成');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '确认损耗失败');
  } finally {
    pendingAction.value = '';
  }
}
async function cancelLoss(row: MaterialLossItem) {
  try {
    const { value } = await RouteMessageBox.prompt(
      `确认取消损耗单 ${row.scrapNo}？请输入取消原因。`,
      '取消损耗申报',
      {
        type: 'warning',
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputType: 'textarea',
        inputPlaceholder: '请填写取消原因',
        inputValidator: cancellationReasonValidator,
      },
    );
    pendingAction.value = `cancel:${row.id}`;
    await warehouseApi.cancelMaterialLoss(row.id, { version: row.version, reason: value.trim() });
    EMessage.success('损耗申报已取消');
    await loadRows();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, '取消损耗失败');
  } finally {
    pendingAction.value = '';
  }
}

const cancellationReasonValidator = (input: string) =>
  input.trim() ? input.trim().length <= 5000 || '取消原因不能超过 5000 个字符' : '请填写取消原因';
function search() {
  query.page = 1;
  void loadRows();
}
function resetQuery() {
  query.keyword = '';
  query.status = undefined;
  search();
}
function pageSizeChanged(value: number) {
  query.pageSize = value;
  query.page = 1;
  void loadRows();
}
function pageChanged(value: number) {
  query.page = value;
  void loadRows();
}
const quantity = (value: string | number) => Number(value).toFixed(0);
const statusTag = (status: ScrapStatus) =>
  status === 'confirmed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';
onMounted(loadRows);
onActivated(loadRows);
</script>

<style scoped>
.scraps-page {
  display: grid;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  padding: 16px 16px 0;
}
.scope-alert {
  border-radius: 8px;
}
.primary-cell {
  color: #303133;
  font-weight: 500;
}
.secondary-cell {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
.loss-form {
  margin-top: 20px;
}
.loss-form :deep(.el-select),
.loss-form :deep(.el-input) {
  width: 100%;
}
.unit-hint {
  margin-left: 10px;
  color: #606266;
}
</style>
