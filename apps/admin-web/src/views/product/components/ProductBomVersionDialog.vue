<template>
  <el-dialog
    :model-value="visible"
    title="BOM 版本管理"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div
      v-if="product"
      v-loading="loading"
      class="bom-dialog-body"
    >
      <div class="product-summary">
        <div>
          <span class="item-code">{{ product.itemCode }}</span>
          <span class="product-name">{{ product.productName }}</span>
        </div>
        <el-tag
          v-if="currentVersion"
          type="success"
          >当前使用：{{ currentVersion.versionNo }}</el-tag
        >
        <el-tag
          v-else
          type="warning"
          >未配置当前 BOM</el-tag
        >
      </div>

      <el-alert
        v-if="loadFailed"
        title="BOM 版本加载失败，当前不可编辑，请刷新重试。"
        type="error"
        :closable="false"
        show-icon
      />

      <div class="section-toolbar">
        <strong>BOM 版本</strong>
        <div>
          <el-button
            :icon="Refresh"
            @click="loadVersions"
            >刷新</el-button
          >
          <el-button
            v-if="canEditDraft"
            type="primary"
            :icon="Plus"
            :disabled="loadFailed"
            @click="createOrOpenDraft"
            >{{ draftVersion ? '继续编辑草稿' : '创建新版本' }}</el-button
          >
        </div>
      </div>

      <el-table
        :data="versions"
        highlight-current-row
        class="version-table"
        @current-change="selectVersion"
      >
        <el-table-column
          prop="versionNo"
          label="版本号"
          width="110"
        />
        <el-table-column
          label="状态"
          width="120"
        >
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
            <el-tag
              v-if="row.isCurrent"
              class="current-tag"
              type="success"
              effect="plain"
              >当前使用</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          prop="lineCount"
          label="明细数"
          width="90"
        />
        <el-table-column
          label="发布时间"
          min-width="170"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column
          prop="changeReason"
          label="变更原因"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column
          label="操作"
          width="150"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click.stop="selectVersion(row)"
              >{{ row.status === 'draft' ? '编辑' : '查看' }}</el-button
            >
            <el-button
              v-if="row.status !== 'draft' && canEditDraft && !draftVersion"
              link
              type="primary"
              @click.stop="copyAsDraft(row)"
              >复制为草稿</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <template v-if="selectedDetail">
        <div class="detail-heading">
          <div>
            <strong>{{ selectedDetail.versionNo }} 明细</strong>
            <span class="detail-hint">
              {{ selectedDetail.status === 'draft' ? '草稿可编辑' : '发布后永久只读' }}
            </span>
          </div>
          <div v-if="isDraftSelected && canEditDraft">
            <el-button
              :icon="Plus"
              @click="addLine"
              >添加物料</el-button
            >
            <el-button
              type="primary"
              :loading="saving"
              @click="saveDraft"
              >保存草稿</el-button
            >
            <el-button
              type="danger"
              plain
              @click="deleteDraft"
              >删除草稿</el-button
            >
          </div>
        </div>

        <el-table
          :data="lines"
          class="line-table"
        >
          <el-table-column
            label="物料"
            min-width="260"
          >
            <template #default="{ row }">
              <el-select
                v-if="isDraftSelected && canEditDraft"
                v-model="row.materialProductId"
                filterable
                placeholder="选择已有物料"
                @change="syncMaterialSnapshot(row)"
                @visible-change="(opened: boolean) => opened && productSource.refresh()"
              >
                <el-option
                  v-for="option in materialOptions"
                  :key="option.id"
                  :label="`${option.itemCode} / ${option.productName}`"
                  :value="option.id"
                />
              </el-select>
              <span v-else>{{ row.itemCode }} / {{ row.itemName }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="unit"
            label="单位"
            width="90"
          />
          <el-table-column
            label="单位用量"
            width="140"
          >
            <template #default="{ row }">
              <el-input-number
                v-if="isDraftSelected && canEditDraft"
                v-model="row.quantityPerUnit"
                :min="1"
                :max="99999999"
                :precision="0"
                controls-position="right"
              />
              <span v-else>{{ row.quantityPerUnit }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="关键物料"
            width="100"
            align="center"
          >
            <template #default="{ row }">
              <el-switch
                v-if="isDraftSelected && canEditDraft"
                v-model="row.isKeyMaterial"
              />
              <span v-else>{{ row.isKeyMaterial ? '是' : '否' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="记录批次"
            width="100"
            align="center"
          >
            <template #default="{ row }">
              <el-switch
                v-if="isDraftSelected && canEditDraft"
                v-model="row.needBatchRecord"
              />
              <span v-else>{{ row.needBatchRecord ? '是' : '否' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="备注"
            min-width="160"
          >
            <template #default="{ row }">
              <el-input
                v-if="isDraftSelected && canEditDraft"
                v-model="row.remark"
                maxlength="2000"
                placeholder="可选"
              />
              <span v-else>{{ row.remark || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="isDraftSelected && canEditDraft"
            label="操作"
            width="80"
          >
            <template #default="{ $index }">
              <el-button
                link
                type="danger"
                @click="removeLine($index)"
                >删除</el-button
              >
            </template>
          </el-table-column>
        </el-table>

        <div
          v-if="isDraftSelected"
          class="publish-panel"
        >
          <div>
            <strong>相对当前 BOM 的变化</strong>
            <div class="diff-text">{{ differenceSummary }}</div>
          </div>
          <el-input
            v-model="changeReason"
            type="textarea"
            :rows="2"
            maxlength="2000"
            show-word-limit
            placeholder="发布时必填：说明本次 BOM 变更原因"
          />
          <el-checkbox v-model="compatibilityConfirmed">
            我确认使用新版 BOM 生产的成品与旧版成品在规格、质量标准、用途和库存混用上完全兼容
          </el-checkbox>
          <el-alert
            title="如果不能确认兼容，必须取消发布并创建新的迭代产品编码。发布后该版本永久只读。"
            type="warning"
            :closable="false"
            show-icon
          />
          <div class="publish-action">
            <el-button
              v-if="canPublish"
              type="primary"
              :loading="publishing"
              @click="publishDraft"
              >发布并设为当前 BOM</el-button
            >
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { PERMISSIONS, PRODUCT_BOM_VERSION_STATUS_LABELS } from '@company/constants';
import type {
  ProductBomVersionDetail,
  ProductBomVersionLineItem,
  ProductBomVersionListItem,
  ProductListItem,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { useProductOptions } from '../../../composables/options/useProductOptions';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';

type EditableLine = Omit<ProductBomVersionLineItem, 'quantityPerUnit'> & {
  quantityPerUnit: number;
};

const props = defineProps<{ visible: boolean; product: ProductListItem | null }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'changed'): void;
}>();

const auth = useAuthStore();
const productSource = useProductOptions();
const versions = ref<ProductBomVersionListItem[]>([]);
const selectedDetail = ref<ProductBomVersionDetail | null>(null);
const currentDetail = ref<ProductBomVersionDetail | null>(null);
const lines = ref<EditableLine[]>([]);
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const loadFailed = ref(false);
const changeReason = ref('');
const compatibilityConfirmed = ref(false);
let requestToken = 0;

const canEditDraft = computed(() => auth.can(PERMISSIONS.product.bomVersions.editDraft));
const canPublish = computed(() => auth.can(PERMISSIONS.product.bomVersions.publish));
const currentVersion = computed(() => versions.value.find((item) => item.isCurrent) ?? null);
const draftVersion = computed(() => versions.value.find((item) => item.status === 'draft') ?? null);
const isDraftSelected = computed(() => selectedDetail.value?.status === 'draft');
const materialOptions = computed(() =>
  productSource.options.value.filter((item) => item.itemKind === 'material'),
);

const setDetail = (detail: ProductBomVersionDetail): void => {
  selectedDetail.value = detail;
  lines.value = detail.lines.map((line) => ({
    ...line,
    quantityPerUnit: Number(line.quantityPerUnit),
    remark: line.remark ?? null,
  }));
  changeReason.value = '';
  compatibilityConfirmed.value = false;
};

const loadDetail = async (versionId: string): Promise<void> => {
  const token = requestToken;
  try {
    const detail = await productApi.bomVersion(versionId);
    if (token !== requestToken) return;
    setDetail(detail);
  } catch (error) {
    if (token === requestToken) EMessage.error(error, 'BOM 版本明细加载失败');
  }
};

const loadVersions = async (): Promise<void> => {
  if (!props.product) return;
  const token = ++requestToken;
  loading.value = true;
  loadFailed.value = false;
  void productSource.refresh();
  try {
    const result = await productApi.bomVersions(props.product.id);
    if (token !== requestToken) return;
    versions.value = result;
    const current = result.find((item) => item.isCurrent);
    currentDetail.value = current ? await productApi.bomVersion(current.id) : null;
    if (token !== requestToken) return;
    const target = result.find((item) => item.status === 'draft') ?? current ?? result[0];
    if (target) await loadDetail(target.id);
    else {
      selectedDetail.value = null;
      lines.value = [];
    }
  } catch (error) {
    if (token !== requestToken) return;
    loadFailed.value = true;
    EMessage.error(error, 'BOM 版本加载失败');
  } finally {
    if (token === requestToken) loading.value = false;
  }
};

watch(
  () => [props.visible, props.product?.id] as const,
  ([visible]) => {
    if (visible) void loadVersions();
    else requestToken += 1;
  },
);

const selectVersion = (version: ProductBomVersionListItem | null): void => {
  if (version) void loadDetail(version.id);
};

const createOrOpenDraft = async (): Promise<void> => {
  if (!props.product) return;
  if (draftVersion.value) {
    await loadDetail(draftVersion.value.id);
    return;
  }
  loading.value = true;
  try {
    const draft = currentVersion.value
      ? await productApi.copyBomVersionAsDraft(currentVersion.value.id)
      : await productApi.createBomVersionDraft(props.product.id);
    await loadVersions();
    await loadDetail(draft.id);
    emit('changed');
  } catch (error) {
    EMessage.error(error, 'BOM 草稿创建失败');
  } finally {
    loading.value = false;
  }
};

const copyAsDraft = async (version: ProductBomVersionListItem): Promise<void> => {
  loading.value = true;
  try {
    const draft = await productApi.copyBomVersionAsDraft(version.id);
    await loadVersions();
    await loadDetail(draft.id);
    EMessage.success('已复制为新草稿');
    emit('changed');
  } catch (error) {
    EMessage.error(error, '复制 BOM 草稿失败');
  } finally {
    loading.value = false;
  }
};

const addLine = (): void => {
  lines.value.push({
    id: `new-${Date.now()}-${lines.value.length}`,
    lineNo: lines.value.length + 1,
    materialProductId: '',
    itemCode: '',
    itemName: '',
    unit: '',
    quantityPerUnit: 1,
    isKeyMaterial: true,
    needBatchRecord: true,
    remark: null,
  });
};

const removeLine = (index: number): void => {
  lines.value.splice(index, 1);
};

const syncMaterialSnapshot = (line: EditableLine): void => {
  const material = materialOptions.value.find((item) => item.id === line.materialProductId);
  line.itemCode = material?.itemCode ?? '';
  line.itemName = material?.productName ?? '';
  line.unit = material?.unit ?? '';
};

const validateLines = (): boolean => {
  if (!lines.value.length) {
    EMessage.warning('BOM 至少需要一行物料');
    return false;
  }
  if (lines.value.some((line) => !line.materialProductId)) {
    EMessage.warning('请选择每一行的物料');
    return false;
  }
  if (new Set(lines.value.map((line) => line.materialProductId)).size !== lines.value.length) {
    EMessage.warning('同一物料不能在一个 BOM 版本中重复');
    return false;
  }
  if (
    lines.value.some((line) => !Number.isInteger(line.quantityPerUnit) || line.quantityPerUnit < 1)
  ) {
    EMessage.warning('单位用量必须是大于零的整数');
    return false;
  }
  return true;
};

const saveDraft = async (): Promise<ProductBomVersionDetail | null> => {
  if (!selectedDetail.value || !validateLines()) return null;
  saving.value = true;
  try {
    const detail = await productApi.replaceBomVersionLines(selectedDetail.value.id, {
      items: lines.value.map((line) => ({
        materialProductId: line.materialProductId,
        quantityPerUnit: line.quantityPerUnit,
        isKeyMaterial: line.isKeyMaterial,
        needBatchRecord: line.needBatchRecord,
        remark: line.remark?.trim() || null,
      })),
    });
    setDetail(detail);
    await loadVersions();
    await loadDetail(detail.id);
    EMessage.success('BOM 草稿已保存');
    emit('changed');
    return detail;
  } catch (error) {
    EMessage.error(error, 'BOM 草稿保存失败');
    return null;
  } finally {
    saving.value = false;
  }
};

const differenceSummary = computed(() => {
  const before = new Map(
    (currentDetail.value?.lines ?? []).map((line) => [line.materialProductId, line]),
  );
  const after = new Map(lines.value.map((line) => [line.materialProductId, line]));
  const added = [...after.keys()].filter((id) => !before.has(id)).length;
  const removed = [...before.keys()].filter((id) => !after.has(id)).length;
  const changed = [...after.entries()].filter(([id, line]) => {
    const old = before.get(id);
    return old && Number(old.quantityPerUnit) !== line.quantityPerUnit;
  }).length;
  if (!currentDetail.value) return `首次发布，共 ${lines.value.length} 项物料`;
  return `新增 ${added} 项，删除 ${removed} 项，用量变化 ${changed} 项`;
});

const publishDraft = async (): Promise<void> => {
  if (!selectedDetail.value) return;
  const reason = changeReason.value.trim();
  if (!reason) {
    EMessage.warning('请填写 BOM 变更原因');
    return;
  }
  if (!compatibilityConfirmed.value) {
    EMessage.warning('请确认新旧成品输出兼容；不能确认时请创建迭代产品');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `${differenceSummary.value}。发布后版本永久只读，并立即成为新工单使用的当前 BOM。确定发布吗？`,
      `发布 ${selectedDetail.value.versionNo}`,
      { type: 'warning', confirmButtonText: '确认发布' },
    );
  } catch {
    return;
  }
  publishing.value = true;
  try {
    const saved = await saveDraft();
    if (!saved) return;
    await productApi.publishBomVersion(saved.id, {
      changeReason: reason,
      outputCompatibilityConfirmed: true,
    });
    EMessage.success('BOM 版本已发布并设为当前版本');
    await loadVersions();
    emit('changed');
  } catch (error) {
    EMessage.error(error, 'BOM 版本发布失败');
  } finally {
    publishing.value = false;
  }
};

const deleteDraft = async (): Promise<void> => {
  if (!selectedDetail.value) return;
  try {
    await ElMessageBox.confirm('删除后草稿及其明细不可恢复，确定删除吗？', '删除 BOM 草稿', {
      type: 'warning',
      confirmButtonText: '确认删除',
    });
    await productApi.deleteBomVersionDraft(selectedDetail.value.id);
    EMessage.success('BOM 草稿已删除');
    await loadVersions();
    emit('changed');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') EMessage.error(error, 'BOM 草稿删除失败');
  }
};

const statusTagType = (status: ProductBomVersionListItem['status']) =>
  status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'info';

const statusLabel = (status: ProductBomVersionListItem['status']) =>
  PRODUCT_BOM_VERSION_STATUS_LABELS[status];
</script>

<style scoped>
.bom-dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
.product-summary,
.section-toolbar,
.detail-heading,
.publish-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.product-summary {
  margin-bottom: 14px;
}
.item-code {
  font-weight: 600;
}
.product-name,
.detail-hint {
  margin-left: 8px;
  color: #6b7280;
  font-size: 13px;
}
.section-toolbar,
.detail-heading {
  margin: 16px 0 10px;
}
.version-table,
.line-table {
  width: 100%;
}
.current-tag {
  margin-left: 6px;
}
.publish-panel {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.diff-text {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
}
.line-table :deep(.el-select),
.line-table :deep(.el-input),
.line-table :deep(.el-input-number) {
  width: 100%;
}
</style>
