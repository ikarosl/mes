<template>
  <div class="tasks-page">
    <div class="page-title">
      <div>
        <h2>生产任务管理</h2>
        <p>管理生产批次任务与工序执行</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="openCreate"
        >新增任务</el-button
      >
    </div>

    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="搜索关键字：工单/产品"
          />
        </el-form-item>
        <el-form-item label="产品">
          <el-select
            v-model="query.productId"
            clearable
            filterable
            placeholder="全部"
          >
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="formatProduct(product)"
              :value="product.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="query.ownerId"
            clearable
            filterable
            placeholder="全部"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            placeholder="全部"
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="item in taskStatusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="searchTasks"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <div class="table-toolbar">
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新增任务</el-button
        >
        <div class="toolbar-actions">
          <span class="toolbar-title">生产任务</span>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="loadTasks"
            />
          </el-tooltip>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="tasks"
        class="tasks-table"
      >
        <el-table-column
          label="批次号"
          min-width="170"
        >
          <template #default="{ row }"
            ><span class="batch-no">{{ row.batchNo }}</span></template
          >
        </el-table-column>
        <el-table-column
          label="工单号"
          min-width="150"
        >
          <template #default="{ row }">{{ row.workOrderNo || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="产品"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="product-name">{{ row.productName }}</div>
            <div class="sub-text">{{ row.itemCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="工艺路线"
          min-width="160"
        >
          <template #default="{ row }">{{ row.routeName || '未选择' }}</template>
        </el-table-column>
        <el-table-column
          label="任务状态"
          width="130"
        >
          <template #default="{ row }">
            <el-tag
              :type="getTaskStatusMeta(row.status).type"
              effect="light"
            >
              {{ getTaskStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="360"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >查看</el-button
            >
            <el-button
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              link
              type="primary"
              @click="generateMaterials(row)"
              >生成物料</el-button
            >
            <el-button
              link
              type="primary"
              @click="openDispatch(row)"
              >派工</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="row.status === 'completed'"
              @click="startTask(row)"
              >开始</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="row.status === 'completed'"
              @click="finishTask(row)"
              >完成</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
        <el-select
          v-model="pageSize"
          class="page-size-select"
          @change="handlePageSizeChange"
        >
          <el-option
            label="10条/页"
            :value="10"
          />
          <el-option
            label="20条/页"
            :value="20"
          />
          <el-option
            label="50条/页"
            :value="50"
          />
        </el-select>
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="loadTasks"
        />
      </div>
    </section>

    <el-dialog
      v-model="taskDialogVisible"
      :title="editingTaskId ? '编辑任务' : '新增任务'"
      :width="DialogWidth.xl"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="taskForm"
      >
        <el-form-item
          v-if="!editingTaskId"
          label="选择工单"
          required
        >
          <el-select
            v-model="taskForm.workOrderId"
            filterable
            remote
            reserve-keyword
            :loading="workOrderLoading"
            :remote-method="searchWorkOrders"
            placeholder="输入工单号、产品编码或名称搜索"
            @change="handleTaskOrderChange"
          >
            <el-option
              v-for="order in availableWorkOrderOptions"
              :key="order.id"
              :label="formatWorkOrder(order)"
              :value="order.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="!editingTaskId"
          label="批次号"
        >
          <el-input
            v-model="taskForm.batchNo"
            placeholder="若为空则自动生成批次号"
          />
        </el-form-item>
        <el-form-item
          v-if="!editingTaskId && selectedWorkOrder"
          label="产品"
        >
          <el-input
            :model-value="formatTaskProduct(selectedWorkOrder)"
            disabled
          />
        </el-form-item>
        <el-form-item
          label="工艺路线"
          required
        >
          <el-select
            v-model="taskForm.routeId"
            filterable
            clearable
            placeholder="请选择工艺路线"
            :loading="routeLoading"
            @change="handleRouteChange"
          >
            <el-option
              v-for="route in availableRouteOptions"
              :key="route.id"
              :label="formatRoute(route)"
              :value="route.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="taskForm.ownerId"
            filterable
            clearable
            placeholder="请选择负责人"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="计划数量"
          required
        >
          <el-input-number
            v-model="taskForm.plannedQuantity"
            :min="0"
            :max="taskQuantityMax ?? undefined"
            :precision="4"
            :step="1"
            @change="handleQuantityChange"
          />
        </el-form-item>
        <el-form-item label="计划开始日期">
          <el-date-picker
            v-model="taskForm.planStartDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="计划结束日期">
          <el-date-picker
            v-model="taskForm.planEndDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="taskForm.remark"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <el-tabs class="detail-tabs">
        <el-tab-pane label="工序执行">
          <el-table
            :data="createPreviewSteps"
            class="detail-table"
          >
            <el-table-column
              prop="stepOrder"
              label="顺序"
              width="70"
            />
            <el-table-column
              prop="stepName"
              label="工序"
              min-width="160"
            />
            <el-table-column
              label="实际参考文件"
              min-width="220"
            >
              <template #default="{ row }">
                <div class="file-cell">
                  <el-select
                    v-model="row.sopFileId"
                    clearable
                    filterable
                    placeholder="请选择参考文件"
                  >
                    <el-option
                      v-for="file in sopFileOptions"
                      :key="file.id"
                      :label="file.name"
                      :value="file.id"
                    />
                  </el-select>
                  <el-upload
                    v-if="canUploadStepFile(row)"
                    :show-file-list="false"
                    :before-upload="createStepSopUploadHandler(row)"
                  >
                    <el-button>上传</el-button>
                  </el-upload>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="负责人"
              min-width="180"
            >
              <template #default="{ row }">
                <el-select
                  v-model="row.responsibleUserId"
                  clearable
                  filterable
                  placeholder="请选择负责人"
                >
                  <el-option
                    v-for="user in userOptions"
                    :key="user.id"
                    :label="user.displayName"
                    :value="user.id"
                  />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="物料需求">
          <el-table
            :data="createPreviewMaterials"
            class="detail-table"
          >
            <el-table-column
              prop="materialModel"
              label="物料型号"
              min-width="160"
            />
            <el-table-column
              prop="materialName"
              label="物料名称"
              min-width="160"
            />
            <el-table-column
              label="单位用量"
              width="120"
              align="right"
            >
              <template #default="{ row }">{{ formatQuantity(row.quantityPerUnit) }}</template>
            </el-table-column>
            <el-table-column
              label="需求数量"
              width="170"
              align="right"
            >
              <template #default="{ row }">
                {{ formatQuantity(row.planQuantity) }}
              </template>
            </el-table-column>
            <el-table-column
              label="单位"
              width="90"
            >
              <template #default="{ row }">{{ row.unit || '-' }}</template>
            </el-table-column>
            <el-table-column
              label="批次记录"
              width="100"
            >
              <template #default="{ row }">{{ row.needBatchRecord ? '需要' : '不需要' }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitTask"
          >保存任务</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      title="任务详情"
      :width="DialogWidth.xl"
    >
      <template v-if="activeTask">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="批次号">{{ activeTask.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{
            activeTask.workOrderNo || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ activeTask.productName }}</el-descriptions-item>
          <el-descriptions-item label="工艺路线">{{
            activeTask.routeName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{
            formatQuantity(activeTask.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            activeTask.ownerName || '-'
          }}</el-descriptions-item>
        </el-descriptions>
        <el-tabs class="detail-tabs">
          <el-tab-pane label="工序执行">
            <el-table
              :data="activeTask.steps"
              class="detail-table"
            >
              <el-table-column
                prop="stepOrder"
                label="序号"
                width="70"
              />
              <el-table-column
                prop="stepName"
                label="工序"
                min-width="160"
              />
              <el-table-column
                label="默认负责人"
                width="130"
              >
                <template #default="{ row }">{{ row.responsibleUserName || '-' }}</template>
              </el-table-column>
              <el-table-column
                label="现场负责人"
                width="130"
              >
                <template #default="{ row }">{{ row.responsibleUserName || '-' }}</template>
              </el-table-column>
              <el-table-column
                label="实际参考文件"
                width="160"
              >
                <template #default="{ row }">{{ getSopFileName(row.sopFileId) }}</template>
              </el-table-column>
              <el-table-column
                label="状态"
                width="110"
              >
                <template #default="{ row }">{{
                  stepStatusLabels[row.status] ?? row.status
                }}</template>
              </el-table-column>
              <el-table-column
                label="完成/返工/异常"
                width="150"
              >
                <template #default="{ row }"
                  >{{ formatQuantity(row.outputQuantity) }} /
                  {{ formatQuantity(row.returnQuantity) }} /
                  {{ formatQuantity(row.abnormalQuantity) }}</template
                >
              </el-table-column>
              <el-table-column
                label="操作"
                width="90"
                fixed="right"
              >
                <template #default="{ row }">
                  <el-button
                    link
                    type="primary"
                    @click="openStepEdit(row)"
                    >编辑</el-button
                  >
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="物料需求">
            <el-table
              :data="activeTask.materialRequirements"
              class="detail-table"
            >
              <el-table-column
                prop="materialModel"
                label="物料编码"
                min-width="160"
              />
              <el-table-column
                prop="materialName"
                label="物料名称"
                min-width="160"
              />
              <el-table-column
                label="单位用量"
                width="120"
                align="right"
              >
                <template #default="{ row }">{{ formatQuantity(row.quantityPerUnit) }}</template>
              </el-table-column>
              <el-table-column
                label="需求数量"
                width="120"
                align="right"
              >
                <template #default="{ row }">{{ formatQuantity(row.planQuantity) }}</template>
              </el-table-column>
              <el-table-column
                label="已用数量"
                width="120"
                align="right"
              >
                <template #default="{ row }">{{ formatQuantity(row.usedQuantity) }}</template>
              </el-table-column>
              <el-table-column
                label="单位"
                width="80"
              >
                <template #default="{ row }">{{ row.unit || '-' }}</template>
              </el-table-column>
              <el-table-column
                label="是否批次记录"
                width="100"
              >
                <template #default="{ row }">{{ row.needBatchRecord ? '是' : '否' }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-dialog>

    <el-dialog
      v-model="dispatchDialogVisible"
      title="任务派工"
      :width="DialogWidth.lg"
    >
      <el-table
        :data="dispatchRows"
        class="detail-table"
      >
        <el-table-column
          prop="stepOrder"
          label="序号"
          width="70"
        />
        <el-table-column
          prop="stepName"
          label="工序"
          min-width="180"
        />
        <el-table-column
          label="实际参考文件"
          min-width="220"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.sopFileId"
              clearable
              filterable
              placeholder="请选择参考文件"
            >
              <el-option
                v-for="file in sopFileOptions"
                :key="file.id"
                :label="file.name"
                :value="file.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          min-width="180"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.responsibleUserId"
              clearable
              filterable
              placeholder="指定现场负责人"
            >
              <el-option
                v-for="user in userOptions"
                :key="user.id"
                :label="user.displayName"
                :value="user.id"
              />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="dispatchDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitDispatch"
          >确认派工</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="stepDialogVisible"
      title="编辑工序记录"
      :width="DialogWidth.md"
    >
      <el-form
        class="dialog-form"
        label-width="108px"
        :model="stepForm"
      >
        <el-form-item label="负责人">
          <el-select
            v-model="stepForm.responsibleUserId"
            clearable
            filterable
            placeholder="请选择负责人"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="参考文件">
          <div class="file-cell">
            <el-select
              v-model="stepForm.sopFileId"
              clearable
              filterable
              placeholder="请选择参考文件"
            >
              <el-option
                v-for="file in sopFileOptions"
                :key="file.id"
                :label="file.name"
                :value="file.id"
              />
            </el-select>
            <el-upload
              v-if="editingTaskId && editingStepId"
              :show-file-list="false"
              :before-upload="uploadEditingStepSopFile"
            >
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="stepForm.status">
            <el-option
              v-for="item in stepStatusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="返工数量">
          <el-input-number
            v-model="stepForm.returnQuantity"
            :min="0"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="产出数量">
          <el-input-number
            v-model="stepForm.outputQuantity"
            :min="0"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="异常数量">
          <el-input-number
            v-model="stepForm.abnormalQuantity"
            :min="0"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="stepForm.remark"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitStep"
          >保存工序记录</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessageBox, type UploadRawFile } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'ProductionTasksPage' });

/* ====== 类型定义 ====== */
type ProductionBatchStatus =
  'pending' | 'material_pending' | 'material_assigned' | 'doing' | 'completed' | 'cancelled';
type BatchStepStatus = 'pending' | 'doing' | 'completed' | 'abnormal';

interface WorkOrderListItem {
  id: string;
  orderNo: string;
  productId: string;
  productName: string;
  itemCode: string;
  plannedQuantity: string;
  assignedQuantity: string;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  planStartDate: string | null;
  planEndDate: string | null;
  remark: string | null;
}

interface ProductionBatchItem {
  id: string;
  workOrderId: string;
  workOrderNo: string | null;
  batchNo: string;
  productId: string;
  productName: string;
  itemCode: string;
  routeId: string | null;
  routeName: string | null;
  plannedQuantity: string;
  ownerId: string | null;
  ownerName: string | null;
  status: ProductionBatchStatus;
  planStartDate: string | null;
  planEndDate: string | null;
  remark: string | null;
}

interface BatchStepRecordItem {
  id: string;
  batchId: string;
  processRouteStepsId: string;
  stepOrder: number;
  stepName: string;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  sopFileId: string | null;
  status: BatchStepStatus;
  outputQuantity: string;
  returnQuantity: string;
  abnormalQuantity: string;
  remark: string | null;
}

interface TaskMaterialRequirementItem {
  id: string;
  materialModel: string;
  materialName: string;
  quantityPerUnit: string;
  planQuantity: string;
  usedQuantity: string;
  unit: string | null;
  needBatchRecord: boolean;
}

interface ProductionTaskDetail {
  id: string;
  batchNo: string;
  workOrderNo: string | null;
  productName: string;
  itemCode: string;
  routeName: string | null;
  plannedQuantity: string;
  ownerName: string | null;
  routeId: string | null;
  steps: BatchStepRecordItem[];
  materialRequirements: TaskMaterialRequirementItem[];
}

interface ProductListItem {
  id: string;
  productName: string;
  itemCode: string;
  defaultRouteId: string | null;
}

interface ProcessRouteListItem {
  id: string;
  routeName: string;
  version: string | null;
  productId: string;
}

interface SystemUserListItem {
  id: string;
  displayName: string;
  username: string;
}

interface ProcessOption {
  id: string;
  processName: string;
  sopFileId: string | null;
  sopFileName: string | null;
}

/* ====== 状态选项 ====== */
const taskStatusOptions: Array<{
  value: ProductionBatchStatus;
  label: string;
  type: 'info' | 'primary' | 'success' | 'danger';
}> = [
  { value: 'pending', label: '已生成批次', type: 'info' },
  { value: 'material_pending', label: '已生成物料需求', type: 'primary' },
  { value: 'material_assigned', label: '已分配物料批次', type: 'primary' },
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];
const stepStatusOptions: Array<{ value: BatchStepStatus; label: string }> = [
  { value: 'pending', label: '待开始' },
  { value: 'doing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'abnormal', label: '异常' },
];
const stepStatusLabels = Object.fromEntries(
  stepStatusOptions.map((item) => [item.value, item.label]),
);

type MaterialDemandFormRow = {
  materialModel: string;
  materialName: string;
  quantityPerUnit: string;
  planQuantity: string | number;
  unit: string | null;
  needBatchRecord: boolean;
};

/* ====== 静态演示数据 ====== */
const tasks = ref<ProductionBatchItem[]>([
  {
    id: 't1',
    workOrderId: 'wo1',
    workOrderNo: 'WO-2026-0001',
    batchNo: 'BATCH-001',
    productId: 'p1',
    productName: 'PCB主板-A100',
    itemCode: 'A100-V2',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    plannedQuantity: '250',
    ownerId: 'u1',
    ownerName: '张工',
    status: 'doing',
    planStartDate: '2026-07-15',
    planEndDate: '2026-07-25',
    remark: null,
  },
  {
    id: 't2',
    workOrderId: 'wo1',
    workOrderNo: 'WO-2026-0001',
    batchNo: 'BATCH-002',
    productId: 'p1',
    productName: 'PCB主板-A100',
    itemCode: 'A100-V2',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    plannedQuantity: '250',
    ownerId: null,
    ownerName: null,
    status: 'pending',
    planStartDate: '2026-07-18',
    planEndDate: '2026-07-28',
    remark: null,
  },
  {
    id: 't3',
    workOrderId: 'wo2',
    workOrderNo: 'WO-2026-0004',
    batchNo: 'BATCH-003',
    productId: 'p3',
    productName: '机箱外壳-C500',
    itemCode: 'C500-V3',
    routeId: 'r3',
    routeName: '钣金加工工艺',
    plannedQuantity: '50',
    ownerId: 'u3',
    ownerName: '王工',
    status: 'material_pending',
    planStartDate: '2026-07-20',
    planEndDate: '2026-07-28',
    remark: null,
  },
  {
    id: 't4',
    workOrderId: 'wo1',
    workOrderNo: 'WO-2026-0002',
    batchNo: 'BATCH-004',
    productId: 'p1',
    productName: 'PCB主板-A100',
    itemCode: 'A100-V2',
    routeId: 'r1',
    routeName: 'SMT贴片工艺',
    plannedQuantity: '1000',
    ownerId: 'u2',
    ownerName: '李工',
    status: 'completed',
    planStartDate: '2026-07-01',
    planEndDate: '2026-07-20',
    remark: null,
  },
]);

const productOptions = ref<ProductListItem[]>([
  { id: 'p1', productName: 'PCB主板-A100', itemCode: 'A100-V2', defaultRouteId: 'r1' },
  { id: 'p2', productName: '电源模块-B200', itemCode: 'B200-V1', defaultRouteId: 'r2' },
  { id: 'p3', productName: '机箱外壳-C500', itemCode: 'C500-V3', defaultRouteId: 'r3' },
]);

const routeOptions = ref<ProcessRouteListItem[]>([
  { id: 'r1', routeName: 'SMT贴片工艺', version: 'V2', productId: 'p1' },
  { id: 'r2', routeName: '电源组装工艺', version: 'V1', productId: 'p2' },
  { id: 'r3', routeName: '钣金加工工艺', version: 'V3', productId: 'p3' },
]);

const userOptions = ref<SystemUserListItem[]>([
  { id: 'u1', displayName: '张工', username: 'zhang' },
  { id: 'u2', displayName: '李工', username: 'li' },
  { id: 'u3', displayName: '王工', username: 'wang' },
]);

const workOrderOptions = ref<WorkOrderListItem[]>([
  {
    id: 'wo1',
    orderNo: 'WO-2026-0001',
    productId: 'p1',
    productName: 'PCB主板-A100',
    itemCode: 'A100-V2',
    plannedQuantity: '500',
    assignedQuantity: '250',
    ownerId: 'u1',
    ownerName: '张工',
    status: 'doing',
    planStartDate: '2026-07-15',
    planEndDate: '2026-07-30',
    remark: null,
  },
  {
    id: 'wo2',
    orderNo: 'WO-2026-0004',
    productId: 'p3',
    productName: '机箱外壳-C500',
    itemCode: 'C500-V3',
    plannedQuantity: '50',
    assignedQuantity: '0',
    ownerId: 'u3',
    ownerName: '王工',
    status: 'released',
    planStartDate: '2026-07-18',
    planEndDate: '2026-07-28',
    remark: null,
  },
  {
    id: 'wo3',
    orderNo: 'WO-2026-0005',
    productId: 'p1',
    productName: 'PCB主板-A100',
    itemCode: 'A100-V2',
    plannedQuantity: '300',
    assignedQuantity: '0',
    ownerId: 'u2',
    ownerName: '李工',
    status: 'released',
    planStartDate: null,
    planEndDate: '2026-08-05',
    remark: null,
  },
]);

const processOptions = ref<ProcessOption[]>([
  { id: 'pr1', processName: '上板', sopFileId: 'sf1', sopFileName: 'SMT上板操作规范V2.pdf' },
  { id: 'pr2', processName: '印刷', sopFileId: null, sopFileName: null },
  { id: 'pr3', processName: '贴片', sopFileId: 'sf2', sopFileName: '贴片机操作指南V1.pdf' },
  { id: 'pr4', processName: '回流焊', sopFileId: null, sopFileName: null },
  { id: 'pr5', processName: 'AOI检测', sopFileId: 'sf3', sopFileName: 'AOI检测标准.pdf' },
]);

/* ====== 默认演示步骤数据 ====== */
const demoSteps = [
  {
    id: 's1',
    batchId: '0',
    processRouteStepsId: 'prs1',
    stepOrder: 10,
    stepName: '上板',
    responsibleUserId: null,
    responsibleUserName: null,
    sopFileId: null,
    status: 'pending' as BatchStepStatus,
    outputQuantity: '0',
    returnQuantity: '0',
    abnormalQuantity: '0',
    remark: null,
  },
  {
    id: 's2',
    batchId: '0',
    processRouteStepsId: 'prs2',
    stepOrder: 20,
    stepName: '印刷',
    responsibleUserId: null,
    responsibleUserName: null,
    sopFileId: null,
    status: 'pending' as BatchStepStatus,
    outputQuantity: '0',
    returnQuantity: '0',
    abnormalQuantity: '0',
    remark: null,
  },
  {
    id: 's3',
    batchId: '0',
    processRouteStepsId: 'prs3',
    stepOrder: 30,
    stepName: '贴片',
    responsibleUserId: null,
    responsibleUserName: null,
    sopFileId: null,
    status: 'pending' as BatchStepStatus,
    outputQuantity: '0',
    returnQuantity: '0',
    abnormalQuantity: '0',
    remark: null,
  },
  {
    id: 's4',
    batchId: '0',
    processRouteStepsId: 'prs4',
    stepOrder: 40,
    stepName: '回流焊',
    responsibleUserId: null,
    responsibleUserName: null,
    sopFileId: null,
    status: 'pending' as BatchStepStatus,
    outputQuantity: '0',
    returnQuantity: '0',
    abnormalQuantity: '0',
    remark: null,
  },
  {
    id: 's5',
    batchId: '0',
    processRouteStepsId: 'prs5',
    stepOrder: 50,
    stepName: 'AOI检测',
    responsibleUserId: null,
    responsibleUserName: null,
    sopFileId: 'sf3',
    status: 'pending' as BatchStepStatus,
    outputQuantity: '0',
    returnQuantity: '0',
    abnormalQuantity: '0',
    remark: null,
  },
];

const demoMaterials = [
  {
    materialModel: 'RES-0603-10K',
    materialName: '贴片电阻 0603 10KΩ',
    quantityPerUnit: '10',
    planQuantity: '2500',
    unit: '个',
    needBatchRecord: false,
  },
  {
    materialModel: 'CAP-0805-100N',
    materialName: '贴片电容 0805 100nF',
    quantityPerUnit: '5',
    planQuantity: '1250',
    unit: '个',
    needBatchRecord: false,
  },
  {
    materialModel: 'IC-ST-001',
    materialName: '主控芯片 STM32F103',
    quantityPerUnit: '1',
    planQuantity: '250',
    unit: '个',
    needBatchRecord: true,
  },
];

const activeTask = ref<ProductionTaskDetail | null>(null);
const createPreviewSteps = ref<
  Array<BatchStepRecordItem & { responsibleUserId: string | null; sopFileId: string | null }>
>([]);
const createPreviewMaterials = ref<MaterialDemandFormRow[]>([]);
const editingTaskId = ref<string | null>(null);
const editingTaskOriginalQuantity = ref(0);
const dispatchTaskId = ref<string | null>(null);
const editingStepId = ref<string | null>(null);
const loading = ref(false);
const workOrderLoading = ref(false);
const routeLoading = ref(false);
const submitting = ref(false);
const total = ref(4);
const currentPage = ref(1);
const pageSize = ref(10);
const taskDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const dispatchDialogVisible = ref(false);
const stepDialogVisible = ref(false);
const dispatchRows = ref<
  Array<BatchStepRecordItem & { responsibleUserId: string | null; sopFileId: string | null }>
>([]);

const query = reactive({ keyword: '', productId: '', ownerId: '', status: '' });
const taskForm = reactive({
  workOrderId: '',
  batchNo: '',
  routeId: '',
  ownerId: '',
  plannedQuantity: 1,
  planStartDate: '',
  planEndDate: '',
  remark: '',
});

let workOrderRouteRequestToken = 0;
let previewRequestToken = 0;
const stepForm = reactive({
  responsibleUserId: '',
  sopFileId: '',
  status: 'pending' as BatchStepStatus,
  returnQuantity: 0,
  outputQuantity: 0,
  abnormalQuantity: 0,
  remark: '',
});

const loadTasks = async () => {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    loading.value = false;
  }
};

// TODO(api-integration): 接通真实 API 分页查询后删除此占位函数
const loadPageData = async () => {
  loading.value = true;
  try {
    await loadTasks();
  } finally {
    loading.value = false;
  }
};

const searchWorkOrders = async (keyword: string) => {
  workOrderLoading.value = true;
  try {
    // Demo: filter inline work orders
    const filtered = workOrderOptions.value.filter((order) => {
      const kw = keyword.trim().toLowerCase();
      if (!kw) return true;
      return (
        order.orderNo.toLowerCase().includes(kw) ||
        order.productName.toLowerCase().includes(kw) ||
        order.itemCode.toLowerCase().includes(kw)
      );
    });
    workOrderOptions.value = filtered;
    if (!keyword.trim()) {
      // Reset to full list if keyword is empty
      workOrderOptions.value = [
        {
          id: 'wo1',
          orderNo: 'WO-2026-0001',
          productId: 'p1',
          productName: 'PCB主板-A100',
          itemCode: 'A100-V2',
          plannedQuantity: '500',
          assignedQuantity: '250',
          ownerId: 'u1',
          ownerName: '张工',
          status: 'doing',
          planStartDate: '2026-07-15',
          planEndDate: '2026-07-30',
          remark: null,
        },
        {
          id: 'wo2',
          orderNo: 'WO-2026-0004',
          productId: 'p3',
          productName: '机箱外壳-C500',
          itemCode: 'C500-V3',
          plannedQuantity: '50',
          assignedQuantity: '0',
          ownerId: 'u3',
          ownerName: '王工',
          status: 'released',
          planStartDate: '2026-07-18',
          planEndDate: '2026-07-28',
          remark: null,
        },
        {
          id: 'wo3',
          orderNo: 'WO-2026-0005',
          productId: 'p1',
          productName: 'PCB主板-A100',
          itemCode: 'A100-V2',
          plannedQuantity: '300',
          assignedQuantity: '0',
          ownerId: 'u2',
          ownerName: '李工',
          status: 'released',
          planStartDate: null,
          planEndDate: '2026-08-05',
          remark: null,
        },
      ];
    }
  } finally {
    workOrderLoading.value = false;
  }
};

const selectedWorkOrder = computed(
  () => workOrderOptions.value.find((item) => item.id === taskForm.workOrderId) ?? null,
);
const availableWorkOrderOptions = computed(() =>
  workOrderOptions.value.filter((order) => getWorkOrderRemaining(order) > 0),
);
const selectedProduct = computed(
  () => productOptions.value.find((item) => item.id === selectedWorkOrder.value?.productId) ?? null,
);
const selectedWorkOrderRemaining = computed(() => {
  if (!selectedWorkOrder.value) return null;
  return getWorkOrderRemaining(selectedWorkOrder.value);
});
const taskQuantityMax = computed(() => {
  if (selectedWorkOrderRemaining.value === null) return null;
  return editingTaskId.value
    ? selectedWorkOrderRemaining.value + editingTaskOriginalQuantity.value
    : selectedWorkOrderRemaining.value;
});
const availableRouteOptions = computed(() => {
  if (!selectedWorkOrder.value) return [];
  return routeOptions.value.filter(
    (route) => route.productId === selectedWorkOrder.value?.productId,
  );
});
const sopFileOptions = computed(() => {
  const map = new Map<string, { id: string; name: string }>();
  for (const process of processOptions.value) {
    if (process.sopFileId && process.sopFileName) {
      map.set(process.sopFileId, { id: process.sopFileId, name: process.sopFileName });
    }
  }
  return [...map.values()];
});

const searchTasks = async () => {
  currentPage.value = 1;
  await loadTasks();
};

const resetQuery = async () => {
  Object.assign(query, { keyword: '', productId: '', ownerId: '', status: '' });
  currentPage.value = 1;
  await loadTasks();
};

const handlePageSizeChange = async () => {
  currentPage.value = 1;
  await loadTasks();
};

const resetTaskForm = () => {
  Object.assign(taskForm, {
    workOrderId: '',
    batchNo: '',
    routeId: '',
    ownerId: '',
    plannedQuantity: 1,
    planStartDate: '',
    planEndDate: '',
    remark: '',
  });
  createPreviewSteps.value = [];
  createPreviewMaterials.value = [];
};

const resolveRouteId = (
  routes: ProcessRouteListItem[],
  preferredRouteId?: string | null,
  fallbackRouteId?: string | null,
) => {
  const preferred = preferredRouteId ? String(preferredRouteId) : '';
  if (preferred && routes.some((route) => route.id === preferred)) return preferred;
  const fallback = fallbackRouteId ? String(fallbackRouteId) : '';
  if (fallback && routes.some((route) => route.id === fallback)) return fallback;
  return routes[0]?.id ?? '';
};

const openCreate = () => {
  editingTaskId.value = null;
  editingTaskOriginalQuantity.value = 0;
  resetTaskForm();
  void searchWorkOrders('');
  taskDialogVisible.value = true;
};

const openEdit = (row: ProductionBatchItem) => {
  void openEditTask(row);
};

const openEditTask = async (row: ProductionBatchItem) => {
  editingTaskId.value = row.id;
  editingTaskOriginalQuantity.value = Number(row.plannedQuantity);
  Object.assign(taskForm, {
    workOrderId: row.workOrderId,
    batchNo: row.batchNo,
    routeId: row.routeId ?? '',
    ownerId: row.ownerId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    planStartDate: row.planStartDate ?? '',
    planEndDate: row.planEndDate ?? '',
    remark: row.remark ?? '',
  });
  taskDialogVisible.value = true;

  // Populate preview with demo data
  await new Promise((resolve) => setTimeout(resolve, 200));
  const matchedSteps = demoSteps.map((s) => ({
    ...s,
    sopFileId: s.sopFileId,
    responsibleUserId: null,
  }));
  const matchedMaterials = demoMaterials.map((m) => ({
    ...m,
    planQuantity: m.planQuantity,
  }));
  createPreviewSteps.value = matchedSteps;
  createPreviewMaterials.value = matchedMaterials;
};

const handleTaskOrderChange = async (workOrderId: string) => {
  const requestToken = ++workOrderRouteRequestToken;
  const order = workOrderOptions.value.find((item) => item.id === workOrderId);
  if (!order) {
    taskForm.routeId = '';
    createPreviewSteps.value = [];
    createPreviewMaterials.value = [];
    return;
  }

  taskForm.routeId = '';
  createPreviewSteps.value = [];
  createPreviewMaterials.value = [];

  routeLoading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    if (requestToken === workOrderRouteRequestToken) {
      routeLoading.value = false;
    }
  }

  if (requestToken !== workOrderRouteRequestToken || taskForm.workOrderId !== workOrderId) return;

  // Auto-select default route
  taskForm.routeId = resolveRouteId(
    availableRouteOptions.value,
    selectedProduct.value?.defaultRouteId,
  );

  taskForm.ownerId = order.ownerId ?? '';
  taskForm.planStartDate = order.planStartDate ?? '';
  taskForm.planEndDate = order.planEndDate ?? '';
  taskForm.plannedQuantity = getWorkOrderRemaining(order);

  if (taskForm.plannedQuantity <= 0) {
    EMessage.warning('该工单已无可分配数量');
    return;
  }

  await refreshCreatePreview();
};

const refreshCreatePreview = async (
  options: { keepSteps?: boolean; keepMaterials?: boolean } = {},
) => {
  const requestToken = ++previewRequestToken;

  if (!taskForm.workOrderId || !taskForm.routeId || taskForm.plannedQuantity <= 0) {
    if (!options.keepSteps) createPreviewSteps.value = [];
    if (!options.keepMaterials) createPreviewMaterials.value = [];
    return true;
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (requestToken !== previewRequestToken) return true;

    if (!options.keepSteps) {
      createPreviewSteps.value = demoSteps.map((step) => ({
        ...step,
        responsibleUserId: null,
        sopFileId: null,
      }));
    }
    if (!options.keepMaterials) {
      createPreviewMaterials.value = demoMaterials.map((row) => ({
        ...row,
        planQuantity: row.planQuantity,
      }));
    }
    return true;
  } catch (error) {
    if (requestToken !== previewRequestToken) return false;
    if (!options.keepSteps) createPreviewSteps.value = [];
    if (!options.keepMaterials) createPreviewMaterials.value = [];
    EMessage.error(error instanceof Error ? error.message : '任务预览失败');
    return false;
  }
};

const handleRouteChange = async () => {
  await refreshCreatePreview();
};

const handleQuantityChange = async () => {
  await refreshCreatePreview();
};

const submitTask = async () => {
  if (taskForm.plannedQuantity <= 0 || (!editingTaskId.value && !taskForm.workOrderId)) {
    EMessage.warning('请选择所属工单并填写计划数量');
    return;
  }
  if (taskQuantityMax.value !== null && taskForm.plannedQuantity > taskQuantityMax.value) {
    EMessage.warning('计划数量不能超过工单剩余数量');
    return;
  }

  submitting.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    EMessage.success(editingTaskId.value ? '任务已更新' : '任务已新增');
    taskDialogVisible.value = false;
    await loadTasks();
  } finally {
    submitting.value = false;
  }
};

