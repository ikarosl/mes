import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  HealthCheckService,
  type HealthCheckResult,
  type HealthDependency,
} from './health-check.service.js';

/**
 * 在 Nest 开始监听端口前复用 readiness 检查并输出依赖状态。
 * 依赖暂不可用不阻断进程启动：编排系统继续通过 /health/ready 的 503 阻止流量，依赖恢复后无需
 * 重启 API 即可自动恢复 ready，避免 CI、Compose/Kubernetes 启动顺序造成重启循环。
 */
@Injectable()
export class StartupReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupReadinessService.name);

  constructor(private readonly health: HealthCheckService) {}

  async onApplicationBootstrap(): Promise<void> {
    const readiness = await this.health.check();
    const summary = dependencySummary(readiness);
    if (readiness.status !== 'ok') {
      this.logger.warn(
        `Startup dependency check degraded; API will start but readiness remains unavailable: ${summary}`,
      );
      return;
    }
    this.logger.log(`Startup dependency check passed: ${summary}`);
  }
}

const dependencySummary = (result: HealthCheckResult): string =>
  [
    `database=${formatDependency(result.database)}`,
    `objectStorage=${formatDependency(result.objectStorage)}`,
  ].join(' ');

const formatDependency = (dependency: HealthDependency): string =>
  dependency.status === 'up' ? 'up' : `down${dependency.error ? `(code=${dependency.error})` : ''}`;
