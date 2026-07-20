import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/identity/presentation/http/auth.decorators.js';
@Controller()
export class AppController {
  @Public() @Get('health/live') live() {
    return { status: 'ok' };
  }
}
