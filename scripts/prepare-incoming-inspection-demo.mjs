import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../packages/config/dist/index.js';

loadWorkspaceEnv({ quiet: true });

const groupPath = '/quality/inbound-inspection-orders';

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node scripts/prepare-incoming-inspection-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(
    process.env.INCOMING_INSPECTION_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3002/api',
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
  if (
    !local &&
    (process.env.INCOMING_INSPECTION_DEMO_ALLOW_REMOTE !== '1' || endpoint.protocol !== 'https:')
  )
    throw new Error('远程地址要求 HTTPS 和 INCOMING_INSPECTION_DEMO_ALLOW_REMOTE=1');
  const tag = process.env.INCOMING_INSPECTION_DEMO_TAG;
  if (tag !== undefined && !/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('INCOMING_INSPECTION_DEMO_TAG 须为 1～40 位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-incoming-group-v1${tag ? `:${tag}` : ''}]`,
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
  // JSON parse errors can include raw response fragments; keep authentication diagnostics static.
  const result = await response.json().catch(() => null);
  if (typeof result?.accessToken !== 'string' || !result.accessToken)
    throw new Error('管理员登录未返回访问凭证');
  let writesAttempted = 0;
  return {
    get writesAttempted() {
      return writesAttempted;
    },
    async request(path, body, method = body === undefined ? 'GET' : 'POST') {
      if (method !== 'GET') {
        if (config.mode !== 'prepare') throw new Error('report 模式禁止业务写入');
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
      const value = await response.json().catch(() => null);
      if (!response.ok) {
        const code =
          typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code)
            ? value.code
            : 'UNKNOWN';
        // 不输出请求体、原始响应及凭证；失败写入不自动换键重试。
        throw new Error(`${method} ${path} 失败：HTTP ${response.status} ${code}`);
      }
      if (value === null) throw new Error(`${method} ${path} 未返回 JSON`);
      return value;
    },
  };
}

async function allPages(client, path) {
  const items = [];
  for (let page = 1; page <= 1000; page += 1) {
    const result = await client.request(
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
    );
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total))
      throw new Error(`分页契约错误：${path}`);
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length) throw new Error(`分页提前结束：${path}`);
  }
  throw new Error('演示数据查询超出安全分页上限');
}

function unique(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1)
    throw new Error(`${label} 应匹配一项，实际 ${matches.length} 项；请先加载 demo`);
  return matches[0];
}

async function references(client) {
  const suppliers = await allPages(
    client,
    '/procurement/suppliers?keyword=' + encodeURIComponent('演示共批供应商'),
  );
  const supplierIds = ['演示共批供应商甲', '演示共批供应商乙'].map(
    (name) => unique(suppliers, (row) => row.supplierName === name, name).id,
  );
  const materials = await client.request('/procurement/material-options?keyword=demo-stock-multi');
  const material = unique(materials, (row) => row.materialCode === 'demo-stock-multi', '演示物料');
  const variants = await client.request(
    `/procurement/material-variants/options?materialId=${material.id}`,
  );
  const variant = unique(
    variants,
    (row) => row.variantCode === 'demo-stock-multi-v1-A',
    '演示精确版本',
  );
  return { supplierIds, itemId: material.id, materialVariantId: variant.id };
}

const note = (config, scenario) => `${config.marker} [scenario:${scenario}] 人工验收样例`;

async function createPurchase(client, config, refs, index) {
  const created = await client.request('/procurement/purchase-orders', {
    supplierId: refs.supplierIds[index],
    sourceType: 'stock',
    workOrderId: null,
    remark: note(config, `purchase-${index + 1}`),
    items: [
      {
        itemId: refs.itemId,
        materialVariantId: refs.materialVariantId,
        plannedQuantity: 1000,
        demandIds: [],
      },
    ],
  });
  await client.request(`/procurement/purchase-orders/${created.purchaseOrderId}/actions/place`, {
    version: created.version,
  });
  return created.purchaseOrderId;
}

async function createReceipt(client, config, orderId, scenario, lineCount = 1) {
  const order = await client.request(`/procurement/purchase-orders/${orderId}`);
  const line = unique(order.items, () => true, '样例采购行');
  const created = await client.request('/procurement/receipts/actions/confirm', {
    purchaseOrderId: order.id,
    purchaseOrderVersion: order.version,
    receivedAt: new Date().toISOString(),
    handoverEvidence: note(config, `${scenario}-handover`),
    remark: note(config, scenario),
    details: Array.from({ length: lineCount }, (_, index) => ({
      purchaseOrderLineId: line.id,
      version: line.version,
      receivedQuantity: 5,
      supplierBatchCode: `DEMO-QC-${scenario}-${index + 1}`,
    })),
  });
  const detail = await client.request(`/procurement/receipts/${created.receiptId}`);
  return {
    id: detail.id,
    lineId: detail.items[0].id,
  };
}

