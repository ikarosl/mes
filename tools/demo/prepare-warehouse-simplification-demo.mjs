import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error(
      '用法：node tools/demo/prepare-warehouse-simplification-demo.mjs [prepare|report]',
    );
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(process.env.WAREHOUSE_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3003/api');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.replace(/\/$/, '').endsWith('/api')
  )
    throw new Error('仓库实验工具只允许本地、无凭证且以 /api 结尾的 API 地址');
  const tag = process.env.WAREHOUSE_DEMO_TAG ?? 'sample';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('WAREHOUSE_DEMO_TAG 须为1～40位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return { mode, base: endpoint.href.replace(/\/$/, ''), marker: `[demo-warehouse-v1:${tag}]` };
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
  if (typeof session.accessToken !== 'string') throw new Error('登录没有返回访问凭证');
  return {
    async request(path, body) {
      if (body !== undefined && config.mode !== 'prepare')
        throw new Error('report模式禁止业务写入');
      const result = await fetch(`${config.base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          ...(body === undefined ? {} : { 'Idempotency-Key': randomUUID() }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await result.json().catch(() => null);
      if (!result.ok) {
        const code =
          typeof data?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code)
            ? data.code
            : 'UNKNOWN';
        throw new Error(
          `${body === undefined ? 'GET' : 'POST'} ${path}：HTTP ${result.status} ${code}`,
        );
      }
      if (data === null) throw new Error(`${path}未返回JSON`);
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
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total))
      throw new Error(`分页契约异常：${path}`);
    rows.push(...data.items);
    if (rows.length >= data.total) return rows;
    if (!data.items.length) throw new Error(`分页提前结束：${path}`);
  }
  throw new Error('超出场景查询分页上限');
}

function unique(rows, predicate, name) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw new Error(`${name}需要精确匹配一项，请先加载demo主数据`);
  return matches[0];
}

const purchasePath = (id) => `/procurement/purchase-orders/${id}`;
const note = (config, scenario) => `${config.marker} ${scenario}`;

async function references(client) {
  const suppliers = await allPages(client, '/procurement/suppliers');
  const materials = await client.request(
    '/procurement/material-options?keyword=demo-warehouse-chamber',
  );
  const material = unique(
    materials,
    (row) => row.materialCode === 'demo-warehouse-chamber',
    '腔体物料',
  );
  const variants = await client.request(
    `/procurement/material-variants/options?materialId=${material.id}`,
  );
  return {
    supplierIds: ['演示共批供应商甲', '演示共批供应商乙'].map(
      (name) => unique(suppliers, (row) => row.supplierName === name, name).id,
    ),
    itemId: material.id,
    variantId: unique(
      variants,
      (row) => row.variantCode === 'demo-warehouse-chamber-v1-A',
      '腔体版本',
    ).id,
  };
}

async function arrival(client, config, refs, scenario, supplierIndex = 0) {
  const created = await client.request('/procurement/purchase-orders', {
    supplierId: refs.supplierIds[supplierIndex],
    sourceType: 'stock',
    workOrderId: null,
    remark: note(config, scenario),
    items: [
      {
        itemId: refs.itemId,
        materialVariantId: refs.variantId,
        plannedQuantity: 20,
        demandIds: [],
      },
    ],
  });
  await client.request(`${purchasePath(created.purchaseOrderId)}/actions/place`, {
    version: created.version,
  });
  const order = await client.request(purchasePath(created.purchaseOrderId));
  const receipt = await client.request('/procurement/receipts/actions/confirm', {
    purchaseOrderId: order.id,
    purchaseOrderVersion: order.version,
    receivedAt: new Date().toISOString(),
    ...(scenario === '待人工办理' ? {} : { handoverEvidence: note(config, '演示来货交接') }),
    remark: note(config, scenario),
    details: [
      {
        purchaseOrderLineId: order.items[0].id,
        version: order.items[0].version,
        supplierBatchCode: `DEMO-${scenario}`,
      },
    ],
  });
  const detail = await client.request(`/procurement/receipts/${receipt.receiptId}/worklist-lines`);
  return { order, receiptId: receipt.receiptId, lineId: detail.items[0].id };
}

async function inspect(client, source, qualified = 21, unqualified = 1) {
  return client.request(`/procurement/receipt-lines/${source.lineId}/inspect`, {
    inspectionMethod: 'full',
    qualifiedQuantity: qualified,
    unqualifiedQuantity: unqualified,
    inspectedAt: new Date().toISOString(),
    specification: '演示腔体，按图样核对',
    remark: unqualified ? '1个腔体密封面划伤；结果仅记录检查信息' : '本次检查未发现异常',
    inspectionDetails: {
      columns: [
        { key: 'inspectionItem', label: '检验项目' },
        { key: 'acceptanceRequirement', label: '验收要求' },
        { key: 'inspectionTool', label: '检验工具' },
        { key: 'contentDescription', label: '检验内容描述' },
        { key: 'inspectionResult', label: '检验结果' },
      ],
      rows: [
        {
          inspectionItem: '外观',
          acceptanceRequirement: '密封面无划伤',
          inspectionTool: '目视',
          contentDescription: unqualified ? '发现1个密封面划伤' : '检查表面',
          inspectionResult: unqualified ? '1个异常' : '符合',
        },
        {
          inspectionItem: '包装要求',
          acceptanceRequirement: '包装完整',
          inspectionTool: '目视',
          contentDescription: '外包装完整',
          inspectionResult: '符合',
        },
        {
          inspectionItem: '材料证明',
          acceptanceRequirement: '核对随货资料',
          inspectionTool: '目视',
          contentDescription: '演示资料核对',
          inspectionResult: '已核对',
        },
        {
          inspectionItem: '数量',
          acceptanceRequirement: '记录实际检查数量',
          inspectionTool: '点数',
          contentDescription: `本次检查${qualified + unqualified}个`,
          inspectionResult: `合格${qualified}，不合格${unqualified}`,
        },
      ],
    },
  });
}

async function receive(client, config, sources) {
  const details = [];
  for (const source of sources) {
    const line = await client.request(`/procurement/receipt-lines/${source.lineId}`);
    details.push({
      receiptLineId: source.lineId,
      version: line.version,
      quantity: source.quantity,
      target: { mode: 'new', clientKey: source.clientKey ?? source.lineId },
    });
  }
  return client.request('/procurement/purchase-inbounds/actions/confirm', {
    remark: note(config, '仓库实际收货'),
    details,
  });
}

async function recordHandling(client, source, otherHandlingNote) {
  return client.request(`/procurement/receipt-lines/${source.lineId}/handlings`, {
    otherHandlingNote,
  });
}

async function supplement(client, config, source, reason) {
  const created = await client.request(`${purchasePath(source.order.id)}/supplements`, {
    supplementReason: reason,
    remark: note(config, reason),
    items: [
      {
        originOrderLineId: source.order.items[0].id,
        originReceiptLineId: source.lineId,
        plannedQuantity: 1,
        supplementEvidence:
          reason === 'excess_purchase'
            ? '协商额外接收1个，需付费补购'
            : '供应商约定另行补发1个，原货线下协调',
        taxInclusiveAmount: reason === 'excess_purchase' ? '100.00' : '0',
      },
    ],
  });
  await client.request(`${purchasePath(created.purchaseOrderId)}/actions/place`, {
    version: created.version,
  });
  return created;
}

async function prepare(client, config) {
  const refs = await references(client);
  const free = await arrival(client, config, refs, '赠送-先检查后入库');
  await inspect(client, free);
  await recordHandling(client, free, '1个异常腔体退回供应商；多收1个免费赠送');
  await receive(client, config, [{ ...free, quantity: 21 }]);
  const paid = await arrival(client, config, refs, '收费-先补单先入库后报告');
  await supplement(client, config, paid, 'excess_purchase');
  await receive(client, config, [{ ...paid, quantity: 21 }]);
  await recordHandling(client, paid, '1个异常腔体退回供应商；多收1个已协商采购补单');
  await inspect(client, paid);
  const offline = await arrival(client, config, refs, '只登记其他处理');
  await supplement(client, config, offline, 'quality_replacement');
  await recordHandling(client, offline, '整批线下退回，供应商约定另行补发；系统不确认线下执行状态');
  await arrival(client, config, refs, '待人工办理');
  const sharedA = await arrival(client, config, refs, '跨供应商共批甲');
  const sharedB = await arrival(client, config, refs, '跨供应商共批乙', 1);
  await receive(client, config, [
    { ...sharedA, quantity: 4, clientKey: 'shared-chamber' },
    { ...sharedB, quantity: 6, clientKey: 'shared-chamber' },
  ]);
}

async function markedPurchases(client, config) {
  return (await allPages(client, '/procurement/purchase-orders')).filter((row) =>
    row.remark?.includes(config.marker),
  );
}

async function report(client, config) {
  const purchases = [];
  for (const order of await markedPurchases(client, config)) {
    const detail = await client.request(purchasePath(order.id));
    const lines = [];
    for (const item of detail.items) {
      const receipts = await allPages(
        client,
        `/procurement/purchase-order-lines/${item.id}/receipt-records`,
      );
      const arrivals = [];
      for (const receipt of receipts) {
        const source = await client.request(`/procurement/receipt-lines/${receipt.receiptLineId}`);
        const reports = await allPages(
          client,
          `/quality/inbound-inspections/${receipt.receiptLineId}/reports`,
        );
        arrivals.push({
          receiptNo: receipt.receiptNo,
          receiptLineId: source.id,
          inboundQuantity: source.quantities.inboundQuantity,
          handlingCount: source.handlingCount,
          otherHandlingNote: source.otherHandlingNote,
          reports: reports.map((row) => ({
            id: row.id,
            reportNo: row.reportNo,
            qualifiedQuantity: row.qualifiedQuantity,
            unqualifiedQuantity: row.unqualifiedQuantity,
          })),
        });
      }
      lines.push({
        plannedQuantity: item.plannedQuantity,
        fulfillmentMode: item.fulfillmentMode,
        originReceiptLineId: item.originReceiptLineId,
        arrivals,
      });
    }
    purchases.push({
      purchaseNo: order.purchaseNo,
      scenario: order.remark,
      supplementReason: order.supplementReason,
      lines,
    });
  }
  return { marker: config.marker, purchases };
}

try {
  const config = configuration();
  const client = await login(config);
  if (config.mode === 'prepare' && !(await markedPurchases(client, config)).length)
    await prepare(client, config);
  console.log(JSON.stringify(await report(client, config), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : '仓库演示数据准备失败');
  process.exitCode = 1;
}
