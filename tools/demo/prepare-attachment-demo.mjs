import { deflateSync } from 'node:zlib';
import { loadWorkspaceEnv } from '../../packages/config/dist/index.js';
import { ATTACHMENT_CLEANUP_STATUS, SYSTEM_STATUS } from '../../packages/constants/dist/index.js';

loadWorkspaceEnv({ quiet: true });

function configuration() {
  const mode = process.argv[2] ?? 'report';
  if (!['prepare', 'report'].includes(mode) || process.argv.length > 3)
    throw new Error('用法：node tools/demo/prepare-attachment-demo.mjs [prepare|report]');
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('必须显式设置 ALLOW_DEMO_SEED=1');
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error('禁止在 production 环境准备附件样例');
  const endpoint = new URL(process.env.ATTACHMENT_DEMO_API_BASE_URL ?? 'http://127.0.0.1:3003/api');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.replace(/\/$/, '').endsWith('/api')
  )
    throw new Error('附件样例工具只允许本地、无凭证且以 /api 结尾的 API 地址');
  const tag = (process.env.ATTACHMENT_DEMO_TAG ?? 'sample').toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(tag))
    throw new Error('ATTACHMENT_DEMO_TAG 须为1～40位字母、数字、下划线或连字符');
  if (!process.env.ADMIN_PASSWORD) throw new Error('请配置初始化管理员的 ADMIN_PASSWORD');
  const code = `demo-attachment-${tag}`;
  return {
    mode,
    tag,
    code,
    base: endpoint.href.replace(/\/$/, ''),
    prefix: `${code}--`,
    marker: `[demo-attachment-v1:${tag}]`,
  };
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value))
    throw new Error('API 返回了无效的业务 ID');
  return value;
}