const openDetail = (row: ProductionBatchItem) => {
  activeTask.value = {
    id: row.id,
    batchNo: row.batchNo,
    workOrderNo: row.workOrderNo,
    productName: row.productName,
    itemCode: row.itemCode,
    routeName: row.routeName,
    plannedQuantity: row.plannedQuantity,
    ownerName: row.ownerName,
    routeId: row.routeId,
    steps: [
      {
        id: 's1',
        batchId: row.id,
        processRouteStepsId: 'prs1',
        stepOrder: 10,
        stepName: '上板',
        responsibleUserId: 'u1',
        responsibleUserName: '张工',
        sopFileId: 'sf1',
        status: 'completed' as BatchStepStatus,
        outputQuantity: '250',
        returnQuantity: '0',
        abnormalQuantity: '0',
        remark: null,
      },
      {
        id: 's2',
        batchId: row.id,
        processRouteStepsId: 'prs2',
        stepOrder: 20,
        stepName: '印刷',
        responsibleUserId: 'u1',
        responsibleUserName: '张工',
        sopFileId: null,
        status: 'completed' as BatchStepStatus,
        outputQuantity: '250',
        returnQuantity: '0',
        abnormalQuantity: '0',
        remark: null,
      },
      {
        id: 's3',
        batchId: row.id,
        processRouteStepsId: 'prs3',
        stepOrder: 30,
        stepName: '贴片',
        responsibleUserId: 'u2',
        responsibleUserName: '李工',
        sopFileId: 'sf2',
        status: 'doing' as BatchStepStatus,
        outputQuantity: '180',
        returnQuantity: '0',
        abnormalQuantity: '0',
        remark: null,
      },
      {
        id: 's4',
        batchId: row.id,
        processRouteStepsId: 'prs4',
        stepOrder: 40,
        stepName: '回流焊',
        responsibleUserId: null,
        responsibleUserName: null,
        sopFileId: null,
        status: 'pending' as BatchStepStatus,
        outputQuantity: '0',
        returnQuantity: '0',
        abnormalQuantity: '0',
        remark: null,
      },
      {
        id: 's5',
        batchId: row.id,
        processRouteStepsId: 'prs5',
        stepOrder: 50,
        stepName: 'AOI检测',
        responsibleUserId: null,
        responsibleUserName: null,
        sopFileId: 'sf3',
        status: 'pending' as BatchStepStatus,
        outputQuantity: '0',
        returnQuantity: '0',
        abnormalQuantity: '0',
        remark: null,
      },
    ],
    materialRequirements: [
      {
        id: 'm1',
        materialModel: 'RES-0603-10K',
        materialName: '贴片电阻 0603 10KΩ',
        quantityPerUnit: '10',
        planQuantity: '2500',
        usedQuantity: '1800',
        unit: '个',
        needBatchRecord: false,
      },
      {
        id: 'm2',
        materialModel: 'CAP-0805-100N',
        materialName: '贴片电容 0805 100nF',
        quantityPerUnit: '5',
        planQuantity: '1250',
        usedQuantity: '900',
        unit: '个',
        needBatchRecord: false,
      },
      {
        id: 'm3',
        materialModel: 'IC-ST-001',
        materialName: '主控芯片 STM32F103',
        quantityPerUnit: '1',
        planQuantity: '250',
        usedQuantity: '180',
        unit: '个',
        needBatchRecord: true,
      },
    ],
  };
  detailDialogVisible.value = true;
};

