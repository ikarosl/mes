import { Controller, Get } from '@nestjs/common';
import { Public } from './common/security/auth.decorators.js';
@Controller()
export class AppController {
  @Public() @Get('health/live') live() {
    return { status: 'ok' };
  }
}
