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
    marker: `[demo-tracking-v2:${tag}]`,
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
  return async (path, body, method = body === undefined ? 'GET' : 'POST', options = {}) => {
    if (method !== 'GET' && config.mode !== 'prepare') throw new Error('report 模式禁止业务写入');
    const response = await fetch(`${config.base}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        ...(method === 'GET' ? {} : { 'Idempotency-Key': options.idempotencyKey ?? randomUUID() }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      if (options.expectedCode && value?.code === options.expectedCode)
        return { status: response.status, code: value.code };
      throw new Error(
        `${method} ${path} 失败：HTTP ${response.status} ${typeof value?.code === 'string' && /^[A-Z_]+$/.test(value.code) ? value.code : 'UNKNOWN'}`,
      );
    }
    if (options.expectedCode)
      throw new Error(`${method} ${path} 应拒绝 ${options.expectedCode}，实际却已成功`);
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
  const confirm = (card) =>
    request(`/production/tracking-cards/${card.id}/actions/confirm-output`, {
      version: card.version,
      personnelId: quality.id,
      remark: `${config.marker} 质量人员确认完成，按服务器剩余盘量入库`,
    });
  const discover = (card, affectedQuantity, description, stepRecordId) =>
    request(`/production/tracking-cards/${card.id}/abnormalities`, {
      version: card.version,
      ...(stepRecordId ? { stepRecordId } : {}),
      personnelId: quality.id,
      affectedQuantity,
      description: `${config.marker} ${description}`,
    });
  const disposition = (
    card,
    abnormalityId,
    repairedQuantity,
    scrappedQuantity,
    scrapReferences,
  ) => {
    const abnormality = card.abnormalities.find((item) => item.id === abnormalityId);
    if (!abnormality) throw new Error('异常事实缺失');
    return request(
      `/production/tracking-cards/${card.id}/abnormalities/${abnormalityId}/handlings`,
      {
        version: abnormality.version,
        personnelId: production.id,
        content: `${config.marker} 人工核对实物重叠后一次最终结算`,
        repairedQuantity,
        scrappedQuantity,
        scrapReferences,
      },
    );
  };
  const newestAbnormalityId = (card) => {
    const abnormality = card.abnormalities.at(-1);
    if (!abnormality) throw new Error('异常登记未返回事实');
    return abnormality.id;
  };
  const observations = [];

  await confirm(await completeRoute(await create('正常流转及按剩余10件入库', 10)));
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
  corrected = await discover(
    corrected,
    3,
    '外观问题影响3件，返修1件、新增报废2件',
    workbench.steps[0].stepRecordId,
  );
  const sourceAbnormalityId = newestAbnormalityId(corrected);
  corrected = await discover(corrected, 2, '尺寸问题与外观报废的同2件重叠');
  const overlapAbnormalityId = newestAbnormalityId(corrected);
  corrected = await discover(corrected, 2, '第三个问题也由同2件报废实物解释，不累计耗用引用额度');
  const secondOverlapId = newestAbnormalityId(corrected);
  const handlingPath = `/production/tracking-cards/${corrected.id}/abnormalities/${sourceAbnormalityId}/handlings`;
  const handlingBody = {
    version: corrected.abnormalities.find((item) => item.id === sourceAbnormalityId).version,
    personnelId: production.id,
    content: `${config.marker} 影响3=返修1+新增报废2`,
    repairedQuantity: 1,
    scrappedQuantity: 2,
    scrapReferences: [],
  };
  const idempotencyKey = randomUUID();
  corrected = await request(handlingPath, handlingBody, 'POST', { idempotencyKey });
  const replay = await request(handlingPath, handlingBody, 'POST', { idempotencyKey });
  if (corrected.quantity !== '5' || replay.quantity !== corrected.quantity)
    throw new Error('一次处理或同键重放的盘量不符合7-2=5');
  const sourceHandling = corrected.abnormalities.find(
    (item) => item.id === sourceAbnormalityId,
  ).handling;
  if (!sourceHandling) throw new Error('一次结算未返回handling');
  for (const abnormalityId of [overlapAbnormalityId, secondOverlapId]) {
    corrected = await disposition(corrected, abnormalityId, 0, 0, [
      { handlingId: sourceHandling.id, quantity: 2 },
    ]);
    if (corrected.quantity !== '5') throw new Error('关联已有报废重复扣减了盘量');
  }
  corrected = await confirm(corrected);
  if (corrected.output?.quantity !== '5') throw new Error('末站确认未按剩余盘量5生成产出');
  observations.push({
    scenario: '3=1返修+2新增报废；两个重叠异常分别关联同2件且不再扣量',
    cardId: corrected.id,
    outputQuantity: corrected.output.quantity,
    replayQuantity: replay.quantity,
  });

  let paused = await scan(await create('未结异常阻止流转待人工处理', 4), workbench.steps[0]);
  paused = await discover(paused, 2, '待人工检查，所有未结异常均阻止整盘后续流转');
  observations.push({
    scenario: '未结异常阻止流转',
    cardId: paused.id,
    refusal: await request(
      '/production/tracking-cards/scan',
      {
        cardNo: paused.cardNo,
        stepRecordId: workbench.steps[1].stepRecordId,
        personnelId: production.id,
      },
      'POST',
      { expectedCode: 'CONFLICT' },
    ),
  });
  await create('未使用待打印', 3);
  const voided = await scan(await create('已用卡作废保留事实', 2), workbench.steps[0]);
  await request(`/production/tracking-cards/${voided.id}/actions/void`, {
    version: voided.version,
    reason: `${config.marker} 现场取消该盘，已有到站事实保留`,
  });
  let scrapped = await create('整盘报废保留已到站及交接事实', 3);
  for (const step of workbench.steps.slice(0, 2)) scrapped = await scan(scrapped, step);
  scrapped = await discover(scrapped, 3, '全部3件实际报废');
  const fullScrapId = newestAbnormalityId(scrapped);
  scrapped = await discover(scrapped, 2, '另一异常影响其中2件，待关联已有报废关闭');
  const fullScrapOverlapId = newestAbnormalityId(scrapped);
  scrapped = await disposition(scrapped, fullScrapId, 0, 3, []);
  if (
    scrapped.quantity !== '0' ||
    scrapped.status !== 'in_progress' ||
    scrapped.openAbnormalityCount !== 1
  )
    throw new Error('零盘量未结异常未保留继续结算状态');
  const fullScrapHandling = scrapped.abnormalities.find((item) => item.id === fullScrapId).handling;
  scrapped = await disposition(scrapped, fullScrapOverlapId, 0, 0, [
    { handlingId: fullScrapHandling.id, quantity: 2 },
  ]);
  if (
    scrapped.status !== 'scrapped' ||
    scrapped.output !== null ||
    scrapped.openAbnormalityCount !== 0
  )
    throw new Error('全报废关闭未形成无产出的scrapped终态');
  observations.push({
    scenario: '全报废且全部异常已结，历史到站/报工保留且无产出',
    cardId: scrapped.id,
    status: scrapped.status,
    completedVisits: scrapped.visits.filter((visit) => visit.completedAt !== null).length,
  });

  let zeroPending = await scan(
    await create('零盘量仍有异常待人工关联报废结算', 3),
    workbench.steps[0],
  );
  zeroPending = await discover(zeroPending, 3, '全部3件实际报废');
  const zeroSourceId = newestAbnormalityId(zeroPending);
  zeroPending = await discover(zeroPending, 2, '影响其中2件，保留人工选择已有报废的待处理场景');
  await disposition(zeroPending, zeroSourceId, 0, 3, []);
  return { ...(await report(config, request)), preparedObservations: observations };
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
