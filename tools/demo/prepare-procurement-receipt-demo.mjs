import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-procurement-receipt-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(
    process.env.PROCUREMENT_RECEIPT_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3002/api',
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
    (process.env.PROCUREMENT_RECEIPT_DEMO_ALLOW_REMOTE !== '1' || endpoint.protocol !== 'https:')
  )
    throw new Error('远程地址要求 HTTPS 和 PROCUREMENT_RECEIPT_DEMO_ALLOW_REMOTE=1');
  const tag = process.env.PROCUREMENT_RECEIPT_DEMO_TAG;
  if (tag !== undefined && !/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('PROCUREMENT_RECEIPT_DEMO_TAG 须为 1～40 位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-procurement-receipts-v1${tag ? `:${tag}` : ''}]`,
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
        // Failed writes are never retried with a new key; diagnostics exclude credentials and payloads.
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
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0)
      throw new Error(`分页契约错误：${path}`);
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length) throw new Error(`分页提前结束：${path}`);
  }
  throw new Error('演示数据查询超出安全分页上限');
}

function unique(rows, predicate, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} 未返回约定的数组`);
  const matches = rows.filter(predicate);
  if (matches.length !== 1)
    throw new Error(`${label} 应精确匹配一项，实际 ${matches.length} 项；请先加载 demo`);
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
  return {
    supplierIds,
    itemId: material.id,
    variantIds: ['demo-stock-multi-v1-A', 'demo-stock-multi-v1-B'].map(
      (code) => unique(variants, (row) => row.variantCode === code, code).id,
    ),
  };
}

const note = (config, scenario) => `${config.marker} [scenario:${scenario}] 人工分页验收样例`;
const purchasePath = (id) => `/procurement/purchase-orders/${id}`;
const parentPath = (id) => `/procurement/receipt-purchase-orders/${id}`;

async function markedPurchases(client, config) {
  return (await allPages(client, '/procurement/purchase-orders')).filter((row) =>
    row.remark?.includes(config.marker),
  );
}

async function createPurchase(client, config, refs, index) {
  const result = await client.request('/procurement/purchase-orders', {
    supplierId: refs.supplierIds[(index - 1) % refs.supplierIds.length],
    sourceType: 'stock',
    workOrderId: null,
    remark: note(config, `purchase-${index}`),
    items: refs.variantIds.map((materialVariantId) => ({
      itemId: refs.itemId,
      materialVariantId,
      plannedQuantity: 1000,
      demandIds: [],
    })),
  });
  await client.request(`${purchasePath(result.purchaseOrderId)}/actions/place`, {
    version: result.version,
  });
  return result.purchaseOrderId;
}

async function createReceipt(client, config, purchaseId, scenario, lineCount = 2) {
  const purchase = await client.request(purchasePath(purchaseId));
  const result = await client.request('/procurement/receipts/actions/confirm', {
    purchaseOrderId: purchase.id,
    purchaseOrderVersion: purchase.version,
    receivedAt: new Date().toISOString(),
    handoverEvidence: note(config, `${scenario}-handover`),
    remark: note(config, scenario),
    details: Array.from({ length: lineCount }, (_, index) => {
      const line = purchase.items[index % purchase.items.length];
      return {
        purchaseOrderLineId: line.id,
        version: line.version,
        receivedQuantity: 1,
        supplierBatchCode: `DEMO-RECEIPT-${scenario}-${index + 1}`,
      };
    }),
  });
  return client.request(`/procurement/receipts/${result.receiptId}/worklist-lines`);
}

async function startReview(client, config, lineId) {
  const line = await client.request(`/procurement/receipt-lines/${lineId}`);
  await client.request(`/procurement/receipt-lines/${lineId}/actions/start-review`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    reason: note(config, 'review'),
  });
}

async function completeReview(client, config, lineId) {
  await startReview(client, config, lineId);
  const line = await client.request(`/quality/inbound-inspections/receipt-lines/${lineId}`);
  const review = unique(
    line.cases,
    (row) => row.roundId === line.currentRound.id && row.status === 'reviewing',
    '当前检验办理',
  );
  await client.request(`/procurement/receipt-lines/${lineId}/actions/inspect`, {
    version: line.version,
    roundId: line.currentRound.id,
    roundVersion: line.currentRound.version,
    caseId: review.id,
    caseVersion: review.version,
    receiptRevisionId: line.currentReceiptRevisionId,
    inspectionMethod: 'full',
    qualifiedQuantity: 1,
    unqualifiedQuantity: 0,
    releaseDecision: 'released',
    inspectedAt: new Date().toISOString(),
    remark: note(config, 'awaiting-acceptance'),
    evidence: note(config, 'inspection-evidence'),
  });
}

async function voidReceipt(client, config, receiptId) {
  const source = await client.request(`/procurement/receipts/${receiptId}/voiding`);
  if (!source.voiding.canVoid) throw new Error('新建样例未满足整单作废资格');
  await client.request(`/procurement/receipts/${receiptId}/actions/void`, {
    version: source.version,
    lines: source.voiding.lines,
    reason: note(config, 'void'),
  });
}

async function prepare(client, config) {
  const refs = await references(client);
  const purchaseIds = [];
  for (let index = 1; index <= 12; index += 1)
    purchaseIds.push(await createPurchase(client, config, refs, index));
  for (let index = 1; index <= 11; index += 1) {
    const receipt = await createReceipt(client, config, purchaseIds[index - 1], `single-${index}`);
    if (index === 1) await completeReview(client, config, receipt.items[0].id);
    if (index === 11) await completeReview(client, config, receipt.items[1].id);
    if (index === 9) await startReview(client, config, receipt.items[0].id);
    if (index === 10) await voidReceipt(client, config, receipt.receipt.id);
  }
  // The newest parent opens to 12 independently paged receipts; its oldest receipt has 100 complete rows.
  for (let index = 1; index <= 12; index += 1) {
    const receipt = await createReceipt(
      client,
      config,
      purchaseIds[11],
      `large-${index}`,
      index === 1 ? 100 : 2,
    );
    if (index === 1) await completeReview(client, config, receipt.items[99].id);
    if (index === 12) await completeReview(client, config, receipt.items[0].id);
  }
}

async function report(client, config) {
  const purchases = await markedPurchases(client, config);
  const parents = (await allPages(client, '/procurement/receipt-purchase-orders')).filter((row) =>
    row.remark?.includes(config.marker),
  );
  const receipts = [];
  for (const parent of parents) {
    const rows = await allPages(client, `${parentPath(parent.id)}/receipts`);
    for (const row of rows) {
      const worklist = await client.request(`/procurement/receipts/${row.id}/worklist-lines`);
      if (!Array.isArray(worklist.items)) throw new Error('到货工作列表未返回完整行数组');
      receipts.push({
        id: row.id,
        receiptNo: row.receiptNo,
        purchaseOrderId: parent.id,
        remark: row.remark,
        voided: row.void !== null,
        declaredLineCount: row.lineCount,
        completeLineCount: worklist.items.length,
        lines: worklist.items.map((line) => ({
          id: line.id,
          materialVariantCode: line.materialVariantCode,
          supplierBatchCode: line.supplierBatchCode,
          status: line.currentRound.status,
        })),
      });
    }
  }
  const largeParent = parents.find((row) => row.remark?.includes('[scenario:purchase-12]'));
  const awaitingAcceptanceCount = parents.reduce(
    (sum, row) => sum + row.awaitingAcceptanceCount,
    0,
  );
  const initialReadinessIssues = [];
  const check = (condition, message) => {
    if (!condition) initialReadinessIssues.push(message);
  };
  check(purchases.length === 12 && parents.length === 12, '初始样例应包含12张有到货的采购主单');
  check(
    receipts.length === 23 && largeParent?.receiptCount === 12,
    '初始样例应有23张到货，其中一个采购主单有12张到货',
  );
  check(
    receipts.filter((row) => row.completeLineCount === 100).length === 1,
    '应有一张完整100明细的到货',
  );
  check(
    receipts.every((row) => row.declaredLineCount === row.completeLineCount),
    '到货工作列表须包含该单全部明细',
  );
  check(
    receipts.filter((row) => row.voided).length === 1 && awaitingAcceptanceCount === 4,
    '初始样例应有一张作废到货、四条待定稿明细',
  );
  return {
    marker: config.marker,
    purchaseCount: purchases.length,
    parents,
    receipts,
    initialReadinessIssues,
    manualScenarios: [
      '采购主单第2页与每个主单独立展开状态',
      'purchase-12的到货第2页及最旧到货的完整100行',
      'keyword和待定稿只筛父：展开后保留该父全部到货和单次到货全部行',
      '精确版本v1-A加待定稿：single-11只有B待定稿，不得由另一条A待检明细拼接命中',
      'single-1位于默认父第2页；receiptLineId深链通过轻量定位打开，不扫描分页',
      '作废到货保留完整目录；待定稿筛选不包含作废明细',
      '同一tag重跑prepare不再写；report始终只读，用户办理后统计可与初始值不同',
    ],
  };
}

let client;
try {
  const config = configuration();
  client = await login(config);
  if (config.mode === 'report') console.log(JSON.stringify(await report(client, config), null, 2));
  else if ((await markedPurchases(client, config)).length) {
    console.log(
      JSON.stringify(
        {
          prepared: false,
          blockedByExistingMarker: true,
          message: '已有相同标记，未写业务数据；先report核对，需要新样例请使用新tag，不盲目续写。',
          report: await report(client, config),
        },
        null,
        2,
      ),
    );
  } else {
    try {
      await prepare(client, config);
      const result = await report(client, config);
      if (result.initialReadinessIssues.length)
        throw new Error('准备后的关键统计不符合初始约定，请用report核对');
      console.log(
        JSON.stringify(
          { prepared: true, writesAttempted: client.writesAttempted, ...result },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            prepared: false,
            marker: config.marker,
            writesAttempted: client.writesAttempted,
            message: error instanceof Error ? error.message : '准备失败',
            recovery:
              '写入未自动重试，已提交事实保留；先report核对，重新准备使用新tag，不对同一标记续写。',
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '演示脚本未完成');
  process.exitCode = 1;
}
