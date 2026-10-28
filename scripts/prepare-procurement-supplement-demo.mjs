import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../packages/config/dist/index.js';

loadWorkspaceEnv({ quiet: true });

const scenarios = {
  excessOriginal: 'excess-original',
  excessBefore: 'excess-before-inbound',
  excessAfter: 'excess-after-inbound',
  qualityOriginal: 'quality-original',
  qualityDraft: 'quality-old-draft',
  qualityContinued: 'quality-old-continued',
  uninspected: 'source-uninspected',
  pending: 'source-all-pending',
  returned: 'source-all-return',
  history: 'source-quality-returned-history',
  historySupplement: 'quality-history-receipt-draft',
};

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'prepare-history', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error(
      '用法：node scripts/prepare-procurement-supplement-demo.mjs [prepare|prepare-history|report]',
    );
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备或查询演示数据');
  const endpoint = new URL(
    process.env.PROCUREMENT_SUPPLEMENT_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3002/api',
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
  if (!local && process.env.PROCUREMENT_SUPPLEMENT_DEMO_ALLOW_REMOTE !== '1')
    throw new Error(
      '默认只访问本地 API；远程地址须显式设置 PROCUREMENT_SUPPLEMENT_DEMO_ALLOW_REMOTE=1',
    );
  if (!local && endpoint.protocol !== 'https:') throw new Error('远程演示 API 必须使用 HTTPS');
  const tag = process.env.PROCUREMENT_SUPPLEMENT_DEMO_TAG;
  if (tag !== undefined && !/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('PROCUREMENT_SUPPLEMENT_DEMO_TAG 须为 1～40 位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请先配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-supplement-decoupled-v1${tag ? `:${tag}` : ''}]`,
  };
}

function createClient(config, accessToken) {
  let writesAttempted = 0;
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    if (method !== 'GET') {
      if (config.mode === 'report') throw new Error('report 模式不允许业务写入');
      writesAttempted += 1;
    }
    const response = await fetch(`${config.base}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof result?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(result.code)
          ? result.code
          : 'UNKNOWN';
      // 不输出请求体、原始响应、Cookie 或凭证；失败写入不自动换键重试。
      throw new Error(`${method} ${path} 失败：HTTP ${response.status} ${code}`);
    }
    if (result === null) throw new Error(`${method} ${path} 未返回有效 JSON`);
    return result;
  }
  return {
    request,
    get writesAttempted() {
      return writesAttempted;
    },
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
  return createClient(config, result.accessToken);
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

async function markedOrders(client, marker) {
  return (await allPages(client, '/procurement/purchase-orders')).filter((order) =>
    order.remark?.includes(marker),
  );
}

function unique(rows, predicate, name) {
  if (!Array.isArray(rows)) throw new Error(`${name} 未返回约定的数组`);
  const matching = rows.filter(predicate);
  if (matching.length !== 1) throw new Error(`${name} 应精确匹配一项，实际 ${matching.length} 项`);
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

function note(marker, scenario, message) {
  return `${marker} [scenario:${scenario}] ${message}；仅供人工验收。`;
}

async function getOrder(client, id) {
  return client.request(`/procurement/purchase-orders/${id}`);
}

async function place(client, orderId) {
  const order = await getOrder(client, orderId);
  await client.request(`/procurement/purchase-orders/${orderId}/actions/place`, {
    version: order.version,
  });
  return getOrder(client, orderId);
}

async function original(client, config, refs, scenario, plannedQuantity, message) {
  const result = await client.request('/procurement/purchase-orders', {
    supplierId: refs.supplierId,
    sourceType: 'stock',
    workOrderId: null,
    remark: note(config.marker, scenario, message),
    items: [
      {
        itemId: refs.itemId,
        materialVariantId: refs.materialVariantId,
        plannedQuantity,
        taxExclusiveAmount: '原采购整行总额待约定',
        taxInclusiveAmount: null,
        demandIds: [],
      },
    ],
  });
  return place(client, result.purchaseOrderId);
}

async function receipt(client, config, orderId, scenario, quantity) {
  const order = await getOrder(client, orderId);
  const line = unique(order.items, () => true, '样例采购行');
  const result = await client.request('/procurement/receipts/actions/confirm', {
    purchaseOrderId: order.id,
    purchaseOrderVersion: order.version,
    receivedAt: new Date().toISOString(),
    handoverEvidence: note(config.marker, scenario, '模拟实物交接凭据'),
    remark: note(config.marker, scenario, `登记独立真实到货 ${quantity}`),
    details: [
      {
        purchaseOrderLineId: line.id,
        version: line.version,
        receivedQuantity: quantity,
        supplierBatchCode: `DEMO-SUPPLEMENT-${scenario}`,
        ...(quantity > Number(line.plannedQuantity)
          ? {
              overReceiptNote: note(
                config.marker,
                scenario,
                '现场确认本次超计划来货，仍计入登记来源采购行',
              ),
            }
          : {}),
      },
    ],
  });
  const detail = await client.request(`/procurement/receipts/${result.receiptId}`);
  return unique(detail.items, () => true, '样例到货明细');
}

async function inspect(client, config, receiptLineId, qualifiedQuantity, unqualifiedQuantity) {
  let line = await client.request(`/procurement/receipt-lines/${receiptLineId}`);
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/start-review`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    reason: `${config.marker} 对本次到货实物进行模拟全检`,
  });
  line = await client.request(`/quality/inbound-inspections/receipt-lines/${receiptLineId}`);
  const review = unique(
    line.cases,
    (row) => row.roundId === line.currentRound.id && row.status === 'reviewing',
    '当前检验办理',
  );
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/inspect`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    caseId: review.id,
    caseVersion: review.version,
    receiptRevisionId: line.currentReceiptRevisionId,
    inspectionMethod: 'full',
    qualifiedQuantity,
    unqualifiedQuantity,
    releaseDecision: 'released',
    inspectedAt: new Date().toISOString(),
    remark: `${config.marker} 模拟全检：合格 ${qualifiedQuantity}，不合格 ${unqualifiedQuantity}`,
    evidence: `${config.marker} 人工验收样例检验凭据`,
  });
}

async function accept(client, config, receiptLineId, details, message, overrideReason) {
  const line = await client.request(
    `/procurement/receipt-lines/${receiptLineId}/acceptance-context`,
  );
  const review = line.currentInspectionCase;
  if (!review || review.inspection?.id !== line.currentRound.inspectionId)
    throw new Error('本轮缺少明确采用的真实检验，停止准备');
  await client.request(`/procurement/receipt-lines/${receiptLineId}/actions/accept`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    confirmedQuantity: details.reduce((sum, row) => sum + row.quantity, 0),
    receiptRevisionId: line.currentReceiptRevisionId,
    caseId: review.id,
    inspectionId: line.currentRound.inspectionId,
    physicalIdentityConfirmed: true,
    remark: `${config.marker} ${message}`,
    ...(overrideReason ? { overrideReason: `${config.marker} ${overrideReason}` } : {}),
    details: details.map((row) => ({ ...row, remark: `${config.marker} ${message}` })),
  });
  return client.request(`/procurement/receipt-lines/${receiptLineId}`);
}

const inbound = (quantity) => ({ disposition: 'inbound', quantity, returnReason: null });
const pending = (quantity) => ({ disposition: 'pending', quantity, returnReason: null });
const returnAllocation = (quantity, returnReason) => ({
  disposition: 'return',
  quantity,
  returnReason,
});

async function supplement(
  client,
  config,
  source,
  sourceReceipt,
  scenario,
  reason,
  quantity,
  message,
) {
  const result = await client.request(`/procurement/purchase-orders/${source.id}/supplements`, {
    supplementReason: reason,
    remark: note(config.marker, scenario, message),
    items: [
      {
        originOrderLineId: source.items[0].id,
        originReceiptLineId: sourceReceipt.id,
        plannedQuantity: quantity,
        supplementEvidence: note(config.marker, scenario, message),
      },
    ],
  });
  return getOrder(client, result.purchaseOrderId);
}

async function inboundAll(client, config, receiptLineId) {
  const candidates = await allPages(
    client,
    `/procurement/inbound-releases?receiptLineId=${receiptLineId}`,
  );
  if (!candidates.length) throw new Error('样例没有当前有效可入分配，停止准备');
  await client.request('/procurement/purchase-inbounds/actions/confirm', {
    remark: `${config.marker} 通过正式业务入口确认本到货的全部可入授权`,
    details: candidates.map((row) => ({
      receiptLineId: row.receiptLineId,
      roundId: row.roundId,
      roundVersion: row.roundVersion,
      version: row.receiptLineVersion,
      receiptRevisionId: row.receiptRevisionId,
      allocationId: row.allocationId,
      inspectionId: row.inspectionId,
      quantity: Number(row.approvedRemainingQuantity),
      target: { mode: 'new', clientKey: `demo-${row.allocationId}` },
    })),
  });
}

async function prepareDataset(client, config, refs) {
  const excess = await original(
    client,
    config,
    refs,
    scenarios.excessOriginal,
    100,
    '原采购 100，到货 120；物流全部归本行',
  );
  const excessReceipt = await receipt(client, config, excess.id, scenarios.excessOriginal, 120);
  await inspect(client, config, excessReceipt.id, 120, 0);
  await accept(client, config, excessReceipt.id, [inbound(120)], '核实 120 全部可入，不分配给补单');
  const before = await supplement(
    client,
    config,
    excess,
    excessReceipt,
    scenarios.excessBefore,
    'excess_purchase',
    20,
    '入库前补购 20，已下单；只追溯来源，不占有原到货物流',
  );
  await place(client, before.id);
  await inboundAll(client, config, excessReceipt.id);
  await supplement(
    client,
    config,
    excess,
    excessReceipt,
    scenarios.excessAfter,
    'excess_purchase',
    20,
    '全部入库后再建补购 20 草稿；与前一补单同时存在仅用于比较先后时机，不表示建议重复采购',
  );

  const quality = await original(
    client,
    config,
    refs,
    scenarios.qualityOriginal,
    100,
    '质量原采购 100，到货 100；A 为 95 可入和 5 质量待退，更正后 B 为 97 可入和 3 质量待退',
  );
  const qualityReceipt = await receipt(client, config, quality.id, scenarios.qualityOriginal, 100);
  await inspect(client, config, qualityReceipt.id, 95, 5);
  await accept(
    client,
    config,
    qualityReceipt.id,
    [inbound(95), returnAllocation(5, 'quality')],
    '定稿 A：95 可入，5 质量待退，尚未实际执行',
  );
  await supplement(
    client,
    config,
    quality,
    qualityReceipt,
    scenarios.qualityDraft,
    'quality_replacement',
    5,
    '保留 A 定稿时创建的旧草稿 5，供改量、取消重建或继续下单验收；固定原采购和原到货',
  );
  const continued = await supplement(
    client,
    config,
    quality,
    qualityReceipt,
    scenarios.qualityContinued,
    'quality_replacement',
    4,
    '按同次到货先建 4 的草稿；A 被替代后改为 5 并继续下单',
  );
  await accept(
    client,
    config,
    qualityReceipt.id,
    [inbound(97), returnAllocation(3, 'quality')],
    '同一实物重新定稿 B：97 可入，3 质量待退，A 授权失效',
    '现场逐件复核发现原建议中的 2 件为外观误判，仓管核实可接收；沿用原检查事实，承担超建议 2 的数量例外',
  );
  const oldDraft = await getOrder(client, continued.id);
  await client.request(
    `/procurement/purchase-orders/${continued.id}`,
    {
      version: oldDraft.version,
      supplierId: oldDraft.supplierId,
      sourceType: oldDraft.sourceType,
      workOrderId: oldDraft.workOrderId,
      remark: note(
        config.marker,
        scenarios.qualityContinued,
        'A 已被 B 替代；旧草稿由 4 调整为 5 后正式下单，仍固定原到货来源，并有自己的 5 件到货及入库',
      ),
      items: oldDraft.items.map((line) => ({
        taxExclusiveAmount: line.taxExclusiveAmount,
        taxInclusiveAmount: line.taxInclusiveAmount,
        itemId: line.itemId,
        materialVariantId: line.materialVariantId,
        plannedQuantity: 5,
        demandIds: line.sources.map((source) => source.demandId),
      })),
    },
    'PATCH',
  );
  await place(client, continued.id);
  const replacementReceipt = await receipt(
    client,
    config,
    continued.id,
    scenarios.qualityContinued,
    5,
  );
  await inspect(client, config, replacementReceipt.id, 5, 0);
  await accept(
    client,
    config,
    replacementReceipt.id,
    [inbound(5)],
    '补发自身新到货 5 全部可入，与原到货 A/B 分配独立',
  );
  await inboundAll(client, config, replacementReceipt.id);

  const uninspected = await original(
    client,
    config,
    refs,
    scenarios.uninspected,
    4,
    '未定稿来源：到货 4，保持待检，不应出现在超量候选',
  );
  await receipt(client, config, uninspected.id, scenarios.uninspected, 4);
  const pendingOrder = await original(
    client,
    config,
    refs,
    scenarios.pending,
    8,
    '全待处理来源：到货 8 已检查，但正式分配全 pending，不应出现在超量候选',
  );
  const pendingReceipt = await receipt(client, config, pendingOrder.id, scenarios.pending, 8);
  await inspect(client, config, pendingReceipt.id, 8, 0);
  await accept(client, config, pendingReceipt.id, [pending(8)], '全量待处理 8，不形成可入授权');
  const returned = await original(
    client,
    config,
    refs,
    scenarios.returned,
    6,
    '全待退来源：到货 6，全部按超发待退且无真实已入，不应出现在超量候选',
  );
  const returnedReceipt = await receipt(client, config, returned.id, scenarios.returned, 6);
  await inspect(client, config, returnedReceipt.id, 6, 0);
  await accept(
    client,
    config,
    returnedReceipt.id,
    [returnAllocation(6, 'excess')],
    '核对供应商约定后全量超发待退 6，无可入授权',
  );

  const history = await original(
    client,
    config,
    refs,
    scenarios.history,
    10,
    '质量历史来源：到货 10，真实质量退回 2 后剩余 8 全部可入；该到货仍可作为新质量补发来源',
  );
  const historyReceipt = await receipt(client, config, history.id, scenarios.history, 10);
  await inspect(client, config, historyReceipt.id, 8, 2);
  const historyA = await accept(
    client,
    config,
    historyReceipt.id,
    [inbound(8), returnAllocation(2, 'quality')],
    '先定稿 8 可入、2 质量待退',
  );
  const toReturn = unique(
    historyA.allocations,
    (row) => row.returnReason === 'quality',
    '真实质量退回分配',
  );
  await client.request(`/procurement/receipt-lines/${historyReceipt.id}/actions/return`, {
    version: historyA.version,
    roundId: historyA.currentRound.id,
    roundVersion: historyA.currentRound.version,
    allocationId: toReturn.id,
    receiptRevisionId: historyA.currentReceiptRevisionId,
    returnedAt: new Date().toISOString(),
    handoverEvidence: `${config.marker} 模拟质量退回 2 的真实交接`,
    remark: `${config.marker} 实际退回事实通过正式退回入口记录`,
  });
  await accept(
    client,
    config,
    historyReceipt.id,
    [inbound(8)],
    '实际已退 2 后，将尚余 8 重新定稿；保留旧质量分配的真实退回追溯',
  );
}

async function prepareHistorySupplement(client, config) {
  const orders = await markedOrders(client, config.marker);
  const original = await getOrder(
    client,
    unique(orders, (row) => row.remark?.includes(`[scenario:${scenarios.history}]`), '历史来源').id,
  );
  const candidates = await allPages(
    client,
    `/procurement/purchase-order-lines/${original.items[0].id}/quality-replacement-candidates`,
  );
  const candidate = unique(
    candidates,
    (row) => row.pendingReturnQuantity === '0' && row.returnedQuantity === '2',
    '当前无质量待退、真实质量已退 2 的到货',
  );
  await supplement(
    client,
    config,
    original,
    { id: candidate.receiptLineId },
    scenarios.historySupplement,
    'quality_replacement',
    2,
    '当前仅可入 8、无质量待退；按该到货真实质量已退 2 新建质量补单，保留草稿供人工下单',
  );
}

function orderSummary(order) {
  return {
    id: order.id,
    purchaseNo: order.purchaseNo,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    status: order.status,
    supplementReason: order.supplementReason,
    remark: order.remark,
    canCancel: order.canCancel,
    lines: order.items.map((line) => ({
      id: line.id,
      plannedQuantity: line.plannedQuantity,
      status: line.status,
      fulfillmentMode: line.fulfillmentMode,
      taxExclusiveAmount: line.taxExclusiveAmount,
      taxInclusiveAmount: line.taxInclusiveAmount,
      materialVariantCode: line.materialVariantCode,
      originOrderLineId: line.originOrderLineId,
      originReceiptLineId: line.originReceiptLineId,
      quantities: line.quantities,
    })),
  };
}

async function buildReport(client, config) {
  const matching = await markedOrders(client, config.marker);
  const orders = [];
  const receipts = [];
  const candidates = [];
  for (const row of matching) {
    const order = await getOrder(client, row.id);
    orders.push(orderSummary(order));
    const registrations = await allPages(
      client,
      `/procurement/receipts?purchaseOrderId=${order.id}`,
    );
    for (const registration of registrations) {
      const detail = await client.request(`/procurement/receipts/${registration.id}`);
      const lines = [];
      for (const indexLine of detail.items) {
        const line = await client.request(`/procurement/receipt-lines/${indexLine.id}`);
        const [history, inbounds, returns] = await Promise.all([
          allPages(client, `/procurement/receipt-lines/${line.id}/allocations`),
          allPages(client, `/procurement/receipt-lines/${line.id}/inbounds`),
          allPages(client, `/procurement/receipt-lines/${line.id}/returns`),
        ]);
        lines.push({
          id: line.id,
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantities: line.quantities,
          currentRound: line.currentRound,
          allocations: history.map(
            ({
              id,
              roundId,
              quantity,
              disposition,
              returnReason,
              isCurrent,
              inboundQuantity,
              returnedQuantity,
            }) => ({
              id,
              roundId,
              quantity,
              disposition,
              returnReason,
              isCurrent,
              inboundQuantity,
              returnedQuantity,
            }),
          ),
          inboundIds: inbounds.map((item) => item.inboundId),
          returns: returns.map(({ id, returnNo, allocationId, returnedQuantity }) => ({
            id,
            returnNo,
            allocationId,
            returnedQuantity,
          })),
        });
      }
      receipts.push({
        id: detail.id,
        receiptNo: detail.receiptNo,
        purchaseOrderId: order.id,
        lines,
      });
    }
    if (order.supplementReason === null) {
      for (const line of order.items) {
        const [excess, quality] = await Promise.all([
          allPages(
            client,
            `/procurement/purchase-order-lines/${line.id}/excess-receipt-candidates`,
          ),
          allPages(
            client,
            `/procurement/purchase-order-lines/${line.id}/quality-replacement-candidates`,
          ),
        ]);
        candidates.push({
          purchaseOrderId: order.id,
          purchaseOrderLineId: line.id,
          excess,
          quality,
        });
      }
    }
  }
  const qualityOrder = orders.find((order) =>
    order.remark?.includes(`[scenario:${scenarios.qualityOriginal}]`),
  );
  const qualityDraft = orders.find((order) =>
    order.remark?.includes(`[scenario:${scenarios.qualityDraft}]`),
  );
  let qualityLinkage = null;
  if (qualityOrder && qualityDraft) {
    const line = qualityDraft.lines[0];
    const location = `originOrderLineId=${line.originOrderLineId}&originReceiptLineId=${line.originReceiptLineId}&supplementReason=quality_replacement`;
    const receiptLinked = await allPages(client, `/procurement/purchase-orders?${location}`);
    qualityLinkage = {
      sourceReceiptLineId: line.originReceiptLineId,
      receiptLinkedOrderIds: receiptLinked.map((order) => order.id),
    };
  }

  const report = {
    marker: config.marker,
    apiBase: config.base,
    orders,
    receipts,
    candidates,
    qualityLinkage,
    expectedInitialState: {
      baseOrderCount: 10,
      historySupplementCount: orders.filter((row) =>
        row.remark?.includes(`[scenario:${scenarios.historySupplement}]`),
      ).length,
      receiptCount: 7,
      excessOriginal: { planned: '100', received: '120', inbound: '120' },
      excessSupplements: {
        ordered: 1,
        draft: 1,
        plannedTotal: '40',
        quantities: null,
        ownReceiptCount: 0,
      },
      qualityOriginal: {
        received: '100',
        pendingInbound: '97',
        pendingReturn: '3',
        actualInbound: '0',
      },
      qualitySupplementsFromReceipt: {
        draft: 1,
        ordered: 1,
        plannedTotal: '10',
      },
      qualityContinuedOwnReceipt: { received: '5', inbound: '5' },
      qualityReceiptCandidate: {
        receivedQuantity: '100',
        pendingReturnQuantity: '3',
        receiptLinkedSupplementCount: 2,
        plannedTotal: '10',
      },
      boundaryExcessCandidateCounts: { uninspected: 0, allPending: 0, allReturn: 0 },
      historicalQualityReturn: { returned: '2', pendingReturn: '0' },
    },
    notes: [
      '同一超量来源的两张 20 补单只用于比较入库前后时机，不表示应重复采购；原 120 的物流始终归原采购。',
      '质量补单固定引用原到货，来源重定稿后仍由同次到货候选查看两张相关补单。',
      'quality-old-draft 保留供改量、取消重建或继续下单；quality-old-continued 已演示 A 替代后由 4 改 5、下单、自身到货及入库。',
      'source-quality-returned-history 当前仅可入 8、无质量待退，但真实质量已退 2 仍使该到货可用于新建质量补单。',
      '此脚本只准备与核对人工验收数据，不代替正式测试或用户验收。',
    ],
  };
  return { ...report, initialReadinessIssues: readinessIssues(report) };
}

function readinessIssues(report) {
  const issues = [];
  const check = (condition, message) => {
    if (!condition) issues.push(message);
  };
  const byScenario = (scenario) =>
    report.orders.find((order) => order.remark?.includes(`[scenario:${scenario}]`));
  const quantity = (scenario) => byScenario(scenario)?.lines[0]?.quantities;
  const candidate = (scenario) =>
    report.candidates.find((row) => row.purchaseOrderId === byScenario(scenario)?.id);
  check(
    report.orders.length === 10 + report.expectedInitialState.historySupplementCount &&
      report.receipts.length === 7,
    '初始数据应包含 10 张采购单与 7 张到货单',
  );
  for (const scenario of Object.values(scenarios).filter(
    (value) => value !== scenarios.historySupplement,
  ))
    check(
      report.orders.filter((order) => order.remark?.includes(`[scenario:${scenario}]`)).length ===
        1,
      `场景标记缺失或重复：${scenario}`,
    );
  const excess = quantity(scenarios.excessOriginal);
  check(
    excess?.receivedQuantity === '120' && excess.inboundQuantity === '120',
    '超量原采购应独立累计到货及实际入库 120',
  );
  for (const scenario of [scenarios.excessBefore, scenarios.excessAfter]) {
    const order = byScenario(scenario);
    check(
      order?.lines[0]?.quantities === null &&
        !report.receipts.some((row) => row.purchaseOrderId === order?.id),
      '超量补单必须无自身物流投影或到货',
    );
  }
  check(
    byScenario(scenarios.excessBefore)?.status === 'ordered' &&
      byScenario(scenarios.excessAfter)?.status === 'draft',
    '超量补单应分别为入库前已下单与入库后草稿',
  );
  const excessCandidate = candidate(scenarios.excessOriginal)?.excess[0];
  check(
    excessCandidate?.receiptLinkedSupplements.reduce((sum, row) => sum + row.count, 0) === 2 &&
      excessCandidate.receiptLinkedSupplements.reduce(
        (sum, row) => sum + Number(row.plannedQuantity),
        0,
      ) === 40,
    '超量候选应显示两张相关补单及计划合计 40',
  );
  const quality = quantity(scenarios.qualityOriginal);
  check(
    quality?.receivedQuantity === '100' &&
      quality.pendingInboundQuantity === '97' &&
      quality.pendingReturnQuantity === '3' &&
      quality.inboundQuantity === '0',
    '质量原到货应为 97 待入、3 待退，补发自身入库不得计入原行',
  );
  for (const scenario of [scenarios.qualityDraft, scenarios.qualityContinued])
    check(
      byScenario(scenario)?.lines[0]?.originReceiptLineId ===
        report.qualityLinkage?.sourceReceiptLineId,
      '两张质量补单应固定引用同一原到货',
    );
  const continued = quantity(scenarios.qualityContinued);
  check(
    continued?.receivedQuantity === '5' &&
      continued.inboundQuantity === '5' &&
      byScenario(scenarios.qualityContinued)?.status === 'ordered',
    '继续办理的质量补单应有自身到货及入库 5',
  );
  check(
    byScenario(scenarios.qualityDraft)?.status === 'draft',
    '应保留一张固定原到货的质量草稿供人工办理',
  );
  const qualityCandidates = candidate(scenarios.qualityOriginal)?.quality ?? [];
  const receiptCandidate = qualityCandidates[0];
  check(
    qualityCandidates.length === 1 &&
      receiptCandidate?.pendingReturnQuantity === '3' &&
      receiptCandidate.receivedQuantity === '100' &&
      receiptCandidate.receiptLineId === report.qualityLinkage?.sourceReceiptLineId,
    '质量候选应按原到货只返回一项，当前质量待退 3、本次到货 100',
  );
  check(
    receiptCandidate?.receiptLinkedSupplements.reduce((sum, row) => sum + row.count, 0) === 2 &&
      receiptCandidate.receiptLinkedSupplements.reduce(
        (sum, row) => sum + Number(row.plannedQuantity),
        0,
      ) === 10,
    '到货候选应显示两张相关质量补单及计划合计 10',
  );
  check(
    report.qualityLinkage?.receiptLinkedOrderIds.length === 2,
    '同到货筛选应找到两张相关质量补单',
  );
  for (const scenario of [scenarios.uninspected, scenarios.pending, scenarios.returned])
    check(candidate(scenario)?.excess.length === 0, `${scenario} 不应出现在超量候选`);
  const history = candidate(scenarios.history)?.quality ?? [];
  check(
    history.length === 1 &&
      history[0].returnedQuantity === '2' &&
      history[0].pendingReturnQuantity === '0',
    '当前无质量待退的到货应凭真实质量已退 2 继续出现在候选',
  );
  return issues;
}

async function main() {
  const config = configuration();
  const client = await login(config);
  if (config.mode === 'report') {
    console.log(JSON.stringify(await buildReport(client, config), null, 2));
    return;
  }
  const existing = await markedOrders(client, config.marker);
  const blocked =
    config.mode === 'prepare-history'
      ? existing.some((row) => row.remark?.includes(`[scenario:${scenarios.historySupplement}]`))
      : existing.length > 0;
  if (blocked) {
    console.log(
      JSON.stringify(
        {
          message:
            '已有相同场景标记，未进行业务写入；先用 report 核对，不盲目续写。需要新来源可设置新的 PROCUREMENT_SUPPLEMENT_DEMO_TAG。',
          blockedByExistingMarker: true,
          report: await buildReport(client, config),
        },
        null,
        2,
      ),
    );
    return;
  }
  try {
    if (config.mode === 'prepare-history') await prepareHistorySupplement(client, config);
    else await prepareDataset(client, config, await references(client));
    const report = await buildReport(client, config);
    if (config.mode === 'prepare' && report.initialReadinessIssues.length)
      throw new Error('准备后的关键统计不符合预期，请查看 initialReadinessIssues');
    console.log(JSON.stringify({ prepared: true, preparedMode: config.mode, ...report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          prepared: false,
          marker: config.marker,
          writesAttempted: client.writesAttempted,
          message: error instanceof Error ? error.message : '准备失败',
          recovery:
            '写入未自动重试；已提交事实保留。先运行 report 核对；需要重新准备时使用新 tag 或重置开发库，不对同一标记续写。',
        },
        null,
        2,
      ),
    );
    if (client.writesAttempted > 0) {
      try {
        console.log(JSON.stringify(await buildReport(client, config), null, 2));
      } catch {
        console.error('部分数据报告读取失败，请恢复 API 后使用 report 只读核对。');
      }
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '演示脚本未完成');
  process.exitCode = 1;
});
