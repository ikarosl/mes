import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import { SYSTEM_STATUS } from '../../packages/constants/dist/index.js';
import { toBeijingDateString } from '../../packages/utils/dist/index.js';
import { allocateDemoMarkCodes } from './item-marking-demo-codes.mjs';

loadWorkspaceEnv({ quiet: true });

const scenarios = [
  { key: 'single-first', taskKey: 'main', title: '单件卡一：待输入起始码', quantity: 1 },
  { key: 'single-next', taskKey: 'main', title: '单件卡二：待继续输入下一码', quantity: 1 },
  { key: 'partial', taskKey: 'main', title: '三件卡：已绑一码，留待补齐', quantity: 3 },
  {
    key: 'scrapped',
    taskKey: 'main',
    title: '三件齐码后选码报废一件，余两件待终检',
    quantity: 3,
  },
  { key: 'cancelled', taskKey: 'main', title: '误绑定已撤销，保留历史待重新绑定', quantity: 1 },
  { key: 'general', taskKey: 'general', title: '通用任务单件卡：待绑齐后终检', quantity: 1 },
  {
    key: 'unused',
    taskKey: 'general',
    title: '预生成未到站卡：已绑一码，待首站扫码',
    quantity: 2,
    preGenerated: true,
  },
  {
    key: 'inbound-90',
    taskKey: 'inbound90',
    title: '90件已齐码且终检，留待整盘入库',
    quantity: 90,
  },
];

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-item-marking-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(
    process.env.ITEM_MARKING_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3005/api',
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
    throw new Error('刻码样例工具只允许本地、无凭证且以 /api 结尾的 API 地址');
  const tag = (process.env.ITEM_MARKING_DEMO_TAG ?? 'sample').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(tag))
    throw new Error('ITEM_MARKING_DEMO_TAG 须为1～40位字母、数字、下划线或连字符');
  const sourceBatchId = process.env.ITEM_MARKING_DEMO_SOURCE_BATCH_ID;
  if (sourceBatchId !== undefined) identifier(sourceBatchId);
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    tag,
    sourceBatchId,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-item-marking-v1:${tag}]`,
    externalOrderNo: `demo-item-marking-${tag}`,
  };
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value))
    throw new Error('请提供有效业务ID，来源任务使用 ITEM_MARKING_DEMO_SOURCE_BATCH_ID');
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

function exactlyOne(rows, predicate, name) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw new Error(`${name}须精确匹配一项，请核对现有资料`);
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
      if (method !== 'GET' && config.mode !== 'prepare') throw new Error('report 模式禁止业务写入');
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
      if (data === null) throw new Error(`${method} ${path} 未返回 JSON`);
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

async function markedOrders(client, config) {
  return (await allPages(client, '/production/work-orders')).filter(
    (row) =>
      row.externalOrderNo === config.externalOrderNo || row.remark?.startsWith(config.marker),
  );
}

function ownerOf(value, name) {
  const [owner] = arrayOf(value, name);
  if (!owner) throw new Error(`${name}没有当前合格人员，请先核对人员配置`);
  return identifier(owner.id);
}

function demandRequirements(bom, configured, plannedQuantity) {
  return bom.map((line) => {
    const basis = exactlyOne(
      configured,
      (row) => row.productMaterialId === line.id && row.materialId === line.materialId,
      `BOM ${line.itemCode} 的来源初配`,
    );
    if (
      basis.status !== 'configured' ||
      !basis.requirementBasisId ||
      !basis.variants.some(
        (variant) =>
          variant.materialVariantId === basis.lockedMaterialVariantId &&
          variant.status === SYSTEM_STATUS.enabled,
      )
    )
      throw new Error(`来源任务的 ${line.itemCode} 须已完整初配，且冻结版本当前仍启用`);
    const quantityPerUnit = Number(line.quantityPerUnit);
    const quantity = quantityPerUnit * plannedQuantity;
    if (
      !Number.isSafeInteger(quantityPerUnit) ||
      quantityPerUnit <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 99999999
    )
      throw new Error(`BOM ${line.itemCode} 的样例需求量须为1～99999999的整数`);
    return {
      productMaterialId: identifier(line.id),
      splits: [{ materialVariantId: identifier(basis.lockedMaterialVariantId), quantity }],
    };
  });
}

async function references(client, config) {
  if (!config.sourceBatchId)
    throw new Error('首次准备请设置已完整初配的 ITEM_MARKING_DEMO_SOURCE_BATCH_ID');
  const source = await client.request(`/production/batches/${config.sourceBatchId}`);
  if (source.orderType !== 'mass_production' || !source.routeId || source.status === 'draft')
    throw new Error('来源须为已下达、已有冻结路线及完整初配的批量任务');
  await allPages(client, `/production/tracking-item-marks?batchId=${config.sourceBatchId}`);
  const product = exactlyOne(
    await allPages(client, `/product/products?keyword=${encodeURIComponent(source.productCode)}`),
    (row) => row.id === source.productId,
    '来源成品',
  );
  const productOptions = arrayOf(await client.request('/product/products/options'), '有效成品');
  if (
    product.status !== SYSTEM_STATUS.enabled ||
    product.acquireMethod !== 'self_made' ||
    product.bomStatus !== 'approved' ||
    !product.bomLockedAt ||
    !productOptions.some((row) => row.id === product.id)
  )
    throw new Error('来源成品及分类须有效、自制，且 BOM 已批准并锁定');
  const routes = arrayOf(await client.request('/product/process-routes/options'), '启用路线');
  exactlyOne(
    routes,
    (row) => row.id === source.routeId && row.status === 'enabled',
    '来源启用路线',
  );
  const routeSteps = arrayOf(
    await client.request(`/product/process-routes/${identifier(source.routeId)}/steps`),
    '来源路线工序',
  );
  if (!routeSteps.length) throw new Error('来源启用路线至少需要一道工序');
  const bom = arrayOf(
    await client.request(`/product/products/${identifier(product.id)}/materials`),
    '来源 BOM',
  );
  if (!bom.length) throw new Error('来源 BOM 不能为空');
  const configured = await allPages(
    client,
    `/production/material-demands?productionBatchId=${config.sourceBatchId}`,
  );
  const mainRequirements = demandRequirements(bom, configured, 9);
  const generalRequirements = demandRequirements(bom, configured, 3);
  const inboundRequirements = demandRequirements(bom, configured, 90);
  const currentCodes = new Set(
    (await allPages(client, '/production/tracking-item-marks')).map((mark) => mark.markCode),
  );
  const people = arrayOf(await client.request('/identity/personnel/options'), '现场人员');
  if (!people.length) throw new Error('至少需要一名启用的现场人员');
  return {
    productId: identifier(product.id),
    routeId: identifier(source.routeId),
    sourceBatchNo: source.batchNo,
    personnelId: identifier(people[0].id),
    workOrderOwnerId: ownerOf(
      await client.request('/production/work-orders/owner-options'),
      '工单负责人',
    ),
    ownerId: ownerOf(await client.request('/production/batches/owner-options'), '任务负责人'),
    mainRequirements,
    generalRequirements,
    inboundRequirements,
    currentCodes,
  };
}

async function prepare(client, config, refs) {
  const now = Date.now();
  const dates = {
    planStartDate: toBeijingDateString(now),
    planEndDate: toBeijingDateString(now + 7 * 24 * 60 * 60 * 1000),
  };
  const command = (path, body, idempotent = true) =>
    client.request(path, { method: 'POST', body, idempotent });
  const order = await command('/production/work-orders', {
    orderType: 'mass_production',
    productId: refs.productId,
    plannedQuantity: 102,
    workOrderOwnerId: refs.workOrderOwnerId,
    ...dates,
    externalOrderNo: config.externalOrderNo,
    remark: `${config.marker} 单件刻码人工验收独立工单；只读复用来源任务 ${refs.sourceBatchNo}`,
  });
  const orderId = identifier(order.id);
  await command(
    `/production/work-orders/${orderId}/actions/release`,
    { version: versionOf(order) },
    false,
  );
  for (const task of [
    { key: 'main', title: '常规追踪任务', quantity: 9, requirements: refs.mainRequirements },
    {
      key: 'general',
      title: '通用追踪任务及未到站预生成卡',
      quantity: 3,
      requirements: refs.generalRequirements,
    },
    {
      key: 'inbound90',
      title: '同盘90件整笔入库人工验收',
      quantity: 90,
      requirements: refs.inboundRequirements,
    },
  ]) {
    let batch = await command(`/production/work-orders/${orderId}/batches`, {
      routeId: refs.routeId,
      plannedQuantity: task.quantity,
      ownerId: refs.ownerId,
      ...dates,
      remark: `${config.marker} ${task.key} ${task.title}`,
    });
    const batchId = identifier(batch.id);
    batch = await command(`/production/batches/${batchId}/actions/release`, {
      version: versionOf(batch),
    });
    await command(`/production/batches/${batchId}/material-demands/configurations`, {
      requirements: task.requirements,
    });
    const startCheck = await client.request(`/production/batches/${batchId}/start-check`);
    if (!startCheck.canStart) throw new Error(`新任务 ${batch.batchNo} 尚不满足真实开工前提`);
    await command(`/production/batches/${batchId}/actions/start`, {
      version: versionOf(startCheck),
      reason: `${config.marker} 只准备追踪与刻码人工验收，物料已完整初配但尚未领料，明确缺料开工`,
    });
    const workbench = await client.request(`/production/batches/${batchId}/tracking-workbench`);
    if (!workbench.steps.length) throw new Error('新任务下达后未返回冻结工序');
    const taskScenarios = scenarios.filter((item) => item.taskKey === task.key);
    for (const scene of taskScenarios) {
      const creationBody = {
        personnelId: refs.personnelId,
        remark: `${config.marker} ${scene.key} ${scene.title}`,
      };
      let card;
      if (scene.preGenerated) {
        const result = await command(`/production/batches/${batchId}/tracking-cards/bulk`, {
          ...creationBody,
          totalQuantity: scene.quantity,
          quantityPerCard: scene.quantity,
        });
        card = exactlyOne(arrayOf(result.cards, '预生成追踪卡'), () => true, '本次预生成追踪卡');
      } else {
        card = await command(`/production/batches/${batchId}/tracking-cards`, {
          ...creationBody,
          quantity: scene.quantity,
        });
      }
      const cardId = identifier(card.id);
      const presetCodes = allocateDemoMarkCodes(refs.currentCodes, cardId, scene.quantity);
      if (!scene.preGenerated) {
        for (const step of workbench.steps.slice(1)) {
          const result = await command('/production/tracking-cards/scan', {
            cardNo: card.cardNo,
            stepRecordId: identifier(step.stepRecordId),
            personnelId: refs.personnelId,
          });
          card = result.card;
        }
      }
      const bind = async (markCode) => {
        card = await command(`/production/tracking-cards/${cardId}/item-marks`, {
          version: versionOf(card),
          personnelId: refs.personnelId,
          markCode,
        });
      };
      if (scene.key === 'partial') await bind(presetCodes[0]);
      if (scene.key === 'unused') await bind(presetCodes[0]);
      if (scene.key === 'scrapped') {
        for (const code of presetCodes) await bind(code);
        const marks = await allPages(client, `/production/tracking-item-marks?cardId=${cardId}`);
        const selected = exactlyOne(
          marks,
          (mark) => mark.markCode === presetCodes[1] && mark.status === 'active',
          '本次选码报废的刻码',
        );
        await command(`/production/tracking-cards/${cardId}/abnormalities`, {
          version: versionOf(card),
          stepRecordId: workbench.steps.at(-1).stepRecordId,
          personnelId: refs.personnelId,
          affectedQuantity: 1,
          descriptionLabels: [`${config.marker} 本盘刻码${presetCodes[1]}的实物损坏，选码报废一件`],
          resolution: 'scrap',
          scrappedItemMarkIds: [identifier(selected.id)],
        });
      }
      if (scene.key === 'cancelled') {
        await bind(presetCodes[0]);
        const marks = await allPages(client, `/production/tracking-item-marks?cardId=${cardId}`);
        const selected = exactlyOne(
          marks,
          (mark) => mark.markCode === presetCodes[0] && mark.status === 'active',
          '本次误绑定的刻码',
        );
        await command(
          `/production/tracking-cards/${cardId}/item-marks/${identifier(selected.id)}/actions/cancel`,
          {
            version: versionOf(card),
            reason: `${config.marker} 演示误绑定撤销，保留原绑定和撤销原因；待人工绑定正确号码`,
          },
        );
      }
      if (scene.key === 'inbound-90') {
        for (const code of presetCodes) await bind(code);
        await command(`/production/tracking-cards/${cardId}/actions/confirm-output`, {
          version: versionOf(card),
          personnelId: refs.personnelId,
          remark: `${config.marker} inbound-90 90件已齐码，留待手工勾选整盘实际入库`,
        });
      }
    }
  }
}

async function report(client, config, outcome) {
  const orders = [];
  const availableCodes = new Set(
    (await allPages(client, '/production/tracking-item-marks')).map((mark) => mark.markCode),
  );
  for (const selected of await markedOrders(client, config)) {
    const order = await client.request(`/production/work-orders/${identifier(selected.id)}`);
    const tasks = [];
    for (const task of order.batches) {
      const batch = await client.request(`/production/batches/${identifier(task.id)}`);
      if (!batch.remark?.startsWith(config.marker)) continue;
      const workbench = await client.request(`/production/batches/${batch.id}/tracking-workbench`);
      const outputs = await allPages(client, `/production/outputs?batchId=${batch.id}`);
      const markedCards = (
        await allPages(client, `/production/tracking-cards?batchId=${batch.id}`)
      ).filter((card) => card.remark?.startsWith(config.marker));
      const cards = [];
      for (const card of markedCards) {
        const detail = await client.request(`/production/tracking-cards/${identifier(card.id)}`);
        const sceneRemark = detail.remark.slice(config.marker.length).trimStart();
        const separator = sceneRemark.indexOf(' ');
        const scenario = separator === -1 ? sceneRemark : sceneRemark.slice(0, separator);
        const marks = await allPages(client, `/production/tracking-item-marks?cardId=${detail.id}`);
        for (const mark of marks) {
          if (mark.correctionCount > 0)
            mark.corrections = await client.request(
              `/production/tracking-cards/${detail.id}/item-marks/${mark.id}/corrections`,
            );
        }
        const output = outputs.find((item) => item.id === detail.output?.id) ?? null;
        const missingCount = Math.max(0, Number(detail.quantity) - detail.itemMarking.activeCount);
        cards.push({
          scenario,
          title: separator === -1 ? sceneRemark : sceneRemark.slice(separator + 1),
          cardId: detail.id,
          cardNo: detail.cardNo,
          quantity: detail.quantity,
          status: detail.status,
          currentStepName: detail.currentStepName,
          itemMarking: {
            activeCount: detail.itemMarking.activeCount,
            scrappedCount: detail.itemMarking.scrappedCount,
            cancelledCount: detail.itemMarking.cancelledCount,
            totalCount: detail.itemMarking.totalCount,
          },
          suggestedCodes: allocateDemoMarkCodes(
            availableCodes,
            detail.id,
            Math.min(3, missingCount),
          ),
          marks,
          abnormalities: detail.abnormalities,
          output: detail.output,
          outputFacts: output,
          inboundPlan: scenario === 'inbound-90' ? wholeInboundPlan(output) : null,
        });
      }
      tasks.push({
        batchId: batch.id,
        batchNo: batch.batchNo,
        status: batch.status,
        finalStep: workbench.steps.at(-1) ?? null,
        cards,
        outputs,
      });
    }
    orders.push({
      workOrderId: order.id,
      workOrderNo: order.workOrderNo,
      status: order.status,
      tasks,
    });
  }
  return {
    outcome,
    marker: config.marker,
    writesAttempted: client.writesAttempted,
    entryPoints: {
      workbench: '/production/workbench',
      codeBinding: '/production/workbench/code-binding',
      tracking: '/production/tracking',
      tasks: '/production/tasks',
      finishedInbound: '/warehouse/inbound-orders/finished',
      instructions:
        '员工工作台“编码绑定”选择报告中的任务号和现场人员，查询对应卡号后录入数字；“工序作业”选择末站办理终检，工序追踪查询刻码及历史。',
    },
    manualInput: {
      instructions:
        '各卡suggestedCodes按当前全局号码避重，仅供本次报告参考且不预占；待绑卡可连续输入或更正已绑错码。新建90件卡已终检，在成品入库页勾选整盘产出入库，按盘查看实际receipts。',
    },
    orders,
  };
}

function wholeInboundPlan(output) {
  if (!output) return null;
  const receipts = arrayOf(output.receipts, '产出入库记录');
  return {
    outputId: output.id,
    receivedQuantity: output.receivedQuantity,
    pendingQuantity: output.pendingQuantity,
    receipts,
    outputIds: receipts.length ? [] : [output.id],
    targetHint: receipts.length ? null : { mode: 'new_batch' },
    instructions: receipts.length
      ? '本盘已有真实入库记录，仅查看全部receipts，不再选择本盘入库；历史分次记录逐笔保留。'
      : '在成品入库页选择本任务并勾选本盘完整产出90件，确认后重新report核对真实入库单；编码通过追踪卡查询。',
  };
}

async function main() {
  const config = configuration();
  const client = await login(config);
  try {
    let outcome = 'report';
    if (config.mode === 'prepare') {
      const previous = await markedOrders(client, config);
      if (previous.length) {
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
        message: error instanceof Error ? error.message : '刻码样例准备失败',
        recovery: '不自动重试或续写。先用同TAG运行report核对；另一组样例使用新TAG。',
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '刻码样例工具未完成');
  process.exitCode = 1;
});