const generateMaterials = async (row: ProductionBatchItem) => {
  EMessage.success('已生成 3 条物料需求');
  await loadTasks();
};

const openDispatch = async (row: ProductionBatchItem) => {
  dispatchTaskId.value = row.id;
  dispatchRows.value = demoSteps.map((step) => ({
    ...step,
    responsibleUserId: step.responsibleUserId,
    sopFileId: step.sopFileId,
  }));
  dispatchDialogVisible.value = true;
};

const submitDispatch = async () => {
  if (!dispatchTaskId.value) return;
  submitting.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    EMessage.success('派工已保存');
    dispatchDialogVisible.value = false;
    await loadTasks();
  } finally {
    submitting.value = false;
  }
};

const startTask = async (row: ProductionBatchItem) => {
  EMessage.success('任务已开始');
  await loadTasks();
};

const finishTask = async (row: ProductionBatchItem) => {
  try {
    await ElMessageBox.confirm('确认完成该生产任务？', '完成任务', {
      confirmButtonText: '确认完成',
      cancelButtonText: '取消',
      type: 'info',
    });
  } catch {
    return;
  }
  EMessage.success('任务已完成');
  await loadTasks();
};

const openStepEdit = (row: BatchStepRecordItem) => {
  if (!activeTask.value) return;
  editingTaskId.value = activeTask.value.id;
  editingStepId.value = row.id;
  Object.assign(stepForm, {
    responsibleUserId: row.responsibleUserId ?? '',
    sopFileId: row.sopFileId ?? '',
    status: row.status,
    returnQuantity: Number(row.returnQuantity ?? 0),
    outputQuantity: Number(row.outputQuantity ?? 0),
    abnormalQuantity: Number(row.abnormalQuantity ?? 0),
    remark: row.remark ?? '',
  });
  stepDialogVisible.value = true;
};

