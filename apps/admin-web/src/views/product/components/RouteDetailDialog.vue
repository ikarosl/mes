<template>
  <el-dialog
    :model-value="visible"
    title="工艺路线详情"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-descriptions
      v-if="row"
      :column="2"
      border
    >
      <el-descriptions-item label="路线编号">{{ row.routeCode }}</el-descriptions-item>
      <el-descriptions-item label="路线名称">{{ row.routeName }}</el-descriptions-item>
      <el-descriptions-item label="适用产品">{{
        row.itemCode && row.productName ? `${row.itemCode} / ${row.productName}` : '-'
      }}</el-descriptions-item>
      <el-descriptions-item label="版本">{{ row.versionNo || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ routeStatusLabel(row.status) }}</el-descriptions-item>
      <el-descriptions-item label="备注">{{ row.remark || '-' }}</el-descriptions-item>
    </el-descriptions>

    <div class="route-detail-steps">
      <div class="route-detail-steps__title">工序与 BOM</div>

      <div
        v-if="stepsStatus === 'loading'"
        class="route-detail-steps__state"
      >
        <el-skeleton
          :rows="3"
          animated
        />
      </div>

      <el-alert
        v-else-if="stepsStatus === 'error'"
        type="error"
        show-icon
        :closable="false"
      >
        <template #title>
          <span>工序明细加载失败，请重试</span>
          <el-button
            link
            type="primary"
            @click="reloadDetail"
            >重试</el-button
          >
        </template>
      </el-alert>

      <el-empty
        v-else-if="stepsStatus === 'success' && steps.length === 0"
        description="该路线尚未配置工序"
      />

      <div
        v-else
        class="step-card-list"
      >
        <div
          v-for="step in steps"
          :key="step.id"
          class="step-card"
        >
          <div class="step-card__header">
            <span class="step-card__order">{{ step.stepOrder }}</span>
            <span class="step-card__name">{{ step.stepCode }} / {{ step.stepName }}</span>
            <el-tag
              v-if="step.needRecord"
              size="small"
              effect="plain"
              >需报工</el-tag
            >
            <el-tag
              v-if="step.needInspection"
              size="small"
              type="warning"
              effect="plain"
              >需检验</el-tag
            >
            <el-tag
              v-if="step.status === 0"
              size="small"
              type="info"
              effect="plain"
              >已停用</el-tag
            >
          </div>
          <div
            v-if="step.description"
            class="step-card__desc"
          >
            {{ step.description }}
          </div>
          <div class="step-card__meta">
            <span>负责人：{{ step.defaultOwnerName || '-' }}</span>
            <span>SOP：{{ step.sopFileName || '-' }}</span>
            <span v-if="step.remark">备注：{{ step.remark }}</span>
          </div>

          <div class="step-card__bom">
            <div class="step-card__bom-title">使用 BOM</div>

            <div
              v-if="bomStatus === 'loading'"
              class="bom-hint"
            >
              BOM 明细加载中...
            </div>
            <el-alert
              v-else-if="bomStatus === 'error'"
              type="warning"
              show-icon
              :closable="false"
            >
              <template #title>
                <span>BOM 明细加载失败，以下物料可能不完整</span>
                <el-button
                  link
                  type="primary"
                  @click="reloadBom"
                  >重试</el-button
                >
              </template>
            </el-alert>
            <template v-else-if="bomStatus === 'success'">
              <table
                v-if="bomOf(step).length"
                class="bom-table"
              >
                <thead>
                  <tr>
                    <th>物料编码</th>
                    <th>物料名称</th>
                    <th>单件用量</th>
                    <th>单位</th>
                    <th>关键物料</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in bomOf(step)"
                    :key="item.materialId"
                    :class="{ 'is-unavailable': item.unavailable }"
                  >
                    <td>{{ item.itemCode }}</td>
                    <td>{{ item.productName }}</td>
                    <td>{{ item.quantityPerUnit }}</td>
                    <td>{{ item.unit }}</td>
                    <td>{{ item.isKeyMaterial ? '是' : '否' }}</td>
                  </tr>
                </tbody>
              </table>
              <div
                v-else
                class="bom-hint"
              >
                该工序未关联 BOM 明细
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ProcessRouteListItem,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProductMaterialItem,
} from '@company/contracts';
import { productApi } from '../../../api/product';
import { DialogWidth } from '../../../utils/dialog';

