import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import { APPROVAL_SCENE_CODES, SYSTEM_STATUS } from '../../packages/constants/dist/index.js';
import { toBeijingDateString } from '../../packages/utils/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-optional-approval-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(
    process.env.OPTIONAL_APPROVAL_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3003/api',
  );
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.replace(/\/$/, '').endsWith('/api')
  )
    throw new Error('审批样例工具只允许本地、无凭证且以 /api 结尾的 API 地址');
  const tag = (process.env.OPTIONAL_APPROVAL_DEMO_TAG ?? 'sample').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(tag))
    throw new Error('OPTIONAL_APPROVAL_DEMO_TAG 须为1～40位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  const specificationFileId = process.env.OPTIONAL_APPROVAL_DEMO_SPECIFICATION_FILE_ID;
  if (specificationFileId !== undefined && !/^[1-9]\d{0,19}$/.test(specificationFileId))
    throw new Error('OPTIONAL_APPROVAL_DEMO_SPECIFICATION_FILE_ID 须为已有规格书文件ID');
  return {
    mode,
    tag,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-optional-approval-v1:${tag}]`,
    productCode: `demo-optional-approval-${tag}`,
    sourceProductCode: process.env.OPTIONAL_APPROVAL_DEMO_SOURCE_PRODUCT_CODE ?? 'p-micro-20-30',
    materialCode: process.env.OPTIONAL_APPROVAL_DEMO_MATERIAL_CODE ?? 'm1.077.012',
    variantCode: process.env.OPTIONAL_APPROVAL_DEMO_VARIANT_CODE,
    specificationFileId,
  };
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value))
    throw new Error('API 返回了无效的业务ID');
  return value;
}

function versionOf(record) {
  if (!Number.isSafeInteger(record?.version) || record.version < 0)
    throw new Error('API 返回了无效的业务版本');
  return record.version;
}

function arrayOf(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name}未返回数组`);
  return value;
}

function unique(rows, predicate, name) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw new Error(`${name}需精确匹配一项，请核对现有演示资料`);
  return matches[0];
}