const submitStep = async () => {
  if (!editingTaskId.value || !editingStepId.value) return;
  submitting.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
    EMessage.success('工序记录已更新');
    stepDialogVisible.value = false;
  } finally {
    submitting.value = false;
  }
};

const getTaskStatusMeta = (status: ProductionBatchStatus) =>
  taskStatusOptions.find((item) => item.value === status) ?? taskStatusOptions[0];
const formatProduct = (product: ProductListItem) => `${product.itemCode} / ${product.productName}`;
const formatTaskProduct = (order: WorkOrderListItem) => `${order.itemCode} / ${order.productName}`;
const formatRoute = (route: ProcessRouteListItem) =>
  `${route.routeName}${route.version ? ` / ${route.version}` : ''}`;
const getWorkOrderRemaining = (order: WorkOrderListItem) =>
  Math.max(Number(order.plannedQuantity) - Number(order.assignedQuantity), 0);
const formatWorkOrder = (order: WorkOrderListItem) =>
  [order.orderNo, order.itemCode, '剩余 ' + formatQuantity(getWorkOrderRemaining(order))].join(
    ' / ',
  );
const formatQuantity = (value: string | number | null) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '-';
};

const canUploadStepFile = (row: BatchStepRecordItem) =>
  Boolean(editingTaskId.value && row.batchId !== '0');