type DetailStatus = 'idle' | 'loading' | 'success' | 'error';

interface StepBomRow {
  materialId: string;
  itemCode: string;
  productName: string;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  unavailable?: boolean;
}

const props = defineProps<{
  visible: boolean;
  row: ProcessRouteListItem | null;
  routeStatusLabel: (status: ProcessRouteStatus) => string;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const steps = ref<ProcessRouteStepItem[]>([]);
const materials = ref<ProductMaterialItem[]>([]);
const stepsStatus = ref<DetailStatus>('idle');
const bomStatus = ref<DetailStatus>('idle');
/** 关闭弹窗或切换路线后，丢弃在途的迟到响应（last-request-wins） */
let stepsRequestToken = 0;
let bomRequestToken = 0;

const materialById = computed(
  () => new Map(materials.value.map((material) => [material.id, material])),
);

const bomOf = (step: ProcessRouteStepItem): StepBomRow[] =>
  step.productMaterialIds.map((materialId) => {
    const material = materialById.value.get(materialId);
    if (material) {
      return {
        materialId: material.id,
        itemCode: material.itemCode,
        productName: material.productName,
        quantityPerUnit: material.quantityPerUnit,
        unit: material.unit,
        isKeyMaterial: material.isKeyMaterial,
      };
    }
    return {
      materialId,
      itemCode: '-',
      productName: '已失效物料',
      quantityPerUnit: '-',
      unit: '-',
      isKeyMaterial: false,
      unavailable: true,
    };
  });

const loadSteps = async (routeId: string): Promise<void> => {
  const token = ++stepsRequestToken;
  stepsStatus.value = 'loading';
  try {
    const data = await productApi.routeSteps(routeId);
    if (token !== stepsRequestToken) return;
    steps.value = [...data].sort((a, b) => a.stepOrder - b.stepOrder);
    stepsStatus.value = 'success';
  } catch {
    if (token !== stepsRequestToken) return;
    steps.value = [];
    stepsStatus.value = 'error';
  }
};

const loadBom = async (productId: string): Promise<void> => {
  const token = ++bomRequestToken;
  bomStatus.value = 'loading';
  try {
    const data = await productApi.materials(productId);
    if (token !== bomRequestToken) return;
    materials.value = data;
    bomStatus.value = 'success';
  } catch {
    if (token !== bomRequestToken) return;
    materials.value = [];
    bomStatus.value = 'error';
  }
};

const reloadDetail = (): void => {
  if (!props.row) return;
  void loadSteps(props.row.id);
  void loadBom(props.row.productId);
};

const reloadBom = (): void => {
  if (props.row) void loadBom(props.row.productId);
};

watch(
  () => [props.visible, props.row?.id, props.row?.productId] as const,
  ([visible, routeId, productId]) => {
    if (!visible) {
      stepsRequestToken += 1;
      bomRequestToken += 1;
      stepsStatus.value = 'idle';
      bomStatus.value = 'idle';
      steps.value = [];
      materials.value = [];
      return;
    }
    if (!routeId || !productId) return;
    void loadSteps(routeId);
    void loadBom(productId);
  },
);
</script>

<style scoped>
.route-detail-steps {
  margin-top: 20px;
}
.route-detail-steps__title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.route-detail-steps__state {
  padding: 12px 0;
}
.step-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 420px;
  overflow-y: auto;
}
.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  background: #ffffff;
}
.step-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-card__order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}
.step-card__name {
  font-weight: 600;
  color: #1f2937;
}
.step-card__desc {
  margin-top: 8px;
  color: #4b5563;
}
.step-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  color: #6b7280;
  font-size: 13px;
}
.step-card__bom {
  margin-top: 12px;
}
.step-card__bom-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.bom-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.bom-table th,
.bom-table td {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  text-align: left;
}
.bom-table th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
}
.bom-table td {
  color: #1f2937;
}
.bom-table tr.is-unavailable td {
  color: #9ca3af;
}
.bom-hint {
  padding: 6px 0;
  color: #6b7280;
  font-size: 13px;
}
</style>