async function login(config) {
  const response = await fetch(`${config.base}/auth/login`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME ?? 'admin',
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  if (!response.ok) throw new Error(`管理员登录失败：HTTP ${response.status}`);
  const session = await response.json();
  if (typeof session.accessToken !== 'string' || !session.accessToken)
    throw new Error('管理员登录未返回访问凭证');
  return {
    writesAttempted: 0,
    async request(path, { method = 'GET', body, idempotent = false } = {}) {
      if (method !== 'GET' && config.mode !== 'prepare') throw new Error('report模式禁止业务写入');
      if (method !== 'GET') this.writesAttempted += 1;
      const response = await fetch(`${config.base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          ...(idempotent ? { 'Idempotency-Key': randomUUID() } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const code =
          typeof data?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code)
            ? data.code
            : 'UNKNOWN';
        throw new Error(`${method} ${path}：HTTP ${response.status} ${code}`);
      }
      if (method === 'GET' && data === null) throw new Error(`${path}未返回JSON`);
      return data;
    },
  };
}

async function allPages(client, path) {
  const rows = [];
  for (let page = 1; page <= 1000; page += 1) {
    const data = await client.request(
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
    );
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0)
      throw new Error(`分页契约异常：${path}`);
    rows.push(...data.items);
    if (rows.length >= data.total) return rows;
    if (!data.items.length) throw new Error(`分页提前结束：${path}`);
  }
  throw new Error('超出场景查询分页上限');
}

async function markedRecords(client, config) {
  const products = (
    await allPages(client, `/product/products?keyword=${encodeURIComponent(config.productCode)}`)
  ).filter((row) => row.itemCode.toLowerCase() === config.productCode);
  const orders = (await allPages(client, '/production/work-orders')).filter(
    (row) =>
      row.externalOrderNo === config.productCode ||
      row.remark?.startsWith(config.marker) ||
      row.productCode.toLowerCase() === config.productCode,
  );
  return { products, orders };
}

async function scenes(client) {
  const rows = arrayOf(await client.request('/approval/scenes'), '审批场景');
  return [APPROVAL_SCENE_CODES.bom, APPROVAL_SCENE_CODES.demandCorrection].map((code) => {
    const row = unique(rows, (item) => item.code === code, '审批场景');
    if (typeof row.isEnabled !== 'boolean')
      throw new Error('API尚未提供审批场景开关，请先部署匹配版本');
    return {
      code,
      name: row.name,
      isEnabled: row.isEnabled,
      definitionVersion: row.definitionVersion,
      configured: row.configured,
      activeFlowVersion: row.activeFlowVersion,
    };
  });
}

function ownerOf(value, name) {
  const [owner] = arrayOf(value, name);
  if (!owner) throw new Error(`${name}没有当前合格人员，请先核对业务人员配置`);
  return identifier(owner.id);
}

async function references(client, config) {
  await scenes(client);
  const source = unique(
    await allPages(
      client,
      `/product/products?keyword=${encodeURIComponent(config.sourceProductCode)}`,
    ),
    (row) => row.itemCode === config.sourceProductCode,
    '来源成品',
  );
  const productOptions = arrayOf(await client.request('/product/products/options'), '有效成品');
  if (
    source.status !== SYSTEM_STATUS.enabled ||
    source.acquireMethod !== 'self_made' ||
    !productOptions.some((row) => row.id === source.id)
  )
    throw new Error('来源成品及分类必须有效，且成品须为自制');
  const specificationFileId = config.specificationFileId ?? source.specificationFileId;
  const files = await allPages(client, '/product/technical-files?fileType=specification&status=1');
  if (!specificationFileId || !files.some((file) => file.id === specificationFileId))
    throw new Error('来源成品须先关联真实启用规格书，或显式指定已有有效规格书文件ID');
  const material = unique(
    arrayOf(
      await client.request(
        `/production/material-demands/material-options?keyword=${encodeURIComponent(config.materialCode)}`,
      ),
      '生产物料',
    ),
    (row) => row.materialCode === config.materialCode,
    '有效物料',
  );
  const variants = arrayOf(
    await client.request(`/product/material-variants/by-material/${identifier(material.id)}`),
    '启用物料版本',
  );
  const variant = variants.find(
    (row) =>
      row.status === SYSTEM_STATUS.enabled &&
      (config.variantCode === undefined || row.variantCode === config.variantCode),
  );
  if (!variant) throw new Error('指定物料没有匹配的启用精确版本');
  return {
    source,
    specificationFileId,
    material,
    variant,
    workOrderOwnerId: ownerOf(
      await client.request('/production/work-orders/owner-options'),
      '工单负责人',
    ),
    taskOwnerId: ownerOf(await client.request('/production/batches/owner-options'), '任务负责人'),
  };
}

async function prepare(client, config, refs) {
  const created = await client.request('/product/products', {
    method: 'POST',
    body: {
      itemCode: config.productCode,
      productName: `审批验收样例 ${config.tag}`,
      categoryId: refs.source.categoryId,
      unit: refs.source.unit,
      acquireMethod: 'self_made',
      specValues: refs.source.specValues,
      specificationFileId: refs.specificationFileId,
      status: SYSTEM_STATUS.enabled,
      remark: `${config.marker} 复用来源成品资料的独立BOM草稿`,
    },
  });
  const productId = identifier(created?.id);
  const product = unique(
    await allPages(client, `/product/products?keyword=${encodeURIComponent(config.productCode)}`),
    (row) => row.id === productId,
    '新成品',
  );
  await client.request(`/product/products/${productId}/materials`, {
    method: 'PUT',
    body: {
      version: versionOf(product),
      items: [
        {
          materialId: identifier(refs.material.id),
          quantityPerUnit: 1,
          unit: refs.material.unit,
          remark: `${config.marker} 保留草稿，供手工提交`,
        },
      ],
    },
  });
  const now = Date.now();
  const dates = {
    planStartDate: toBeijingDateString(now),
    planEndDate: toBeijingDateString(now + 7 * 24 * 60 * 60 * 1000),
  };
  const order = await client.request('/production/work-orders', {
    method: 'POST',
    idempotent: true,
    body: {
      orderType: 'research',
      productId,
      plannedQuantity: 10,
      workOrderOwnerId: refs.workOrderOwnerId,
      ...dates,
      externalOrderNo: config.productCode,
      remark: `${config.marker} 仅为新建需求更正样例提供来源`,
    },
  });
  const orderId = identifier(order?.id);
  await client.request(`/production/work-orders/${orderId}/actions/release`, {
    method: 'POST',
    body: { version: versionOf(order) },
  });
  const batch = await client.request(`/production/work-orders/${orderId}/batches`, {
    method: 'POST',
    idempotent: true,
    body: {
      plannedQuantity: 10,
      ownerId: refs.taskOwnerId,
      ...dates,
      remark: `${config.marker} 研发任务，不依赖BOM批准且不开始生产`,
    },
  });
  const batchId = identifier(batch?.id);
  await client.request(`/production/batches/${batchId}/actions/release`, {
    method: 'POST',
    idempotent: true,
    body: { version: versionOf(batch) },
  });
  for (const scenario of [
    { name: 'quantity', quantity: 10 },
    { name: 'close', quantity: 5 },
  ]) {
    await client.request(`/production/batches/${batchId}/material-demands/additions`, {
      method: 'POST',
      idempotent: true,
      body: {
        reason: `${config.marker} ${scenario.name}：留待手工更正或关闭的独立人工需求`,
        requirements: [
          {
            materialId: refs.material.id,
            splits: [
              { materialVariantId: identifier(refs.variant.id), quantity: scenario.quantity },
            ],
          },
        ],
      },
    });
  }
}

async function demandReport(client, config, batchId) {
  const rows = await allPages(
    client,
    `/production/material-demands?productionBatchId=${identifier(batchId)}`,
  );
  const demands = [];
  for (const row of rows) {
    for (const demand of row.demands) {
      const demandId = identifier(demand.demandId);
      const path = `/production/material-demands/${demandId}`;
      const check = await client.request(`${path}/correction-check`);
      if (!check.sourceReason?.startsWith(config.marker)) continue;
      const history = arrayOf(await client.request(`${path}/corrections`), '需求更正历史');
      const close = check.sourceReason.startsWith(`${config.marker} close：`);
      const issued = Number(check.issuedQuantity);
      const current = Number(check.currentTotalQuantity);
      const target = close ? issued : Math.max(issued, current - 4);
      demands.push({
        demandId,
        scenario: close ? 'close' : 'quantity',
        materialCode: check.itemCode,
        materialVariantCode: check.materialVariantCode,
        businessStatus: demand.businessStatus,
        currentTotalQuantity: check.currentTotalQuantity,
        issuedQuantity: check.issuedQuantity,
        oldRemainingQuantity: check.oldRemainingQuantity,
        version: check.version,
        canCorrect: check.canCorrect,
        blockers: check.blockers,
        pendingCorrectionId: check.pendingCorrectionId,
        suggestedTargetTotalQuantity: check.canCorrect && target !== current ? target : null,
        history: history.map((entry) => ({
          correctionId: entry.id,
          oldDemandId: entry.oldDemandId,
          newDemandId: entry.newDemandId,
          approvalInstanceId: entry.approvalInstanceId,
          state: entry.state,
          targetTotalQuantity: entry.snapshot.targetTotalQuantity,
          createdAt: entry.createdAt,
          appliedAt: entry.appliedAt,
        })),
      });
    }
  }
  return demands;
}

async function report(client, config, outcome) {
  const records = await markedRecords(client, config);
  const boms = [];
  for (const product of records.products) {
    boms.push({
      productId: product.id,
      itemCode: product.itemCode,
      productName: product.productName,
      version: product.version,
      bomStatus: product.bomStatus,
      approvalInstanceId: product.bomApprovalInstanceId,
      lockedAt: product.bomLockedAt,
      lockedById: product.bomLockedById,
      specificationFileId: product.specificationFileId,
      materials: await client.request(`/product/products/${identifier(product.id)}/materials`),
    });
  }
  const researchOrders = [];
  for (const item of records.orders) {
    const order = await client.request(`/production/work-orders/${identifier(item.id)}`);
    const batches = [];
    for (const batch of order.batches) {
      batches.push({
        batchId: batch.id,
        batchNo: batch.batchNo,
        status: batch.status,
        version: batch.version,
        demands: await demandReport(client, config, batch.id),
      });
    }
    researchOrders.push({
      orderId: order.id,
      workOrderNo: order.workOrderNo,
      status: order.status,
      version: order.version,
      batches,
    });
  }
  return {
    outcome,
    marker: config.marker,
    writesAttempted: client.writesAttempted,
    currentApprovalScenes: await scenes(client),
    boms,
    researchOrders,
  };
}

async function main() {
  const config = configuration();
  const client = await login(config);
  try {
    let outcome = 'report';
    if (config.mode === 'prepare') {
      const previous = await markedRecords(client, config);
      if (previous.products.length || previous.orders.length) {
        outcome = 'existing-report-only';
      } else {
        const refs = await references(client, config);
        await prepare(client, config, refs);
        outcome = 'prepared';
      }
    }
    console.log(JSON.stringify(await report(client, config, outcome), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        marker: config.marker,
        writesAttempted: client.writesAttempted,
        message: error instanceof Error ? error.message : '审批样例准备失败',
        recovery: '不自动重试或续写。先用同TAG运行report核对；另一组样例使用新TAG。',
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '审批样例工具未完成');
  process.exitCode = 1;
});