const createStepSopUploadHandler =
  (row: BatchStepRecordItem & { sopFileId: string | null }) => (file: UploadRawFile) =>
    uploadStepSopFile(file, row);
const uploadStepSopFile = (
  file: UploadRawFile,
  row: BatchStepRecordItem & { sopFileId: string | null },
) => {
  if (!editingTaskId.value || !canUploadStepFile(row)) return false;
  EMessage.success('实际参考文件已上传');
  return false;
};
const uploadEditingStepSopFile = (file: UploadRawFile) => {
  if (!editingTaskId.value || !editingStepId.value) return false;
  EMessage.success('实际参考文件已上传');
  return false;
};
const getSopFileName = (fileId: string | null) => {
  if (!fileId) return '-';
  return sopFileOptions.value.find((file) => file.id === fileId)?.name ?? `文件 #${fileId}`;
};
</script>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}
.page-title h2 {
  margin: 0;
  color: #283a50;
  font-size: 20px;
  font-weight: 600;
}
.page-title p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.query-panel {
  padding: 20px 20px 4px;
}

.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}

.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}

.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}

.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 180px;
}

.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}

.query-actions {
  margin-left: auto;
}

.query-actions :deep(.el-button) {
  min-width: 67px;
  height: 32px;
  border-radius: 6px;
}

