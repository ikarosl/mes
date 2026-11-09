import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-tracking-workbench-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备演示数据');
  const endpoint = new URL(process.env.TRACKING_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3002/api');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.replace(/\/$/, '').endsWith('/api')
  )
    throw new Error('API 地址须为无凭证、查询串及片段且以 /api 结尾的 HTTP(S) 地址');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) &&
    (process.env.TRACKING_DEMO_ALLOW_REMOTE !== '1' || endpoint.protocol !== 'https:')
  )
    throw new Error('远程地址要求 HTTPS 和 TRACKING_DEMO_ALLOW_REMOTE=1');
  const tag = process.env.TRACKING_DEMO_TAG ?? 'sample';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    throw new Error('TRACKING_DEMO_TAG 须为 1～40 位字母、数字、下划线或连字符');
  const batchId = process.env.TRACKING_DEMO_BATCH_ID;
  if (!batchId || !/^[1-9]\d{0,19}$/.test(batchId))
    throw new Error('请提供已有执行中批量任务的 TRACKING_DEMO_BATCH_ID');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  return {
    mode,
    base: endpoint.href.replace(/\/$/, ''),
    marker: `[demo-tracking-v1:${tag}]`,
    batchId,
  };
}

async function client(config) {
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
  return async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    if (method !== 'GET' && config.mode !== 'prepare') throw new Error('report 模式禁止业务写入');
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
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        `${method} ${path} 失败：HTTP ${response.status} ${typeof value?.code === 'string' && /^[A-Z_]+$/.test(value.code) ? value.code : 'UNKNOWN'}`,
      );
    if (value === null) throw new Error(`${method} ${path} 未返回 JSON`);
    return value;
  };
}

async function cards(request, batchId) {
  const items = [];
  for (let page = 1; page <= 1000; page += 1) {
    const result = await request(
      `/production/tracking-cards?batchId=${batchId}&page=${page}&pageSize=100`,
    );
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total))
      throw new Error('追踪卡分页契约错误');
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length) throw new Error('追踪卡分页提前结束');
  }
  throw new Error('追踪卡查询超出演示工具安全上限');
}

async function report(config, request) {
  const selected = (await cards(request, config.batchId)).filter((card) =>
    card.remark?.startsWith(config.marker),
  );
  const details = [];
  for (const card of selected) details.push(await request(`/production/tracking-cards/${card.id}`));
  return {
    marker: config.marker,
    workbench: await request(`/production/batches/${config.batchId}/tracking-workbench`),
    cards: details,
  };
}

async function prepare(config, request) {
  const previous = (await cards(request, config.batchId)).filter((card) =>
    card.remark?.startsWith(config.marker),
  );
  if (previous.length) return report(config, request);
  const workbench = await request(`/production/batches/${config.batchId}/tracking-workbench`);
  if (
    workbench.batch.status !== 'doing' ||
    workbench.batch.orderType !== 'mass_production' ||
    workbench.steps.length < 2
  )
    throw new Error('场景要求已经开始执行、至少两道冻结工序的批量任务');
  const people = await request('/identity/personnel/options');
  const production = people.find((person) => person.group === 'production');
  const quality = people.find((person) => person.group === 'quality');
  if (!production || !quality) throw new Error('场景要求至少一名启用的生产人员及质量人员');
  const create = (name, quantity) =>
    request(`/production/batches/${config.batchId}/tracking-cards`, {
      quantity,
      personnelId: production.id,
      remark: `${config.marker} ${name}`,
    });
  const scan = async (card, step) =>
    (
      await request('/production/tracking-cards/scan', {
        cardNo: card.cardNo,
        stepRecordId: step.stepRecordId,
        personnelId: production.id,
      })
    ).card;
  const completeRoute = async (card) => {
    for (const step of workbench.steps) card = await scan(card, step);
    return card;
  };
  const confirm = (card, quantity) =>
    request(`/production/tracking-cards/${card.id}/actions/confirm-output`, {
      version: card.version,
      personnelId: quality.id,
      availableQuantity: quantity,
      remark: `${config.marker} 质量人员显式确认最终可用产出`,
    });

  await confirm(await completeRoute(await create('正常流转及正数入库', 10)), 9);
  let corrected = await completeRoute(await create('交接后改量保留历史', 5));
  corrected = await request(
    `/production/tracking-cards/${corrected.id}/quantity`,
    {
      version: corrected.version,
      quantity: 7,
      reason: `${config.marker} 末站核实实际盘量为7，已过站5件事实保留`,
    },
    'PATCH',
  );
  corrected = await request(`/production/tracking-cards/${corrected.id}/abnormalities`, {
    version: corrected.version,
    stepRecordId: workbench.steps[0].stepRecordId,
    personnelId: quality.id,
    severity: 'normal',
    description: `${config.marker} 终检发现首站外观问题`,
  });
  const abnormality = corrected.abnormalities.at(-1);
  if (!abnormality) throw new Error('异常登记未返回事实');
  corrected = await request(
    `/production/tracking-cards/${corrected.id}/abnormalities/${abnormality.id}/handlings`,
    {
      version: abnormality.version,
      personnelId: production.id,
      content: `${config.marker} 已完成现场处理并复核`,
      resolve: true,
    },
  );
  await confirm(corrected, 6);
  const paused = await scan(await create('暂停异常待人工处理', 4), workbench.steps[0]);
  await request(`/production/tracking-cards/${paused.id}/abnormalities`, {
    version: paused.version,
    personnelId: production.id,
    severity: 'pause',
    description: `${config.marker} 待人工检查，当前暂停流转`,
  });
  await create('未使用待打印', 3);
  const voided = await scan(await create('已用卡作废保留事实', 2), workbench.steps[0]);
  await request(`/production/tracking-cards/${voided.id}/actions/void`, {
    version: voided.version,
    reason: `${config.marker} 现场取消该盘，已有到站事实保留`,
  });
  await confirm(await completeRoute(await create('零产出确认不记库存', 1)), 0);
  return report(config, request);
}

try {
  const config = configuration();
  const request = await client(config);
  const result =
    config.mode === 'prepare' ? await prepare(config, request) : await report(config, request);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : '场景工具失败') + '\n');
  process.exitCode = 1;
}