function versionOf(record) {
  if (!Number.isSafeInteger(record?.version) || record.version < 0)
    throw new Error('API 返回了无效的附件版本');
  return record.version;
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
      const multipart = body instanceof FormData;
      const requestBody = multipart ? body : JSON.stringify(body);
      const result = await fetch(`${config.base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: requestBody }),
      });
      const data = await result.json().catch(() => null);
      if (!result.ok) {
        const code =
          typeof data?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code)
            ? data.code
            : 'UNKNOWN';
        throw new Error(`${method} ${path}：HTTP ${result.status} ${code}`);
      }
      if (method === 'GET' && data === null) throw new Error(`${path} 未返回 JSON`);
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
  throw new Error('超出附件样例查询分页上限');
}

async function markedRecords(client, config) {
  const keyword = encodeURIComponent(config.code);
  const files = (await allPages(client, `/attachments?keyword=${keyword}`)).filter((row) =>
    row.originalName?.startsWith(config.prefix),
  );
  const steps = (await allPages(client, `/product/process-steps?keyword=${keyword}`)).filter(
    (row) => row.stepCode === config.code || row.remark?.startsWith(config.marker),
  );
  const routes = (await allPages(client, `/product/process-routes?keyword=${keyword}`)).filter(
    (row) => row.routeCode === config.code || row.remark?.startsWith(config.marker),
  );
  return { files, steps, routes };
}

/** 生成可正常打开的一页 PDF；内容是可见样例标签，不是假 locator 或空文件。 */
function samplePdf(tag, scenario) {
  const text = `BT /F1 18 Tf 40 155 Td (Attachment demo: ${tag}) Tj 0 -35 Td /F1 12 Tf (${scenario}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document);
}

/** 无外部依赖的小型 RGB PNG，保留真实像素供下载和预览验收。 */
function samplePng() {
  function chunk(type, data) {
    const content = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  }
  const width = 240;
  const height = 120;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  const colors = [
    [35, 88, 170],
    [37, 150, 130],
    [234, 179, 58],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      const border = x < 8 || y < 8 || x >= width - 8 || y >= height - 8;
      const color = border ? [245, 247, 250] : colors[Math.floor(x / 80)];
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function prepare(client, config) {
  // 本次执行新上传的 ID 才能进入回收与清理动作，不从已有目录补齐或挑选文件。
  const ownedIds = new Set();
  async function upload(scenario, fileType = 'sop', image = false) {
    const body = new FormData();
    const name = `${config.prefix}${scenario}.${image ? 'png' : 'pdf'}`;
    body.append('fileType', fileType);
    body.append(
      'file',
      new Blob([image ? samplePng() : samplePdf(config.tag, scenario)], {
        type: image ? 'image/png' : 'application/pdf',
      }),
      name,
    );
    const uploaded = await client.request('/product/technical-files', { method: 'POST', body });
    const id = identifier(uploaded?.id);
    ownedIds.add(id);
    return id;
  }
  async function lifecycle(id, action) {
    if (!ownedIds.has(id)) throw new Error('回收与清理仅限本次新建的附件');
    const files = await allPages(client, `/attachments?keyword=${encodeURIComponent(config.code)}`);
    const file = files.find((row) => row.id === id && row.originalName?.startsWith(config.prefix));
    if (!file) throw new Error('未找到本次创建的附件，停止生命周期操作');
    return client.request(`/attachments/${identifier(id)}/${action}`, {
      method: 'POST',
      body: { version: versionOf(file) },
    });
  }
  const step = await client.request('/product/process-steps', {
    method: 'POST',
    body: {
      stepCode: config.code,
      stepName: `附件验收 ${config.tag}`,
      description: '统一附件当前与历史引用样例',
      status: SYSTEM_STATUS.enabled,
      remark: `${config.marker} current-sop`,
    },
  });
  const stepId = identifier(step?.id);
  const bind = (fileId) =>
    client.request(`/product/process-steps/${stepId}/default-sop`, {
      method: 'PATCH',
      body: { fileId },
    });
  const historicalId = await upload('route-retained');
  await bind(historicalId);
  const route = await client.request('/product/process-routes', {
    method: 'POST',
    body: {
      routeCode: config.code,
      routeName: `附件验收历史路线 ${config.tag}`,
      versionNo: 'v1',
      remark: `${config.marker} archived-route-retains-sop`,
    },
  });
  const routeId = identifier(route?.id);
  await client.request(`/product/process-routes/${routeId}/steps`, {
    method: 'PUT',
    body: {
      items: [
        {
          processStepId: stepId,
          stepOrder: 1,
          sopFileId: historicalId,
          status: SYSTEM_STATUS.enabled,
        },
      ],
    },
  });
  await client.request(`/product/process-routes/${routeId}/status`, {
    method: 'PATCH',
    body: { status: 'enabled' },
  });
  await client.request(`/product/process-routes/${routeId}/status`, {
    method: 'PATCH',
    body: { status: 'archived' },
  });
  await bind(await upload('replaced-old-unreferenced'));
  await bind(await upload('current-process-sop'));
  await upload('unattached-image', 'specification', true);
  const trashedId = await upload('trashed', 'specification');
  await lifecycle(trashedId, 'trash');
  const purgedId = await upload('purged', 'specification');
  await lifecycle(purgedId, 'trash');
  const cleanup = await lifecycle(purgedId, 'purge');
  return cleanup?.cleanupStatus === ATTACHMENT_CLEANUP_STATUS.completed
    ? 'prepared'
    : 'prepared-cleanup-needs-attention';
}

async function report(client, config, outcome) {
  const current = await markedRecords(client, config);
  const attachments = [];
  for (const file of current.files) {
    const references = await allPages(client, `/attachments/${identifier(file.id)}/references`);
    attachments.push({
      id: file.id,
      fileName: file.originalName,
      fileType: file.fileType,
      version: file.version,
      sizeBytes: file.sizeBytes,
      lifecycle: file.lifecycle,
      cleanupStatus: file.cleanupStatus,
      cleanupErrorCode: file.cleanupErrorCode,
      referenceCount: file.referenceCount,
      canTrash: file.canTrash,
      canPurge: file.canPurge,
      canDownload: file.canDownload,
      contentPath: file.canDownload ? `/attachments/${file.id}/content` : null,
      references: references.map(({ ownerType, ownerId, slot, createdAt }) => ({
        ownerType,
        ownerId,
        slot,
        createdAt,
      })),
    });
  }
  const routes = [];
  for (const route of current.routes) {
    const steps = await client.request(`/product/process-routes/${identifier(route.id)}/steps`);
    routes.push({
      id: route.id,
      routeCode: route.routeCode,
      versionNo: route.versionNo,
      status: route.status,
      steps,
    });
  }
  return {
    outcome,
    marker: config.marker,
    writesAttempted: client.writesAttempted,
    attachments,
    processes: current.steps.map(({ id, stepCode, defaultSopFileId }) => ({
      id,
      stepCode,
      defaultSopFileId,
    })),
    routes,
    productionHistory:
      '本工具不新建工单或任务；归档路线保留引用已覆盖，生产默认与实际 SOP 的历史保留需在既有合格任务下达时人工验收。',
  };
}

async function main() {
  const config = configuration();
  const client = await login(config);
  try {
    let outcome = 'report';
    if (config.mode === 'prepare') {
      const previous = await markedRecords(client, config);
      outcome =
        previous.files.length || previous.steps.length || previous.routes.length
          ? 'existing-report-only'
          : await prepare(client, config);
    }
    console.log(JSON.stringify(await report(client, config, outcome), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        marker: config.marker,
        writesAttempted: client.writesAttempted,
        message: error instanceof Error ? error.message : '附件样例准备失败',
        recovery: '不自动重试或续写。先用同 TAG 运行 report 核对；另一组样例使用新 TAG。',
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '附件样例工具未完成');
  process.exitCode = 1;
});