async function createGroup(client, config, scenario, receipts) {
  const result = await client.request(groupPath, {
    remark: note(config, scenario),
    receipts: receipts.map((receipt) => ({ receiptId: receipt.id, fromOrderId: null })),
    expectedOrders: [],
  });
  return result.order;
}

async function move(client, receiptId, fromOrderId, toOrderId) {
  const expectedOrders = [];
  for (const id of new Set([fromOrderId, toOrderId].filter(Boolean))) {
    const order = await client.request(`${groupPath}/${id}`);
    expectedOrders.push({ orderId: id, expectedVersion: order.version });
  }
  return client.request(`${groupPath}/associations`, {
    changes: [{ receiptId, fromOrderId, toOrderId }],
    expectedOrders,
  });
}

async function startReview(client, config, receiptLineId) {
  const line = await client.request(`/procurement/receipt-lines/${receiptLineId}`);
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/start-review`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    reason: note(config, 'review'),
  });
}

async function completeReview(
  client,
  config,
  receiptLineId,
  qualifiedQuantity = 5,
  unqualifiedQuantity = 0,
) {
  const line = await client.request(`/quality/inbound-inspections/receipt-lines/${receiptLineId}`);
  const current = unique(
    line.cases,
    (row) => row.roundId === line.currentRound.id && row.status === 'reviewing',
    '当前检验',
  );
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/inspect`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    caseId: current.id,
    caseVersion: current.version,
    receiptRevisionId: line.currentReceiptRevisionId,
    inspectionMethod: 'full',
    qualifiedQuantity,
    unqualifiedQuantity,
    releaseDecision: 'released',
    inspectedAt: new Date().toISOString(),
    remark: note(config, 'completed'),
    evidence: note(config, 'inspection-evidence'),
  });
}

async function voidReceipt(client, config, receiptId) {
  const detail = await client.request(`/procurement/receipts/${receiptId}/voiding`);
  if (!detail.voiding.canVoid) throw new Error('新建样例未满足整单作废资格');
  await client.request(`/procurement/receipts/${receiptId}/actions/void`, {
    version: detail.version,
    lines: detail.voiding.lines,
    reason: note(config, 'void'),
  });
}

async function executeReceipt(client, config, receiptLineId, returnedQuantity) {
  await startReview(client, config, receiptLineId);
  await completeReview(client, config, receiptLineId, 5 - returnedQuantity, returnedQuantity);
  const source = await client.request(
    `/procurement/receipt-lines/${receiptLineId}/acceptance-context`,
  );
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/accept`, {
    version: source.version,
    roundId: source.currentRound.id,
    roundVersion: source.currentRound.version,
    confirmedQuantity: 5,
    receiptRevisionId: source.currentReceiptRevisionId,
    caseId: source.currentInspectionCase.id,
    inspectionId: source.currentRound.inspectionId,
    physicalIdentityConfirmed: true,
    remark: note(config, 'physical-execution'),
    details: [
      { disposition: 'inbound', quantity: 5 - returnedQuantity, returnReason: null },
      ...(returnedQuantity
        ? [{ disposition: 'return', quantity: returnedQuantity, returnReason: 'quality' }]
        : []),
    ],
  });
  const releases = await allPages(
    client,
    `/procurement/inbound-releases?receiptLineId=${receiptLineId}`,
  );
  await client.request('/procurement/purchase-inbounds/actions/confirm', {
    remark: note(config, 'physical-inbound'),
    details: releases.map((row) => ({
      receiptLineId,
      version: row.receiptLineVersion,
      roundId: row.roundId,
      roundVersion: row.roundVersion,
      receiptRevisionId: row.receiptRevisionId,
      allocationId: row.allocationId,
      inspectionId: row.inspectionId,
      quantity: Number(row.approvedRemainingQuantity),
      target: { mode: 'new', clientKey: `demo-qc-${row.allocationId}` },
    })),
  });
  if (returnedQuantity) {
    const current = await client.request(`/procurement/receipt-lines/${receiptLineId}`);
    const allocation = unique(
      current.allocations,
      (row) => row.disposition === 'return',
      '本轮退回授权',
    );
    await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/return`, {
      version: current.version,
      roundId: current.currentRound.id,
      roundVersion: current.currentRound.version,
      allocationId: allocation.id,
      receiptRevisionId: current.currentReceiptRevisionId,
      returnedAt: new Date().toISOString(),
      handoverEvidence: note(config, 'supplier-return'),
    });
  }
}

