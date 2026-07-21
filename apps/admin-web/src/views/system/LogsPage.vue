<template>
  <section>
    <div class="page-title">
      <div>
        <h2>操作日志</h2>
        <p>认证和 RBAC 关键操作审计</p>
      </div>
      <el-button
        @click="
          logs = demoData;
          total = demoData.length;
        "
        >刷新</el-button
      >
    </div>

    <div class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="模块、动作、用户、对象、IP或备注"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select
            v-model="query.logType"
            clearable
            placeholder="全部"
            style="width: 130px"
          >
            <el-option
              label="认证"
              value="auth"
            />
            <el-option
              label="操作"
              value="operation"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模块">
          <el-select
            v-model="query.module"
            clearable
            filterable
            placeholder="请选择模块"
            style="width: 170px"
          >
            <el-option
              v-for="item in operationLogModuleOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select
            v-model="query.result"
            clearable
            placeholder="全部"
            style="width: 130px"
          >
            <el-option
              label="成功"
              value="success"
            />
            <el-option
              label="失败"
              value="failed"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input
            v-model="query.userId"
            clearable
          />
        </el-form-item>
        <el-form-item label="请求ID">
          <el-input
            v-model="query.requestId"
            clearable
          />
        </el-form-item>
        <el-form-item label="对象类型">
          <el-input
            v-model="query.targetType"
            clearable
            placeholder="work_order / user"
          />
        </el-form-item>
        <el-form-item label="对象ID">
          <el-input
            v-model="query.targetId"
            clearable
          />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="query.createdAtRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            @click="searchLogs"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-panel">
      <el-table
        :data="logs"
        class="data-table"
      >
        <el-table-column
          prop="id"
          label="ID"
          width="90"
        />
        <el-table-column
          prop="logType"
          label="类型"
          width="100"
        />
        <el-table-column
          prop="module"
          label="模块"
          min-width="150"
        />
        <el-table-column
          prop="action"
          label="动作"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column
          label="用户"
          min-width="130"
        >
          <template #default="{ row }">
            {{ row.username ?? row.userId ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="targetType"
          label="对象"
          min-width="130"
        />
        <el-table-column
          prop="targetId"
          label="对象ID"
          width="100"
        />
        <el-table-column
          label="结果"
          width="100"
        >
          <template #default="{ row }">
            <el-tag :type="row.result === 'success' ? 'success' : 'danger'">
              {{ row.result }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="httpStatus"
          label="状态码"
          width="90"
        />
        <el-table-column
          prop="durationMs"
          label="耗时(ms)"
          width="100"
        />
        <el-table-column
          prop="ip"
          label="IP"
          min-width="140"
        />
        <el-table-column
          prop="remark"
          label="备注"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column
          prop="createdAt"
          label="时间"
          min-width="180"
        />
        <el-table-column
          label="详情"
          width="80"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row)"
              >查看</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <span class="total-text">共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="
            (page: number) => {
              currentPage = page;
            }
          "
        />
      </div>
    </div>

    <!-- 日志详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      title="日志详情"
      :width="DialogWidth.lg"
    >
      <el-descriptions
        v-if="activeLog"
        border
        :column="1"
        class="detail-block"
      >
        <el-descriptions-item label="动作">{{ activeLog.action }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{
          activeLog.username ?? activeLog.userId
        }}</el-descriptions-item>
        <el-descriptions-item label="对象"
          >{{ activeLog.targetType }} / {{ activeLog.targetId }}</el-descriptions-item
        >
        <el-descriptions-item label="结果">{{ activeLog.result }}</el-descriptions-item>
        <el-descriptions-item label="请求ID">{{ activeLog.requestId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="请求"
          >{{ activeLog.httpMethod || '-' }} {{ activeLog.route || '-' }}</el-descriptions-item
        >
        <el-descriptions-item label="状态 / 耗时"
          >{{ activeLog.httpStatus ?? '-' }} /
          {{ activeLog.durationMs ?? '-' }}ms</el-descriptions-item
        >
        <el-descriptions-item label="关联对象">{{
          JSON.stringify(activeLog.targetIds)
        }}</el-descriptions-item>
        <el-descriptions-item label="错误代码">{{
          activeLog.errorCode || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ activeLog.remark }}</el-descriptions-item>
      </el-descriptions>
      <h3>请求数据</h3>
      <pre>{{ JSON.stringify(activeLog?.requestData, null, 2) }}</pre>
      <h3>变更前数据</h3>
      <pre>{{ JSON.stringify(activeLog?.beforeData, null, 2) }}</pre>
      <h3>字段差异</h3>
      <pre>{{ JSON.stringify(activeDiff, null, 2) }}</pre>
      <h3>返回 / 变更后数据</h3>
      <pre>{{ JSON.stringify(activeLog?.afterData, null, 2) }}</pre>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { OPERATION_LOG_MODULE_OPTIONS } from '@company/contracts';
import { DialogWidth } from '../../utils/dialog';

defineOptions({ name: 'LogsPage' });

const demoData = [
  {
    id: '1',
    logType: 'auth',
    module: 'auth',
    action: '用户登录',
    userId: '1',
    username: 'admin',
    targetId: null,
    targetType: null,
    targetIds: null,
    businessKey: null,
    result: 'success',
    requestId: 'req-001',
    httpMethod: 'POST',
    route: '/api/auth/login',
    httpStatus: 200,
    durationMs: 45,
    requestData: { username: 'admin' },
    beforeData: null,
    afterData: { loginTime: '2026-07-21T09:00:00' },
    ip: '192.168.1.100',
    userAgent: null,
    errorCode: null,
    remark: '登录成功',
    createdAt: '2026-07-21 09:00:00',
  },
  {
    id: '2',
    logType: 'operation',
    module: 'system',
    action: '创建用户',
    userId: '1',
    username: 'admin',
    targetId: '5',
    targetType: 'user',
    targetIds: null,
    businessKey: null,
    result: 'success',
    requestId: 'req-002',
    httpMethod: 'POST',
    route: '/api/system/users',
    httpStatus: 201,
    durationMs: 120,
    requestData: { username: 'operator1', displayName: '操作员' },
    beforeData: null,
    afterData: { id: '5', username: 'operator1' },
    ip: '192.168.1.100',
    userAgent: null,
    errorCode: null,
    remark: '新用户创建',
    createdAt: '2026-07-21 09:30:00',
  },
  {
    id: '3',
    logType: 'operation',
    module: 'system',
    action: '更新角色权限',
    userId: '1',
    username: 'admin',
    targetId: '2',
    targetType: 'role',
    targetIds: null,
    businessKey: null,
    result: 'success',
    requestId: 'req-003',
    httpMethod: 'PUT',
    route: '/api/system/roles/2/permissions',
    httpStatus: 200,
    durationMs: 85,
    requestData: { permissionIds: ['1', '2', '3'] },
    beforeData: { permissionIds: ['1', '2'] },
    afterData: { permissionIds: ['1', '2', '3'] },
    ip: '192.168.1.100',
    userAgent: null,
    errorCode: null,
    remark: '添加了查看权限',
    createdAt: '2026-07-21 10:00:00',
  },
  {
    id: '4',
    logType: 'operation',
    module: 'product',
    action: '更新产品信息',
    userId: '2',
    username: 'operator1',
    targetId: '1',
    targetType: 'product',
    targetIds: null,
    businessKey: null,
    result: 'failed',
    requestId: 'req-004',
    httpMethod: 'PUT',
    route: '/api/products/1',
    httpStatus: 422,
    durationMs: 200,
    requestData: { productName: '', unit: 'pcs' },
    beforeData: null,
    afterData: null,
    ip: '192.168.1.101',
    userAgent: null,
    errorCode: 'VALIDATION_ERROR',
    remark: '产品名称为空',
    createdAt: '2026-07-21 11:00:00',
  },
];

const logs = ref(demoData);
const total = ref(demoData.length);
const currentPage = ref(1);
const pageSize = 10;
const detailVisible = ref(false);
const activeLog = ref<any>(null);
const activeDiff = computed(() =>
  buildDiff(activeLog.value?.beforeData, activeLog.value?.afterData),
);

const operationLogModuleOptions = OPERATION_LOG_MODULE_OPTIONS;

const query = reactive({
  keyword: '',
  logType: '',
  module: '',
  result: '',
  userId: '',
  requestId: '',
  targetType: '',
  targetId: '',
  createdAtRange: [] as string[],
});

const searchLogs = () => {
  currentPage.value = 1;
};

const resetQuery = () => {
  Object.assign(query, {
    keyword: '',
    logType: '',
    module: '',
    result: '',
    userId: '',
    requestId: '',
    targetType: '',
    targetId: '',
    createdAtRange: [],
  });
  currentPage.value = 1;
};

const openDetail = (row: any) => {
  activeLog.value = row;
  detailVisible.value = true;
};

const buildDiff = (before: unknown, after: unknown) => {
  if (!isRecord(before) || !isRecord(after)) return null;
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { before: before[key], after: after[key] };
    }
  }
  return diff;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
</script>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
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
  padding: 16px 20px 4px;
  margin-bottom: 16px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 12px;
}
.query-form :deep(.el-form-item__label) {
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
}
.query-form :deep(.el-input__wrapper),
.query-form :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}

.table-panel {
  overflow: hidden;
}

.data-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.data-table :deep(.el-table__row) {
  height: 48px;
}
.data-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.data-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.data-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.data-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.data-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
}
.total-text {
  color: #6b7280;
  font-size: 14px;
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
.table-footer :deep(.el-pagination__jump) {
  margin-left: 12px;
  color: #6b7280;
}
.table-footer :deep(.el-pagination__editor) {
  width: 48px;
}

.detail-block {
  margin-bottom: 18px;
}
.detail-block :deep(.el-descriptions__label) {
  color: #1f2937;
  font-weight: 500;
}

h3 {
  margin: 18px 0 8px;
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
}

pre {
  max-height: 260px;
  overflow: auto;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  font-size: 12px;
  line-height: 1.5;
}
</style>
