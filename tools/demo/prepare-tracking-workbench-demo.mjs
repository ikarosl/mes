import { randomUUID } from 'node:crypto';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import { allocateDemoMarkCodes } from './item-marking-demo-codes.mjs';

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
      throw new Error(
        `${method} ${path} 失败：HTTP ${response.status} ${typeof value?.code === 'string' && /^[A-Z_]+$/.test(value.code) ? value.code : 'UNKNOWN'}`,
      );
    }
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

async function itemMarks(request, cardId) {
  const items = [];
  for (let page = 1; page <= 1000; page += 1) {
    const result = await request(
      `/production/tracking-item-marks?${cardId ? `cardId=${cardId}&` : ''}page=${page}&pageSize=100`,
    );
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total))
      throw new Error('单件刻码分页契约错误');
    items.push(...result.items);
    if (items.length >= result.total) return items;
    if (!result.items.length) throw new Error('单件刻码分页提前结束');
  }
  throw new Error('单件刻码查询超出演示工具安全上限');
}

async function report(config, request) {
  const selected = (await cards(request, config.batchId)).filter((card) =>
    card.remark?.startsWith(config.marker),
  );
  const details = [];
  for (const card of selected) {
    const detail = await request(`/production/tracking-cards/${card.id}`);
    details.push({ ...detail, itemMarks: await itemMarks(request, card.id) });
  }
  const outputs = [];
  for (let page = 1; page <= 1000; page += 1) {
    const result = await request(
      `/production/outputs?batchId=${config.batchId}&page=${page}&pageSize=100`,
    );
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total))
      throw new Error('产出分页契约错误');
    outputs.push(...result.items.filter((output) => output.remark?.startsWith(config.marker)));
    if (page * 100 >= result.total) break;
    if (!result.items.length || page === 1000) throw new Error('产出分页未完整返回');
  }
  for (const detail of details)
    detail.outputFacts = outputs.find((output) => output.id === detail.output?.id) ?? null;
  return {
    marker: config.marker,
    workbench: await request(`/production/batches/${config.batchId}/tracking-workbench`),
    cards: details,
    outputs,
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
  const registrant = people[0];
  if (!registrant) throw new Error('场景要求至少一名启用的现场人员');
  const currentCodes = new Set((await itemMarks(request)).map((mark) => mark.markCode));
  const codesByCard = new Map();
  const create = (name, quantity) =>
    request(`/production/batches/${config.batchId}/tracking-cards`, {
      quantity,
      personnelId: registrant.id,
      remark: `${config.marker} ${name}`,
    });
  const scan = async (card, step) =>
    (
      await request('/production/tracking-cards/scan', {
        cardNo: card.cardNo,
        stepRecordId: step.stepRecordId,
        personnelId: registrant.id,
      })
    ).card;
  const completeRoute = async (card) => {
    for (const step of workbench.steps) card = await scan(card, step);
    return card;
  };
  const bindExamples = async (card) => {
    if (card.itemMarking.activeCount !== 0 || card.itemMarking.totalCount !== 0)
      throw new Error('示例绑定仅用于本次新建且尚无刻码历史的卡，请先报告现状');
    const quantity = Number(card.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10)
      throw new Error('示例绑定只接受本工具场景的1～10件盘量');
    const codes = allocateDemoMarkCodes(currentCodes, card.id, quantity);
    codesByCard.set(card.id, codes);
    for (const markCode of codes) {
      card = await request(`/production/tracking-cards/${card.id}/item-marks`, {
        version: card.version,
        personnelId: registrant.id,
        markCode,
      });
    }
    return card;
  };
  const selectedScrapMarkIds = async (card, positions) => {
    const marks = await itemMarks(request, card.id);
    const examples = codesByCard.get(card.id);
    if (!examples) throw new Error('本次新建卡的示例刻码缺失，请保留现状并report');
    return positions.map((position) => {
      const markCode = examples[position - 1];
      const selected = marks.find((mark) => mark.markCode === markCode && mark.status === 'active');
      if (!selected) throw new Error(`本卡待报废示例刻码 ${markCode} 已变化，请先报告现状`);
      return selected.id;
    });
  };
  const confirm = (card) =>
    request(`/production/tracking-cards/${card.id}/actions/confirm-output`, {
      version: card.version,
      personnelId: registrant.id,
      remark: `${config.marker} 登记人员确认完成，按服务器剩余盘量登记待入库产出`,
    });
  const register = (card, resolution, affectedQuantity, description, scrappedItemMarkIds = []) =>
    request(`/production/tracking-cards/${card.id}/abnormalities`, {
      version: card.version,
      personnelId: registrant.id,
      resolution,
      affectedQuantity,
      descriptionLabels: [`${config.marker} ${description}`],
      ...(scrappedItemMarkIds.length ? { scrappedItemMarkIds } : {}),
    });
  const observations = [];

  const first = await confirm(
    await bindExamples(await completeRoute(await create('正常流转及待入库10件', 10))),
  );
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
  corrected = await bindExamples(corrected);
  const scrapPath = `/production/tracking-cards/${corrected.id}/abnormalities`;
  const scrapBody = {
    version: corrected.version,
    personnelId: registrant.id,
    stepRecordId: workbench.steps[0].stepRecordId,
    affectedQuantity: 2,
    descriptionLabels: [`${config.marker} 终检确认两件实物报废，追溯首站外观问题`],
    resolution: 'scrap',
    scrappedItemMarkIds: await selectedScrapMarkIds(corrected, [2, 3]),
  };
  const idempotencyKey = randomUUID();
  corrected = await request(scrapPath, scrapBody, 'POST', { idempotencyKey });
  const replay = await request(scrapPath, scrapBody, 'POST', { idempotencyKey });
  if (corrected.quantity !== '5' || replay.quantity !== corrected.quantity)
    throw new Error('新增报废或同键重放的盘量不符合7-2=5');
  corrected = await register(corrected, 'repair', 1, '其余外观异常一件已返修');
  corrected = await confirm(corrected);
  if (corrected.output?.quantity !== '5') throw new Error('末站确认未按剩余盘量5生成产出');
  observations.push({
    scenario: '末站报废2件，另有1件返修完成，剩余5件确认产出',
    cardId: corrected.id,
    outputQuantity: corrected.output.quantity,
    replayQuantity: replay.quantity,
  });

  if (!first.output?.id || !corrected.output?.id) throw new Error('成品合并入库来源缺失');
  const pending = await request(
    `/production/outputs?batchId=${config.batchId}&status=pending_inbound&page=1&pageSize=100`,
  );
  if (
    ![first.output.id, corrected.output.id].every((id) =>
      pending.items.some((item) => item.id === id),
    )
  )
    throw new Error('终检确认后未留下待入库产出');
  const inboundBody = {
    outputIds: [first.output.id, corrected.output.id],
    target: { mode: 'new_batch' },
    remark: `${config.marker} 选中两盘完整产出15件，合并到一个新成品库批`,
  };
  const inboundKey = randomUUID();
  const grouped = await request(
    `/production/batches/${config.batchId}/output-inbounds`,
    inboundBody,
    'POST',
    { idempotencyKey: inboundKey },
  );
  const groupedReplay = await request(
    `/production/batches/${config.batchId}/output-inbounds`,
    inboundBody,
    'POST',
    { idempotencyKey: inboundKey },
  );
  if (
    grouped.inboundQuantity !== '15' ||
    grouped.itemBatchId !== groupedReplay.itemBatchId ||
    grouped.inboundId !== groupedReplay.inboundId
  )
    throw new Error('两笔整盘合并15件或同键入库重放结果不一致');
  const extra = await confirm(
    await bindExamples(await completeRoute(await create('后续产出4件接收入同一任务已有库批', 4))),
  );
  if (!extra.output?.id) throw new Error('后续产出事实缺失');
  const candidateQuery = new URLSearchParams({
    productionBatchId: config.batchId,
    productId: workbench.batch.productId,
    unit: first.unit,
    keyword: grouped.batchCode,
    page: '1',
    pageSize: '100',
  });
  const candidates = await request(
    `/warehouse/production-output-inbound-batch-candidates?${candidateQuery}`,
  );
  const target = candidates.items.find((candidate) => candidate.batchId === grouped.itemBatchId);
  if (!target) throw new Error('同任务已有成品库批候选缺失');
  const appended = await request(`/production/batches/${config.batchId}/output-inbounds`, {
    outputIds: [extra.output.id],
    target: { mode: 'existing_batch', itemBatchId: target.batchId, version: target.version },
    remark: `${config.marker} 后续完整4件补入同任务既有库批`,
  });
  if (appended.itemBatchId !== grouped.itemBatchId || appended.inboundQuantity !== '4')
    throw new Error('后续整盘产出未进入同任务既有库批');
  const waiting = await confirm(
    await bindExamples(await completeRoute(await create('终检完成待仓库选择入库6件', 6))),
  );
  const revoked = await confirm(
    await bindExamples(await completeRoute(await create('未入库产出撤销后回到末站待重新确认', 2))),
  );
  if (!revoked.output?.id) throw new Error('待撤销产出事实缺失');
  await request(`/production/outputs/${revoked.output.id}/actions/revoke`, {
    reason: `${config.marker} 终检登记有误，保留原确认与撤销事实，回到末站核实`,
  });
  observations.push({
    scenario:
      '终检不直接入库；两笔15件合并新库批，后续4件进入同任务既有库批，另留6件待入库及2件撤销历史',
    groupedInboundId: grouped.inboundId,
    appendedInboundId: appended.inboundId,
    itemBatchId: grouped.itemBatchId,
    pendingOutputId: waiting.output?.id ?? null,
    revokedOutputId: revoked.output.id,
  });

  const frontScrap = await register(
    await create('前道无码报废供人工更正或作废', 4),
    'scrap',
    2,
    '前道两件已报废',
  );
  observations.push({
    scenario: '前道报废两件',
    cardId: frontScrap.id,
    quantity: frontScrap.quantity,
  });
  await request(`/production/batches/${config.batchId}/tracking-cards/bulk`, {
    totalQuantity: 3,
    quantityPerCard: 3,
    personnelId: registrant.id,
    remark: `${config.marker} 未使用待打印`,
  });
  const voided = await scan(await create('已用卡作废保留事实', 2), workbench.steps[0]);
  await request(`/production/tracking-cards/${voided.id}/actions/void`, {
    version: voided.version,
    reason: `${config.marker} 现场取消该盘，已有到站事实保留`,
  });
  const fullCard = await bindExamples(
    await completeRoute(await create('末道整盘报废保留已交接事实', 3)),
  );
  const scrapped = await register(
    fullCard,
    'scrap',
    3,
    '末道三件全部报废',
    await selectedScrapMarkIds(fullCard, [1, 2, 3]),
  );
  if (
    scrapped.quantity !== '0' ||
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

  const editable = await bindExamples(
    await completeRoute(await create('终检报废供人工换码或改数', 5)),
  );
  const registered = await register(
    editable,
    'scrap',
    2,
    '终检选码报废两件',
    await selectedScrapMarkIds(editable, [2, 3]),
  );
  observations.push({
    scenario: '可在原登记更正报废或作废',
    cardId: registered.id,
    quantity: registered.quantity,
  });
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