async function prepare(client, config) {
  const refs = await references(client);
  const purchases = [];
  for (let index = 0; index < 2; index += 1)
    purchases.push(await createPurchase(client, config, refs, index));
  const many = [];
  for (let index = 0; index < 12; index += 1)
    many.push(
      await createReceipt(
        client,
        config,
        purchases[index % 2],
        `large-${index + 1}`,
        index === 0 ? 100 : 1,
      ),
    );
  const singles = [];
  for (let index = 0; index < 10; index += 1)
    singles.push(await createReceipt(client, config, purchases[index % 2], `single-${index + 1}`));
  const unassigned = await createReceipt(client, config, purchases[0], 'unassigned-completed');
  await startReview(client, config, unassigned.lineId);
  await completeReview(client, config, unassigned.lineId);
  const emptySource = await createReceipt(client, config, purchases[1], 'empty-group-source');
  const voided = await createReceipt(client, config, purchases[1], 'unassigned-void');
  await voidReceipt(client, config, voided.id);
  // 先建立十个分页主单，再建立空组和大组，默认首组就能看到完整复杂样例。
  const groups = [];
  for (let index = 0; index < singles.length; index += 1)
    groups.push(await createGroup(client, config, `page-${index + 1}`, [singles[index]]));
  const empty = await createGroup(client, config, 'empty', [emptySource]);
  await move(client, emptySource.id, empty.id, null);
  const large = await createGroup(client, config, 'large-cross-supplier', many);
  await startReview(client, config, many[1].lineId);
  // 检查中移出并移回，留下原检验草稿来源；成功操作日志保留真实前后归属。
  await move(client, many[1].id, large.id, groups[0].id);
  await move(client, many[1].id, groups[0].id, large.id);
  await startReview(client, config, many[2].lineId);
  await completeReview(client, config, many[2].lineId);
  await voidReceipt(client, config, many[3].id);
  await executeReceipt(client, config, singles[7].lineId, 0);
  await executeReceipt(client, config, singles[8].lineId, 1);
}

async function report(client, config) {
  const groups = (await allPages(client, groupPath)).filter((row) =>
    row.remark?.includes(config.marker),
  );
  const purchases = (await allPages(client, '/procurement/purchase-orders')).filter((row) =>
    row.remark?.includes(config.marker),
  );
  const receipts = [];
  for (const purchase of purchases)
    receipts.push(
      ...(await allPages(client, `/procurement/receipts?purchaseOrderId=${purchase.id}`)),
    );
  const summaries = [];
  for (const group of groups) {
    const page = await client.request(`${groupPath}/${group.id}/receipts?page=1&pageSize=10`);
    summaries.push({
      id: group.id,
      inspectionNo: group.inspectionNo,
      version: group.version,
      remark: group.remark,
      receiptCount: page.total,
    });
  }
  return {
    marker: config.marker,
    groups: summaries,
    receipts: receipts.map((row) => ({
      id: row.id,
      receiptNo: row.receiptNo,
      lineCount: row.lineCount,
      voided: row.void !== null,
      remark: row.remark,
    })),
    manualScenarios: [
      '主单第2页',
      '大组到货第2页',
      '单张到货100行',
      '检查中整单移组',
      '未分组已完成检查',
      '空主单',
      '已关联后作废',
      '未关联作废不进入候选',
      '两个窗口使用旧版本提交关联冲突',
      '全部入库以及入库加退回后剩余为零',
    ],
  };
}

let client;
try {
  const config = configuration();
  client = await login(config);
  const before = await report(client, config);
  const exists =
    before.groups.length > 0 ||
    before.receipts.length > 0 ||
    (await allPages(client, '/procurement/purchase-orders')).some((row) =>
      row.remark?.includes(config.marker),
    );
  let prepared = false;
  if (config.mode === 'prepare' && !exists) {
    await prepare(client, config);
    prepared = true;
  }
  console.log(
    JSON.stringify(
      { prepared, existingDataPreserved: exists, ...(await report(client, config)) },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : '演示准备失败');
  console.error(
    `已尝试 ${client?.writesAttempted ?? 0} 次业务写入；已成功事实保留，不自动重试。可先运行 report，重新准备使用新的 TAG。`,
  );
  process.exitCode = 1;
}