.query-actions :deep(.el-button + .el-button) {
  margin-left: 12px;
}

.table-panel {
  overflow: hidden;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
}

.table-toolbar :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-title,
.batch-no,
.product-name {
  color: #1f2937;
  font-weight: 600;
}

.tasks-table,
.detail-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}

.tasks-table :deep(.el-table__header th),
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}

.tasks-table :deep(.el-table__row),
.detail-table :deep(.el-table__row) {
  height: 48px;
}

.tasks-table :deep(.el-table__row:hover),
.detail-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}

.tasks-table :deep(.el-table__cell),
.detail-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}

.tasks-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}

.tasks-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}

.tasks-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}

.tasks-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}

.tasks-table :deep(.el-tag--primary) {
  background: #e8f0fe;
  color: #306188;
}

.tasks-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}

.sub-text {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
}

.total-text {
  color: #6b7280;
  font-size: 14px;
}

.page-size-select {
  width: 78px;
}

.page-size-select :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
}

.table-footer :deep(.el-pagination) {
  gap: 4px;
}

.table-footer :deep(.el-pager li),
.table-footer :deep(.btn-prev),
.table-footer :deep(.btn-next) {
  min-width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.table-footer :deep(.el-pager li.is-active) {
  border-color: #306188;
  background: #306188;
  color: #ffffff;
}

.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-date-editor),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}

.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}

.dialog-form :deep(.el-button) {
  border-radius: 6px;
}

.detail-tabs {
  margin-top: 18px;
}

.file-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-cell :deep(.el-select) {
  flex: 1;
}

@media (max-width: 1120px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }

  .query-actions {
    margin-left: 0;
  }
}
</style>
