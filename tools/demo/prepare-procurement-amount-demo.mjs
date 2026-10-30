import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import { calculatePurchaseLineAmount } from '../../packages/utils/dist/index.js';

loadWorkspaceEnv({ quiet: true });

// Versioned API-created examples for manual acceptance; this is not a formal test suite.
const scenarios = [
  {
    name: 'inclusive-only-calculates',
    input: { plannedQuantity: 3, taxInclusiveAmount: '3.00' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: null,
      taxInclusiveAmount: '4.00',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '12.00',
    source: 'calculated',
  },
  {
    name: 'both-quotes-inclusive-basis',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2', taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2',
      taxInclusiveAmount: '99.00',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '297.00',
    source: 'calculated',
  },
  {
    name: 'inclusive-clear-uses-exclusive',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2', taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2',
      taxInclusiveAmount: null,
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '6.78',
    source: 'calculated',
  },
  {
    name: 'exclusive-add-with-inclusive',
    input: { plannedQuantity: 3, taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2.5000',
      taxInclusiveAmount: '3',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '9.00',
    source: 'calculated',
  },
  {
    name: 'exclusive-clear-keeps-inclusive',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2', taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: null,
      taxInclusiveAmount: '3',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '9.00',
    source: 'calculated',
  },
  {
    name: 'manual-zero-before-calculation',
    input: {
      plannedQuantity: 3,
      taxExclusiveAmount: '2',
      taxInclusiveAmount: '3',
      manualTotalAmount: '0',
    },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '4',
      taxInclusiveAmount: '50',
      taxRatePercent: '6',
      manualTotalAmount: '0',
    },
    total: '0.00',
    source: 'manual',
  },
  {
    name: 'clear-manual-with-only-inclusive',
    input: { plannedQuantity: 3, taxInclusiveAmount: '3', manualTotalAmount: '7' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: null,
      taxInclusiveAmount: '3',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '9.00',
    source: 'calculated',
  },
  {
    name: 'clear-manual-uses-exclusive',
    input: {
      plannedQuantity: 3,
      taxExclusiveAmount: '2',
      manualTotalAmount: '7',
    },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2',
      taxInclusiveAmount: null,
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '6.78',
    source: 'calculated',
  },
  {
    name: 'round-exclusive-half-up',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2' },
    state: 'completed',
    correction: {
      taxExclusiveAmount: '2.5000',
      taxInclusiveAmount: null,
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '8.48',
    source: 'calculated',
  },
  {
    name: 'rate-change-with-inclusive',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2', taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2',
      taxInclusiveAmount: '3',
      taxRatePercent: '0',
      manualTotalAmount: null,
    },
    total: '9.00',
    source: 'calculated',
  },
  {
    name: 'exclusive-zero-keeps-calculated',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '0',
      taxInclusiveAmount: null,
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '0.00',
    source: 'calculated',
  },
  {
    name: 'inclusive-zero-before-exclusive',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2', taxInclusiveAmount: '3' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2',
      taxInclusiveAmount: '0',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '0.00',
    source: 'calculated',
  },
  {
    name: 'round-inclusive-half-up',
    input: { plannedQuantity: 3, taxInclusiveAmount: '0.33' },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: null,
      taxInclusiveAmount: '0.335',
      taxRatePercent: '13',
      manualTotalAmount: null,
    },
    total: '1.01',
    source: 'calculated',
  },
  {
    name: 'manual-precision-correction-persists',
    input: {
      plannedQuantity: 3,
      taxExclusiveAmount: '2.5',
      taxInclusiveAmount: '3',
      manualTotalAmount: '9.01',
    },
    state: 'ordered',
    correction: {
      taxExclusiveAmount: '2.6000',
      taxInclusiveAmount: '3.0001',
      taxRatePercent: '6',
      manualTotalAmount: '9.01',
    },
    total: '9.01',
    source: 'manual',
  },
  {
    name: 'exclusive-only-default-tax',
    input: { plannedQuantity: 3, taxExclusiveAmount: '2' },
    total: '6.78',
    source: 'calculated',
  },
  {
    name: 'both-prices-empty',
    input: { plannedQuantity: 3 },
    total: null,
    source: null,
  },
  {
    name: 'manual-total-without-prices',
    input: { plannedQuantity: 3, manualTotalAmount: '9.01' },
    total: '9.01',
    source: 'manual',
  },
];

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-procurement-amount-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备或查询演示数据');
  const endpoint = new URL(
    process.env.PROCUREMENT_AMOUNT_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3002/api',
  );
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.replace(/\/$/, '').endsWith('/api')
  )
    throw new Error('API 地址须为无凭证、查询串及片段且以 /api 结尾的 HTTP(S) 地址');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (!local && process.env.PROCUREMENT_AMOUNT_DEMO_ALLOW_REMOTE !== '1')
    throw new Error(
      '默认只访问本地 API；远程地址须显式设置 PROCUREMENT_AMOUNT_DEMO_ALLOW_REMOTE=1',
    );
  if (!local && endpoint.protocol !== 'https:') throw new Error('远程演示 API 必须使用 HTTPS');
  const tag = process.env.PROCUREMENT_AMOUNT_DEMO_TAG;
  if (tag !== undefined && !/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('PROCUREMENT_AMOUNT_DEMO_TAG 须为 1～40 位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请先配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-procurement-amount-v5${tag ? `:${tag}` : ''}]`,
  };
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
  const result = await response.json().catch(() => null);
  if (typeof result?.accessToken !== 'string') throw new Error('管理员登录未返回访问凭证');
  let writesAttempted = 0;
  return {
    get writesAttempted() {
      return writesAttempted;
    },
    async request(path, body) {
      const method = body === undefined ? 'GET' : 'POST';
      if (method !== 'GET') {
        if (config.mode === 'report') throw new Error('report 模式不允许业务写入');
        writesAttempted += 1;
      }
      const response = await fetch(`${config.base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          'Content-Type': 'application/json',
          ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const code =
          typeof payload?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(payload.code)
            ? payload.code
            : 'UNKNOWN';
        // Never output request bodies, credentials, cookies or raw server responses.
        throw new Error(`${method} ${path} 失败：HTTP ${response.status} ${code}`);
      }
      if (payload === null) throw new Error(`${method} ${path} 未返回有效 JSON`);
      return payload;
    },
  };
}

async function allPages(client, path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await client.request(
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
    );
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0)
      throw new Error(`分页响应不符合契约：${path}`);
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length) throw new Error(`分页在读取完成前返回空页：${path}`);
  }
}

function unique(rows, predicate, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} 未返回数组`);
  const matching = rows.filter(predicate);
  if (matching.length !== 1) throw new Error(`${label} 应精确匹配一项，实际 ${matching.length} 项`);
  return matching[0];
}

async function references(client) {
  const supplierName = '演示共批供应商甲';
  const materialCode = 'demo-stock-multi';
  const variantCode = 'demo-stock-multi-v1-A';
  const suppliers = await allPages(
    client,
    `/procurement/suppliers?keyword=${encodeURIComponent(supplierName)}`,
  );
  const supplier = unique(suppliers, (row) => row.supplierName === supplierName, '演示供应商');
  const materials = await client.request(
    `/procurement/material-options?keyword=${encodeURIComponent(materialCode)}`,
  );
  const material = unique(materials, (row) => row.materialCode === materialCode, '演示基础物料');
  const variants = await client.request(
    `/procurement/material-variants/options?materialId=${material.id}`,
  );
  const variant = unique(variants, (row) => row.variantCode === variantCode, '演示精确版本');
  return { supplierId: supplier.id, itemId: material.id, materialVariantId: variant.id };
}

const getOrder = (client, id) => client.request(`/procurement/purchase-orders/${id}`);
const markedOrders = async (client, marker) =>
  (await allPages(client, '/procurement/purchase-orders')).filter((order) =>
    order.remark?.includes(marker),
  );

async function prepareScenario(client, config, refs, scenario) {
  const created = await client.request('/procurement/purchase-orders', {
    supplierId: refs.supplierId,
    sourceType: 'stock',
    workOrderId: null,
    remark: `${config.marker} [scenario:${scenario.name}] 采购金额人工验收样例。`,
    items: [
      {
        itemId: refs.itemId,
        materialVariantId: refs.materialVariantId,
        demandIds: [],
        ...scenario.input,
      },
    ],
  });
  let order = await getOrder(client, created.purchaseOrderId);
  if (!scenario.state) return;
  await client.request(`/procurement/purchase-orders/${order.id}/actions/place`, {
    version: order.version,
  });
  order = await getOrder(client, order.id);
  if (scenario.state === 'completed') {
    await client.request(`/procurement/purchase-orders/${order.id}/actions/close`, {
      version: order.version,
      reason: `${config.marker} 准备已结束单的总额更正样例`,
    });
    order = await getOrder(client, order.id);
  }
  if (Object.hasOwn(scenario, 'correction')) {
    const line = unique(order.items, () => true, '样例采购行');
    await client.request(`/procurement/purchase-orders/${order.id}/actions/correct-amounts`, {
      version: order.version,
      items: [
        {
          id: line.id,
          version: line.version,
          ...scenario.correction,
        },
      ],
      reason: `${config.marker} [scenario:${scenario.name}] 根据供应商确认更正金额输入；手填含税总额优先，其次按含税单价乘采购量，无含税单价时按无税单价、数量及税率推算。`,
    });
  }
  if (scenario.state === 'cancelled') {
    await client.request(`/procurement/purchase-orders/${order.id}/actions/cancel`, {
      version: order.version,
      reason: `${config.marker} 准备已取消单的总额更正阻断样例`,
    });
  }
}

async function buildReport(client, config) {
  const orders = [];
  const issues = [];
  for (const row of await markedOrders(client, config.marker)) {
    const order = await getOrder(client, row.id);
    const corrections = (
      await allPages(
        client,
        `/system/logs?module=procurement&targetType=purchase_order&targetId=${order.id}`,
      )
    ).filter((log) => log.action === 'purchase-order.correct-amounts' && log.result === 'success');
    orders.push({
      id: order.id,
      purchaseNo: order.purchaseNo,
      status: order.status,
      version: order.version,
      remark: order.remark,
      lines: order.items.map((line) => ({
        id: line.id,
        version: line.version,
        plannedQuantity: line.plannedQuantity,
        taxExclusiveAmount: line.taxExclusiveAmount,
        taxInclusiveAmount: line.taxInclusiveAmount,
        taxRatePercent: line.taxRatePercent,
        totalAmount: line.totalAmount,
        totalAmountSource: line.totalAmountSource,
      })),
      corrections: corrections.map((log) => ({
        id: log.id,
        requestId: log.requestId,
        beforeData: log.beforeData,
        afterData: log.afterData,
      })),
    });
  }
  for (const scenario of scenarios) {
    const matches = orders.filter((row) => row.remark?.includes(`[scenario:${scenario.name}]`));
    if (matches.length !== 1) {
      issues.push(`${scenario.name} 应有且仅有一张采购单`);
      continue;
    }
    const order = matches[0];
    const line = order.lines.length === 1 ? order.lines[0] : undefined;
    if (!line || line.totalAmount !== scenario.total || line.totalAmountSource !== scenario.source)
      issues.push(`${scenario.name} 总金额或来源与初始样例不一致`);
    if (order.status !== (scenario.state ?? 'draft'))
      issues.push(`${scenario.name} 状态与初始样例不一致`);
    const expected = calculatePurchaseLineAmount({ ...scenario.input, ...scenario.correction });
    if (
      line &&
      (line.taxExclusiveAmount !== expected.taxExclusiveAmount ||
        line.taxInclusiveAmount !== expected.taxInclusiveAmount ||
        calculatePurchaseLineAmount({ plannedQuantity: 1, taxRatePercent: line.taxRatePercent })
          .taxRatePercent !== expected.taxRatePercent)
    )
      issues.push(`${scenario.name} 更正后报价或税率与初始样例不一致`);
    if (
      Object.hasOwn(scenario, 'correction') &&
      !order.corrections.some(
        (log) =>
          log.afterData?.items?.some(
            (item) =>
              item.id === line?.id &&
              item.taxExclusiveAmount === expected.taxExclusiveAmount &&
              item.taxInclusiveAmount === expected.taxInclusiveAmount &&
              log.beforeData?.items?.some(
                (before) =>
                  before.id === item.id &&
                  Object.hasOwn(before, 'taxExclusiveAmount') &&
                  Object.hasOwn(before, 'taxInclusiveAmount'),
              ) &&
              item.totalAmount === scenario.total &&
              item.totalAmountSource === scenario.source,
          ) && log.afterData?.reason?.includes(config.marker),
      )
    )
      issues.push(`${scenario.name} 缺少包含逐行两项报价、税率、总额、来源及原因的主单成功审计`);
  }
  return {
    marker: config.marker,
    expectedOrderCount: scenarios.length,
    orders,
    initialReadinessIssues: issues,
  };
}

async function main() {
  const config = configuration();
  const client = await login(config);
  if (config.mode === 'report') {
    console.log(JSON.stringify(await buildReport(client, config), null, 2));
    return;
  }
  if ((await markedOrders(client, config.marker)).length) {
    console.log(
      JSON.stringify(
        {
          blockedByExistingMarker: true,
          message: '已有相同标记，仅报告；需要新样例时设置新的 PROCUREMENT_AMOUNT_DEMO_TAG。',
          report: await buildReport(client, config),
        },
        null,
        2,
      ),
    );
    return;
  }
  try {
    const refs = await references(client);
    for (const scenario of scenarios) await prepareScenario(client, config, refs, scenario);
    const report = await buildReport(client, config);
    if (report.initialReadinessIssues.length)
      throw new Error('样例金额或审计不符合初始预期，请运行 report 核对');
    console.log(JSON.stringify({ prepared: true, ...report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          prepared: false,
          marker: config.marker,
          writesAttempted: client.writesAttempted,
          message: error instanceof Error ? error.message : '准备失败',
          recovery:
            '不自动重试或续写；保留已提交事实。先运行 report 核对，重新准备使用新 TAG 或重建开发库。',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '演示脚本未完成');
  process.exitCode = 1;
});
