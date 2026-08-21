import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '../../common/security/auth.decorators.js';
import { HealthCheckService } from '../../infrastructure/health/health-check.service.js';

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
  status(status: number): void;
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: ResponseHeaders) {
    const result = await this.health.check();
    response.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
