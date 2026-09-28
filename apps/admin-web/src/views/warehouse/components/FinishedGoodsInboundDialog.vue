<template>
  <el-dialog
    :model-value="visible"
    :title="inboundId ? '成品入库详情' : '确认成品入库'"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="close"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <template v-if="inboundId">
      <div v-loading="loading">
        <el-alert
          v-if="error"
          type="error"
          :title="error"
          :closable="false"
        />
        <template v-if="detail">
          <el-descriptions
            :column="3"
            border
          >
            <el-descriptions-item label="入库单">{{ detail.inboundNo }}</el-descriptions-item>
            <el-descriptions-item label="工单 / 任务"
              >{{ detail.workOrderNo }} / {{ detail.batchNo }}</el-descriptions-item
            >
            <el-descriptions-item label="成品"
              >{{ detail.productCode }} · {{ detail.productName }}</el-descriptions-item
            >
            <el-descriptions-item label="确认时间">{{
              formatDateTimeForDisplay(detail.inboundAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="确认人">{{ detail.createdByName }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.remark || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-table
            :data="detail.details"
            row-key="inboundDetailId"
            class="section"
          >
            <el-table-column
              label="授权来源"
              min-width="190"
            >
              <template #default="{ row }"
                >{{
                  FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
                }}
                · 清单第 {{ row.revisionNo }} 版<br /><span class="muted"
                  >授权 {{ row.allocationId }}</span
                ></template
              >
            </el-table-column>
            <el-table-column
              label="实际入库"
              min-width="120"
              ><template #default="{ row }"
                >{{ formatQuantity(row.quantity) }} {{ detail.unit }}</template
              ></el-table-column
            >
            <el-table-column
              label="库存批次"
              min-width="150"
              ><template #default="{ row }"
                >{{ row.batchCode }} (#{{ row.itemBatchId }})</template
              ></el-table-column
            >
            <el-table-column
              label="批准与质检依据"
              min-width="210"
            >
              <template #default="{ row }">
                <template v-if="row.approvedOutput"
                  >质检记录 {{ row.approvedOutput.inspectionRecordId }}<br />审批
                  {{ row.approvedOutput.approvalInstanceId }}</template
                >
                <span v-else>批准版 {{ row.outputRevisionId }}</span>
              </template>
            </el-table-column>
            <el-table-column
              prop="inventoryTransactionId"
              label="库存流水"
              min-width="110"
            />
          </el-table>
        </template>
      </div>
    </template>
    <template v-else>
      <el-alert
        title="选择当前有效授权、本次数量和目标库存批次后直接确认。已入与剩余按任务及来源类别累计，部分入库后可继续办理。"
        type="info"
        :closable="false"
      />
      <div class="toolbar section">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索工单、任务或成品"
          @keyup.enter="loadCandidates"
        />
        <el-button
          :loading="loading"
          @click="loadCandidates"
          >查询</el-button
        >
        <el-button
          :loading="checking"
          :disabled="command.locked.value || !selected.length"
          @click="recheck(true)"
          >重新核对已选</el-button
        >
      </div>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
      />
      <el-table
        v-loading="loading"
        :data="candidates"
        row-key="allocationId"
        max-height="250"
      >
        <el-table-column width="45"
          ><template #default="{ row }"
            ><el-checkbox
              :model-value="selected.some((item) => item.source.allocationId === row.allocationId)"
              :disabled="
                command.locked.value ||
                !row.canConfirm ||
                (!!selected.length &&
                  selected[0]?.source.productionBatchId !== row.productionBatchId)
              "
              @change="toggle(row)" /></template
        ></el-table-column>
        <el-table-column
          label="工单 / 任务"
          min-width="150"
          ><template #default="{ row }"
            >{{ row.workOrderNo }} / {{ row.batchNo }}</template
          ></el-table-column
        >
        <el-table-column
          label="成品 / 来源"
          min-width="160"
          ><template #default="{ row }"
            >{{ row.productCode }} · {{ row.productName }}<br />{{
              FINISHED_GOODS_INBOUND_SOURCE_LABELS[row.sourceType as FinishedGoodsInboundSource]
            }}</template
          ></el-table-column
        >
        <el-table-column
          label="批准 / 已入 / 剩余"
          min-width="210"
          ><template #default="{ row }"
            >{{ row.authorizedQuantity }} / {{ row.receivedQuantity }} / {{ row.remainingQuantity }}
            {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="资格"
          min-width="140"
          ><template #default="{ row }">{{
            row.canConfirm ? '可入库' : row.blockers.join('；')
          }}</template></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="candidateTotal"
        :current-page="candidatePage"
        :page-size="10"
        @page-change="changeCandidatePage"
      />
      <el-table
        :data="selected"
        row-key="detailKey"
        class="section"
      >
        <el-table-column
          label="本次授权"
          min-width="180"
          ><template #default="{ row }"
            >{{
              FINISHED_GOODS_INBOUND_SOURCE_LABELS[
                row.source.sourceType as FinishedGoodsInboundSource
              ]
            }}
            · 第 {{ row.source.revisionNo }} 版<br /><span class="muted"
              >剩余 {{ row.source.remainingQuantity }} {{ row.source.unit }}</span
            ></template
          ></el-table-column
        >
        <el-table-column
          label="本次入库"
          min-width="125"
          ><template #default="{ row }"
            ><el-input-number
              v-model="row.quantity"
              :precision="0"
              :min="1"
              :disabled="command.locked.value" /></template
        ></el-table-column>
        <el-table-column
          label="目标批次"
          min-width="270"
          ><template #default="{ row }"
            ><InboundBatchTargetPicker
              v-model="row.target"
              item-kind="finished_product"
              :product-id="row.source.productId"
              :unit="row.source.unit"
              :related-new-targets="relatedNewTargetsFor(row.detailKey)"
              :disabled="command.locked.value" /></template
        ></el-table-column>
        <el-table-column width="115"
          ><template #default="{ row }"
            ><el-button
              link
              :disabled="command.locked.value"
              @click="split(row.detailKey)"
              >拆入</el-button
            ><el-button
              link
              type="danger"
              :disabled="command.locked.value"
              @click="remove(row.detailKey)"
              >移除</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-input
        v-model="remark"
        class="section"
        type="textarea"
        :rows="2"
        maxlength="2000"
        placeholder="入库备注（可选）"
        :disabled="command.locked.value"
      />
      <el-alert
        v-if="checkError"
        class="section"
        :title="checkError"
        type="error"
        :closable="false"
      />
      <el-alert
        v-if="command.status.value !== 'idle'"
        class="section"
        title="确认结果未知：保留原授权、数量、目标批次和幂等键。请核对历史后按原操作重试。"
        type="warning"
        :closable="false"
      />
    </template>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <template v-if="!inboundId">
        <el-button
          v-if="command.status.value === 'pending'"
          type="primary"
          :loading="command.busy.value"
          @click="command.retry"
          >按原操作重试</el-button
        >
        <el-button
          v-else
          type="primary"
          :loading="command.busy.value"
          :disabled="command.locked.value || checking || !selected.length"
          @click="confirm"
          >确认实际入库</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderDetail,
  FinishedGoodsInboundSource,
  InventoryInboundTarget,
  ConfirmFinishedGoodsInboundPayload,
  FinishedGoodsInboundCommandResult,
} from '@company/contracts';
import { FINISHED_GOODS_INBOUND_SOURCE_LABELS } from '@company/constants';
import { productionApi } from '../../../api/production';
import { useProcurementCommand } from '../../procurement/composables/useProcurementCommand';
import { EMessage } from '../../../utils/message';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InboundBatchTargetPicker from './InboundBatchTargetPicker.vue';
defineOptions({ name: 'FinishedGoodsInboundDialog' });
const props = defineProps<{
  visible: boolean;
  inboundId: string | null;
  sourceType: FinishedGoodsInboundSource;
  active: boolean;
}>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [] }>();
interface Selection {
  detailKey: string;
  source: FinishedGoodsInboundCandidate;
  quantity: number;
  target: InventoryInboundTarget;
}
const candidates = ref<FinishedGoodsInboundCandidate[]>([]),
  selected = ref<Selection[]>([]),
  detail = ref<FinishedGoodsInboundOrderDetail | null>(null);
const candidatePage = ref(1),
  candidateTotal = ref(0),
  keyword = ref(''),
  remark = ref('');
const loading = ref(false),
  checking = ref(false),
  error = ref(''),
  checkError = ref('');
let requestNo = 0;
const command = useProcurementCommand<FinishedGoodsInboundCommandResult>(async () => {
  emit('changed');
  selected.value = [];
  remark.value = '';
  await loadCandidates();
}, '成品入库');
async function loadCandidates() {
  if (!props.visible || props.inboundId) return;
  const current = ++requestNo;
  loading.value = true;
  error.value = '';
  try {
    const page = await productionApi.finishedGoodsInboundCandidates({
      keyword: keyword.value.trim() || undefined,
      page: candidatePage.value,
      pageSize: 10,
    });
    if (current !== requestNo) return;
    candidates.value = page.items;
    candidateTotal.value = page.total;
  } catch (failure) {
    if (current === requestNo) {
      error.value = '授权候选加载失败';
      EMessage.error(failure);
    }
  } finally {
    if (current === requestNo) loading.value = false;
  }
}
async function loadDetail() {
  if (!props.visible || !props.inboundId) return;
  const current = ++requestNo;
  loading.value = true;
  error.value = '';
  try {
    const data = await productionApi.getFinishedGoodsInbound(props.inboundId);
    if (current === requestNo) detail.value = data;
  } catch (failure) {
    if (current === requestNo) {
      error.value = '入库详情加载失败';
      EMessage.error(failure);
    }
  } finally {
    if (current === requestNo) loading.value = false;
  }
}
function relatedNewTargetsFor(detailKey: string) {
  const current = selected.value.find((item) => item.detailKey === detailKey);
  if (!current) return [];
  return selected.value.flatMap((item, index) =>
    item.detailKey !== detailKey &&
    item.source.productId === current.source.productId &&
    item.source.unit === current.source.unit &&
    item.target.mode === 'new'
      ? [
          {
            clientKey: item.target.clientKey,
            label: `第 ${index + 1} 条明细的新批次`,
          },
        ]
      : [],
  );
}
function toggle(source: FinishedGoodsInboundCandidate) {
  if (command.locked.value) return;
  const index = selected.value.findIndex(
    (item) => item.source.allocationId === source.allocationId,
  );
  if (index >= 0) {
    selected.value.splice(index, 1);
    return;
  }
  if (
    !source.canConfirm ||
    (selected.value.length &&
      selected.value[0]?.source.productionBatchId !== source.productionBatchId)
  )
    return;
  selected.value.push({
    detailKey: crypto.randomUUID(),
    source: { ...source },
    quantity: Number(source.remainingQuantity),
    target: { mode: 'new', clientKey: crypto.randomUUID() },
  });
}
function remove(detailKey: string) {
  if (command.locked.value) return;
  selected.value = selected.value.filter((item) => item.detailKey !== detailKey);
}
function split(detailKey: string) {
  if (command.locked.value || selected.value.length >= 100) return;
  const item = selected.value.find((row) => row.detailKey === detailKey);
  if (!item) return;
  selected.value.push({
    detailKey: crypto.randomUUID(),
    source: { ...item.source },
    quantity: 1,
    target: { mode: 'new', clientKey: crypto.randomUUID() },
  });
}
async function recheck(adopt: boolean): Promise<boolean> {
  if (!selected.value.length || command.locked.value) return false;
  checking.value = true;
  checkError.value = '';
  try {
    const page = await productionApi.finishedGoodsInboundCandidates({
      keyword: selected.value[0]!.source.batchNo,
      page: 1,
      pageSize: 100,
    });
    const latest = new Map(page.items.map((item) => [item.allocationId, item]));
    for (const item of selected.value) {
      const current = latest.get(item.source.allocationId);
      if (!current || !current.canConfirm) {
        checkError.value = '授权已失效，请移除后重新选择';
        return false;
      }
      if (
        current.outputRevisionId !== item.source.outputRevisionId ||
        current.remainingQuantity !== item.source.remainingQuantity
      ) {
        if (!adopt) {
          checkError.value = '授权版本或余量已变化，请明确重新核对';
          return false;
        }
        item.source = { ...current };
      }
    }
    return true;
  } catch (failure) {
    checkError.value = '授权重新核对失败';
    EMessage.error(failure);
    return false;
  } finally {
    checking.value = false;
  }
}
async function confirm() {
  if (command.locked.value || !(await recheck(false))) return;
  for (const item of selected.value) {
    const aggregate = selected.value
      .filter((row) => row.source.allocationId === item.source.allocationId)
      .reduce((sum, row) => sum + row.quantity, 0);
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      aggregate > Number(item.source.remainingQuantity) ||
      (item.target.mode === 'existing' && !item.target.batchId)
    ) {
      checkError.value = '请核对本次数量、剩余额度与目标批次';
      return;
    }
  }
  const body: ConfirmFinishedGoodsInboundPayload = {
    productionBatchId: selected.value[0]!.source.productionBatchId,
    details: selected.value.map((item) => ({
      detailKey: item.detailKey,
      allocationId: item.source.allocationId,
      revisionId: item.source.outputRevisionId,
      quantity: item.quantity,
      target: item.target,
    })),
    remark: remark.value.trim() || null,
  };
  await command.run(
    { intentType: 'production.finished-inbound.confirm', params: {}, query: {}, body },
    (key) => productionApi.confirmFinishedGoodsInbound(body, key),
    '成品入库已确认',
  );
}
async function close(): Promise<boolean> {
  if (!(await command.canClose(!!selected.value.length || !!remark.value))) return false;
  requestNo++;
  selected.value = [];
  detail.value = null;
  remark.value = '';
  error.value = '';
  checkError.value = '';
  emit('update:visible', false);
  return true;
}
async function prepareTargetSwitch() {
  return !props.visible || close();
}
function currentInboundId() {
  return props.inboundId;
}
function changeCandidatePage(page: number) {
  candidatePage.value = page;
  void loadCandidates();
}
watch(
  () => [props.visible, props.inboundId, props.sourceType] as const,
  () => {
    requestNo++;
    candidates.value = [];
    selected.value = [];
    detail.value = null;
    keyword.value = '';
    candidatePage.value = 1;
    candidateTotal.value = 0;
    if (props.visible) void (props.inboundId ? loadDetail() : loadCandidates());
  },
  { immediate: true },
);
defineExpose({ prepareTargetSwitch, currentInboundId });
</script>
<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
}
.section {
  margin-top: 14px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
