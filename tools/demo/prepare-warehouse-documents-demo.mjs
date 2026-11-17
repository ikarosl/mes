import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import {
  BUSINESS_NUMBER_PREFIX,
  INVENTORY_ITEM_KINDS,
  OTHER_INVENTORY_DIRECTIONS,
} from '../../packages/constants/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-warehouse-documents-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(
    process.env.WAREHOUSE_DOCUMENTS_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3005/api',
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
    throw new Error('仓库单据样例只允许本地、无凭证且以 /api 结尾的 API 地址');
  const tag = (process.env.WAREHOUSE_DOCUMENTS_DEMO_TAG ?? 'sample').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(tag))
    throw new Error('WAREHOUSE_DOCUMENTS_DEMO_TAG 须为1～40位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-warehouse-documents-v1:${tag}]`,
  };
}

const documentPath = (direction, id) =>
  `/warehouse/other-${direction === 'inbound' ? 'inbounds' : 'outbounds'}${id ? `/${id}` : ''}`;

function arrayOf(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}未返回数组`);
  return value;
}

function unique(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label}须精确匹配一项，请先核对演示主数据`);
  return matches[0];
}

function versionOf(order) {
  if (!Number.isSafeInteger(order?.version) || order.version < 0)
    throw new Error('API 返回了无效的单据版本');
  return order.version;
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
    async request(path, { method = 'GET', body } = {}) {
      if (method !== 'GET' && config.mode !== 'prepare') throw new Error('report 模式禁止业务写入');
      if (method !== 'GET') this.writesAttempted += 1;
      const response = await fetch(`${config.base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }),
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
      if (data === null) throw new Error(`${path}未返回 JSON`);
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

async function markedDocuments(client, config) {
  const orders = [];
  for (const direction of OTHER_INVENTORY_DIRECTIONS) {
    for (const itemKind of INVENTORY_ITEM_KINDS) {
      const rows = await allPages(
        client,
        `/warehouse/stock-documents?direction=${direction}&itemKind=${itemKind}&sourceType=other&keyword=${encodeURIComponent(config.marker)}`,
      );
      orders.push(...rows.filter((row) => row.remark?.startsWith(config.marker)));
    }
  }
  return orders;
}

async function references(client) {
  const materialWindow = await client.request(
    '/warehouse/other-stock-materials?keyword=demo-stock-multi',
  );
  const material = unique(
    arrayOf(materialWindow.items, '基础物料候选'),
    (row) => row.code === 'demo-stock-multi',
    '多版本演示物料',
  );
  const variants = await client.request(
    `/warehouse/other-stock-objects?itemKind=material&materialId=${material.id}`,
  );
  const products = await client.request(
    '/warehouse/other-stock-objects?itemKind=finished_product&keyword=demo-stock-product',
  );
  return {
    material: ['demo-stock-multi-v1-A', 'demo-stock-multi-v1-B'].map((code) =>
      unique(
        arrayOf(variants.items, '精确物料版本候选'),
        (row) => row.materialVariantCode === code,
        code,
      ),
    ),
    finished_product: ['demo-stock-product', 'demo-stock-product-second'].map((code) =>
      unique(arrayOf(products.items, '成品候选'), (row) => row.code === code, code),
    ),
  };
}

function inboundLines(objects) {
  return objects.map((object, index) => ({
    itemKind: object.itemKind,
    ...(object.itemKind === 'material'
      ? { materialVariantId: object.materialVariantId }
      : { productId: object.productId }),
    quantity: index === 0 ? 14 : 9,
    target: { mode: 'new', clientKey: `line-${index + 1}` },
    remark: `第${index + 1}条同类型明细`,
  }));
}

function outboundLines(inbound) {
  return inbound.details
    .filter((line) => !line.isDeleted)
    .map((line, index) => {
      if (!line.batchId) throw new Error('已确认入库未返回真实库存批次');
      return {
        itemKind: line.itemKind,
        ...(line.itemKind === 'material'
          ? { materialVariantId: line.materialVariantId }
          : { productId: line.productId }),
        quantity: index === 0 ? 3 : 2,
        target: { mode: 'existing', batchId: line.batchId },
        remark: `第${index + 1}条同类型明细`,
      };
    });
}

async function createScenario(client, config, direction, itemKind, scene, details) {
  const remark = `${config.marker} ${direction} ${itemKind} ${scene}`;
  let order = await client.request(documentPath(direction), {
    method: 'POST',
    body: { itemKind, reason: '仓库单据整合人工验收样例', remark, details },
  });
  // Save a real typed draft before the terminal action; no direct status or inventory writes.
  order = await client.request(documentPath(direction, order.id), {
    method: 'PATCH',
    body: {
      itemKind,
      version: versionOf(order),
      reason: order.reason,
      remark,
      details: order.details
        .filter((line) => !line.isDeleted)
        .map((line, index) => ({
          id: line.id,
          itemKind: line.itemKind,
          ...(line.itemKind === 'material'
            ? { materialVariantId: line.materialVariantId }
            : { productId: line.productId }),
          quantity: Number(line.quantity) + (index === 0 ? 1 : 0),
          target:
            line.targetMode === 'new'
              ? { mode: 'new', clientKey: line.newBatchKey }
              : { mode: 'existing', batchId: line.batchId },
          remark: `${line.remark}；已保存草稿修改`,
        })),
    },
  });
  if (scene === 'completed') {
    return client.request(`${documentPath(direction, order.id)}/actions/confirm`, {
      method: 'POST',
      body: { version: versionOf(order) },
    });
  }
  if (scene === 'cancelled') {
    return client.request(`${documentPath(direction, order.id)}/actions/cancel`, {
      method: 'POST',
      body: { version: versionOf(order), reason: '人工验收保留取消样例' },
    });
  }
  return order;
}

async function prepare(client, config, refs) {
  const completedInbounds = new Map();
  for (const scene of ['completed', 'draft', 'cancelled']) {
    for (const itemKind of INVENTORY_ITEM_KINDS) {
      const order = await createScenario(
        client,
        config,
        'inbound',
        itemKind,
        scene,
        inboundLines(refs[itemKind]),
      );
      if (scene === 'completed') completedInbounds.set(itemKind, order);
    }
  }
  for (const scene of ['completed', 'draft', 'cancelled']) {
    for (const itemKind of INVENTORY_ITEM_KINDS) {
      await createScenario(
        client,
        config,
        'outbound',
        itemKind,
        scene,
        outboundLines(completedInbounds.get(itemKind)),
      );
    }
  }
}

function numberingObservation(orders, direction) {
  const prefix =
    direction === 'inbound'
      ? BUSINESS_NUMBER_PREFIX.inbound_order
      : BUSINESS_NUMBER_PREFIX.outbound_order;
  const sorted = orders
    .filter((order) => order.direction === direction)
    .sort((left, right) => {
      if (BigInt(left.id) < BigInt(right.id)) return -1;
      if (BigInt(left.id) > BigInt(right.id)) return 1;
      return 0;
    });
  const groups = new Map();
  for (const order of sorted) {
    const tail = order.orderNo.startsWith(prefix) ? order.orderNo.slice(prefix.length) : '';
    const match = /^(\d{8})-([1-9]\d*)$/.exec(tail);
    if (!match) continue;
    const key = match[1];
    groups.set(key, [
      ...(groups.get(key) ?? []),
      {
        orderNo: order.orderNo,
        itemKind: order.itemKind,
        sequence: match[2],
      },
    ]);
  }
  return {
    direction,
    prefix,
    samples: sorted.map((order) => ({ orderNo: order.orderNo, itemKind: order.itemKind })),
    uniqueNumbers: new Set(sorted.map((order) => order.orderNo)).size === sorted.length,
    days: [...groups].map(([beijingDate, samples]) => ({
      beijingDate,
      itemKinds: [...new Set(samples.map((sample) => sample.itemKind))],
      sequencesIncreaseAcrossItemKinds: samples.every(
        (sample, index) =>
          index === 0 || BigInt(sample.sequence) > BigInt(samples[index - 1].sequence),
      ),
      samples,
    })),
  };
}

async function report(client, config, outcome) {
  const summaries = await markedDocuments(client, config);
  const orders = [];
  for (const summary of summaries)
    orders.push(
      await client.request(`/warehouse/stock-documents/${summary.direction}/${summary.id}`),
    );
  const batchIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.details.flatMap((line) => (line.batchId ? [line.batchId] : [])),
      ),
    ),
  ];
  const transactions = new Map();
  for (const batchId of batchIds) {
    const batch = await client.request(`/production/inventory-batches/${batchId}`);
    for (const row of arrayOf(batch.inventoryTransactions, '批次流水'))
      transactions.set(row.inventoryTransactionId, row);
  }
  const ledgerReferences = [];
  for (const order of orders) {
    for (const line of order.details) {
      if (!line.inventoryTransactionId) continue;
      const posting = transactions.get(line.inventoryTransactionId);
      ledgerReferences.push({
        orderNo: order.orderNo,
        detailId: line.id,
        inventoryTransactionId: line.inventoryTransactionId,
        referenceOrderId: posting?.referenceOrderId ?? null,
        referenceOrderNoSnapshot: posting?.referenceOrderNoSnapshot ?? null,
        quantity: posting?.quantity ?? null,
        direction: posting?.direction ?? null,
        itemKind: posting?.itemKind ?? null,
        matchesDirectDocument:
          posting?.referenceOrderId === order.id &&
          posting?.referenceOrderNoSnapshot === order.orderNo &&
          posting?.referenceDetailId === line.id &&
          posting?.direction === order.direction &&
          posting?.itemKind === order.itemKind,
      });
    }
  }
  return {
    marker: config.marker,
    outcome,
    observations: {
      orderCount: orders.length,
      multiLineOrderCount: orders.filter(
        (order) => order.details.filter((line) => !line.isDeleted).length >= 2,
      ).length,
      allLinesMatchOrderKind: orders.every((order) =>
        order.details.every((line) => line.itemKind === order.itemKind),
      ),
      postedDetailCount: ledgerReferences.length,
      matchingDirectDocumentReferenceCount: ledgerReferences.filter(
        (row) => row.matchesDirectDocument,
      ).length,
    },
    numbering: OTHER_INVENTORY_DIRECTIONS.map((direction) =>
      numberingObservation(orders, direction),
    ),
    orders: orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      direction: order.direction,
      itemKind: order.itemKind,
      sourceType: order.sourceType,
      status: order.status,
      version: order.version,
      remark: order.remark,
      details: order.details.map((line) => ({
        id: line.id,
        itemKind: line.itemKind,
        itemCode: line.itemCode,
        materialVariantCode: line.materialVariantCode,
        quantity: line.quantity,
        unit: line.unit,
        batchId: line.batchId,
        batchCode: line.batchCode,
        inventoryTransactionId: line.inventoryTransactionId,
      })),
    })),
    ledgerReferences,
  };
}

async function main() {
  const config = configuration();
  const client = await login(config);
  try {
    let outcome = 'report';
    if (config.mode === 'prepare') {
      const previous = await markedDocuments(client, config);
      if (previous.length) {
        outcome = 'existing-report-only';
      } else {
        const refs = await references(client);
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
        message: error instanceof Error ? error.message : '仓库单据样例准备失败',
        recovery: '不自动重试或续写。先用同 TAG 运行 report；另一组样例使用新 TAG。',
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '仓库单据样例工具未完成');
  process.exitCode = 1;
});
